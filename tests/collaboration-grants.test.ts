import fs from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { db, resetDbForTests } from "@/lib/db";
import { createBoard, createUser, updateBoard } from "@/lib/queries";
import { createAgent, createChannel, grantAgent, revokeAgent, revokeAgentGrant, listEligibleAgents,
  listChannelAgents, listChannels, createHandoff, type Principal } from "@/lib/collaboration";
import { handleAgentRequest } from "@/lib/agent-api";
const human = (id: string): Principal => ({kind: "human", id});
const agent = (id: string): Principal => ({kind: "agent", id});
const creator = human("admin");
const member = human("other");
const third = human("third");
beforeEach(() => {
  resetDbForTests();
  fs.rmSync(process.env.KANBAN_DATA_DIR!, { recursive: true, force: true });
  db(); createUser("other", "Other", "fixture"); createUser("third", "Third", "fixture");
});
const notFound = expect.objectContaining({status: 404});
const granted = (channelId: number) => listChannelAgents(creator, channelId).map(a => a.id).sort();

it("only an agent's owner can grant it, even the channel creator in an open topic", () => {
  const topic = createChannel(creator, {name: "Topic", type: "topic"});
  const board = createBoard({name: "Shared", createdBy: "admin"});
  const project = createChannel(creator, {name: "Project", type: "project", boardIds: [board]});
  const mine = createAgent(creator, {displayName: "Mine"});
  const theirs = createAgent(member, {displayName: "Theirs"});
  for (const ch of [topic, project]) {
    expect(() => grantAgent(creator, ch.id, theirs.agent.id)).toThrow(notFound);
    expect(() => grantAgent(third, ch.id, theirs.agent.id)).toThrow(notFound);
    expect(granted(ch.id)).toEqual([]);
    grantAgent(member, ch.id, theirs.agent.id);
    grantAgent(creator, ch.id, mine.agent.id);
    expect(granted(ch.id)).toEqual([mine.agent.id, theirs.agent.id].sort());
  }
  expect(listChannels(agent(theirs.agent.id)).map(c => c.id).sort()).toEqual([topic.id, project.id].sort());
  // Unknown and foreign agents share one safe error.
  expect(() => grantAgent(member, topic.id, "0".repeat(32))).toThrow(notFound);
});

it("a human who cannot access a project channel cannot grant their own agent into it", () => {
  const board = createBoard({name: "Private", createdBy: "admin", visibility: "private"});
  const channel = createChannel(creator, {name: "Private", type: "project", boardIds: [board]});
  const theirs = createAgent(member, {displayName: "Theirs"});
  expect(() => grantAgent(member, channel.id, theirs.agent.id)).toThrow(notFound);
  expect(() => listEligibleAgents(member, channel.id)).toThrow(notFound);
  expect(granted(channel.id)).toEqual([]);
});

it("the creator or the agent's owner may remove a grant; other members may not", () => {
  const channel = createChannel(creator, {name: "Topic", type: "topic"});
  const a = createAgent(member, {displayName: "A"});
  const b = createAgent(member, {displayName: "B"});
  const c = createAgent(creator, {displayName: "C"});
  grantAgent(member, channel.id, a.agent.id); grantAgent(member, channel.id, b.agent.id); grantAgent(creator, channel.id, c.agent.id);
  expect(() => revokeAgentGrant(third, channel.id, a.agent.id)).toThrow(notFound);
  expect(() => revokeAgentGrant(member, channel.id, c.agent.id)).toThrow(notFound);
  expect(granted(channel.id)).toEqual([a.agent.id, b.agent.id, c.agent.id].sort());
  revokeAgentGrant(creator, channel.id, a.agent.id);
  revokeAgentGrant(member, channel.id, b.agent.id);
  expect(granted(channel.id)).toEqual([c.agent.id]);
  // Removing an absent grant stays a no-op for an allowed caller.
  revokeAgentGrant(member, channel.id, b.agent.id);
});

it("eligible agents: members see their own, the creator also sees others' granted agents", () => {
  const channel = createChannel(creator, {name: "Topic", type: "topic"});
  const own = createAgent(creator, {displayName: "Own"});
  const ownRevoked = createAgent(creator, {displayName: "Gone"});
  revokeAgent(creator, ownRevoked.agent.id);
  const memberGranted = createAgent(member, {displayName: "Member granted"});
  const memberIdle = createAgent(member, {displayName: "Member idle"});
  const thirdIdle = createAgent(third, {displayName: "Third idle"});
  grantAgent(member, channel.id, memberGranted.agent.id);

  const view = (p: Principal) => listEligibleAgents(p, channel.id).map(({id, granted, owned}) => ({id, granted, owned}));
  // Own agents come first; others' granted agents follow and are never grantable.
  expect(view(creator)).toEqual([
    {id: own.agent.id, granted: false, owned: true},
    {id: memberGranted.agent.id, granted: true, owned: false},
  ]);
  expect(view(member).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
    {id: memberGranted.agent.id, granted: true, owned: true},
    {id: memberIdle.agent.id, granted: false, owned: true},
  ].sort((x, y) => x.id.localeCompare(y.id)));
  expect(view(third)).toEqual([{id: thirdIdle.agent.id, granted: false, owned: true}]);
  for (const p of [creator, member, third]) for (const row of listEligibleAgents(p, channel.id)) {
    expect(Object.keys(row).sort()).toEqual(["createdAt", "displayName", "granted", "id", "owned", "provider", "revoked"]);
  }
  expect(() => listEligibleAgents(agent(memberGranted.agent.id), channel.id)).toThrow(notFound);
});

it("accept and decline need no request body; complete still requires its result", async () => {
  const channel = createChannel(creator, {name: "Topic", type: "topic"});
  const sender = createAgent(creator, {displayName: "Sender"});
  const receiver = createAgent(member, {displayName: "Receiver"});
  grantAgent(creator, channel.id, sender.agent.id); grantAgent(member, channel.id, receiver.agent.id);
  const handoff = () => createHandoff(agent(sender.agent.id), channel.id, {toAgentId: receiver.agent.id, brief: "Work"}).id;
  async function post(path: string, raw?: string) {
    const headers: Record<string, string> = {authorization: `Bearer ${receiver.token}`};
    if (raw !== undefined) headers["content-type"] = "application/json";
    const response = await handleAgentRequest(new Request(`http://localhost/api/agent/${path}`,
      {method: "POST", headers, body: raw}), path.split("/"));
    return {status: response.status, body: await response.json()};
  }
  for (const raw of [undefined, "{}"]) {
    const accepted = handoff();
    expect(await post(`handoffs/${accepted}/accept`, raw)).toMatchObject({status: 200, body: {state: "accepted"}});
    expect((await post(`handoffs/${accepted}/complete`)).status).toBe(400);
    expect(await post(`handoffs/${accepted}/complete`, JSON.stringify({result: "Done"})))
      .toMatchObject({status: 200, body: {state: "completed", result: "Done"}});
    expect(await post(`handoffs/${handoff()}/decline`, raw)).toMatchObject({status: 200, body: {state: "declined"}});
  }
  expect((await post(`handoffs/${handoff()}/frobnicate`)).status).toBe(404);
});

it("the creator's view hides other owners' agents that lost access, and grants are per channel", () => {
  const board = createBoard({name: "Shared", createdBy: "admin"});
  const project = createChannel(creator, {name: "Project", type: "project", boardIds: [board]});
  const topic = createChannel(creator, {name: "Topic", type: "topic"});
  const theirs = createAgent(member, {displayName: "Theirs"});
  grantAgent(member, project.id, theirs.agent.id);
  expect(listEligibleAgents(member, topic.id).map(({id, granted}) => ({id, granted}))).toEqual([{id: theirs.agent.id, granted: false}]);
  expect(listEligibleAgents(creator, project.id).map(a => a.id)).toEqual([theirs.agent.id]);
  updateBoard(board, {visibility: "private"});
  expect(listEligibleAgents(creator, project.id)).toEqual([]);
  expect(listChannelAgents(creator, project.id)).toEqual([]);
});
