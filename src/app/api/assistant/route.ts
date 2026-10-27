import { NextResponse } from "next/server";
import { tenant, store, guardRequest } from "@/lib/runtime";
import { createApproval } from "@/lib/security";
import { secret } from "@/lib/runtime";
import { assist } from "@/lib/assistant";
import { NebiusError } from "@/lib/nebius";
import { createBusinessSkills } from "@/lib/business-skills";
import { createSkillLibrary } from "@/lib/skill-library";
export const runtime = "nodejs";
const g = globalThis as unknown as {
  bridgeLimits?: Map<string, { at: number; count: number }>;
};
export async function POST(request: Request) {
  try {
    guardRequest(request);
    const raw = await request.text();
    if (raw.length > 4000)
      throw new Error("Please keep your message under 2,000 characters.");
    const body = JSON.parse(raw);
    if (
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 2000
    )
      throw new Error("Please enter a message under 2,000 characters.");
    const id = await tenant();
    const limits = (g.bridgeLimits ??= new Map());
    const recent = limits.get(id);
    if (recent && recent.at > Date.now() - 60000 && recent.count >= 12)
      return NextResponse.json(
        { error: "Please wait a minute before sending more messages." },
        { status: 429 },
      );
    limits.set(id, {
      at: recent && recent.at > Date.now() - 60000 ? recent.at : Date.now(),
      count: recent && recent.at > Date.now() - 60000 ? recent.count + 1 : 1,
    });
    if (limits.size > 1000) {
      for (const [key, v] of limits)
        if (v.at < Date.now() - 60000) limits.delete(key);
    }
    const s = store();
    const skills = createBusinessSkills(s, id);
    const library = createSkillLibrary(s, id);
    const history = s.getMessages(id);
    let results: unknown[] | undefined;
    let searchCriteria: Record<string, unknown> | undefined;
    const agentMatches = new Map<string, unknown>();
    const discoverAgent = (entry: ReturnType<typeof library.read>) => {
      const { content: _content, ...metadata } = entry;
      agentMatches.set(entry.id, metadata);
      return metadata;
    };
    const result = await assist(
      {
        message: body.message,
        history,
        preferences: s.getPreferences(id),
        listings: skills.search({}),
        skills: library.list().map(({ content: _content, ...entry }) => entry),
      },
      (name, args) => {
        switch (name) {
          case "search_skills":
            return library.list(args).map(discoverAgent);
          case "read_skill":
            return discoverAgent(library.read(args.skillId as string));
          case "search_stays":
            searchCriteria = args;
            results = skills.search(args);
            return results;
          case "business_profile":
            return skills.invoke(args.businessId as string, "profile", {});
          case "stay_details": {
            const business = skills.forListing(args.listingId as string);
            return skills.invoke(business.id, "get_stay_details", args);
          }
          case "create_quote": {
            const business = skills.forListing(args.listingId as string);
            return skills.invoke(business.id, "create_quote", args);
          }
          case "my_bookings":
            return s.listReservations(id);
          default:
            throw new Error("Unsupported capability");
        }
      },
    );
    s.addConversationTurn(id, body.message, result.reply);
    return NextResponse.json({
      ...result,
      listings: results,
      searchCriteria,
      agents: [...agentMatches.values()],
      ...(result.quote
        ? {
            approval: createApproval(
              id,
              "book",
              (result.quote as { id: string }).id,
              secret(),
            ),
          }
        : {}),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Assistant unavailable. Try again.",
      },
      { status: e instanceof NebiusError ? e.status : 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
