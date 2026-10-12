/**
 * Collaboration backend integration tests.
 *
 * Disposable SQLite per test (via KANBAN_DATA_DIR + resetDbForTests).
 * Tests real outcomes, not text matching.
 */
import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "@/lib/db";
import {
  createBoard,
  createCard,
  createList,
  createUser,
  getBoard,
  getLists,
  archiveBoard,
  deleteBoard,
  updateBoard,
} from "@/lib/queries";
import {
  acceptHandoff,
  agentInbox,
  authenticateAgentToken,
  CollabError,
  completeHandoff,
  createAgent,
  createChannel,
  createHandoff,
  declineHandoff,
  ensureCollabSchema,
  grantAgent,
  listChannelHandoffs,
  listChannels,
  listEligibleAgents,
  listMessages,
  listOwnedAgents,
  postMessage,
  resetCollabInit,
  revokeAgent,
  revokeAgentGrant,
  rotateAgentToken,
  type Principal,
} from "@/lib/collaboration";

const DIR = process.env.KANBAN_DATA_DIR!;

beforeEach(() => {
  resetCollabInit();
  resetDbForTests();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  db(); // seed schema + users
});

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ══════════════════════════════════════════════════════════ */

const human = (id: string): Principal => ({ kind: "human", id });
const agent = (id: string): Principal => ({ kind: "agent", id });

function setupTwoUsers() {
  createUser("bob", "Bob", "x");
  // admin is seeded as admin
}

function createGroupBoard(createdBy: string, name = "TestBoard") {
  return createBoard({ name, createdBy, visibility: "group" });
}

function createPrivateBoard(createdBy: string, name = "Private") {
  return createBoard({ name, createdBy, visibility: "private" });
}

function makeAgent(ownerId: string, displayName: string, provider = "other") {
  return createAgent(human(ownerId), { displayName, provider });
}

/* ══════════════════════════════════════════════════════════
 * Agents
 * ══════════════════════════════════════════════════════════ */

describe("Agent CRUD", () => {
  it("create returns plaintext token once, list returns public fields without hash", () => {
    const { agent: a, token } = makeAgent("admin", "Codex Bot", "codex");
    expect(token).toMatch(/^ska_/);
    expect(a.displayName).toBe("Codex Bot");
    expect(a.provider).toBe("codex");
    expect(a.revoked).toBe(false);

    const list = listOwnedAgents(human("admin"));
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a.id);
    // No hash exposed
    expect(JSON.stringify(list[0])).not.toContain("token_hash");
  });

  it("agent cannot create agents (human-only)", () => {
    const { agent: a, token } = makeAgent("admin", "Test");
    const p = authenticateAgentToken(token)!;
    expect(() => createAgent(p, { displayName: "nope" })).toThrow();
  });

  it("token authentication works with correct token", () => {
    const { token } = makeAgent("admin", "Test");
    const p = authenticateAgentToken(token);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("agent");
  });

  it("session tokens are rejected by agent auth", () => {
    expect(authenticateAgentToken("admin.9999999999999.abc")).toBeNull();
    expect(authenticateAgentToken("not-a-token")).toBeNull();
  });

  it("rotate token invalidates old token, new one works", () => {
    const { agent: a, token: oldToken } = makeAgent("admin", "Test");
    const { token: newToken } = rotateAgentToken(human("admin"), a.id);

    expect(authenticateAgentToken(oldToken)).toBeNull();
    expect(authenticateAgentToken(newToken)).not.toBeNull();
  });

  it("revoke makes token stop working", () => {
    const { agent: a, token } = makeAgent("admin", "Test");
    revokeAgent(human("admin"), a.id);

    expect(authenticateAgentToken(token)).toBeNull();
    const list = listOwnedAgents(human("admin"));
    expect(list[0].revoked).toBe(true);
  });

  it("rotate revoked agent fails", () => {
    const { agent: a } = makeAgent("admin", "Test");
    revokeAgent(human("admin"), a.id);
    expect(() => rotateAgentToken(human("admin"), a.id)).toThrow(CollabError);
  });

  it("non-owner cannot rotate/revoke", () => {
    setupTwoUsers();
    const { agent: a } = makeAgent("admin", "Test");
    expect(() => rotateAgentToken(human("bob"), a.id)).toThrow(CollabError);
    expect(() => revokeAgent(human("bob"), a.id)).toThrow(CollabError);
  });
});

/* ══════════════════════════════════════════════════════════
 * Channels
 * ══════════════════════════════════════════════════════════ */

describe("Channels", () => {
  it("project channel requires exactly 1 board", () => {
    const boardId = createGroupBoard("admin");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    expect(ch.type).toBe("project");
    expect(ch.boardIds).toEqual([boardId]);

    // 0 boards → error
    expect(() =>
      createChannel(human("admin"), { type: "project", name: "X", boardIds: [] }),
    ).toThrow(CollabError);
    // 2 boards → error
    const b2 = createGroupBoard("admin", "B2");
    expect(() =>
      createChannel(human("admin"), {
        type: "project",
        name: "X",
        boardIds: [boardId, b2],
      }),
    ).toThrow(CollabError);
  });

  it("topic channel has no boards", () => {
    const ch = createChannel(human("admin"), { type: "topic", name: "General" });
    expect(ch.boardIds).toEqual([]);

    const boardId = createGroupBoard("admin");
    expect(() =>
      createChannel(human("admin"), {
        type: "topic",
        name: "X",
        boardIds: [boardId],
      }),
    ).toThrow(CollabError);
  });

  it("bridge requires >=2 and <=10 distinct boards", () => {
    const b1 = createGroupBoard("admin", "B1");
    const b2 = createGroupBoard("admin", "B2");

    // <2 → error
    expect(() =>
      createChannel(human("admin"), {
        type: "bridge",
        name: "X",
        boardIds: [b1],
      }),
    ).toThrow(CollabError);

    // 2 → OK
    const ch = createChannel(human("admin"), {
      type: "bridge",
      name: "Br",
      boardIds: [b1, b2],
    });
    expect(ch.boardIds).toHaveLength(2);

    // Duplicate IDs → error
    expect(() =>
      createChannel(human("admin"), {
        type: "bridge",
        name: "X",
        boardIds: [b1, b1],
      }),
    ).toThrow(CollabError);
  });

  it("cannot create channel linking invisible boards", () => {
    setupTwoUsers();
    const priv = createPrivateBoard("admin");
    expect(() =>
      createChannel(human("bob"), {
        type: "project",
        name: "X",
        boardIds: [priv],
      }),
    ).toThrow(CollabError);
  });

  it("topic channel accessible to all authenticated humans", () => {
    setupTwoUsers();
    createChannel(human("admin"), { type: "topic", name: "General" });
    const bobList = listChannels(human("bob"));
    expect(bobList).toHaveLength(1);
  });

  it("project channel hidden from user who cannot see linked board", () => {
    setupTwoUsers();
    const priv = createPrivateBoard("admin");
    createChannel(human("admin"), {
      type: "project",
      name: "Secret",
      boardIds: [priv],
    });

    const bobList = listChannels(human("bob"));
    expect(bobList).toHaveLength(0);

    const ownerList = listChannels(human("admin"));
    expect(ownerList).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════
 * Private board hidden even from admin
 * ══════════════════════════════════════════════════════════ */

describe("Private board access", () => {
  it("admin cannot see another user's private board channel", () => {
    setupTwoUsers();
    const priv = createPrivateBoard("bob");
    // bob creates a channel on his private board
    const ch = createChannel(human("bob"), {
      type: "project",
      name: "Bob's private",
      boardIds: [priv],
    });

    // admin is admin but cannot see bob's private board
    const adminList = listChannels(human("admin"));
    expect(adminList.find((c) => c.id === ch.id)).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════
 * Agent channel access
 * ══════════════════════════════════════════════════════════ */

describe("Agent channel access", () => {
  it("no grant → agent cannot see channel (even group board)", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });

    const p = authenticateAgentToken(token)!;
    // No grant yet → empty list
    const channels = listChannels(p);
    expect(channels).toHaveLength(0);

    // Grant → visible
    grantAgent(human("admin"), ch.id, a.id);
    expect(listChannels(p)).toHaveLength(1);
  });

  it("revoked agent loses access", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;
    expect(listChannels(p)).toHaveLength(1);

    revokeAgent(human("admin"), a.id);
    // Token now invalid
    expect(authenticateAgentToken(token)).toBeNull();
  });

  it("owner loses board visibility → agent loses channel access", () => {
    setupTwoUsers();
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const p = authenticateAgentToken(token)!;
    expect(listChannels(p)).toHaveLength(1);

    // Make board private to bob (admin can't see it anymore)
    // Actually, switch board to private by someone else...
    // Simpler: change visibility to private and set created_by to bob
    db().prepare("UPDATE boards SET visibility = 'private', created_by = 'bob' WHERE id = ?").run(boardId);

    // Agent should lose access because owner can't see the board anymore
    expect(listChannels(p)).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════
 * Two agents exchanging messages with idempotency
 * ══════════════════════════════════════════════════════════ */

describe("Agent message exchange + idempotency", () => {
  it("two owned agents granted to a project channel can exchange messages", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "Agent A", "codex");
    const { agent: a2, token: t2 } = makeAgent("admin", "Agent B", "claude");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const msg1 = postMessage(p1, ch.id, { text: "Hello from A" });
    expect(msg1.authorKind).toBe("agent");
    expect(msg1.authorId).toBe(a1.id);

    const msg2 = postMessage(p2, ch.id, {
      text: "Reply from B",
      replyToId: msg1.id,
    });
    expect(msg2.replyToId).toBe(msg1.id);

    const messages = listMessages(p1, ch.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].authorDisplayName).toBe("Agent A");
    expect(messages[1].authorDisplayName).toBe("Agent B");
  });

  it("idempotency: same clientId+payload returns same message", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    const msg1 = postMessage(p, ch.id, {
      text: "idempotent",
      clientId: "dup-1",
    });
    const msg2 = postMessage(p, ch.id, {
      text: "idempotent",
      clientId: "dup-1",
    });
    expect(msg1.id).toBe(msg2.id);
  });

  it("idempotency: same clientId different payload → 409", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    postMessage(p, ch.id, { text: "first", clientId: "dup-2" });
    expect(() =>
      postMessage(p, ch.id, { text: "different", clientId: "dup-2" }),
    ).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });
});

/* ══════════════════════════════════════════════════════════
 * Card references
 * ══════════════════════════════════════════════════════════ */

describe("Card references", () => {
  it("topic channel forbids card references", () => {
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), { type: "topic", name: "Gen" });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    // Create a board just for the card
    const boardId = createGroupBoard("admin");
    const [todo] = getLists(boardId);
    const cardId = createCard({ listId: todo.id, title: "Test", createdBy: "admin" });

    expect(() =>
      postMessage(p, ch.id, { text: "Hi", cardId }),
    ).toThrow(CollabError);
  });

  it("card from unlinked board is rejected", () => {
    const b1 = createGroupBoard("admin", "B1");
    const b2 = createGroupBoard("admin", "B2");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [b1],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    const [b2todo] = getLists(b2);
    const cardId = createCard({ listId: b2todo.id, title: "Wrong board", createdBy: "admin" });

    expect(() =>
      postMessage(p, ch.id, { text: "Hi", cardId }),
    ).toThrow(CollabError);
  });

  it("archived card reference is rejected on write", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    const [todo] = getLists(boardId);
    const cardId = createCard({ listId: todo.id, title: "Test", createdBy: "admin" });
    // Archive the card
    db().prepare("UPDATE cards SET archived_at = ? WHERE id = ?").run(new Date().toISOString(), cardId);

    expect(() =>
      postMessage(p, ch.id, { text: "ref archived", cardId }),
    ).toThrow(CollabError);
  });

  it("card moved to different board shows null on read", () => {
    const b1 = createGroupBoard("admin", "B1");
    const b2 = createGroupBoard("admin", "B2");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [b1],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    const [b1todo] = getLists(b1);
    const [b2todo] = getLists(b2);
    const cardId = createCard({ listId: b1todo.id, title: "Movable", createdBy: "admin" });

    // Post with valid card ref
    postMessage(p, ch.id, { text: "with card", cardId });

    // Move card to b2
    db().prepare("UPDATE cards SET board_id = ?, list_id = ? WHERE id = ?").run(b2, b2todo.id, cardId);

    // On read, card ref should be null (no longer in linked board)
    const msgs = listMessages(p, ch.id);
    const refMsg = msgs.find((m) => m.text === "with card");
    expect(refMsg!.cardId).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════
 * Invalid reply references
 * ══════════════════════════════════════════════════════════ */

describe("Reply references", () => {
  it("reply to message in different channel is rejected", () => {
    const b1 = createGroupBoard("admin", "B1");
    const b2 = createGroupBoard("admin", "B2");
    const { agent: a, token } = makeAgent("admin", "Bot");

    const ch1 = createChannel(human("admin"), {
      type: "project",
      name: "P1",
      boardIds: [b1],
    });
    const ch2 = createChannel(human("admin"), {
      type: "project",
      name: "P2",
      boardIds: [b2],
    });
    grantAgent(human("admin"), ch1.id, a.id);
    grantAgent(human("admin"), ch2.id, a.id);
    const p = authenticateAgentToken(token)!;

    const msg = postMessage(p, ch1.id, { text: "in ch1" });
    expect(() =>
      postMessage(p, ch2.id, { text: "reply crossover", replyToId: msg.id }),
    ).toThrow(CollabError);
  });
});

/* ══════════════════════════════════════════════════════════
 * Deleted/archived linked board
 * ══════════════════════════════════════════════════════════ */

describe("Deleted/archived linked board", () => {
  it("archived linked board blocks channel access", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const p = authenticateAgentToken(token)!;
    expect(listChannels(p)).toHaveLength(1);

    // Archive the board
    archiveBoard(boardId, true);

    // Channel no longer accessible
    expect(listChannels(p)).toHaveLength(0);
    // Human also loses access
    expect(listChannels(human("admin"))).toHaveLength(0);
  });

  it("deleted linked board blocks channel access (does not become topic)", () => {
    const boardId = createGroupBoard("admin");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });

    expect(listChannels(human("admin"))).toHaveLength(1);

    // Delete the board (CASCADE removes channel_boards row)
    deleteBoard(boardId);

    // Channel should not become a public topic —
    // project with 0 boards is invalid, so access is denied
    expect(listChannels(human("admin"))).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════
 * Handoffs
 * ══════════════════════════════════════════════════════════ */

describe("Handoffs", () => {
  it("full lifecycle: pending → accepted → completed with result + event messages", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "Sender");
    const { agent: a2, token: t2 } = makeAgent("admin", "Receiver");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "Proj",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    // Create handoff
    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Please review this",
    });
    expect(ho.state).toBe("pending");
    expect(ho.toAgentId).toBe(a2.id);

    // Receiver sees it in inbox
    const inbox = agentInbox(p2);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(ho.id);

    // Accept
    const accepted = acceptHandoff(p2, ho.id);
    expect(accepted.state).toBe("accepted");

    // Complete with result
    const completed = completeHandoff(p2, ho.id, "Done: merged the PR");
    expect(completed.state).toBe("completed");
    expect(completed.result).toBe("Done: merged the PR");

    // Completed handoff no longer in inbox
    expect(agentInbox(p2)).toHaveLength(0);

    // Event messages were appended
    const msgs = listMessages(p1, ch.id);
    expect(msgs.some((m) => m.text.includes("Handoff #"))).toBe(true);
    expect(msgs.some((m) => m.text.includes("accepted"))).toBe(true);
    expect(msgs.some((m) => m.text.includes("completed"))).toBe(true);
  });

  it("decline lifecycle: pending → declined", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Check this",
    });
    const declined = declineHandoff(p2, ho.id);
    expect(declined.state).toBe("declined");

    // Declined not in inbox
    expect(agentInbox(p2)).toHaveLength(0);
  });

  it("only receiving agent can transition", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Check",
    });

    // Sender (a1) cannot accept
    expect(() => acceptHandoff(p1, ho.id)).toThrow(CollabError);
    // Human cannot accept
    expect(() => acceptHandoff(human("admin"), ho.id)).toThrow(CollabError);
    // Receiver can
    acceptHandoff(p2, ho.id);
  });

  it("invalid state transitions are rejected", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Check",
    });

    // Can't complete from pending (must accept first)
    expect(() => completeHandoff(p2, ho.id, "result")).toThrow(
      expect.objectContaining({ status: 409 }),
    );

    acceptHandoff(p2, ho.id);
    // Can't accept again
    expect(() => acceptHandoff(p2, ho.id)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    // Can't decline after accept
    expect(() => declineHandoff(p2, ho.id)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it("complete without result → error", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Check",
    });
    acceptHandoff(p2, ho.id);
    expect(() => completeHandoff(p2, ho.id, "")).toThrow(CollabError);
  });

  it("handoff idempotency with clientId", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;

    const ho1 = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Same brief",
      clientId: "ho-1",
    });
    const ho2 = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Same brief",
      clientId: "ho-1",
    });
    expect(ho1.id).toBe(ho2.id);

    // Different payload same clientId → 409
    expect(() =>
      createHandoff(p1, ch.id, {
        toAgentId: a2.id,
        brief: "Different brief",
        clientId: "ho-1",
      }),
    ).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it("receiver loses access → cannot transition", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");

    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const p2 = authenticateAgentToken(t2)!;

    const ho = createHandoff(p1, ch.id, {
      toAgentId: a2.id,
      brief: "Check",
    });

    // Revoke a2's channel grant
    revokeAgentGrant(human("admin"), ch.id, a2.id);

    // Cannot accept anymore
    expect(() => acceptHandoff(p2, ho.id)).toThrow(CollabError);
  });
});

/* ══════════════════════════════════════════════════════════
 * Sender spoof prevention
 * ══════════════════════════════════════════════════════════ */

describe("Sender spoof prevention", () => {
  it("message author fields are server-derived, not from request", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "RealName");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    // Even if an attacker could inject fields, the service sets them from the principal
    const msg = postMessage(p, ch.id, { text: "hi" });
    expect(msg.authorKind).toBe("agent");
    expect(msg.authorId).toBe(a.id);
    expect(msg.authorDisplayName).toBe("RealName");
  });
});

/* ══════════════════════════════════════════════════════════
 * Cursor pagination
 * ══════════════════════════════════════════════════════════ */

describe("Cursor pagination", () => {
  it("after + limit pagination works correctly", () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);
    const p = authenticateAgentToken(token)!;

    // Post 5 messages
    for (let i = 0; i < 5; i++) {
      postMessage(p, ch.id, { text: `msg-${i}` });
    }

    const page1 = listMessages(p, ch.id, { limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page1[0].text).toBe("msg-0");
    expect(page1[1].text).toBe("msg-1");

    const page2 = listMessages(p, ch.id, { after: page1[1].id, limit: 2 });
    expect(page2).toHaveLength(2);
    expect(page2[0].text).toBe("msg-2");

    const page3 = listMessages(p, ch.id, { after: page2[1].id, limit: 100 });
    expect(page3).toHaveLength(1);
    expect(page3[0].text).toBe("msg-4");
  });
});

/* ══════════════════════════════════════════════════════════
 * Route handler tests (Request/Response)
 * ══════════════════════════════════════════════════════════ */

describe("Route handler", () => {
  // We import the handler dynamically since it needs Next.js types
  // but we can construct NextRequest-like objects

  async function callRoute(
    method: string,
    path: string,
    opts: {
      token?: string;
      body?: unknown;
      searchParams?: Record<string, string>;
    } = {},
  ) {
    const { handleAgentRequest } = await import(
      "@/lib/agent-api"
    );

    const url = new URL(`http://localhost:3000/api/agent/${path}`);
    if (opts.searchParams) {
      for (const [k, v] of Object.entries(opts.searchParams)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
    if (opts.body) headers["Content-Type"] = "application/json";

    const reqInit: RequestInit = {
      method,
      headers,
    };
    if (opts.body) {
      reqInit.body = JSON.stringify(opts.body);
    }

    // Use the standard Request constructor, then cast to NextRequest
    // handleAgentRequest extracts segments from the path arg, not from the URL
    const req = new Request(url.toString(), reqInit);
    const segments = path.split("/").filter(Boolean);
    const response = await handleAgentRequest(req as any, segments);
    const responseBody = await response.json();
    return { status: response.status, body: responseBody, response };
  }

  it("401 without token", async () => {
    const { status, body } = await callRoute("GET", "channels");
    expect(status).toBe(401);
    expect(body.error).toBeTruthy();
  });

  it("401 with invalid token", async () => {
    const { status } = await callRoute("GET", "channels", { token: "bad-token" });
    expect(status).toBe(401);
  });

  it("GET channels returns accessible channels", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "TestP",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const { status, body } = await callRoute("GET", "channels", { token });
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("TestP");
  });

  it("POST message returns 201", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const { status, body } = await callRoute("POST", `channels/${ch.id}/messages`, {
      token,
      body: { text: "Hello via route" },
    });
    expect(status).toBe(201);
    expect(body.text).toBe("Hello via route");
  });

  it("400 for missing text in message", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const { status } = await callRoute("POST", `channels/${ch.id}/messages`, {
      token,
      body: {},
    });
    expect(status).toBe(400);
  });

  it("404 for channel agent cannot see", async () => {
    const boardId = createGroupBoard("admin");
    const { token } = makeAgent("admin", "Bot");
    // No grant
    createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });

    const { status } = await callRoute("GET", "channels/1/messages", { token });
    expect(status).toBe(404);
  });

  it("no-store header on all responses", async () => {
    const { response } = await callRoute("GET", "channels");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET inbox works", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    // Create handoff via service
    const p1 = authenticateAgentToken(t1)!;
    createHandoff(p1, ch.id, { toAgentId: a2.id, brief: "Do this" });

    const { status, body } = await callRoute("GET", "inbox", { token: t2 });
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it("POST accept/decline/complete via route", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a1, token: t1 } = makeAgent("admin", "S");
    const { agent: a2, token: t2 } = makeAgent("admin", "R");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a1.id);
    grantAgent(human("admin"), ch.id, a2.id);

    const p1 = authenticateAgentToken(t1)!;
    const ho = createHandoff(p1, ch.id, { toAgentId: a2.id, brief: "Do" });

    const { status: s1, body: b1 } = await callRoute(
      "POST",
      `handoffs/${ho.id}/accept`,
      { token: t2, body: {} },
    );
    expect(s1).toBe(200);
    expect(b1.state).toBe("accepted");

    const { status: s2, body: b2 } = await callRoute(
      "POST",
      `handoffs/${ho.id}/complete`,
      { token: t2, body: { result: "Done!" } },
    );
    expect(s2).toBe(200);
    expect(b2.state).toBe("completed");
    expect(b2.result).toBe("Done!");
  });

  it("404 for unknown routes", async () => {
    const { token } = makeAgent("admin", "Bot");
    const { status } = await callRoute("GET", "nonexistent", { token });
    expect(status).toBe(404);
  });

  it("400 for bad channel ID", async () => {
    const { token } = makeAgent("admin", "Bot");
    const { status } = await callRoute("GET", "channels/abc/messages", { token });
    expect(status).toBe(400);
  });

  it("validation: bad kind in message", async () => {
    const boardId = createGroupBoard("admin");
    const { agent: a, token } = makeAgent("admin", "Bot");
    const ch = createChannel(human("admin"), {
      type: "project",
      name: "P",
      boardIds: [boardId],
    });
    grantAgent(human("admin"), ch.id, a.id);

    const { status } = await callRoute("POST", `channels/${ch.id}/messages`, {
      token,
      body: { text: "hi", kind: "invalid" },
    });
    expect(status).toBe(400);
  });
});
