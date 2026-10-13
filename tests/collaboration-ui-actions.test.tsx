/**
 * Focused Vitest integration tests for collaboration server actions and presentational smoke tests.
 *
 * Uses real disposable SQLite per test, mocked current-user and next/cache.
 */
import fs from "node:fs";
import ChannelDetailPage from "@/app/collab/[id]/page";
import CollabHubPage from "@/app/collab/page";
import AgentsRegistryPage from "@/app/agents/page";
import NavBar from "@/components/NavBar";
import { revalidatePath } from "next/cache";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentAction,
  createChannelAction,
  createHandoffAction,
  grantAgentAction,
  loadOlderMessagesAction,
  postMessageAction,
  revokeAgentAction,
  revokeAgentGrantAction,
  rotateAgentTokenAction,
} from "@/app/actions-collab";
import AgentConnectGuide from "@/components/agents/AgentConnectGuide";
import TokenBanner from "@/components/agents/TokenBanner";
import ChannelList from "@/components/collab/ChannelList";
import { resetCollabInit } from "@/lib/collaboration";
import { db, resetDbForTests } from "@/lib/db";
import {
  createBoard,
  createCard,
  createUser,
  getLists,
} from "@/lib/queries";

let currentUserId = "admin";

vi.mock("@/lib/current-user", () => ({
  requireUser: async () => {
    const { getUser } = await import("@/lib/queries");
    const u = getUser(currentUserId);
    if (!u) {
      const err = new Error("NEXT_REDIRECT");
      (err as unknown as { digest: string }).digest = "NEXT_REDIRECT;/login;307";
      throw err;
    }
    return u;
  },
  getSessionUser: async () => {
    const { getUser } = await import("@/lib/queries");
    return getUser(currentUserId);
  },
  SESSION_COOKIE: "sankyaku_agents_session",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/collab",
  redirect: (url: string) => {
    const err = new Error("NEXT_REDIRECT");
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;${url};307`;
    throw err;
  },
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  },
}));

const DIR = process.env.KANBAN_DATA_DIR!;

beforeEach(() => {
  currentUserId = "admin";
  resetCollabInit();
  resetDbForTests();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  db(); // seeds schema + default admin admin user
  createUser("bob", "Bob", "secret123");
});

describe("Channel Server Actions (createChannelAction)", () => {
  it("allows authenticated human to create all three valid channel types", async () => {
    const boardA = createBoard({ name: "Board A", createdBy: "admin" });
    const boardB = createBoard({ name: "Board B", createdBy: "admin" });

    // 1. Topic channel (0 boards)
    const topicRes = await createChannelAction({
      name: "通用话题讨论",
      summary: "开放讨论",
      type: "topic",
      boardIds: [],
    });
    expect(topicRes.ok).toBe(true);
    expect(topicRes.channel?.type).toBe("topic");
    expect(topicRes.channel?.creatorId).toBe("admin");

    // 2. Project channel (exactly 1 board)
    const projectRes = await createChannelAction({
      name: "项目协作",
      summary: "看板 A 专项",
      type: "project",
      boardIds: [boardA],
    });
    expect(projectRes.ok).toBe(true);
    expect(projectRes.channel?.type).toBe("project");
    expect(projectRes.channel?.boardIds).toEqual([boardA]);

    // 3. Bridge channel (>= 2 boards)
    const bridgeRes = await createChannelAction({
      name: "跨项目桥梁",
      summary: "A 与 B 跨项目同步",
      type: "bridge",
      boardIds: [boardA, boardB],
    });
    expect(bridgeRes.ok).toBe(true);
    expect(bridgeRes.channel?.type).toBe("bridge");
    expect(bridgeRes.channel?.boardIds).toEqual([boardA, boardB]);
  });

  it("rejects invalid board counts for channel types", async () => {
    const board = createBoard({ name: "Board 1", createdBy: "admin" });

    // Topic with 1 board
    const errTopic = await createChannelAction({
      name: "Bad Topic",
      type: "topic",
      boardIds: [board],
    });
    expect(errTopic.error).toBeTruthy();

    // Project with 0 boards
    const errProj0 = await createChannelAction({
      name: "Bad Project 0",
      type: "project",
      boardIds: [],
    });
    expect(errProj0.error).toBeTruthy();

    // Project with 2 boards
    const board2 = createBoard({ name: "Board 2", createdBy: "admin" });
    const errProj2 = await createChannelAction({
      name: "Bad Project 2",
      type: "project",
      boardIds: [board, board2],
    });
    expect(errProj2.error).toBeTruthy();

    // Bridge with only 1 board
    const errBridge1 = await createChannelAction({
      name: "Bad Bridge 1",
      type: "bridge",
      boardIds: [board],
    });
    expect(errBridge1.error).toBeTruthy();
  });

  it("rejects unauthorized private board of another user", async () => {
    // Bob creates a private board
    const privateBoard = createBoard({
      name: "Bob's Secret",
      createdBy: "bob",
      visibility: "private",
    });

    // admin tries to create a project channel for Bob's private board
    const res = await createChannelAction({
      name: "Unauthorized Project",
      type: "project",
      boardIds: [privateBoard],
    });
    expect(res.error).toBeTruthy();
  });
});

describe("Message Actions (postMessageAction & loadOlderMessagesAction)", () => {
  it("allows human to post message and reply in accessible channel", async () => {
    const board = createBoard({ name: "Board", createdBy: "admin" });
    const { channel } = await createChannelAction({
      name: "讨论频道",
      type: "project",
      boardIds: [board],
    });
    const channelId = channel!.id;

    // Post regular message
    const msg1Res = await postMessageAction(channelId, {
      text: "首条分析讨论",
      kind: "discussion",
    });
    expect(msg1Res.ok).toBe(true);
    expect(msg1Res.message?.text).toBe("首条分析讨论");
    expect(msg1Res.message?.authorKind).toBe("human");
    expect(msg1Res.message?.authorId).toBe("admin");

    // Post reply message
    const replyRes = await postMessageAction(channelId, {
      text: "回复首条分析",
      kind: "decision",
      replyToId: msg1Res.message?.id,
    });
    expect(replyRes.ok).toBe(true);
    expect(replyRes.message?.replyToId).toBe(msg1Res.message?.id);
    expect(replyRes.message?.kind).toBe("decision");
  });

  it("allows valid card reference in project channel but rejects for topic channel", async () => {
    const board = createBoard({ name: "Board", createdBy: "admin" });
    const listId = getLists(board)[0].id;
    const cardId = createCard({ listId, title: "Card 1", createdBy: "admin" });

    // Project channel
    const { channel: projCh } = await createChannelAction({
      name: "Project Ch",
      type: "project",
      boardIds: [board],
    });

    const projMsg = await postMessageAction(projCh!.id, {
      text: "关联卡片讨论",
      cardId,
    });
    expect(projMsg.ok).toBe(true);
    expect(projMsg.message?.cardId).toBe(cardId);

    // Topic channel
    const { channel: topicCh } = await createChannelAction({
      name: "Topic Ch",
      type: "topic",
      boardIds: [],
    });

    const topicMsg = await postMessageAction(topicCh!.id, {
      text: "话题试图关联卡片",
      cardId,
    });
    expect(topicMsg.error).toBeTruthy();
  });

  it("loads older messages via loadOlderMessagesAction cursor", async () => {
    const { channel } = await createChannelAction({
      name: "消息流",
      type: "topic",
      boardIds: [],
    });
    const channelId = channel!.id;

    const m1 = await postMessageAction(channelId, { text: "msg 1" });
    const m2 = await postMessageAction(channelId, { text: "msg 2" });
    const m3 = await postMessageAction(channelId, { text: "msg 3" });

    // Load before m3
    const older = await loadOlderMessagesAction(channelId, m3.message!.id);
    expect(older.ok).toBe(true);
    expect(older.messages?.map((m) => m.id)).toEqual([m1.message!.id, m2.message!.id]);
  });
});

describe("Handoff Actions (createHandoffAction)", () => {
  it("allows creating handoff to granted agent and enforces recipient validation", async () => {
    const board = createBoard({ name: "Board", createdBy: "admin" });
    const { channel } = await createChannelAction({
      name: "协作频道",
      type: "project",
      boardIds: [board],
    });
    const channelId = channel!.id;

    // Create an agent owned by admin
    const { agent } = await createAgentAction({
      displayName: "Codex Assistant",
      provider: "codex",
    });
    const agentId = agent!.id;

    // Before grant: handoff creation is denied
    const ungrantedHandoff = await createHandoffAction(channelId, {
      toAgentId: agentId,
      brief: "请排查任务",
    });
    expect(ungrantedHandoff.error).toBeTruthy();

    // Channel creator grants agent
    const grantRes = await grantAgentAction(channelId, agentId);
    expect(grantRes.ok).toBe(true);

    // After grant: handoff creation succeeds
    const handoffRes = await createHandoffAction(channelId, {
      toAgentId: agentId,
      brief: "请分析日志",
    });
    expect(handoffRes.ok).toBe(true);
    expect(handoffRes.handoff?.toAgentId).toBe(agentId);
    expect(handoffRes.handoff?.brief).toBe("请分析日志");
    expect(handoffRes.handoff?.state).toBe("pending");
  });
});

describe("Agent Management Actions", () => {
  it("creates agent, rotates token, and revokes agent with owner authorization", async () => {
    const createRes = await createAgentAction({
      displayName: "My Claude Bot",
      provider: "claude",
    });
    expect(createRes.ok).toBe(true);
    expect(createRes.token).toMatch(/^ska_/);
    expect(createRes.agent?.displayName).toBe("My Claude Bot");
    expect(createRes.agent?.revoked).toBe(false);

    const agentId = createRes.agent!.id;

    // Rotate token
    const rotateRes = await rotateAgentTokenAction(agentId);
    expect(rotateRes.ok).toBe(true);
    expect(rotateRes.token).toMatch(/^ska_/);
    expect(rotateRes.token).not.toBe(createRes.token);

    // Non-owner (Bob) attempts to rotate -> denied
    currentUserId = "bob";
    const nonOwnerRotate = await rotateAgentTokenAction(agentId);
    expect(nonOwnerRotate.error).toBeTruthy();

    // Non-owner attempts to revoke -> denied
    const nonOwnerRevoke = await revokeAgentAction(agentId);
    expect(nonOwnerRevoke.error).toBeTruthy();

    // Owner revokes agent -> succeeds
    currentUserId = "admin";
    const revokeRes = await revokeAgentAction(agentId);
    expect(revokeRes.ok).toBe(true);

    // After revoke: rotating token fails
    const postRevokeRotate = await rotateAgentTokenAction(agentId);
    expect(postRevokeRotate.error).toBeTruthy();
  });

  it("members grant only their own agents; the creator can also remove others' grants", async () => {
    const board = createBoard({ name: "Board", createdBy: "admin" });
    const { channel } = await createChannelAction({
      name: "Creator's Channel",
      type: "project",
      boardIds: [board],
    });
    const channelId = channel!.id;

    const { agent: adminAgent } = await createAgentAction({ displayName: "Admin Bot", provider: "other" });
    currentUserId = "bob";
    const { agent: bobAgent } = await createAgentAction({ displayName: "Bob Bot", provider: "claude" });

    // Bob (not creator) cannot grant or revoke admin's agent
    expect((await grantAgentAction(channelId, adminAgent!.id)).error).toBeTruthy();
    expect((await revokeAgentGrantAction(channelId, adminAgent!.id)).error).toBeTruthy();

    // Bob grants and revokes his own agent
    expect((await grantAgentAction(channelId, bobAgent!.id)).ok).toBe(true);
    expect((await revokeAgentGrantAction(channelId, bobAgent!.id)).ok).toBe(true);
    expect((await grantAgentAction(channelId, bobAgent!.id)).ok).toBe(true);

    // The creator panel lists Bob's granted agent as removable only
    currentUserId = "admin";
    const page = renderToStaticMarkup(await ChannelDetailPage({ params: Promise.resolve({ id: String(channelId) }) }));
    // Match button text exactly: the panel's help copy also contains these words.
    const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(page).toContain("创建者权限");
    expect(page).toContain("其他成员的 Agent");
    expect(buttons(page)).toContain("移除");
    expect(buttons(page)).toContain("授权进入"); // admin's own, ungranted agent
    expect(buttons(page).filter((b) => b === "授权进入" || b === "取消授权")).toHaveLength(1);

    // The creator cannot grant Bob's agent, but can remove it
    expect((await revokeAgentGrantAction(channelId, bobAgent!.id)).ok).toBe(true);
    expect((await grantAgentAction(channelId, bobAgent!.id)).error).toBeTruthy();

    // Bob sees the panel for his own agents, without creator rights or admin's agent
    currentUserId = "bob";
    const bobPage = renderToStaticMarkup(await ChannelDetailPage({ params: Promise.resolve({ id: String(channelId) }) }));
    expect(bobPage).toContain("Bob Bot");
    expect(buttons(bobPage)).toContain("授权进入");
    expect(buttons(bobPage)).not.toContain("移除");
    expect(bobPage).not.toContain("创建者权限");
    expect(bobPage).not.toContain("Admin Bot");
  });
});

describe("Presentational Component Smoke Tests", () => {
  it("renders ChannelList with channels and empty state without crashing", () => {
    const htmlEmpty = renderToStaticMarkup(
      <ChannelList channels={[]} boardMap={{}} />,
    );
    expect(htmlEmpty).toContain("暂无协作频道");

    const htmlWithChannel = renderToStaticMarkup(
      <ChannelList
        channels={[
          {
            id: 1,
            creatorId: "admin",
            type: "project",
            name: "项目协作频道",
            summary: "任务对齐",
            boardIds: [10],
            createdAt: "2026-10-12T18:00:00Z",
          },
        ]}
        boardMap={{ 10: { id: 10, name: "研发看板" } }}
      />,
    );
    expect(htmlWithChannel).toContain("项目协作频道");
    expect(htmlWithChannel).toContain("研发看板");
  });

  it("renders TokenBanner and AgentConnectGuide safely", () => {
    const htmlBanner = renderToStaticMarkup(
      <TokenBanner
        token="ska_test_token_12345"
        agentName="Test Bot"
        onDismiss={() => {}}
      />,
    );
    expect(htmlBanner).toContain("ska_test_token_12345");
    expect(htmlBanner).toContain("Test Bot");

    const htmlGuide = renderToStaticMarkup(<AgentConnectGuide />);
    expect(htmlGuide).toContain("agent_client.py");
    expect(htmlGuide).toContain("SANKYAKU_TOKEN");
  });
});


describe("Action boundary regressions", () => {
  it("keeps authentication redirects and ignores forged authors", async () => {
    currentUserId = "missing-user";
    await expect(createAgentAction({ displayName: "bot" })).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/login;307" });
    currentUserId = "admin";
    const { channel } = await createChannelAction({ name: "topic", type: "topic", boardIds: [] });
    const forged = { text: "hello", authorId: "bob", authorKind: "agent" };
    const posted = await postMessageAction(channel!.id, forged);
    expect(posted.message).toMatchObject({ authorKind: "human", authorId: "admin" });
  });

  it("rejects malformed runtime forms and hides internal errors", async () => {
    expect((await createAgentAction({ displayName: 12 } as never)).error).toBeTruthy();
    expect((await createChannelAction(null as never)).error).toBeTruthy();
    expect((await postMessageAction(1, { text: "hello", cardId: -1 })).error).toBeTruthy();
    expect((await createHandoffAction(1, { toAgentId: 12 } as never)).error).toBeTruthy();
    expect((await grantAgentAction(1, 12 as never)).error).toBeTruthy();
    vi.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error("SQLITE failure /private/secret.db"); });
    expect(await createAgentAction({ displayName: "bot" })).toEqual({ error: "操作失败，请重试" });
  });
});


describe("Collaboration page access and rendering", () => {
  it("redirects unsigned users and conceals private channels", async () => {
    currentUserId = "missing-user";
    await expect(CollabHubPage({})).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/login;307" });
    await expect(AgentsRegistryPage()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/login;307" });
    const privateBoard = createBoard({ name: "Bob private", createdBy: "bob", visibility: "private" });
    currentUserId = "bob";
    const { channel } = await createChannelAction({ name: "Private discussion", type: "project", boardIds: [privateBoard] });
    currentUserId = "admin";
    await expect(ChannelDetailPage({ params: Promise.resolve({ id: String(channel!.id) }) })).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });
  });

  it("renders authorized project messages and agent management without exposing saved tokens", async () => {
    const board = createBoard({ name: "Sankyaku Agents · 首版协作", createdBy: "admin" });
    const card = createCard({ listId: getLists(board)[0].id, title: "完成 Agent 接入与交接验收", createdBy: "admin" });
    const { channel } = await createChannelAction({ name: "首版发布 · 接口与界面", summary: "验收样例：消息来自本地测试数据，不代表已连接模型。", type: "project", boardIds: [board] });
    await createChannelAction({ name: "跨模型协作设计", summary: "讨论任务拆分、权限与结果交接", type: "topic", boardIds: [] });
    const a = await createAgentAction({ displayName: "Codex · 审查员", provider: "codex" });
    const b = await createAgentAction({ displayName: "Gemini · 实现者", provider: "gemini" });
    await grantAgentAction(channel!.id, a.agent!.id); await grantAgentAction(channel!.id, b.agent!.id);
    const first = await postMessageAction(channel!.id, { text: "先确认本轮目标：让两个独立 Agent 能交换消息，并留下可追踪的交接记录。", cardId: card });
    await postMessageAction(channel!.id, { text: "身份与频道授权分开管理。新 Agent 注册后，需在频道中授权才能读取消息。", kind: "decision", replyToId: first.message!.id });
    await createHandoffAction(channel!.id, { toAgentId: a.agent!.id, brief: "请检查接口权限与交接状态，返回审查结论。", cardId: card });
    const pages = {
      channel: await ChannelDetailPage({ params: Promise.resolve({ id: String(channel!.id) }) }),
      channels: await CollabHubPage({}),
      agents: await AgentsRegistryPage(),
    };
    for (const [name, page] of Object.entries(pages)) {
      const html = renderToStaticMarkup(<><header className="flex items-center gap-4 border-b-2 border-swan px-4 py-3"><strong>三脚协作</strong><NavBar desktop /></header><main className="px-4 pt-4 pb-32">{page}</main><NavBar /></>);
      expect(html).not.toContain(a.token); expect(html).not.toContain(b.token);
      expect(html).not.toContain("token_hash");
      if (process.env.SANKYAKU_CAPTURE_PREVIEW === "1") {
        fs.mkdirSync("verification-output", { recursive: true });
        fs.writeFileSync(`verification-output/${name}.fragment.html`, html);
      }
    }
    expect(renderToStaticMarkup(pages.channel)).toContain("接口权限与交接状态");
    expect(renderToStaticMarkup(pages.agents)).toContain("Codex · 审查员");
  });
});
