import { NextResponse } from "next/server";
import { tenant, store, guardRequest, secret } from "@/lib/runtime";
import { AgentChatError, createAgentChat, withAgentChatApproval } from "@/lib/agent-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ skillId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 1024) throw new AgentChatError("Alternative selection is too large.");
    const { skillId } = await params;
    const id = await tenant();
    const selected = createAgentChat(store(), id).selectAlternative(skillId, JSON.parse(raw));
    return NextResponse.json(withAgentChatApproval(selected, id, skillId, secret()), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare that date alternative. Please request new dates." }, {
      status: error instanceof AgentChatError ? error.status : 400, headers,
    });
  }
}
