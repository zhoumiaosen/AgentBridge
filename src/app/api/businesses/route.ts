import { NextResponse } from "next/server";
import { tenant, store } from "@/lib/runtime";
import { createBusinessSkills } from "@/lib/business-skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const id = await tenant();
  const skills = createBusinessSkills(store(), id);
  return NextResponse.json({
    protocol: "agentbridge.skill.v1",
    businesses: skills.list().map(business => ({
      ...business,
      endpoint: `/api/businesses/${business.id}`,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
