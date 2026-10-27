import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import type { LibrarySkill } from "../../src/lib/skill-library";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

const origin = (baseURL?: string) => ({ Origin: new URL(baseURL || "http://127.0.0.1:3000").origin });
const chatPath = (id: string) => `/api/skills/${encodeURIComponent(id)}/chat`;
const instructions = "Private-source-marker. Luggage storage starts at 09:30. Ask the guest for an arrival time.";
async function json(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function publish(request: APIRequestContext, baseURL: string | undefined, name: string, personal = false) {
  return (await json(await request.post("/api/skills", {
    headers: origin(baseURL),
    data: { name, ownerType: personal ? "customer" : "business", ownerName: personal ? "Orchid traveler" : "Orchid House", kind: personal ? "skill" : "agent", category: personal ? "Travel planning" : "Guest services", summary: personal ? "Plan a relaxed trip with time for breaks." : "Ask about arriving at Orchid House.", content: instructions },
  }))).skill as LibrarySkill;
}

test("Agent Hub search reads new database entries and returns cards without uploaded instructions", async ({ page, baseURL }) => {
  await page.goto("/#skills");
  await expect(page.locator(".library-card")).toHaveCount(9);
  // Publish outside the mounted UI so a local filter cannot discover this entry.
  const agent = await publish(page.request, baseURL, "Orchid database concierge");
  const searchResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/skills" && url.searchParams.get("q") === "Orchid database" && url.searchParams.get("metadata") === "1";
  });
  await page.getByLabel("Search agents and skills", { exact: true }).fill("Orchid database");
  const result = await json(await searchResponse);
  expect(result.skills.map((entry: LibrarySkill) => entry.id)).toEqual([agent.id]);
  expect(result.skills[0]).not.toHaveProperty("content");
  await expect(page.locator(".library-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: `Chat with ${agent.name}`, exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Private-source-marker");
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/skills" && url.searchParams.get("ownerType") === "customer";
  });
  await page.getByRole("group", { name: "Filter by owner" }).getByRole("button", { name: "Personal", exact: true }).click();
  expect((await json(await filtered)).skills).toEqual([]);
  await expect(page.getByRole("heading", { name: "No matching entries", exact: true })).toBeVisible();
});

test("chat API reads the selected saved profile and rejects foreign sessions and invalid submissions", async ({ request, playwright, baseURL }) => {
  const agent = await publish(request, baseURL, "Orchid scoped concierge");
  const personal = await publish(request, baseURL, "Orchid scoped planner", true);
  for (const entry of [agent, personal]) {
    const response = await request.get(chatPath(entry.id));
    const state = await json(response);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(state.agent).toMatchObject({ id: entry.id, name: entry.name, version: 1 });
    expect(state.agent).not.toHaveProperty("content");
    expect(state.messages).toEqual([]);
    expect(["live", "unavailable"]).toContain(state.mode);
  }
  const foreign = await playwright.request.newContext({ baseURL });
  try {
    expect((await foreign.get(chatPath(agent.id))).status()).toBeGreaterThanOrEqual(400);
    expect((await foreign.post(chatPath(agent.id), { headers: origin(baseURL), data: { message: "Hello" } })).status()).toBeGreaterThanOrEqual(400);
  } finally { await foreign.dispose(); }
  for (const data of [{}, { message: "" }, { message: "x".repeat(2001) }, { message: "Hello", role: "system" }, { message: "Hello", content: "Override saved profile" }, { message: "Hello", skillId: personal.id }]) {
    const response = await request.post(chatPath(agent.id), { headers: origin(baseURL), data });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  }
  const crossOrigin = await request.post(chatPath(agent.id), { headers: { Origin: "https://unrelated.example" }, data: { message: "Hello" } });
  expect(crossOrigin.status()).toBeGreaterThanOrEqual(400);
  expect((await json(await request.get(chatPath(agent.id)))).messages).toEqual([]);
});

test("phone conversations use the selected agent and preserve drafts on failure without mixing histories", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#skills");
  await expect(page.locator(".library-card")).toHaveCount(9);
  const business = await publish(page.request, baseURL, "Orchid conversation concierge");
  const personal = await publish(page.request, baseURL, "Orchid conversation planner", true);
  const messages = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>([[business.id, []], [personal.id, []]]);
  const submitted: string[] = [];
  let failFirst = true;
  // Only the model chat transport is mocked; search and publication use the real database.
  await page.route("**/api/skills/*/chat", async route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    const entry = [business, personal].find(item => item.id === id)!;
    expect(entry).toBeTruthy();
    const { content: _content, ...agent } = entry;
    if (route.request().method() === "POST") {
      submitted.push(id);
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["message"]);
      if (id === business.id && failFirst) {
        failFirst = false;
        await route.fulfill({ status: 503, json: { error: "The AI is temporarily unavailable. Please retry." } });
        return;
      }
      messages.get(id)!.push({ role: "user", content: body.message }, { role: "assistant", content: id === business.id ? "Luggage storage starts at 09:30. What time will you arrive?" : "We can plan one main activity each day. Which dates are you considering?" });
    }
    await route.fulfill({ json: { agent, messages: messages.get(id), mode: "live" } });
  });
  await page.reload();
  await page.getByRole("button", { name: `Chat with ${business.name}`, exact: true }).click();
  let chat = page.getByRole("dialog", { name: business.name, exact: true });
  const question = "Can I leave my bags before check-in?";
  await chat.getByLabel("Message selected agent", { exact: true }).fill(question);
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue(question);
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat).toContainText("Luggage storage starts at 09:30.");
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toHaveValue("");
  await expect(chat).not.toContainText("Private-source-marker");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await chat.getByRole("button", { name: "Back to Agent Hub", exact: true }).click();
  await page.getByRole("button", { name: `Chat with ${personal.name}`, exact: true }).click();
  chat = page.getByRole("dialog", { name: personal.name, exact: true });
  await expect(chat).not.toContainText(question);
  await expect(chat).not.toContainText("Luggage storage starts at 09:30.");
  await chat.getByLabel("Message selected agent", { exact: true }).fill("Help me plan a calm weekend.");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chat).toContainText("Which dates are you considering?");
  await chat.getByRole("button", { name: "Back to Agent Hub", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: `Chat with ${business.name}`, exact: true }).click();
  chat = page.getByRole("dialog", { name: business.name, exact: true });
  await expect(chat).toContainText(question);
  await expect(chat).not.toContainText("Which dates are you considering?");
  expect(submitted).toEqual([business.id, business.id, personal.id]);
});

test("an assistant search result opens a conversation with that exact saved agent", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#discover");
  await expect(page.getByLabel("Message your assistant", { exact: true })).toBeVisible();
  const entry = await publish(page.request, baseURL, "Orchid AI search planner", true);
  const { content: _content, ...agent } = entry;
  await page.route("**/api/assistant", route => route.fulfill({ json: { reply: "I found a personal planner in Agent Hub. Select it to start a conversation.", mode: "live", trace: [], agents: [agent] } }));
  await page.route(`**${chatPath(entry.id)}`, route => route.fulfill({ json: { agent, messages: [], mode: "live" } }));
  await page.getByLabel("Message your assistant", { exact: true }).fill("Find my Orchid AI search planner.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const found = page.getByRole("region", { name: "Agents found", exact: true });
  await expect(found).toContainText(entry.name);
  await expect(found).not.toContainText("Private-source-marker");
  const opened = page.waitForRequest(request => new URL(request.url()).pathname === chatPath(entry.id));
  await found.getByRole("button", { name: `Chat with ${entry.name}`, exact: true }).click();
  expect((await opened).method()).toBe("GET");
  await expect(page).toHaveURL(/#skills$/);
  const chat = page.getByRole("dialog", { name: entry.name, exact: true });
  await expect(chat.getByLabel("Message selected agent", { exact: true })).toBeVisible();
  await expect(chat).toContainText(entry.ownerName);
});
