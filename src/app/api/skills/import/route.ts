import { NextResponse } from "next/server";
import { tenant, guardRequest } from "@/lib/runtime";
import { parseSkillImport } from "@/lib/skill-library";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Import is too large.");
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["filename", "text"].includes(key)) ||
        typeof body.filename !== "string" || typeof body.text !== "string")
      throw new Error("Choose a Markdown or JSON skill file.");
    await tenant();
    return NextResponse.json({ draft: parseSkillImport(body.text, body.filename) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read this skill file." }, { status: 400, headers });
  }
}
