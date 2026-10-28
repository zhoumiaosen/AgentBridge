import { NextResponse } from "next/server";
import { tenant, store, guardRequest } from "@/lib/runtime";
import { createBusinessSkills } from "@/lib/business-skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ businessId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { businessId } = await params;
    const id = await tenant();
    const skills = createBusinessSkills(store(), id);
    skills.profile(businessId); // The downloadable manifest includes the owner's private guidance.
    return NextResponse.json(skills.manifest(businessId), { headers });
  } catch {
    return NextResponse.json({ error: "Business skill not found." }, { status: 404, headers });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 8000) throw new Error("Skill request is too large.");
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof body.action !== "string" || Object.keys(body).some(key => !["action", "input"].includes(key)))
      throw new Error("Use an action and input for this business skill.");
    const { businessId } = await params;
    const id = await tenant();
    const skills = createBusinessSkills(store(), id);
    const business = skills.resolve(businessId, { allowExistingBooking: true }).business;
    let result = skills.invoke(businessId, body.action, body.input);
    if (!business.canEdit && body.action === "profile") {
      const { knowledge: _knowledge, ...metadata } = result as typeof business;
      result = metadata as typeof business;
    }
    if (!business.canEdit && body.action === "get_stay_details") {
      const details = result as ReturnType<typeof skills.details>;
      const { knowledge: _knowledge, ...metadata } = details.businessSkill;
      result = { ...details, businessSkill: metadata } as typeof details;
    }
    return NextResponse.json({
      protocol: "agentbridge.skill.v1",
      businessId: business.id,
      businessName: business.name,
      skillVersion: business.version,
      result,
    }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Business skill unavailable." }, { status: 400, headers });
  }
}
