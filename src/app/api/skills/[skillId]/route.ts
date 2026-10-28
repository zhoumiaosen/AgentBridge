import { NextResponse } from "next/server";
import { tenant, store, guardRequest } from "@/lib/runtime";
import { createSkillLibrary } from "@/lib/skill-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ skillId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: Context) {
  try {
    const { skillId } = await params;
    const id = await tenant();
    const library = createSkillLibrary(store(), id);
    const query = new URL(request.url).searchParams;
    const skill = query.get("metadata") === "1" && query.get("download") !== "1"
      ? library.resolve(skillId, { allowExistingBooking: true }).skill : library.read(skillId);
    if (query.get("download") === "1") {
      return NextResponse.json(library.manifest(skillId), { headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${skill.id.replace(/[^a-zA-Z0-9_-]/g, "")}.json"`,
      } });
    }
    const { content: _content, ...metadata } = skill;
    return NextResponse.json({ skill: query.get("metadata") === "1" ? metadata : skill }, { headers });
  } catch {
    return NextResponse.json({ error: "Skill not found in this workspace." }, { status: 404, headers });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Skill is too large.");
    const input = JSON.parse(raw);
    const { skillId } = await params;
    const id = await tenant();
    const library = createSkillLibrary(store(), id);
    const visibilityOnly = input && typeof input === "object" && !Array.isArray(input) && Object.hasOwn(input, "visibility") && Object.keys(input).every(key => ["version", "visibility"].includes(key));
    const skill = visibilityOnly ? library.setVisibility(skillId, input.visibility, input.version) : library.update(skillId, input);
    return NextResponse.json({ skill }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save skill." }, { status: 400, headers });
  }
}
