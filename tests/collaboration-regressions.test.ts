import fs from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { db, resetDbForTests } from "@/lib/db";
import { createBoard, createUser, updateBoard, getLists, createCard, getCard } from "@/lib/queries";
import { createSessionToken } from "@/lib/auth";
import { createAgent, createChannel, grantAgent, revokeAgentGrant, listEligibleAgents,
  listChannelAgents, createHandoff, postMessage, listMessages, listChannels,
  acceptHandoff, completeHandoff, type Principal } from "@/lib/collaboration";
import { handleAgentRequest } from "@/lib/agent-api";
const human = (id: string): Principal => ({kind: "human", id});
const owner = human("admin");
const other = human("other");
beforeEach(() => {
  resetDbForTests();
  fs.rmSync(process.env.KANBAN_DATA_DIR!, { recursive: true, force: true });
  db(); createUser("other", "Other", "fixture");
});
function fixture() {
  const board = createBoard({ name: "Project", createdBy: "other" });
  const channel = createChannel(owner, {name: "Channel", type: "project", boardIds: [board]});
  const a = createAgent(owner, {displayName: "A"});
  const b = createAgent(other, {displayName: "B"});
  grantAgent(owner, channel.id, a.agent.id); grantAgent(owner, channel.id, b.agent.id);
  return {board, channel, a, b, pa: {kind: "agent", id: a.agent.id} as Principal, pb: {kind: "agent", id: b.agent.id} as Principal};
}
it("reopens collaboration schema by connection identity without a second reset hook", () => {
  createChannel(owner, {name: "Before", type: "topic"});
  resetDbForTests();
  fs.rmSync(process.env.KANBAN_DATA_DIR!, { recursive: true, force: true });
  expect(listChannels(owner)).toEqual([]);
});
it("creator loses visibility: listing candidates and both grant controls are denied", () => {
  const f = fixture(); updateBoard(f.board, {visibility: "private"});
  for (const act of [() => grantAgent(owner, f.channel.id, f.b.agent.id),
    () => revokeAgentGrant(owner, f.channel.id, f.b.agent.id),
    () => listEligibleAgents(owner, f.channel.id)]) expect(act).toThrow(expect.objectContaining({status: 404}));
  expect(listChannels(f.pa)).toEqual([]);
  expect(() => listChannelAgents(f.pa, f.channel.id)).toThrow();
  expect(listChannelAgents(other, f.channel.id).map(a => a.id)).toEqual([f.b.agent.id]);
});
it("cannot hand off to a recipient whose owner lost visibility or replay an old request", () => {
  const f = fixture();
  createHandoff(f.pb, f.channel.id, {toAgentId: f.a.agent.id, brief: "Work", clientId: "one"});
  updateBoard(f.board, {visibility: "private"});
  for (const clientId of ["one", "two"]) expect(() => createHandoff(f.pb, f.channel.id,
    {toAgentId: f.a.agent.id, brief: "Work", clientId})).toThrow(expect.objectContaining({status: 404}));
});
it("foreign and nonexistent card references have the same safe error", () => {
  const f = fixture();
  const secret = createBoard({name: "Secret", createdBy: "other", visibility: "private"});
  const card = createCard({listId: getLists(secret)[0].id, title: "Secret title", createdBy: "other"});
  for (const cardId of [card, 999999]) expect(() => postMessage(f.pa, f.channel.id, {text: "ref", cardId}))
    .toThrow(expect.objectContaining({status: 404, message: "Not found"}));
});
it("handoff does not mutate cards; accepted agent cannot complete after access is lost", () => {
  const f = fixture(); const card = createCard({listId: getLists(f.board)[0].id, title: "Task", createdBy: "other"});
  const before = getCard(card);
  const h = createHandoff(f.pb, f.channel.id, {toAgentId: f.a.agent.id, brief: "Task", cardId: card});
  acceptHandoff(f.pa, h.id); updateBoard(f.board, {visibility: "private"});
  expect(() => completeHandoff(f.pa, h.id, "done")).toThrow(expect.objectContaining({status: 404}));
  expect(getCard(card)).toEqual(before);
});
it("latest and before pages retain a complete 125-message history", () => {
  const f = fixture(); const ids = Array.from({length: 125}, (_, i) => postMessage(f.pa, f.channel.id, {text: `message ${i}`}).id);
  const latest = listMessages(f.pa, f.channel.id, {latest: true});
  expect(latest.map(m => m.id)).toEqual(ids.slice(25));
  const older = listMessages(f.pa, f.channel.id, {before: latest[0].id});
  expect([...older, ...latest].map(m => m.id)).toEqual(ids);
});
it("route isolates cookies, validates full integers/body bytes, and fixes author identity", async () => {
  const f = fixture();
  const call = (path: string, method = "GET", raw?: string, token?: string, extra: Record<string,string> = {}) =>
    handleAgentRequest(new Request(`http://localhost/api/agent/${path}`, {
      method, headers: {...extra, ...(token ? {authorization: `Bearer ${token}`} : {})}, body: raw,
    }), path.split("?")[0].split("/"));
  const cookie = {cookie: `sankyaku_agents_session=${createSessionToken("admin")}`};
  expect((await call("channels", "GET", undefined, undefined, cookie)).status).toBe(401);
  const sent = await call(`channels/${f.channel.id}/messages`, "POST",
    JSON.stringify({text: "hello", authorKind: "human", authorId: "other"}), f.a.token, cookie);
  expect((await sent.json()).authorId).toBe(f.a.agent.id);
  for (const id of ["1garbage", "1.2", "9007199254740993"]) expect((await call(`channels/${id}/messages`, "GET", undefined, f.a.token)).status).toBe(400);
  for (const query of ["after=1x", "limit=101", "before=1&after=0", "latest=garbage"]) expect((await call(`channels/${f.channel.id}/messages?${query}`, "GET", undefined, f.a.token)).status).toBe(400);
  for (const raw of ['[]', '{"text":"ok","clientId":{}}']) expect((await call(`channels/${f.channel.id}/messages`, "POST", raw, f.a.token)).status).toBe(400);
  const huge = JSON.stringify({text: "x", ignored: "x".repeat(66000)});
  expect((await call(`channels/${f.channel.id}/messages`, "POST", huge, f.a.token)).status).toBe(413);
  expect((await call(`channels/${f.channel.id}/messages`, "POST", huge, f.a.token, {"content-length":"1"})).status).toBe(413);
});

it("two independent bearer agents exchange a reply and finish a handoff through the real route", async () => {
  const f = fixture();
  async function call(token: string, path: string, payload?: unknown) {
    const response = await handleAgentRequest(new Request(`http://localhost/api/agent/${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }), path.split("?")[0].split("/"));
    return {status: response.status, body: await response.json()};
  }
  const path = `channels/${f.channel.id}`;
  const question = await call(f.a.token, `${path}/messages`, {text: "Please review the proposal", kind: "question", clientId: "q1"});
  expect(question.status).toBe(201);
  expect((await call(f.a.token, `${path}/messages`, {text: "Please review the proposal", kind: "question", clientId: "q1"})).body.id).toBe(question.body.id);
  const reply = await call(f.b.token, `${path}/messages`, {text: "I can review it", replyTo: question.body.id});
  expect(reply.status).toBe(201);
  expect(reply.body).toMatchObject({authorId: f.b.agent.id, replyToId: question.body.id});
  const handoff = await call(f.a.token, `${path}/handoffs`, {toAgentId: f.b.agent.id, brief: "Return review findings"});
  expect(handoff.status).toBe(201);
  expect((await call(f.b.token, "inbox")).body.map((h: {id: number}) => h.id)).toContain(handoff.body.id);
  expect((await call(f.a.token, `handoffs/${handoff.body.id}/accept`, {})).status).toBe(404);
  expect((await call(f.b.token, `handoffs/${handoff.body.id}/accept`, {})).body.state).toBe("accepted");
  expect((await call(f.b.token, `handoffs/${handoff.body.id}/complete`, {result: "Reviewed: clarify the retry policy"})).body.state).toBe("completed");
  const history = await call(f.a.token, `${path}/messages?latest=1`);
  expect(history.status).toBe(200);
  expect(history.body.some((m: {text: string}) => m.text.includes("clarify the retry policy"))).toBe(true);
  revokeAgentGrant(owner, f.channel.id, f.b.agent.id);
  expect((await call(f.b.token, `${path}/messages`)).status).toBe(404);
});
