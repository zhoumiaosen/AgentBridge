import { NextResponse } from "next/server";
import { tenant, store, guardRequest, secret } from "@/lib/runtime";
import { AgentChatError, createAgentChat } from "@/lib/agent-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ skillId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 4000) throw new AgentChatError("Approval request is too large.");
    const { skillId } = await params;
    const id = await tenant();
    return NextResponse.json(createAgentChat(store(), id).cancel(skillId, JSON.parse(raw), secret()), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not cancel the test reservation." }, {
      status: error instanceof AgentChatError ? error.status : 400, headers,
    });
  }
}
