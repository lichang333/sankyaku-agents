import { handleAgentRequest } from "@/lib/agent-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAgentRequest(req, (await context.params).path);
}
export async function POST(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAgentRequest(req, (await context.params).path);
}
