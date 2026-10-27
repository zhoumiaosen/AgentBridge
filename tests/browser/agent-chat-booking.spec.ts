import { test, expect, type APIResponse, type Page } from "@playwright/test";
import type { LibrarySkill } from "../../src/lib/skill-library";
import type { BusinessListing, BusinessQuote } from "../../src/lib/business-skills";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

const headers = (baseURL?: string) => ({ Origin: new URL(baseURL || "http://127.0.0.1:3000").origin });
const endpoint = (id: string) => `/api/skills/${encodeURIComponent(id)}/chat`;
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
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
  const { listings }: { listings: BusinessListing[] } = await json(await page.request.get("/api/actions/state"));
  const room = listings.find(item => item.businessId === agent.businessId)!;
  const quote: BusinessQuote = {
    id: "browser-test-quote-a", listingId: room.id, listingName: room.name,
    businessId: agent.businessId!, businessName: agent.name, skillVersion: agent.version,
    checkIn: date(40), checkOut: date(42), guests: 2, nights: 2,
    nightlyCents: room.nightlyCents, cleaningCents: room.cleaningCents,
    totalCents: room.nightlyCents * 2 + room.cleaningCents,
    cancellation: room.cancellation, expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  return { agent, room, quote, path: endpoint(agent.id) };
}

test("selected chat approval API rejects ordinary tokens, forged requests and other workspaces without reserving", async ({ request, playwright, baseURL }) => {
  const before = await json(await request.get("/api/actions/state"));
  const { skills }: { skills: LibrarySkill[] } = await json(await request.get("/api/skills?metadata=1"));
  const agent = skills.find(item => item.source === "connected")!;
  const room = before.listings.find((item: BusinessListing) => item.businessId === agent.businessId);
  const prepared = await json(await request.post("/api/actions/quote", { headers: headers(baseURL), data: {
    listingId: room.id, checkIn: date(40), checkOut: date(42), guests: 2,
  } }));
  const path = `${endpoint(agent.id)}/confirm`;
  const validShape = { quoteId: prepared.quote.id, approval: prepared.approval, approved: true, idempotencyKey: "test-agent-approval" };
  for (const body of [
    validShape,
    { ...validShape, approval: "forged" },
    { ...validShape, approved: false },
    { ...validShape, businessId: agent.businessId },
    { ...validShape, quoteId: "unowned-quote" },
    { quoteId: prepared.quote.id, approved: true },
  ]) {
    const response = await request.post(path, { headers: headers(baseURL), data: body });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  }
  expect((await request.post(path, { headers: { Origin: "https://unrelated.example" }, data: validShape })).status()).toBeGreaterThanOrEqual(400);
  const foreign = await playwright.request.newContext({ baseURL });
  try {
    expect((await foreign.post(path, { headers: headers(baseURL), data: validShape })).status()).toBeGreaterThanOrEqual(400);
  } finally { await foreign.dispose(); }
  const unlinked = skills.find(item => item.source === "example" && item.ownerType === "business")!;
  const linkedState = await json(await request.get(endpoint(agent.id)));
  const unlinkedState = await json(await request.get(endpoint(unlinked.id)));
  expect(linkedState).toMatchObject({ canBook: true, testOnly: true });
  expect(unlinkedState).toMatchObject({ canBook: false, testOnly: true });
  expect((await request.post(`${endpoint(unlinked.id)}/confirm`, { headers: headers(baseURL), data: validShape })).status()).toBeGreaterThanOrEqual(400);
  expect((await json(await request.get("/api/actions/state"))).reservations).toEqual(before.reservations);
});

test("phone quote stays test-only and requires the checkbox rather than a typed yes", async ({ page }) => {
  const { agent, room, quote, path } = await fixture(page);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let prepared = false, confirms = 0;
  // Model and confirmation transport are mocked; the profile is selected from the real database.
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["message"]);
      prepared = true;
      messages.push({ role: "user", content: body.message }, { role: "assistant", content: "Review the test quote and approve it below." });
    }
    await route.fulfill({ json: { agent, messages, mode: "live", canBook: true, testOnly: true, ...(prepared ? { listings: [room], quote, approval: "test-approval" } : {}) } });
  });
  await page.route(`**${path}/confirm`, async route => {
    confirms++;
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["approval", "approved", "idempotencyKey", "quoteId"]);
    expect(body).toMatchObject({ quoteId: quote.id, approval: "test-approval", approved: true });
    expect(body.idempotencyKey).toBeTruthy();
    await route.fulfill({ json: { agent, messages, mode: "live", canBook: true, testOnly: true, listings: [room], quote,
      reservation: { ...quote, id: "test-reservation", confirmation: "AB-PHONE-TEST", status: "confirmed", createdAt: new Date().toISOString() } } });
  });
  await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
  const chat = page.getByRole("dialog", { name: agent.name, exact: true });
  await chat.getByLabel("Message selected agent", { exact: true }).fill(`Find a room for two from ${quote.checkIn} to ${quote.checkOut} and prepare a test quote.`);
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  const card = chat.getByRole("region", { name: "Test booking quote", exact: true });
  await expect(card.getByRole("heading", { name: "Test quote", exact: true })).toBeVisible();
  await expect(card).toContainText(room.name);
  await expect(card).toContainText(agent.name);
  await expect(card).toContainText(/no real|no payment/i);
  const approve = card.getByRole("checkbox", { name: "I approve this test booking", exact: true });
  const confirm = card.getByRole("button", { name: "Confirm test booking", exact: true });
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Yes, book it.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue("");
  await expect(confirm).toBeDisabled();
  expect(confirms).toBe(0);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = await confirm.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await approve.check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).toBeVisible();
  await expect(chat).toContainText("AB-PHONE-TEST");
  expect(confirms).toBe(1);
});

test("new quotes and reloading clear approval, while failed confirmation keeps its retry key", async ({ page }) => {
  const { agent, quote, path } = await fixture(page);
  let current = quote;
  const keys: string[] = [];
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "POST") current = { ...quote, id: "browser-test-quote-b", checkIn: date(44), checkOut: date(46) };
    await route.fulfill({ json: { agent, messages: [], mode: "live", canBook: true, testOnly: true, quote: current, approval: `test-${current.id}` } });
  });
  await page.route(`**${path}/confirm`, async route => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    await route.fulfill({ status: 409, json: { error: "The room availability changed. Ask for a new quote." } });
  });
  const open = async () => {
    await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
    return page.getByRole("dialog", { name: agent.name, exact: true });
  };
  let chat = await open();
  let approve = chat.getByRole("checkbox", { name: "I approve this test booking", exact: true });
  await approve.check();
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Change my dates and prepare a new quote.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(approve).not.toBeChecked();
  await expect(chat.getByRole("button", { name: "Confirm test booking", exact: true })).toBeDisabled();
  await approve.check();
  await page.reload();
  chat = await open();
  approve = chat.getByRole("checkbox", { name: "I approve this test booking", exact: true });
  await expect(approve).not.toBeChecked();
  const confirm = chat.getByRole("button", { name: "Confirm test booking", exact: true });
  await approve.check();
  await confirm.click();
  await expect(chat.getByRole("alert")).toContainText("availability changed");
  await expect(approve).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).not.toBeVisible();
  await approve.check();
  await confirm.click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
});

test("expired quotes and missing approval credentials cannot be confirmed", async ({ page }) => {
  const { agent, quote, path } = await fixture(page);
  let expired = true, confirms = 0;
  await page.route(`**${path}`, route => route.fulfill({ json: { agent, messages: [], mode: "live", canBook: true, testOnly: true,
    quote: { ...quote, expiresAt: expired ? new Date(Date.now() - 60000).toISOString() : new Date(Date.now() + 600000).toISOString() },
    ...(expired ? { approval: "expired-token" } : {}),
  } }));
  await page.route(`**${path}/confirm`, async route => { confirms++; await route.fulfill({ status: 400, json: { error: "Unexpected confirmation" } }); });
  await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
  let chat = page.getByRole("dialog", { name: agent.name, exact: true });
  await expect(chat).toContainText(/expired/i);
  await expect(chat.getByRole("button", { name: "Confirm test booking", exact: true })).toBeDisabled();
  expired = false;
  await page.reload();
  await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
  chat = page.getByRole("dialog", { name: agent.name, exact: true });
  const approve = chat.getByRole("checkbox", { name: "I approve this test booking", exact: true });
  if (await approve.isEnabled()) await approve.check();
  await expect(chat.getByRole("button", { name: "Confirm test booking", exact: true })).toBeDisabled();
  expect(confirms).toBe(0);
});

test("unverified confirmation responses show no success and canceled reservations stay canceled", async ({ page }) => {
  const { agent, quote, path } = await fixture(page);
  let canceled = false, attempts = 0;
  const reservation = { ...quote, id: "test-canceled-reservation", confirmation: "AB-CANCELED-TEST", status: "canceled", createdAt: new Date().toISOString() };
  await page.route(`**${path}`, route => route.fulfill({ json: {
    agent, messages: [], mode: "live", canBook: true, testOnly: true, quote,
    ...(canceled ? { reservation } : { approval: "test-approval" }),
  } }));
  await page.route(`**${path}/confirm`, route => {
    attempts++;
    return route.fulfill({ json: attempts === 1
      ? { testOnly: true }
      : { testOnly: false, reservation: { ...reservation, status: "confirmed" } },
    });
  });
  await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
  let chat = page.getByRole("dialog", { name: agent.name, exact: true });
  const approve = chat.getByRole("checkbox", { name: "I approve this test booking", exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await approve.check();
    await chat.getByRole("button", { name: "Confirm test booking", exact: true }).click();
    await expect(chat.getByRole("alert")).toContainText("could not be verified");
    await expect(approve).not.toBeChecked();
    await expect(chat.getByRole("heading", { name: "Test booking confirmed", exact: true })).not.toBeVisible();
  }
  expect(attempts).toBe(2);
  canceled = true;
  await page.reload();
  await page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true }).click();
  chat = page.getByRole("dialog", { name: agent.name, exact: true });
  await expect(chat.getByRole("heading", { name: "Test booking canceled", exact: true })).toBeVisible();
  await expect(chat).toContainText("AB-CANCELED-TEST");
  await expect(chat.getByRole("checkbox", { name: "I approve this test booking", exact: true })).not.toBeVisible();
  await expect(chat.getByRole("button", { name: "Confirm test booking", exact: true })).not.toBeVisible();
});
