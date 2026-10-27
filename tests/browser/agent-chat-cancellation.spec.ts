import { test, expect, type APIResponse, type Page } from "@playwright/test";
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
  const quote: BusinessQuote = {
    id: "browser-cancel-quote", listingId: room.id, listingName: room.name,
    businessId: agent.businessId!, businessName: agent.name, skillVersion: agent.version,
    checkIn: date(40), checkOut: date(42), guests: 2, nights: 2,
    nightlyCents: 14900, cleaningCents: 3000, totalCents: 32800,
    cancellation: "flexible", expiresAt: new Date(Date.now() - 60000).toISOString(),
  };
  // A later date change can make the saved booking differ from its original quote.
  const reservation: Reservation = {
    ...quote, id: "browser-cancel-reservation", confirmation: "AB-CANCEL-PHONE", status: "confirmed",
    checkIn: date(46), checkOut: date(49), nights: 3, totalCents: 47700, createdAt: new Date().toISOString(),
  };
  const cancellation = { reservationId: reservation.id, revision: "current-reservation-revision", approval: "test-cancel-approval" };
  const state = { agent, messages: [] as { role: "user" | "assistant"; content: string }[], mode: "live", canBook: true, testOnly: true, quote, reservation, cancellation };
  const open = async () => {
    await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
    return page.getByRole("dialog", { name: agent.name, exact: true });
  };
  return { agent, workspace, quote, reservation, cancellation, state, path: endpoint(agent.id), open };
}

test("phone cancellation needs explicit approval and refreshes both reservation views", async ({ page }) => {
  const { workspace, quote, reservation, cancellation, state, path, open } = await fixture(page);
  let canceled = false, attempts = 0, stateRefreshes = 0;
  const current = () => ({ ...reservation, status: canceled ? "canceled" : "confirmed" });
  await page.route("**/api/actions/state", async route => {
    stateRefreshes++;
    await route.fulfill({ json: { ...workspace, reservations: [current()] } });
  });
  await page.route(`**${path}`, async route => {
    const requested = route.request().method() === "POST";
    if (requested) {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["message"]);
      state.messages.push({ role: "user", content: body.message }, { role: "assistant", content: "Review your saved test reservation and approve cancellation below. It has not been canceled." });
    }
    await route.fulfill({ json: { ...state, reservation: current(), cancellation: canceled ? undefined : cancellation, cancellationRequested: requested && !canceled } });
  });
  await page.route(`**${path}/cancel`, async route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ ...cancellation, approved: true });
    canceled = true;
    await route.fulfill({ json: { ...state, reservation: current(), cancellation: undefined } });
  });
  let chat = await open();
  const details = chat.getByRole("region", { name: "Test booking quote", exact: true });
  await expect(details).toContainText(dateLabel(reservation.checkIn));
  await expect(details).toContainText(dateLabel(reservation.checkOut));
  await expect(details).toContainText("$477.00");
  await expect(details).not.toContainText(dateLabel(quote.checkIn));
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Please cancel this test booking.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  const review = chat.getByRole("region", { name: "Test cancellation review", exact: true });
  const approve = review.getByRole("checkbox", { name: "I approve this test cancellation", exact: true });
  const confirm = review.getByRole("button", { name: "Confirm test cancellation", exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText(reservation.confirmation);
  await expect(review).toContainText(/test|sample/i);
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await approve.check();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Yes, cancel it.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue("");
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  expect(attempts).toBe(0);
  await approve.check();
  await review.getByRole("button", { name: "Keep test booking", exact: true }).click();
  await expect(review).not.toBeVisible();
  await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
  await expect(approve).not.toBeChecked();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await review.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await approve.check();
  await confirm.click();
  await expect(chat.getByRole("heading", { name: "Test booking canceled", exact: true })).toBeVisible();
  await expect(review).not.toBeVisible();
  expect(attempts).toBe(1);
  await expect.poll(() => stateRefreshes).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await expect(page.getByText(reservation.confirmation, { exact: true })).toBeVisible();
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel stay", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Listings", exact: true }).click();
  await expect(page.getByText(reservation.confirmation, { exact: true })).toBeVisible();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await page.reload();
  chat = await open();
  await expect(chat.getByRole("heading", { name: "Test booking canceled", exact: true })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Review test cancellation", exact: true })).not.toBeVisible();
});

test("failed or unverified cancellation responses require fresh unchecked approval", async ({ page }) => {
  const { state, reservation, path, open } = await fixture(page);
  let attempts = 0;
  await page.route(`**${path}`, route => route.fulfill({ json: state }));
  await page.route(`**${path}/cancel`, async route => {
    attempts++;
    const responses = [
      { status: 409, json: { error: "Reservation changed. Review cancellation again." } },
      { json: { testOnly: true } },
      { json: { ...state, testOnly: false, reservation: { ...reservation, status: "canceled" } } },
      { json: { ...state, reservation: { ...reservation, id: "another-reservation", status: "canceled" } } },
      { json: state },
    ];
    await route.fulfill(responses[attempts - 1]);
  });
  const chat = await open();
  const review = chat.getByRole("region", { name: "Test cancellation review", exact: true });
  const approve = review.getByRole("checkbox", { name: "I approve this test cancellation", exact: true });
  const confirm = review.getByRole("button", { name: "Confirm test cancellation", exact: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!await review.isVisible()) await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
    await expect(approve).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await approve.check();
    await confirm.click();
    await expect(chat.getByRole("alert")).toContainText(attempt === 0 ? "Reservation changed" : "could not be verified");
    await expect(chat.getByRole("heading", { name: "Test booking canceled", exact: true })).not.toBeVisible();
    if (await review.isVisible()) {
      await expect(approve).not.toBeChecked();
      await expect(confirm).toBeDisabled();
    }
  }
  expect(attempts).toBe(5);
});

test("reload clears cancellation consent and missing credentials cannot approve", async ({ page }) => {
  const { state, path, open } = await fixture(page);
  let hasCredentials = true, attempts = 0;
  await page.route(`**${path}`, route => route.fulfill({ json: { ...state, cancellation: hasCredentials ? state.cancellation : undefined } }));
  await page.route(`**${path}/cancel`, async route => { attempts++; await route.fulfill({ status: 400, json: { error: "Unexpected cancellation" } }); });
  let chat = await open();
  await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
  await chat.getByRole("checkbox", { name: "I approve this test cancellation", exact: true }).check();
  await page.reload();
  chat = await open();
  await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
  await expect(chat.getByRole("checkbox", { name: "I approve this test cancellation", exact: true })).not.toBeChecked();
  await expect(chat.getByRole("button", { name: "Confirm test cancellation", exact: true })).toBeDisabled();
  hasCredentials = false;
  await page.reload();
  chat = await open();
  await expect(chat.getByRole("button", { name: "Confirm test cancellation", exact: true })).not.toBeVisible();
  await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
  await expect(chat.getByRole("alert")).toContainText("Cancellation is unavailable");
  await expect(chat.getByRole("checkbox", { name: "I approve this test cancellation", exact: true })).not.toBeVisible();
  expect(attempts).toBe(0);
});

test("real cancellation endpoint rejects forged and cross-origin approval without mutation", async ({ request, baseURL }) => {
  const before = await json(await request.get("/api/actions/state"));
  const { skills }: { skills: LibrarySkill[] } = await json(await request.get("/api/skills?metadata=1"));
  const agent = skills.find(item => item.source === "connected")!;
  const path = `${endpoint(agent.id)}/cancel`;
  const headers = { Origin: new URL(baseURL || "http://127.0.0.1:3000").origin };
  const input = { reservationId: "not-a-reservation", revision: "old-revision", approval: "forged", approved: true };
  for (const data of [input, { ...input, approved: false }, { ...input, businessId: agent.id }, { reservationId: input.reservationId, approved: true }]) {
    const response = await request.post(path, { headers, data });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  }
  const foreign = await request.post(path, { headers: { Origin: "https://unrelated.example" }, data: input });
  expect(foreign.status()).toBeGreaterThanOrEqual(400);
  expect(foreign.status()).toBeLessThan(500);
  expect((await json(await request.get("/api/actions/state"))).reservations).toEqual(before.reservations);
});

test("closing chat during approved cancellation still refreshes both reservation views", async ({ page }) => {
  const { workspace, reservation, state, path, open } = await fixture(page);
  let canceled = false, attempts = 0, stateRefreshes = 0;
  let releaseResponse!: () => void;
  const pendingResponse = new Promise<void>(resolve => { releaseResponse = resolve; });
  const current = () => ({ ...reservation, status: canceled ? "canceled" : "confirmed" });
  await page.route("**/api/actions/state", async route => {
    stateRefreshes++;
    await route.fulfill({ json: { ...workspace, reservations: [current()] } });
  });
  await page.route(`**${path}`, route => route.fulfill({ json: { ...state, reservation: current(), cancellation: canceled ? undefined : state.cancellation } }));
  await page.route(`**${path}/cancel`, async route => {
    attempts++;
    // The server mutation succeeds while its response is still in flight.
    canceled = true;
    await pendingResponse;
    await route.fulfill({ json: { ...state, reservation: current(), cancellation: undefined } });
  });
  await page.reload();
  await expect.poll(() => stateRefreshes).toBe(1);
  const chat = await open();
  await chat.getByRole("button", { name: "Review test cancellation", exact: true }).click();
  await chat.getByRole("checkbox", { name: "I approve this test cancellation", exact: true }).check();
  await chat.getByRole("button", { name: "Confirm test cancellation", exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await expect(page.getByText("Confirmed stay", { exact: true })).toBeVisible();
  releaseResponse();
  await expect.poll(() => stateRefreshes, { timeout: 5000 }).toBeGreaterThan(1);
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  await expect(page.getByText(reservation.confirmation, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Listings", exact: true }).click();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();
  await expect(page.getByText(reservation.confirmation, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await open();
  await expect(page.getByRole("heading", { name: "Test booking canceled", exact: true })).toBeVisible();
  expect(attempts).toBe(1);
});
