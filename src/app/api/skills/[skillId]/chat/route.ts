import { NextResponse } from "next/server";
import { tenant, store, guardRequest, secret } from "@/lib/runtime";
import { AgentChatError, createAgentChat, withAgentChatApproval } from "@/lib/agent-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ skillId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "This conversation is unavailable. Please retry." }, {
    status: error instanceof AgentChatError ? error.status : 400, headers,
  });
}
export async function GET(_request: Request, { params }: Context) {
  try {
    const { skillId } = await params;
    const id = await tenant();
    return NextResponse.json(withAgentChatApproval(createAgentChat(store(), id).read(skillId), id, skillId, secret()), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 12032) throw new AgentChatError("Please enter a message under 2,000 characters.");
    const input = JSON.parse(raw);
    const { skillId } = await params;
    const id = await tenant();
    const result = await createAgentChat(store(), id).send(skillId, input);
    return NextResponse.json(withAgentChatApproval(result, id, skillId, secret()), { headers });
  } catch (error) { return failure(error); }
}
