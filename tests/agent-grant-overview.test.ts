/**
 * Owner-side view of each agent's channel grants, including withdrawal of dormant grants.
 */
import fs from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db, resetDbForTests } from "@/lib/db";
import { createBoard, createUser, updateBoard } from "@/lib/queries";
import {
  createAgent,
  createChannel,
  grantAgent,
  listOwnedAgentGrants,
  revokeAgent,
  revokeAgentGrant,
  withdrawOwnAgentGrant,
  type Principal,
} from "@/lib/collaboration";

const human = (id: string): Principal => ({ kind: "human", id });
const agent = (id: string): Principal => ({ kind: "agent", id });
const owner = human("admin");
const other = human("other");

beforeEach(() => {
  resetDbForTests();
  fs.rmSync(process.env.KANBAN_DATA_DIR!, { recursive: true, force: true });
  db();
  createUser("other", "Other", "fixture");
});

const notFound = expect.objectContaining({ status: 404 });
const grantRows = (agentId: string) =>
  (db().prepare("SELECT COUNT(*) AS n FROM collab_channel_agents WHERE agent_id = ?").get(agentId) as { n: number }).n;
afterEach(() => { vi.useRealTimers(); });

it("orders by agent creation, then grant time, then channel id", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const at = (minute: number) => vi.setSystemTime(new Date(Date.UTC(2026, 9, 13, 9, minute)));
  const low = createChannel(owner, { name: "Low id", type: "topic" });
  const high = createChannel(owner, { name: "High id", type: "topic" });
  at(1); const first = createAgent(owner, { displayName: "First" });
  at(2); const second = createAgent(owner, { displayName: "Second" });
  at(3); grantAgent(owner, low.id, second.agent.id);
  at(4); grantAgent(owner, high.id, first.agent.id);   // granted before the lower channel id
  at(5); grantAgent(owner, low.id, first.agent.id);
  expect(listOwnedAgentGrants(owner).map((g) => [g.agentId, g.channelId])).toEqual([
    [first.agent.id, high.id], [first.agent.id, low.id], [second.agent.id, low.id],
  ]);
});

it("a channel creator cannot withdraw another owner's agent from the overview path", () => {
  const topic = createChannel(owner, { name: "Topic", type: "topic" });
  const theirs = createAgent(other, { displayName: "Theirs" });
  grantAgent(other, topic.id, theirs.agent.id);
  expect(() => withdrawOwnAgentGrant(owner, theirs.agent.id, topic.id)).toThrow(notFound);
  expect(listOwnedAgentGrants(other).map((g) => g.channelId)).toEqual([topic.id]);
});

it("lists only the owner's live agents' grants, ordered and sanitized", () => {
  const topic = createChannel(owner, { name: "Topic", type: "topic" });
  const board = createBoard({ name: "Shared", createdBy: "admin" });
  const project = createChannel(owner, { name: "Project", type: "project", boardIds: [board] });

  const mine = createAgent(owner, { displayName: "Mine" });
  const gone = createAgent(owner, { displayName: "Gone" });
  const theirs = createAgent(other, { displayName: "Theirs" });
  grantAgent(owner, topic.id, mine.agent.id);
  grantAgent(owner, project.id, mine.agent.id);
  grantAgent(owner, topic.id, gone.agent.id);
  grantAgent(other, topic.id, theirs.agent.id);
  revokeAgent(owner, gone.agent.id);

  const grants = listOwnedAgentGrants(owner);
  expect(grants.map(({ agentId, channelId, channelName, channelType, active }) => ({
    agentId,
    channelId,
    channelName,
    channelType,
    active,
  }))).toEqual([
    { agentId: mine.agent.id, channelId: topic.id, channelName: "Topic", channelType: "topic", active: true },
    { agentId: mine.agent.id, channelId: project.id, channelName: "Project", channelType: "project", active: true },
  ]);
  for (const row of grants) {
    expect(Object.keys(row).sort()).toEqual([
      "active",
      "agentId",
      "channelId",
      "channelName",
      "channelType",
      "grantedAt",
    ]);
    expect(typeof row.grantedAt).toBe("string");
  }
  // The other owner only ever sees their own agent's grant.
  expect(listOwnedAgentGrants(other).map((g) => g.agentId)).toEqual([theirs.agent.id]);
});

it("hides a channel the owner lost, yet the dormant grant stays withdrawable", () => {
  const board = createBoard({ name: "Shared", createdBy: "other" });
  const project = createChannel(owner, { name: "Project", type: "project", boardIds: [board] });
  const mine = createAgent(owner, { displayName: "Mine" });
  grantAgent(owner, project.id, mine.agent.id);

  updateBoard(board, { visibility: "private" });

  expect(listOwnedAgentGrants(owner)).toEqual([
    expect.objectContaining({
      agentId: mine.agent.id,
      channelId: project.id,
      channelName: null,
      channelType: null,
      active: false,
    }),
  ]);

  // The channel-page path still refuses: the owner can no longer access the channel.
  expect(() => revokeAgentGrant(owner, project.id, mine.agent.id)).toThrow(notFound);
  withdrawOwnAgentGrant(owner, mine.agent.id, project.id);
  expect(listOwnedAgentGrants(owner)).toEqual([]);
});

it("withdrawal is restricted to the owning human and stays a silent no-op when absent", () => {
  const topic = createChannel(owner, { name: "Topic", type: "topic" });
  const mine = createAgent(owner, { displayName: "Mine" });
  const revoked = createAgent(owner, { displayName: "Revoked" });
  grantAgent(owner, topic.id, mine.agent.id);
  grantAgent(owner, topic.id, revoked.agent.id);
  revokeAgent(owner, revoked.agent.id);

  expect(() => withdrawOwnAgentGrant(other, mine.agent.id, topic.id)).toThrow(notFound);
  expect(listOwnedAgentGrants(owner).map((g) => g.channelId)).toEqual([topic.id]);

  expect(() => withdrawOwnAgentGrant(owner, "0".repeat(32), topic.id)).toThrow(notFound);
  expect(() => withdrawOwnAgentGrant(owner, mine.agent.id, 0)).toThrow(notFound);
  expect(() => withdrawOwnAgentGrant(owner, mine.agent.id, 1.5)).toThrow(notFound);

  // Absent grant of an owned agent: no error, nothing removed.
  withdrawOwnAgentGrant(owner, mine.agent.id, topic.id + 999);
  expect(listOwnedAgentGrants(owner).map((g) => g.channelId)).toEqual([topic.id]);

  // Revoked agents are excluded from the overview but their grants remain removable.
  expect(grantRows(revoked.agent.id)).toBe(1);
  withdrawOwnAgentGrant(owner, revoked.agent.id, topic.id);
  expect(grantRows(revoked.agent.id)).toBe(0);

  // Agent principals can neither read nor withdraw grants.
  expect(() => listOwnedAgentGrants(agent(mine.agent.id))).toThrow(notFound);
  expect(() => withdrawOwnAgentGrant(agent(mine.agent.id), mine.agent.id, topic.id)).toThrow(notFound);
  expect(listOwnedAgentGrants(owner).map((g) => g.channelId)).toEqual([topic.id]);
});
