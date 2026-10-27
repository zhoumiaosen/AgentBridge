import { test, expect, type APIResponse, type Locator, type Page } from "@playwright/test";
import type { LibrarySkill } from "../../src/lib/skill-library";
import type { BusinessListing, BusinessQuote } from "../../src/lib/business-skills";
import type { Reservation } from "../../src/lib/store";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

const endpoint = (id: string) => `/api/skills/${encodeURIComponent(id)}/chat`;
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
    id: "browser-original-quote", listingId: room.id, listingName: room.name,
    businessId: agent.businessId!, businessName: agent.name, skillVersion: agent.version,
    checkIn: date(40), checkOut: date(42), guests: 2, nights: 2,
    nightlyCents: 14900, cleaningCents: 3000, totalCents: 32800,
    cancellation: "flexible", expiresAt: new Date(Date.now() - 60000).toISOString(),
  };
  const reservation: Reservation = {
    ...originalQuote, id: "browser-change-reservation", confirmation: "AB-DATE-PHONE", status: "confirmed", createdAt: new Date().toISOString(),
  };
  const quote: BusinessQuote = {
    ...originalQuote, id: "browser-change-quote", reservationId: reservation.id,
    checkIn: date(46), checkOut: date(49), nights: 3, totalCents: 47700,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  const state = { agent, messages: [] as { role: "user" | "assistant"; content: string }[], mode: "live", canBook: true, testOnly: true, quote: originalQuote, reservation, reservations: [reservation] };
  const pending = (current = quote) => ({ ...state, quote: current, dateChangePending: true, approval: `test-change-${current.id}` });
  const changed = (current = quote): Reservation => ({ ...reservation, ...current, id: reservation.id, confirmation: reservation.confirmation, status: "confirmed" });
  const completed = (current = quote) => ({ ...state, quote: current, reservation: changed(current), reservations: [changed(current)], dateChangePending: false });
  const open = async () => {
    await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
    return page.getByRole("dialog", { name: agent.name, exact: true });
  };
  return { agent, workspace, reservation, quote, state, pending, changed, completed, path: endpoint(agent.id), open };
}
async function prepare(chat: Locator, confirmation: string, quote: BusinessQuote) {
  await chat.getByRole("button", { name: `Change dates for ${confirmation}`, exact: true }).click();
  const form = chat.getByRole("region", { name: "Test date change form", exact: true });
  await form.getByLabel("New check-in", { exact: true }).fill(quote.checkIn);
  await form.getByLabel("New check-out", { exact: true }).fill(quote.checkOut);
  await form.getByRole("button", { name: "Review updated price", exact: true }).click();
}

test("phone date change reviews price difference and needs explicit approval before both views update", async ({ page }) => {
  const { workspace, reservation, quote, state, pending, changed, completed, path, open } = await fixture(page);
  let prepared = false, applied = false, attempts = 0, proposals = 0;
  let currentQuote = quote;
  await page.route("**/api/actions/state", route => route.fulfill({ json: { ...workspace, reservations: [applied ? changed(currentQuote) : reservation] } }));
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["message"]);
      if (body.message.includes(quote.checkIn)) {
        expect(body.message).toContain(reservation.confirmation);
        expect(body.message).toContain(quote.checkOut);
        expect(body.message).toContain("2");
        currentQuote = { ...quote, id: `browser-change-quote-${++proposals}` };
      }
      prepared = true;
      state.messages.push({ role: "user", content: body.message }, { role: "assistant", content: "Review your updated dates and price. Your original test booking has not changed." });
    }
    await route.fulfill({ json: applied ? completed(currentQuote) : prepared ? pending(currentQuote) : state });
  });
  await page.route(`**${path}/confirm`, async route => {
    attempts++;
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["approval", "approved", "idempotencyKey", "quoteId"]);
    expect(body).toMatchObject({ quoteId: currentQuote.id, approval: `test-change-${currentQuote.id}`, approved: true });
    expect(body.idempotencyKey).toBeTruthy();
    applied = true;
    await route.fulfill({ json: completed(currentQuote) });
  });
  let chat = await open();
  await expect(chat.getByRole("region", { name: "Your bookings with this business", exact: true })).toContainText(reservation.confirmation);
  await prepare(chat, reservation.confirmation, quote);
  const review = chat.getByRole("region", { name: "Test date change quote", exact: true });
  const approve = review.getByRole("checkbox", { name: "I approve this test date change", exact: true });
  const confirm = review.getByRole("button", { name: "Confirm test date change", exact: true });
  await expect(review.getByRole("heading", { name: "Review test date change", exact: true })).toBeVisible();
  for (const value of [reservation.confirmation, dateLabel(reservation.checkIn), dateLabel(reservation.checkOut), dateLabel(quote.checkIn), dateLabel(quote.checkOut), "$328.00", "$477.00", "$149.00"]) await expect(review).toContainText(value);
  await expect(review).toContainText(/test|sample/i);
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await approve.check();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Yes, approve it.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue("");
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  expect(attempts).toBe(0);
  await review.getByRole("button", { name: "Keep current dates", exact: true }).click();
  await expect(review).not.toBeVisible();
  expect(attempts).toBe(0);
  await prepare(chat, reservation.confirmation, quote);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await review.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await approve.check();
  await confirm.click();
  await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).toBeVisible();
  await expect(review).not.toBeVisible();
  await expect(chat.getByRole("region", { name: "Test booking quote", exact: true })).toContainText("$477.00");
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  const customer = page.getByRole("article").filter({ hasText: reservation.confirmation });
  await expect(customer).toHaveCount(1);
  await expect(customer).toContainText("$477");
  await expect(customer).toContainText("3 nights");
  await page.getByRole("button", { name: "Listings", exact: true }).click();
  const business = page.locator(".reservation-table > div").filter({ hasText: reservation.confirmation });
  await expect(business).toHaveCount(1);
  await expect(business).toContainText("$477");
  await expect(business).toContainText("confirmed");
  await page.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await page.reload();
  chat = await open();
  await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).toBeVisible();
  await expect(chat.getByRole("region", { name: "Test booking quote", exact: true })).toContainText(dateLabel(quote.checkOut));
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).not.toBeVisible();
});

test("new proposals and reopening clear consent while expired or unsigned date quotes cannot apply", async ({ page }) => {
  const { reservation, quote, pending, path, open } = await fixture(page);
  let currentQuote = quote, credentials = true, attempts = 0;
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") currentQuote = { ...quote, id: "replacement-date-quote", nightlyCents: 15900, totalCents: 50700 };
    await route.fulfill({ json: { ...pending(currentQuote), approval: credentials ? `test-change-${currentQuote.id}` : undefined } });
  });
  await page.route(`**${path}/confirm`, async route => { attempts++; await route.fulfill({ status: 400, json: { error: "Unexpected confirmation" } }); });
  let chat = await open();
  let approve = chat.getByRole("checkbox", { name: "I approve this test date change", exact: true });
  await approve.check();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Please prepare another date-change quote with the latest price.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(approve).not.toBeChecked();
  await expect(chat.getByRole("region", { name: "Test date change quote", exact: true })).toContainText("$507.00");
  await approve.check();
  await page.reload();
  chat = await open();
  approve = chat.getByRole("checkbox", { name: "I approve this test date change", exact: true });
  await expect(approve).not.toBeChecked();
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).toBeDisabled();
  currentQuote = { ...currentQuote, expiresAt: new Date(Date.now() - 1000).toISOString() };
  await page.reload();
  chat = await open();
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).toBeDisabled();
  await expect(chat.getByRole("checkbox", { name: "I approve this test date change", exact: true })).toBeDisabled();
  await expect(chat.getByRole("region", { name: "Test date change quote", exact: true })).toContainText(/expired/i);
  currentQuote = { ...currentQuote, expiresAt: new Date(Date.now() + 600000).toISOString() };
  credentials = false;
  await page.reload();
  chat = await open();
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).toBeDisabled();
  await expect(chat.getByRole("checkbox", { name: "I approve this test date change", exact: true })).toBeDisabled();
  await expect(chat.getByRole("region", { name: "Test date change quote", exact: true })).toContainText(reservation.confirmation);
  expect(attempts).toBe(0);
});

test("stale or unverified date-change responses do not claim success or reuse consent", async ({ page }) => {
  const { reservation, quote, pending, completed, path, open } = await fixture(page);
  let attempts = 0;
  const keys: string[] = [];
  await page.route(`**${path}`, route => route.fulfill({ json: pending() }));
  await page.route(`**${path}/confirm`, async route => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    const success = completed();
    const replies = [
      { status: 409, json: { error: "The original reservation has changed. Request a new quote." } },
      { json: { testOnly: true } },
      { json: { ...success, testOnly: false } },
      { json: { ...success, reservation: { ...success.reservation, id: "another-reservation" } } },
      { json: { ...success, reservation: { ...success.reservation, checkOut: reservation.checkOut } } },
      { json: { ...success, reservation: { ...success.reservation, totalCents: 1 } } },
    ];
    await route.fulfill(replies[attempts++]);
  });
  const chat = await open();
  const review = chat.getByRole("region", { name: "Test date change quote", exact: true });
  const approve = review.getByRole("checkbox", { name: "I approve this test date change", exact: true });
  const confirm = review.getByRole("button", { name: "Confirm test date change", exact: true });
  for (let attempt = 0; attempt < 6; attempt++) {
    await expect(approve).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await approve.check();
    await confirm.click();
    await expect(review.getByRole("alert")).toContainText(attempt === 0 ? "original reservation has changed" : "could not be verified");
    await expect(review).toBeVisible();
    await expect(review).toContainText("$328.00");
    await expect(review).toContainText(dateLabel(quote.checkOut));
  }
  expect(attempts).toBe(6);
  expect(new Set(keys).size).toBe(1);
});

test("approved date change completes and refreshes both views even after chat closes", async ({ page }) => {
  const { workspace, reservation, quote, pending, changed, completed, path, open } = await fixture(page);
  let applied = false, attempts = 0, stateRefreshes = 0;
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route("**/api/actions/state", async route => {
    stateRefreshes++;
    await route.fulfill({ json: { ...workspace, reservations: [applied ? changed() : reservation] } });
  });
  await page.route(`**${path}`, route => route.fulfill({ json: applied ? completed() : pending() }));
  await page.route(`**${path}/confirm`, async route => {
    attempts++;
    applied = true;
    await responseGate;
    await route.fulfill({ json: completed() });
  });
  await page.reload();
  await expect.poll(() => stateRefreshes).toBe(1);
  const chat = await open();
  await chat.getByRole("checkbox", { name: "I approve this test date change", exact: true }).check();
  await chat.getByRole("button", { name: "Confirm test date change", exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  const customer = page.getByRole("article").filter({ hasText: reservation.confirmation });
  await expect(customer).toContainText("$328");
  releaseResponse();
  await expect.poll(() => stateRefreshes, { timeout: 5000 }).toBeGreaterThan(1);
  await expect(customer).toHaveCount(1);
  await expect(customer).toContainText("$477");
  await expect(customer).toContainText("3 nights");
  await page.getByRole("button", { name: "Listings", exact: true }).click();
  const business = page.locator(".reservation-table > div").filter({ hasText: reservation.confirmation });
  await expect(business).toHaveCount(1);
  await expect(business).toContainText("$477");
  await page.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await open();
  await expect(page.getByRole("region", { name: "Test booking quote", exact: true })).toContainText(dateLabel(quote.checkOut));
  expect(attempts).toBe(1);
});

test("cancellation review takes precedence over a pending date quote and cannot leave it approvable", async ({ page }) => {
  const { reservation, pending, path, open } = await fixture(page);
  let changed = 0, canceled = 0;
  const cancellation = { reservationId: reservation.id, revision: "current-reservation-revision", approval: "test-cancel-approval" };
  await page.route(`**${path}`, async route => {
    await route.fulfill({ json: { ...pending(), cancellation, cancellationRequested: route.request().method() === "POST" } });
  });
  await page.route(`**${path}/confirm`, async route => { changed++; await route.fulfill({ status: 400, json: { error: "Unexpected date change" } }); });
  await page.route(`**${path}/cancel`, async route => {
    canceled++;
    expect(route.request().postDataJSON()).toEqual({ ...cancellation, approved: true });
    await route.fulfill({ json: { ...pending(), reservation: { ...reservation, status: "canceled" }, reservations: [], cancellation: undefined } });
  });
  const chat = await open();
  const dateReview = chat.getByRole("region", { name: "Test date change quote", exact: true });
  await expect(dateReview).toBeVisible();
  await dateReview.getByRole("checkbox", { name: "I approve this test date change", exact: true }).check();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Please cancel this test booking instead of changing its dates.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  const cancellationReview = chat.getByRole("region", { name: "Test cancellation review", exact: true });
  await expect(cancellationReview).toBeVisible({ timeout: 5000 });
  await expect(dateReview).not.toBeVisible();
  const approve = cancellationReview.getByRole("checkbox", { name: "I approve this test cancellation", exact: true });
  const confirm = cancellationReview.getByRole("button", { name: "Confirm test cancellation", exact: true });
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  expect(changed).toBe(0);
  expect(canceled).toBe(0);
  await approve.check();
  await confirm.click();
  await expect(chat.getByRole("heading", { name: "Test booking canceled", exact: true })).toBeVisible();
  await expect(dateReview).not.toBeVisible();
  await expect(chat.getByRole("button", { name: "Confirm test date change", exact: true })).not.toBeVisible();
  expect(changed).toBe(0);
  expect(canceled).toBe(1);
});

test("date quote uses the visible autofilled date even without a React input event", async ({ page }) => {
  const { reservation, quote, state, pending, path, open } = await fixture(page);
  const visibleQuote = { ...quote, checkIn: reservation.checkIn, checkOut: date(43) };
  let submittedMessage = "", confirmations = 0;
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") {
      submittedMessage = route.request().postDataJSON().message;
      await route.fulfill({ json: pending(visibleQuote) });
    } else await route.fulfill({ json: state });
  });
  await page.route(`**${path}/confirm`, async route => { confirmations++; await route.fulfill({ status: 400, json: { error: "Unexpected approval" } }); });
  const chat = await open();
  await chat.getByRole("button", { name: `Change dates for ${reservation.confirmation}`, exact: true }).click();
  const form = chat.getByRole("region", { name: "Test date change form", exact: true });
  const checkout = form.getByLabel("New check-out", { exact: true });
  // Autofill can update the native value before React observes an input event.
  await checkout.evaluate((element: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
  }, visibleQuote.checkOut);
  await expect(checkout).toHaveValue(visibleQuote.checkOut);
  await form.getByRole("button", { name: "Review updated price", exact: true }).click();
  await expect.poll(() => submittedMessage).toContain(visibleQuote.checkOut);
  expect(submittedMessage).toContain(reservation.confirmation);
  expect(submittedMessage).toContain(reservation.checkIn);
  expect(submittedMessage).not.toContain(reservation.checkOut);
  const review = chat.getByRole("region", { name: "Test date change quote", exact: true });
  await expect(review).toContainText(dateLabel(visibleQuote.checkOut));
  await expect(review).toContainText("$477.00");
  await expect(review.getByRole("checkbox", { name: "I approve this test date change", exact: true })).not.toBeChecked();
  await expect(review.getByRole("button", { name: "Confirm test date change", exact: true })).toBeDisabled();
  expect(confirmations).toBe(0);
});
