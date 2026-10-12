import { NextResponse } from "next/server";
import { acceptHandoff, agentInbox, authenticateAgentToken, CollabError,
  completeHandoff, createHandoff, declineHandoff, listChannelAgents,
  listChannelHandoffs, listChannels, listMessages, postMessage,
  type MessageKind } from "./collaboration";

const json = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "no-store" },
});
const invalid = (message: string): never => { throw new CollabError(400, message); };
function integer(value: string, minimum = 1): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) return invalid("Invalid integer");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) return invalid("Invalid integer");
  return number;
}
function string(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid(`Invalid ${name}`);
  return value;
}
function reference(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return invalid("Invalid reference");
  return value;
}
function key(value: unknown): string | undefined {
  return value === undefined ? undefined : string(value, "clientId", 200);
}
async function body(req: Request): Promise<Record<string, unknown>> {
  const max = 65536;
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    throw new CollabError(413, "Request body too large");
  }
  const reader = req.body?.getReader();
  if (!reader) return invalid("Invalid request body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { await reader.cancel(); throw new CollabError(413, "Request body too large"); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Invalid request body");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CollabError) throw error;
    return invalid("Invalid request body");
  } finally { reader.releaseLock(); }
}

/** Communication only: auth is derived solely from Bearer, never cookies or JSON. */
export async function handleAgentRequest(req: Request, seg: string[]): Promise<NextResponse> {
  try {
    const match = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i);
    const p = match ? authenticateAgentToken(match[1]) : null;
    if (!p) return json({ error: "Unauthorized" }, 401);
    const method = req.method;
    if (method === "GET" && seg.length === 1) {
      if (seg[0] === "channels") return json(listChannels(p));
      if (seg[0] === "inbox") return json(agentInbox(p));
    }
    if (seg.length === 3 && seg[0] === "channels") {
      const id = integer(seg[1]);
      if (method === "GET") {
        if (seg[2] === "agents") return json(listChannelAgents(p, id));
        if (seg[2] === "handoffs") return json(listChannelHandoffs(p, id));
        if (seg[2] === "messages") {
          const params = new URL(req.url).searchParams;
          const after = params.has("after") ? integer(params.get("after")!, 0) : undefined;
          const before = params.has("before") ? integer(params.get("before")!) : undefined;
          const limit = params.has("limit") ? integer(params.get("limit")!) : 100;
          const latest = params.has("latest") ? params.get("latest") === "1" : undefined;
          if (limit > 100 || (params.has("latest") && params.get("latest") !== "1")) return invalid("Invalid pagination");
          return json(listMessages(p, id, { after, before, latest, limit }));
        }
      }
      if (method === "POST" && seg[2] === "messages") {
        const b = await body(req);
        const kind = b.kind === undefined ? "discussion" : b.kind;
        if (typeof kind !== "string" || !["discussion", "question", "decision", "result"].includes(kind)) return invalid("Invalid kind");
        return json(postMessage(p, id, {
          text: string(b.text, "text", 12000), kind: kind as MessageKind,
          replyToId: reference(b.replyTo), cardId: reference(b.cardId), clientId: key(b.clientId),
        }), 201);
      }
      if (method === "POST" && seg[2] === "handoffs") {
        const b = await body(req);
        return json(createHandoff(p, id, {
          toAgentId: string(b.toAgentId, "toAgentId", 200), brief: string(b.brief, "brief", 2000),
          cardId: reference(b.cardId), clientId: key(b.clientId),
        }), 201);
      }
    }
    if (method === "POST" && seg.length === 3 && seg[0] === "handoffs") {
      const id = integer(seg[1]);
      const b = await body(req);
      if (seg[2] === "accept") return json(acceptHandoff(p, id));
      if (seg[2] === "decline") return json(declineHandoff(p, id));
      if (seg[2] === "complete") return json(completeHandoff(p, id, string(b.result, "result", 12000)));
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return error instanceof CollabError ? json({ error: error.message }, error.status)
      : json({ error: "Internal server error" }, 500);
  }
}
