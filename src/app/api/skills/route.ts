import { NextResponse } from "next/server";
import { tenant, store, guardRequest } from "@/lib/runtime";
import { createSkillLibrary } from "@/lib/skill-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const id = await tenant();
    const query = new URL(request.url).searchParams;
    const skills = createSkillLibrary(store(), id).list({
      query: query.get("q") || undefined,
      ownerType: query.get("ownerType") || undefined,
      kind: query.get("kind") || undefined,
    });
    return NextResponse.json({ skills: skills.map(skill => {
      if (query.get("metadata") !== "1" && skill.canEdit) return skill;
      const { content: _content, ...metadata } = skill;
      return metadata;
    }) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load skills." }, { status: 400, headers });
  }
}

export async function POST(request: Request) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Skill is too large.");
    const input = JSON.parse(raw);
    const id = await tenant();
    const skill = createSkillLibrary(store(), id).publish(input);
    return NextResponse.json({ skill }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish skill." }, { status: 400, headers });
  }
}
