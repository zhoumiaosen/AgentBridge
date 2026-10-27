import { reservationRevision } from "@/lib/store";
import { NextResponse } from "next/server";
import { tenant, store, secret, guardRequest } from "@/lib/runtime";
import { createApproval, verifyApproval } from "@/lib/security";
import { createBusinessSkills } from "@/lib/business-skills";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { action } = await params;
    if (action !== "state")
      return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    const id = await tenant();
    const s = store();
    const skills = createBusinessSkills(s, id);
    return NextResponse.json({
      businesses: skills.list(),
      listings: skills.search({}),
      reservations: s.listReservations(id),
      preferences: s.getPreferences(id),
      messages: s.getMessages(id),
      mode: process.env.NEBIUS_API_KEY ? "live" : "demo",
      model: process.env.NEBIUS_MODEL || "nvidia/nemotron-3-super-120b-a12b",
    });
  } catch (e) {
    console.error("State initialization failed", e);
    return NextResponse.json(
      { error: "Could not open this workspace. Please retry." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    guardRequest(request);
    const { action } = await params;
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Request is too large.");
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Invalid request");
    const id = await tenant();
    const s = store();
    const skills = createBusinessSkills(s, id);
    switch (action) {
      case "search":
        return NextResponse.json({ listings: skills.search(body) });
      case "save-skill":
        return NextResponse.json({
          business: skills.update(body.businessId, {
            version: body.version,
            summary: body.summary,
            knowledge: body.knowledge,
          }),
        });
      case "publish": {
        const listing = s.publishListing(id, body);
        const business = skills.forListing(listing.id);
        return NextResponse.json({
          listing: skills.details(business.id, listing.id),
          business,
        });
      }
      case "quote": {
        const business = skills.forListing(body.listingId);
        const quote = skills.quote(business.id, body);
        return NextResponse.json({
          quote,
          approval: createApproval(id, "book", quote.id, secret()),
        });
      }
      case "confirm": {
        if (
          body.approved !== true ||
          !verifyApproval(
            body.approval || "",
            id,
            "book",
            body.quoteId,
            secret(),
          )
        )
          throw new Error("Please review and explicitly approve this quote.");
        return NextResponse.json({
          reservation: s.confirmQuote(id, {
            quoteId: body.quoteId,
            idempotencyKey: body.idempotencyKey,
          }),
        });
      }
      case "prepare-cancel": {
        const r = s
          .listReservations(id)
          .find((r) => r.id === body.reservationId);
        if (!r) throw new Error("Reservation not found.");
        const revision = reservationRevision(r);
        return NextResponse.json({
          reservation: r,
          revision,
          approval: createApproval(
            id,
            "cancel",
            `${r.id}:${revision}`,
            secret(),
          ),
        });
      }
      case "cancel": {
        if (
          body.approved !== true ||
          !verifyApproval(
            body.approval || "",
            id,
            "cancel",
            `${body.reservationId}:${body.revision}`,
            secret(),
          )
        )
          throw new Error("Please approve cancellation.");
        return NextResponse.json({
          reservation: s.cancelReservation(
            id,
            body.reservationId,
            body.revision,
          ),
        });
      }
      case "preferences":
        return NextResponse.json({ preferences: s.savePreferences(id, body) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "The action could not be completed.",
      },
      { status: 400 },
    );
  }
}
