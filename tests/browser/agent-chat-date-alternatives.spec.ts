import { test, expect, type APIResponse, type Page } from "@playwright/test";
import type { LibrarySkill } from "../../src/lib/skill-library";
import type { BusinessListing, BusinessQuote } from "../../src/lib/business-skills";
import type { Reservation } from "../../src/lib/store";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

const endpoint = (id: string) => `/api/skills/${encodeURIComponent(id)}/chat`;
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (value: string) => dateLabel(value).replace(/, \d{4}$/, "");
const reviewLabel = (quote: BusinessQuote) => `Review alternative for ${quote.checkIn} to ${quote.checkOut}`;
async function json(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#skills");
  await expect(page.getByRole("heading", { name: "Agent Hub", exact: true })).toBeVisible();
  const { skills }: { skills: LibrarySkill[] } = await json(await page.request.get("/api/skills?metadata=1"));
  const agent = skills.find(item => item.source === "connected")!;
  const workspace = await json(await page.request.get("/api/actions/state"));
  const room = (workspace.listings as BusinessListing[]).find(item => item.businessId === agent.businessId)!;
  const originalQuote: BusinessQuote = {
    id: "browser-original-alt-quote", listingId: room.id, listingName: room.name,
    businessId: agent.businessId!, businessName: agent.name, skillVersion: agent.version,
    checkIn: date(40), checkOut: date(42), guests: 2, nights: 2,
    nightlyCents: 14900, cleaningCents: 3000, totalCents: 32800,
    cancellation: "flexible", expiresAt: new Date(Date.now() - 60000).toISOString(),
  };
  const reservation: Reservation = { ...originalQuote, id: "browser-alt-reservation", confirmation: "AB-ALTERNATIVES", status: "confirmed", createdAt: new Date().toISOString() };
  const alternatives: BusinessQuote[] = [15900, 14900, 13900].map((nightlyCents, index) => ({
    ...originalQuote, id: `browser-alternative-${index}`, reservationId: reservation.id,
    checkIn: date(46 + index * 3), checkOut: date(48 + index * 3), nightlyCents,
    totalCents: nightlyCents * 2 + 3000, expiresAt: new Date(Date.now() + 600000).toISOString(),
  }));
  const freshQuote = { ...alternatives[0], id: "browser-refreshed-alternative", nightlyCents: 16900, totalCents: 36800 };
  const state = { agent, messages: [] as { role: "user" | "assistant"; content: string }[], mode: "live", canBook: true, testOnly: true, quote: originalQuote, reservation, reservations: [reservation] };
  const suggestions = { ...state, dateAlternatives: alternatives, dateChangePending: false };
  const pending = { ...state, dateAlternatives: [], dateChangePending: true, quote: freshQuote, approval: "test-refreshed-alternative-approval" };
  const changed: Reservation = { ...reservation, ...freshQuote, id: reservation.id, confirmation: reservation.confirmation, status: "confirmed" };
  const completed = { ...state, quote: freshQuote, reservation: changed, reservations: [changed], dateAlternatives: [], dateChangePending: false };
  const open = async () => {
    await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
    return page.getByRole("dialog", { name: agent.name, exact: true });
  };
  return { workspace, state, reservation, alternatives, freshQuote, suggestions, pending, changed, completed, path: endpoint(agent.id), open };
}

test("phone alternatives show actual prices and only an approved refreshed quote updates both views", async ({ page }) => {
  const { workspace, state, reservation, alternatives, freshQuote, suggestions, pending, changed, completed, path, open } = await fixture(page);
  let requested = false, selected = false, applied = false, selections = 0, confirmations = 0;
  await page.route("**/api/actions/state", route => route.fulfill({ json: { ...workspace, reservations: [applied ? changed : reservation] } }));
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") {
      expect(Object.keys(route.request().postDataJSON())).toEqual(["message"]);
      requested = true;
    }
    await route.fulfill({ json: applied ? completed : selected ? pending : requested ? suggestions : state });
  });
  await page.route(`**${path}/alternatives`, async route => {
    selections++;
    expect(route.request().postDataJSON()).toEqual({ quoteId: alternatives[0].id });
    selected = true;
    await route.fulfill({ json: pending });
  });
  await page.route(`**${path}/confirm`, async route => {
    confirmations++;
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["approval", "approved", "idempotencyKey", "quoteId"]);
    expect(body).toMatchObject({ quoteId: freshQuote.id, approval: pending.approval, approved: true });
    expect(body.idempotencyKey).toBeTruthy();
    applied = true;
    await route.fulfill({ json: completed });
  });
  await page.reload();
  let chat = await open();
  await chat.getByLabel("Message selected agent", { exact: true }).fill(`Move test booking ${reservation.confirmation} to ${date(44)} through ${date(46)}; suggest available nearby dates if those conflict.`);
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  let options = chat.getByRole("region", { name: "Available date alternatives", exact: true });
  await expect(options).toContainText("Your booking is unchanged");
  await expect(options).toContainText(reservation.confirmation);
  await expect(options).toContainText(dateLabel(reservation.checkIn));
  await expect(options).toContainText(dateLabel(reservation.checkOut));
  await expect(options.getByRole("article")).toHaveCount(3);
  const differences = ["$20.00 more than your current booking", "Same total as your current booking", "$20.00 less than your current booking"];
  for (let index = 0; index < alternatives.length; index++) {
    const quote = alternatives[index];
    const option = options.getByRole("article").filter({ has: page.getByRole("button", { name: reviewLabel(quote), exact: true }) });
    await expect(option).toContainText(dateLabel(quote.checkIn));
    await expect(option).toContainText(dateLabel(quote.checkOut));
    await expect(option).toContainText("2 nights · 2 guests");
    await expect(option).toContainText(`$${(quote.totalCents / 100).toFixed(2)} total`);
    await expect(option).toContainText(differences[index]);
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await options.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await options.getByRole("button", { name: reviewLabel(alternatives[0]), exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Yes, do it.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue("");
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).not.toBeVisible();
  expect(selections).toBe(0);
  expect(confirmations).toBe(0);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  let customer = page.getByRole("article").filter({ hasText: reservation.confirmation });
  await expect(customer).toContainText("$328");
  await expect(customer).toContainText(shortDate(reservation.checkOut));
  await page.getByRole("button", { name: "Agent Hub", exact: true }).click();
  chat = await open();
  options = chat.getByRole("region", { name: "Available date alternatives", exact: true });
  await options.getByRole("button", { name: reviewLabel(alternatives[0]), exact: true }).click();
  const review = chat.getByRole("region", { name: "Test date change quote", exact: true });
  await expect(options).not.toBeVisible();
  await expect(review).toContainText("$368.00");
  await expect(review).not.toContainText("$348.00");
  await expect(review).toContainText(/Price difference\s*\+\$40\.00/);
  const approve = review.getByRole("checkbox", { name: "I approve this test date change", exact: true });
  const confirm = review.getByRole("button", { name: "Confirm test date change", exact: true });
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  expect(selections).toBe(1);
  expect(confirmations).toBe(0);
  await approve.check();
  await confirm.click();
  await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).toBeVisible();
  expect(confirmations).toBe(1);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  customer = page.getByRole("article").filter({ hasText: reservation.confirmation });
  await expect(customer).toHaveCount(1);
  await expect(customer).toContainText("$368");
  await expect(customer).toContainText(shortDate(freshQuote.checkIn));
  await expect(customer).toContainText(shortDate(freshQuote.checkOut));
  await page.getByRole("button", { name: "Listings", exact: true }).click();
  const business = page.locator(".reservation-table > div").filter({ hasText: reservation.confirmation });
  await expect(business).toHaveCount(1);
  await expect(business).toContainText("$368");
  await expect(business).toContainText(shortDate(freshQuote.checkIn));
  await expect(business).toContainText(shortDate(freshQuote.checkOut));
});

test("rejected or unverified alternative selections cannot expose approval or change the booking", async ({ page }) => {
  const { workspace, reservation, alternatives, suggestions, pending, path, open } = await fixture(page);
  let attempts = 0, confirmations = 0;
  await page.route("**/api/actions/state", route => route.fulfill({ json: { ...workspace, reservations: [reservation] } }));
  await page.route(`**${path}`, route => route.fulfill({ json: suggestions }));
  await page.route(`**${path}/alternatives`, async route => {
    expect(route.request().postDataJSON()).toEqual({ quoteId: alternatives[0].id });
    const replies = [
      { status: 409, json: { error: "Those dates are no longer available. Request fresh alternatives." } },
      { json: { testOnly: true } },
      { json: { ...pending, testOnly: false } },
      { json: { ...pending, reservation: { ...reservation, id: "another-reservation" } } },
      { json: { ...pending, quote: { ...pending.quote, checkOut: date(60) } } },
    ];
    await route.fulfill(replies[attempts++]);
  });
  await page.route(`**${path}/confirm`, async route => { confirmations++; await route.fulfill({ status: 400, json: { error: "Unexpected approval" } }); });
  await page.reload();
  const chat = await open();
  const options = chat.getByRole("region", { name: "Available date alternatives", exact: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    await options.getByRole("button", { name: reviewLabel(alternatives[0]), exact: true }).click();
    await expect(options.getByRole("alert")).toContainText(attempt === 0 ? "no longer available" : "could not be verified");
    await expect(options).toContainText("Your booking is unchanged");
    await expect(chat.getByRole("region", { name: "Test date change quote", exact: true })).not.toBeVisible();
    await expect(chat.getByRole("checkbox", { name: "I approve this test date change", exact: true })).not.toBeVisible();
  }
  expect(attempts).toBe(5);
  expect(confirmations).toBe(0);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  const customer = page.getByRole("article").filter({ hasText: reservation.confirmation });
  await expect(customer).toHaveCount(1);
  await expect(customer).toContainText("$328");
  await expect(customer).toContainText(shortDate(reservation.checkIn));
  await expect(customer).toContainText(shortDate(reservation.checkOut));
});

test("real alternative selection endpoint rejects invalid and cross-origin requests without a booking mutation", async ({ request, baseURL }) => {
  const before = await json(await request.get("/api/actions/state"));
  const { skills }: { skills: LibrarySkill[] } = await json(await request.get("/api/skills?metadata=1"));
  const agent = skills.find(item => item.source === "connected")!;
  const path = `${endpoint(agent.id)}/alternatives`;
  const headers = { Origin: new URL(baseURL || "http://127.0.0.1:3000").origin };
  for (const data of [{ quoteId: "not-a-saved-alternative" }, { quoteId: "not-a-saved-alternative", approved: true }, { reservationId: "another-reservation" }]) {
    const response = await request.post(path, { headers, data });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(typeof (await response.json()).error).toBe("string");
  }
  const foreign = await request.post(path, { headers: { Origin: "https://unrelated.example" }, data: { quoteId: "not-a-saved-alternative" } });
  expect(foreign.status()).toBeGreaterThanOrEqual(400);
  expect(foreign.status()).toBeLessThan(500);
  expect((await json(await request.get("/api/actions/state"))).reservations).toEqual(before.reservations);
});
