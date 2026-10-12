/**
 * Collaboration backend for Sankyaku Agents.
 *
 * Separate tables from the human kanban schema, initialized idempotently.
 * Service methods take an explicit Principal {kind, id} so callers
 * (route handlers, future UI) never bypass access control.
 *
 * Design invariants:
 * - Agent must never impersonate a human user.
 * - Unauthorized resources consistently 404 (existence is private).
 * - Dynamic visibility is re-checked on every read/write.
 * - Mutating compound operations are transactional.
 * - SQL is parameterized throughout.
 */
import { createHash, randomBytes } from "node:crypto";
import { db, q } from "./db";
import { canSeeBoard, getBoard, getCard, getUser } from "./queries";

/* ══════════════════════════════════════════════════════════
 * Types
 * ══════════════════════════════════════════════════════════ */

export interface Principal {
  kind: "human" | "agent";
  id: string;
}

export type ChannelType = "project" | "topic" | "bridge";
export type MessageKind = "discussion" | "question" | "decision" | "result";
export type HandoffState = "pending" | "accepted" | "completed" | "declined";

export class CollabError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CollabError";
  }
}

/* ══════════════════════════════════════════════════════════
 * Schema (idempotent, tolerates resetDbForTests + reopen)
 * ══════════════════════════════════════════════════════════ */

const COLLAB_SCHEMA = `
CREATE TABLE IF NOT EXISTS collab_agents (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'other',
  token_hash TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collab_agents_owner ON collab_agents(owner_user_id);

CREATE TABLE IF NOT EXISTS collab_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('project','topic','bridge')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  creator_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collab_channel_boards (
  channel_id INTEGER NOT NULL REFERENCES collab_channels(id) ON DELETE CASCADE,
  board_id INTEGER NOT NULL,
  PRIMARY KEY (channel_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_ccb_board ON collab_channel_boards(board_id);

CREATE TABLE IF NOT EXISTS collab_channel_agents (
  channel_id INTEGER NOT NULL REFERENCES collab_channels(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES collab_agents(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, agent_id)
);

CREATE TABLE IF NOT EXISTS collab_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES collab_channels(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_display_name TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'discussion',
  reply_to_id INTEGER,
  card_id INTEGER,
  client_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collab_msg_channel ON collab_messages(channel_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_msg_client
  ON collab_messages(channel_id, author_kind, author_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS collab_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES collab_channels(id) ON DELETE CASCADE,
  sender_kind TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL REFERENCES collab_agents(id),
  brief TEXT NOT NULL,
  card_id INTEGER,
  state TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  client_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collab_handoff_channel ON collab_handoffs(channel_id, id);
CREATE INDEX IF NOT EXISTS idx_collab_handoff_agent ON collab_handoffs(to_agent_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_handoff_client
  ON collab_handoffs(channel_id, sender_kind, sender_id, client_id)
  WHERE client_id IS NOT NULL;
`;

let _collabDb: ReturnType<typeof db> | null = null;

export function ensureCollabSchema(): void {
  const connection = db();
  if (_collabDb === connection) return;
  connection.exec(COLLAB_SCHEMA);
  _collabDb = connection;
}

/**
 * Optional test hook; connection identity also handles database reopening.
 */
export function resetCollabInit(): void {
  _collabDb = null;
}

const now = () => new Date().toISOString();

/* ══════════════════════════════════════════════════════════
 * Helpers
 * ══════════════════════════════════════════════════════════ */

function requireHuman(p: Principal): void {
  if (p.kind !== "human") throw new CollabError(404, "Not found");
}

function requirePrincipalExists(p: Principal): void {
  ensureCollabSchema();
  if (p.kind === "human") {
    if (!getUser(p.id)) throw new CollabError(404, "Not found");
  } else {
    const agent = q("SELECT id, revoked_at FROM collab_agents WHERE id = ?").get(p.id) as
      | { id: string; revoked_at: string | null }
      | undefined;
    if (!agent || agent.revoked_at) throw new CollabError(401, "Invalid token");
  }
}

function getAgentRow(agentId: string) {
  ensureCollabSchema();
  return q(
    "SELECT id, owner_user_id, display_name, provider, revoked_at, created_at FROM collab_agents WHERE id = ?",
  ).get(agentId) as
    | {
        id: string;
        owner_user_id: string;
        display_name: string;
        provider: string;
        revoked_at: string | null;
        created_at: string;
      }
    | undefined;
}

/**
 * Check if a human user can currently see a board:
 * board must exist, not archived, and user has visibility.
 */
function humanCanSeeBoard(userId: string, boardId: number): boolean {
  if (!getUser(userId)) return false;
  const board = getBoard(boardId);
  if (!board) return false;
  if (board.archivedAt) return false;
  return canSeeBoard(board, userId);
}

/**
 * Check that a human can see ALL boards linked to a channel.
 * Returns false if the channel has no linked boards when it should (project/bridge).
 */
function humanCanSeeAllChannelBoards(userId: string, channelId: number): boolean {
  ensureCollabSchema();
  const boards = q("SELECT board_id FROM collab_channel_boards WHERE channel_id = ?").all(
    channelId,
  ) as { board_id: number }[];

  // Get channel type to validate board count
  const ch = q("SELECT type FROM collab_channels WHERE id = ?").get(channelId) as
    | { type: string }
    | undefined;
  if (!ch) return false;

  if (ch.type === "project" && boards.length !== 1) return false;
  if (ch.type === "bridge" && boards.length < 2) return false;
  // topic has 0 boards, always passes board check

  for (const b of boards) {
    if (!humanCanSeeBoard(userId, b.board_id)) return false;
  }
  return true;
}

/**
 * Determine whether a principal can access a channel.
 */
function canAccessChannel(p: Principal, channelId: number): boolean {
  ensureCollabSchema();
  const ch = q("SELECT id, type, creator_id FROM collab_channels WHERE id = ?").get(channelId) as
    | { id: number; type: string; creator_id: string }
    | undefined;
  if (!ch) return false;

  if (p.kind === "human") {
    if (ch.type === "topic") {
      // all authenticated humans can access topics
      return true;
    }
    // project / bridge: human must see ALL linked boards
    return humanCanSeeAllChannelBoards(p.id, channelId);
  }

  // Agent: live token + explicit grant + owner visibility
  const agent = getAgentRow(p.id);
  if (!agent || agent.revoked_at || !getUser(agent.owner_user_id)) return false;

  const grant = q(
    "SELECT 1 FROM collab_channel_agents WHERE channel_id = ? AND agent_id = ?",
  ).get(channelId, p.id);
  if (!grant) return false;

  // Agent's owner must still have visibility to all boards
  if (ch.type === "topic") return true;
  return humanCanSeeAllChannelBoards(agent.owner_user_id, channelId);
}

/* ══════════════════════════════════════════════════════════
 * Agents CRUD (human-only management)
 * ══════════════════════════════════════════════════════════ */

export interface AgentPublic {
  id: string;
  displayName: string;
  provider: string;
  createdAt: string;
  revoked: boolean;
}

export interface AgentCreateResult {
  agent: AgentPublic;
  token: string;
}

const VALID_PROVIDERS = ["codex", "claude", "gemini", "other"];

export function createAgent(
  principal: Principal,
  opts: { displayName: string; provider?: string },
): AgentCreateResult {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const name = typeof opts.displayName === "string" ? opts.displayName.trim() : "";
  if (!name || name.length > 200) throw new CollabError(400, "Invalid display name");

  const provider = typeof opts.provider === "string" ? opts.provider.toLowerCase() : (opts.provider === undefined ? "other" : "");
  if (!VALID_PROVIDERS.includes(provider))
    throw new CollabError(400, "Invalid provider");

  const id = randomBytes(16).toString("hex");
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const bearerToken = `ska_${id}_${rawToken}`;

  q(
    `INSERT INTO collab_agents (id, owner_user_id, display_name, provider, token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, principal.id, name, provider, tokenHash, now());

  return {
    agent: { id, displayName: name, provider, createdAt: now(), revoked: false },
    token: bearerToken,
  };
}

export function listOwnedAgents(principal: Principal): AgentPublic[] {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const rows = q(
    "SELECT id, display_name, provider, created_at, revoked_at FROM collab_agents WHERE owner_user_id = ? ORDER BY created_at",
  ).all(principal.id) as {
    id: string;
    display_name: string;
    provider: string;
    created_at: string;
    revoked_at: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    provider: r.provider,
    createdAt: r.created_at,
    revoked: r.revoked_at !== null,
  }));
}

export function rotateAgentToken(principal: Principal, agentId: string): { token: string } {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const agent = getAgentRow(agentId);
  if (!agent || agent.owner_user_id !== principal.id)
    throw new CollabError(404, "Not found");
  if (agent.revoked_at) throw new CollabError(400, "Agent is revoked");

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  q("UPDATE collab_agents SET token_hash = ? WHERE id = ?").run(tokenHash, agentId);

  return { token: `ska_${agentId}_${rawToken}` };
}

export function revokeAgent(principal: Principal, agentId: string): void {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const agent = getAgentRow(agentId);
  if (!agent || agent.owner_user_id !== principal.id)
    throw new CollabError(404, "Not found");

  q("UPDATE collab_agents SET revoked_at = ? WHERE id = ?").run(now(), agentId);
}

/**
 * Authenticate a bearer token. Returns the agent principal or null.
 * Token format: ska_{agentId}_{rawSecret}
 * This MUST reject human session tokens.
 */
export function authenticateAgentToken(bearerToken: string): Principal | null {
  ensureCollabSchema();
  if (!bearerToken.startsWith("ska_")) return null;
  const parts = bearerToken.slice(4).split("_");
  if (parts.length !== 2) return null;
  const [agentId, rawToken] = parts;
  if (!agentId || !rawToken) return null;

  const hash = createHash("sha256").update(rawToken).digest("hex");
  const row = q(
    "SELECT id, revoked_at FROM collab_agents WHERE id = ? AND token_hash = ?",
  ).get(agentId, hash) as { id: string; revoked_at: string | null } | undefined;

  if (!row || row.revoked_at || !getUser(getAgentRow(row.id)!.owner_user_id)) return null;
  return { kind: "agent", id: row.id };
}

/* ══════════════════════════════════════════════════════════
 * Channels
 * ══════════════════════════════════════════════════════════ */

export interface ChannelPublic {
  id: number;
  creatorId: string;
  type: ChannelType;
  name: string;
  summary: string;
  boardIds: number[];
  createdAt: string;
}

export function createChannel(
  principal: Principal,
  opts: {
    type: ChannelType;
    name: string;
    summary?: string;
    boardIds?: number[];
  },
): ChannelPublic {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const name = typeof opts.name === "string" ? opts.name.trim() : "";
  if (!name || name.length > 200) throw new CollabError(400, "Invalid channel name");
  if (opts.summary !== undefined && typeof opts.summary !== "string") throw new CollabError(400, "Invalid summary");
  const summary = (opts.summary ?? "").trim();
  if (summary.length > 2000) throw new CollabError(400, "Summary too long");

  const type = opts.type;
  if (!["project", "topic", "bridge"].includes(type))
    throw new CollabError(400, "Invalid channel type");

  const boardIds = opts.boardIds ?? [];
  if (!Array.isArray(boardIds) || boardIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new CollabError(400, "Invalid board IDs");

  // Validate board counts by type
  if (type === "project" && boardIds.length !== 1)
    throw new CollabError(400, "Project channel requires exactly 1 board");
  if (type === "topic" && boardIds.length !== 0)
    throw new CollabError(400, "Topic channel must not link boards");
  if (type === "bridge") {
    if (boardIds.length < 2)
      throw new CollabError(400, "Bridge channel requires at least 2 boards");
    if (boardIds.length > 10)
      throw new CollabError(400, "Bridge channel allows at most 10 boards");
  }

  // Validate distinct board IDs
  if (new Set(boardIds).size !== boardIds.length)
    throw new CollabError(400, "Duplicate board IDs");

  // Validate all linked boards exist and creator can see them
  for (const bid of boardIds) {
    if (!humanCanSeeBoard(principal.id, bid))
      throw new CollabError(404, "Not found");
  }

  const d = db();
  return d.transaction(() => {
    const res = q(
      `INSERT INTO collab_channels (type, name, summary, creator_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(type, name, summary, principal.id, now());
    const channelId = Number(res.lastInsertRowid);

    for (const bid of boardIds) {
      q("INSERT INTO collab_channel_boards (channel_id, board_id) VALUES (?, ?)").run(
        channelId,
        bid,
      );
    }

    return {
      id: channelId,
      creatorId: principal.id,
      type,
      name,
      summary,
      boardIds,
      createdAt: now(),
    };
  })();
}

export function listChannels(principal: Principal): ChannelPublic[] {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const channels = q("SELECT * FROM collab_channels ORDER BY id").all() as {
    id: number;
    type: string;
    name: string;
    summary: string;
    creator_id: string;
    created_at: string;
  }[];

  const result: ChannelPublic[] = [];
  for (const ch of channels) {
    if (!canAccessChannel(principal, ch.id)) continue;
    const boards = q("SELECT board_id FROM collab_channel_boards WHERE channel_id = ?").all(
      ch.id,
    ) as { board_id: number }[];
    result.push({
      id: ch.id,
      creatorId: ch.creator_id,
      type: ch.type as ChannelType,
      name: ch.name,
      summary: ch.summary,
      boardIds: boards.map((b) => b.board_id),
      createdAt: ch.created_at,
    });
  }
  return result;
}

/**
 * Grant an agent access to a channel.
 * Only the channel creator may grant. The agent's owner must have visibility
 * to all linked boards. The agent must not be revoked.
 */
export function grantAgent(
  principal: Principal,
  channelId: number,
  agentId: string,
): void {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const ch = q("SELECT id, creator_id FROM collab_channels WHERE id = ?").get(channelId) as
    | { id: number; creator_id: string }
    | undefined;
  if (!ch || ch.creator_id !== principal.id || !canAccessChannel(principal, channelId)) throw new CollabError(404, "Not found");

  const agent = getAgentRow(agentId);
  if (!agent || agent.revoked_at) throw new CollabError(404, "Not found");

  // Agent's owner must have visibility to all linked boards
  if (!humanCanSeeAllChannelBoards(agent.owner_user_id, channelId))
    throw new CollabError(404, "Not found");

  q(
    `INSERT OR IGNORE INTO collab_channel_agents (channel_id, agent_id, granted_at)
     VALUES (?, ?, ?)`,
  ).run(channelId, agentId, now());
}

/**
 * Revoke an agent's access to a channel. Creator only.
 */
export function revokeAgentGrant(
  principal: Principal,
  channelId: number,
  agentId: string,
): void {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const ch = q("SELECT id, creator_id FROM collab_channels WHERE id = ?").get(channelId) as
    | { id: number; creator_id: string }
    | undefined;
  if (!ch || ch.creator_id !== principal.id || !canAccessChannel(principal, channelId)) throw new CollabError(404, "Not found");

  q("DELETE FROM collab_channel_agents WHERE channel_id = ? AND agent_id = ?").run(
    channelId,
    agentId,
  );
}

/**
 * List agents eligible for a channel (for the channel creator).
 * Returns sanitized public fields only.
 */
export function listEligibleAgents(
  principal: Principal,
  channelId: number,
): (AgentPublic & { granted: boolean })[] {
  requireHuman(principal);
  requirePrincipalExists(principal);
  ensureCollabSchema();

  const ch = q("SELECT id, type, creator_id FROM collab_channels WHERE id = ?").get(channelId) as
    | { id: number; type: string; creator_id: string }
    | undefined;
  if (!ch || ch.creator_id !== principal.id || !canAccessChannel(principal, channelId)) throw new CollabError(404, "Not found");

  // All non-revoked agents whose owner can see all channel boards
  const agents = q(
    "SELECT id, owner_user_id, display_name, provider, created_at, revoked_at FROM collab_agents WHERE revoked_at IS NULL",
  ).all() as {
    id: string;
    owner_user_id: string;
    display_name: string;
    provider: string;
    created_at: string;
    revoked_at: string | null;
  }[];

  const result: (AgentPublic & { granted: boolean })[] = [];
  for (const a of agents) {
    if (!getUser(a.owner_user_id) || !humanCanSeeAllChannelBoards(a.owner_user_id, channelId))
      continue;
    result.push({
      id: a.id,
      displayName: a.display_name,
      provider: a.provider,
      createdAt: a.created_at,
      revoked: false,
      granted: !!q("SELECT 1 FROM collab_channel_agents WHERE channel_id = ? AND agent_id = ?").get(channelId, a.id),
    });
  }
  return result;
}

/* ══════════════════════════════════════════════════════════
 * Messages
 * ══════════════════════════════════════════════════════════ */

/** Current recipients in this channel, with no token or owner credentials. */
export function listChannelAgents(principal: Principal, channelId: number): AgentPublic[] {
  requirePrincipalExists(principal);
  if (!canAccessChannel(principal, channelId)) throw new CollabError(404, "Not found");
  const ids = q("SELECT agent_id FROM collab_channel_agents WHERE channel_id = ?").all(channelId) as {agent_id: string}[];
  return ids.filter(({agent_id}) => canAccessChannel({kind: "agent", id: agent_id}, channelId)).map(({agent_id}) => {
    const a = getAgentRow(agent_id)!;
    return {id: a.id, displayName: a.display_name, provider: a.provider, createdAt: a.created_at, revoked: false};
  });
}

function clientKey(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new CollabError(400, "Invalid clientId");
  return value.trim();
}

export interface MessagePublic {
  id: number;
  channelId: number;
  authorKind: string;
  authorId: string;
  authorDisplayName: string;
  text: string;
  kind: MessageKind;
  replyToId: number | null;
  cardId: number | null;
  createdAt: string;
}

const VALID_MESSAGE_KINDS: MessageKind[] = ["discussion", "question", "decision", "result"];

function resolveDisplayName(p: Principal): string {
  if (p.kind === "human") {
    const u = getUser(p.id);
    return u?.displayName ?? p.id;
  }
  const a = getAgentRow(p.id);
  return a?.display_name ?? p.id;
}

/**
 * Validate a card reference: card must exist, not archived,
 * and belong to one of the channel's linked boards.
 */
function validateCardRef(channelId: number, cardId: number): void {
  const ch = q("SELECT type FROM collab_channels WHERE id = ?").get(channelId) as
    | { type: string }
    | undefined;
  if (!ch) throw new CollabError(404, "Not found");
  if (ch.type === "topic") throw new CollabError(400, "Topic channels cannot reference cards");

  const card = getCard(cardId);
  if (!card || card.archivedAt) throw new CollabError(404, "Not found");

  const linked = q(
    "SELECT 1 FROM collab_channel_boards WHERE channel_id = ? AND board_id = ?",
  ).get(channelId, card.boardId);
  if (!linked) throw new CollabError(404, "Not found");
}

/**
 * Check if a card reference is currently valid for display.
 * Returns false if card doesn't exist, is archived, or no longer belongs to a linked board.
 */
function isCardRefValid(channelId: number, cardId: number): boolean {
  const card = getCard(cardId);
  if (!card || card.archivedAt) return false;
  const linked = q(
    "SELECT 1 FROM collab_channel_boards WHERE channel_id = ? AND board_id = ?",
  ).get(channelId, card.boardId);
  return !!linked;
}

export function postMessage(
  principal: Principal,
  channelId: number,
  opts: {
    text: string;
    kind?: MessageKind;
    replyToId?: number | null;
    cardId?: number | null;
    clientId?: string | null;
  },
): MessagePublic {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  if (!canAccessChannel(principal, channelId))
    throw new CollabError(404, "Not found");

  const text = opts.text;
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw new CollabError(400, "Invalid message text");

  const kind = opts.kind ?? "discussion";
  if (!VALID_MESSAGE_KINDS.includes(kind))
    throw new CollabError(400, "Invalid message kind");

  const clientId = clientKey(opts.clientId);
  if (clientId && clientId.length > 200)
    throw new CollabError(400, "clientId too long");

  // Validate replyTo
  if (opts.replyToId != null) {
    const ref = q(
      "SELECT id, channel_id FROM collab_messages WHERE id = ?",
    ).get(opts.replyToId) as { id: number; channel_id: number } | undefined;
    if (!ref || ref.channel_id !== channelId)
      throw new CollabError(404, "Not found");
  }

  // Validate cardId
  if (opts.cardId != null) {
    validateCardRef(channelId, opts.cardId);
  }

  const authorDisplayName = resolveDisplayName(principal);

  const d = db();
  return d.transaction(() => {
    // Idempotency check
    if (clientId) {
      const existing = q(
        `SELECT * FROM collab_messages
         WHERE channel_id = ? AND author_kind = ? AND author_id = ? AND client_id = ?`,
      ).get(channelId, principal.kind, principal.id, clientId) as
        | {
            id: number;
            channel_id: number;
            author_kind: string;
            author_id: string;
            author_display_name: string;
            text: string;
            kind: string;
            reply_to_id: number | null;
            card_id: number | null;
            created_at: string;
          }
        | undefined;

      if (existing) {
        // Same payload → return existing
        if (
          existing.text === text &&
          existing.kind === kind &&
          (existing.reply_to_id ?? null) === (opts.replyToId ?? null) &&
          (existing.card_id ?? null) === (opts.cardId ?? null)
        ) {
          return {
            id: existing.id,
            channelId: existing.channel_id,
            authorKind: existing.author_kind,
            authorId: existing.author_id,
            authorDisplayName: existing.author_display_name,
            text: existing.text,
            kind: existing.kind as MessageKind,
            replyToId: existing.reply_to_id,
            cardId: existing.card_id,
            createdAt: existing.created_at,
          };
        }
        // Different payload → conflict
        throw new CollabError(409, "Duplicate clientId with different payload");
      }
    }

    const res = q(
      `INSERT INTO collab_messages
       (channel_id, author_kind, author_id, author_display_name, text, kind, reply_to_id, card_id, client_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      channelId,
      principal.kind,
      principal.id,
      authorDisplayName,
      text,
      kind,
      opts.replyToId ?? null,
      opts.cardId ?? null,
      clientId,
      now(),
    );

    return {
      id: Number(res.lastInsertRowid),
      channelId,
      authorKind: principal.kind,
      authorId: principal.id,
      authorDisplayName,
      text,
      kind,
      replyToId: opts.replyToId ?? null,
      cardId: opts.cardId ?? null,
      createdAt: now(),
    };
  })();
}

export function listMessages(
  principal: Principal,
  channelId: number,
  opts: { after?: number; before?: number; latest?: boolean; limit?: number } = {},
): MessagePublic[] {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  if (!canAccessChannel(principal, channelId))
    throw new CollabError(404, "Not found");

  const after = opts.after ?? 0;
  const limit = opts.limit ?? 100;
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (opts.before !== undefined && (!Number.isSafeInteger(opts.before) || opts.before < 1)) ||
      (opts.latest !== undefined && typeof opts.latest !== "boolean") ||
      (Number(opts.after !== undefined) + Number(opts.before !== undefined) + Number(opts.latest === true) > 1)) {
    throw new CollabError(400, "Invalid pagination");
  }
  const descending = opts.latest === true || opts.before !== undefined;

  const rows = q(
    `SELECT * FROM collab_messages
     WHERE channel_id = ? AND id ${descending ? "<" : ">"} ?
     ORDER BY id ${descending ? "DESC" : "ASC"} LIMIT ?`,
  ).all(channelId, descending ? (opts.before ?? Number.MAX_SAFE_INTEGER) : after, limit) as {
    id: number;
    channel_id: number;
    author_kind: string;
    author_id: string;
    author_display_name: string;
    text: string;
    kind: string;
    reply_to_id: number | null;
    card_id: number | null;
    created_at: string;
  }[];

  if (descending) rows.reverse();
  return rows.map((r) => {
    // Check if card reference is still valid
    let cardId = r.card_id;
    if (cardId != null && !isCardRefValid(channelId, cardId)) {
      cardId = null; // safe omission
    }
    return {
      id: r.id,
      channelId: r.channel_id,
      authorKind: r.author_kind,
      authorId: r.author_id,
      authorDisplayName: r.author_display_name,
      text: r.text,
      kind: r.kind as MessageKind,
      replyToId: r.reply_to_id,
      cardId,
      createdAt: r.created_at,
    };
  });
}

/* ══════════════════════════════════════════════════════════
 * Handoffs
 * ══════════════════════════════════════════════════════════ */

export interface HandoffPublic {
  id: number;
  channelId: number;
  senderKind: string;
  senderId: string;
  toAgentId: string;
  brief: string;
  cardId: number | null;
  state: HandoffState;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createHandoff(
  principal: Principal,
  channelId: number,
  opts: {
    toAgentId: string;
    brief: string;
    cardId?: number | null;
    clientId?: string | null;
  },
): HandoffPublic {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  if (!canAccessChannel(principal, channelId))
    throw new CollabError(404, "Not found");

  const brief = typeof opts.brief === "string" ? opts.brief.trim() : "";
  if (!brief || brief.length > 2000) throw new CollabError(400, "Invalid brief");

  const clientId = clientKey(opts.clientId);

  if (!canAccessChannel({kind: "agent", id: opts.toAgentId}, channelId)) throw new CollabError(404, "Not found");

  // Validate target agent is granted to this channel
  const grant = q(
    "SELECT 1 FROM collab_channel_agents WHERE channel_id = ? AND agent_id = ?",
  ).get(channelId, opts.toAgentId);
  if (!grant) throw new CollabError(404, "Not found");

  // Target agent must not be revoked
  const targetAgent = getAgentRow(opts.toAgentId);
  if (!targetAgent || targetAgent.revoked_at) throw new CollabError(404, "Not found");

  // Validate cardId
  if (opts.cardId != null) {
    validateCardRef(channelId, opts.cardId);
  }

  const senderDisplayName = resolveDisplayName(principal);

  const d = db();
  return d.transaction(() => {
    // Idempotency check
    if (clientId) {
      const existing = q(
        `SELECT * FROM collab_handoffs
         WHERE channel_id = ? AND sender_kind = ? AND sender_id = ? AND client_id = ?`,
      ).get(channelId, principal.kind, principal.id, clientId) as
        | {
            id: number;
            channel_id: number;
            sender_kind: string;
            sender_id: string;
            to_agent_id: string;
            brief: string;
            card_id: number | null;
            state: string;
            result: string | null;
            client_id: string;
            created_at: string;
            updated_at: string;
          }
        | undefined;

      if (existing) {
        if (
          existing.to_agent_id === opts.toAgentId &&
          existing.brief === brief &&
          (existing.card_id ?? null) === (opts.cardId ?? null)
        ) {
          return {
            id: existing.id,
            channelId: existing.channel_id,
            senderKind: existing.sender_kind,
            senderId: existing.sender_id,
            toAgentId: existing.to_agent_id,
            brief: existing.brief,
            cardId: existing.card_id,
            state: existing.state as HandoffState,
            result: existing.result,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
          };
        }
        throw new CollabError(409, "Duplicate clientId with different payload");
      }
    }

    const t = now();
    const res = q(
      `INSERT INTO collab_handoffs
       (channel_id, sender_kind, sender_id, to_agent_id, brief, card_id, state, client_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(
      channelId,
      principal.kind,
      principal.id,
      opts.toAgentId,
      brief,
      opts.cardId ?? null,
      clientId,
      t,
      t,
    );
    const handoffId = Number(res.lastInsertRowid);

    // Append a visible message about the handoff creation
    q(
      `INSERT INTO collab_messages
       (channel_id, author_kind, author_id, author_display_name, text, kind, reply_to_id, card_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'discussion', NULL, ?, ?)`,
    ).run(
      channelId,
      principal.kind,
      principal.id,
      senderDisplayName,
      `[Handoff #${handoffId}] ${brief}`,
      opts.cardId ?? null,
      t,
    );

    return {
      id: handoffId,
      channelId,
      senderKind: principal.kind,
      senderId: principal.id,
      toAgentId: opts.toAgentId,
      brief,
      cardId: opts.cardId ?? null,
      state: "pending" as HandoffState,
      result: null,
      createdAt: t,
      updatedAt: t,
    };
  })();
}

function transitionHandoff(
  principal: Principal,
  handoffId: number,
  toState: "accepted" | "declined" | "completed",
  result?: string,
): HandoffPublic {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  // Only the receiving agent may transition
  if (principal.kind !== "agent")
    throw new CollabError(404, "Not found");

  const d = db();
  return d.transaction(() => {
    const row = q("SELECT * FROM collab_handoffs WHERE id = ?").get(handoffId) as
      | {
          id: number;
          channel_id: number;
          sender_kind: string;
          sender_id: string;
          to_agent_id: string;
          brief: string;
          card_id: number | null;
          state: string;
          result: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row || row.to_agent_id !== principal.id)
      throw new CollabError(404, "Not found");

    // Must still have channel access
    if (!canAccessChannel(principal, row.channel_id))
      throw new CollabError(404, "Not found");

    // Validate state transition
    if (toState === "accepted" && row.state !== "pending")
      throw new CollabError(409, "Invalid state transition");
    if (toState === "declined" && row.state !== "pending")
      throw new CollabError(409, "Invalid state transition");
    if (toState === "completed" && row.state !== "accepted")
      throw new CollabError(409, "Invalid state transition");

    if (toState === "completed") {
      if (typeof result !== "string" || !result.trim())
        throw new CollabError(400, "Result required for completion");
      if (result.length > 12000) throw new CollabError(400, "Result too long");
    }

    const t = now();
    q(
      `UPDATE collab_handoffs SET state = ?, result = ?, updated_at = ? WHERE id = ?`,
    ).run(toState, toState === "completed" ? result! : null, t, handoffId);

    // Append a visible message about the transition
    const displayName = resolveDisplayName(principal);
    let msgText: string;
    if (toState === "accepted") msgText = `[Handoff #${handoffId} accepted]`;
    else if (toState === "declined") msgText = `[Handoff #${handoffId} declined]`;
    else msgText = `[Handoff #${handoffId} completed] ${result!.slice(0, 500)}`;

    q(
      `INSERT INTO collab_messages
       (channel_id, author_kind, author_id, author_display_name, text, kind, reply_to_id, card_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'result', NULL, ?, ?)`,
    ).run(row.channel_id, principal.kind, principal.id, displayName, msgText, row.card_id, t);

    return {
      id: row.id,
      channelId: row.channel_id,
      senderKind: row.sender_kind,
      senderId: row.sender_id,
      toAgentId: row.to_agent_id,
      brief: row.brief,
      cardId: row.card_id != null && isCardRefValid(row.channel_id, row.card_id) ? row.card_id : null,
      state: toState,
      result: toState === "completed" ? result! : null,
      createdAt: row.created_at,
      updatedAt: t,
    };
  })();
}

export function acceptHandoff(principal: Principal, handoffId: number): HandoffPublic {
  return transitionHandoff(principal, handoffId, "accepted");
}

export function declineHandoff(principal: Principal, handoffId: number): HandoffPublic {
  return transitionHandoff(principal, handoffId, "declined");
}

export function completeHandoff(
  principal: Principal,
  handoffId: number,
  result: string,
): HandoffPublic {
  return transitionHandoff(principal, handoffId, "completed", result);
}

export function listChannelHandoffs(
  principal: Principal,
  channelId: number,
): HandoffPublic[] {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  if (!canAccessChannel(principal, channelId))
    throw new CollabError(404, "Not found");

  const rows = q(
    "SELECT * FROM collab_handoffs WHERE channel_id = ? ORDER BY id",
  ).all(channelId) as {
    id: number;
    channel_id: number;
    sender_kind: string;
    sender_id: string;
    to_agent_id: string;
    brief: string;
    card_id: number | null;
    state: string;
    result: string | null;
    created_at: string;
    updated_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    senderKind: r.sender_kind,
    senderId: r.sender_id,
    toAgentId: r.to_agent_id,
    brief: r.brief,
    cardId: r.card_id != null && isCardRefValid(r.channel_id, r.card_id) ? r.card_id : null,
    state: r.state as HandoffState,
    result: r.result,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Agent inbox: pending/accepted handoffs for this agent,
 * filtered to only currently visible channels.
 */
export function agentInbox(principal: Principal): HandoffPublic[] {
  requirePrincipalExists(principal);
  ensureCollabSchema();

  if (principal.kind !== "agent") throw new CollabError(404, "Not found");

  const rows = q(
    `SELECT * FROM collab_handoffs
     WHERE to_agent_id = ? AND state IN ('pending', 'accepted')
     ORDER BY id`,
  ).all(principal.id) as {
    id: number;
    channel_id: number;
    sender_kind: string;
    sender_id: string;
    to_agent_id: string;
    brief: string;
    card_id: number | null;
    state: string;
    result: string | null;
    created_at: string;
    updated_at: string;
  }[];

  const result: HandoffPublic[] = [];
  for (const r of rows) {
    if (!canAccessChannel(principal, r.channel_id)) continue;
    result.push({
      id: r.id,
      channelId: r.channel_id,
      senderKind: r.sender_kind,
      senderId: r.sender_id,
      toAgentId: r.to_agent_id,
      brief: r.brief,
      cardId: r.card_id != null && isCardRefValid(r.channel_id, r.card_id) ? r.card_id : null,
      state: r.state as HandoffState,
      result: r.result,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  return result;
}
