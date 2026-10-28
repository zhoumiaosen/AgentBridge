import { test, expect, type APIResponse } from "@playwright/test";
import type { LibrarySkill } from "../../src/lib/skill-library";

test.use({
  ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}),
});

const endpoint = (id: string) => `/api/skills/${encodeURIComponent(id)}`;
const origin = (baseURL?: string) => ({ Origin: new URL(baseURL || "http://127.0.0.1:3000").origin });
const draft = {
  name: "Orchid neighborhood guide",
  ownerType: "business" as const,
  ownerName: "Orchid Guest House",
  kind: "agent" as const,
  category: "Guest services",
  summary: "Answers questions using the owner's published neighborhood guide.",
  content: "Ask which neighborhood the guest wants to visit. Use supplied information and identify missing details.",
};

async function readJSON(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function expectRejected(response: APIResponse) {
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
  expect((await response.json()).error).toEqual(expect.any(String));
}

test("library seeds business and personal examples alongside connected room agents", async ({ request }) => {
  const { skills }: { skills: LibrarySkill[] } = await readJSON(await request.get("/api/skills"));
  expect(skills.filter(skill => skill.source === "example" && skill.ownerType === "business")).toHaveLength(11);
  const sharedExamples = skills.filter(skill => skill.source === "example" && !skill.canEdit);
  expect(sharedExamples).toHaveLength(8);
  for (const skill of sharedExamples) {
    expect(skill).toMatchObject({ visibility: "public", ownerType: "business", kind: "agent" });
    expect(skill).not.toHaveProperty("content");
    expect(skill.serviceOffer?.items.length).toBeGreaterThan(0);
  }
  expect(skills.filter(skill => skill.source === "example" && skill.ownerType === "customer")).toHaveLength(3);
  const connected = skills.filter(skill => skill.source === "connected");
  expect(connected).toHaveLength(3);
  const { businesses } = await readJSON(await request.get("/api/businesses"));
  expect(connected.map(skill => skill.businessId).sort()).toEqual(businesses.map((business: { id: string }) => business.id).sort());
  for (const skill of connected) expect(skill).toMatchObject({ ownerType: "business", kind: "agent", version: 1 });
  const response = await request.get(endpoint(skills[0].id));
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await readJSON(response)).skill).toEqual(skills[0]);
  expect((await readJSON(await request.get("/api/skills"))).skills).toEqual(skills);
});

test("independent business and personal entries persist and support combined filters", async ({ request, playwright, baseURL }) => {
  const before = await readJSON(await request.get("/api/actions/state"));
  const created: LibrarySkill[] = [];
  for (const ownerType of ["business", "customer"] as const) {
    for (const kind of ["agent", "skill"] as const) {
      const input = { ...draft, name: `Orchid ${ownerType} ${kind}`, ownerType, kind, agentUrl: "https://agents.example.test/orchid" };
      const { skill } = await readJSON(await request.post("/api/skills", { headers: origin(baseURL), data: input }));
      expect(skill).toMatchObject({ ...input, source: "custom", version: 1 });
      expect(Number.isNaN(Date.parse(skill.updatedAt))).toBe(false);
      expect(skill).not.toHaveProperty("businessId");
      created.push(skill);
    }
  }
  expect(new Set(created.map(skill => skill.id)).size).toBe(4);
  const { skills: found } = await readJSON(await request.get("/api/skills", { params: { q: "ORCHID", ownerType: "customer", kind: "skill" } }));
  expect(found.map((skill: LibrarySkill) => skill.id)).toEqual(created.filter(skill => skill.ownerType === "customer" && skill.kind === "skill").map(skill => skill.id));
  const after = await readJSON(await request.get("/api/actions/state"));
  expect(after.listings).toEqual(before.listings);
  expect(after.reservations).toEqual(before.reservations);

  const returningClient = await playwright.request.newContext({ baseURL, storageState: await request.storageState() });
  try {
    for (const skill of created) expect((await readJSON(await returningClient.get(endpoint(skill.id)))).skill).toEqual(skill);
    const reloaded = await readJSON(await returningClient.get("/api/skills", { params: { q: "Orchid" } }));
    expect(reloaded.skills.map((skill: LibrarySkill) => skill.id).sort()).toEqual(created.map(skill => skill.id).sort());
  } finally {
    await returningClient.dispose();
  }
});

test("versioned edits export and import as a draft before explicit publication", async ({ request, baseURL }) => {
  const headers = origin(baseURL);
  const { skill: original } = await readJSON(await request.post("/api/skills", { headers, data: draft }));
  const changes = { ...draft, content: "Use the saved guide. Ask the owner to confirm any opening hours that are missing." };
  const { skill: saved } = await readJSON(await request.patch(endpoint(original.id), { headers, data: { ...changes, version: 1 } }));
  expect(saved).toMatchObject({ ...changes, id: original.id, source: "custom", version: 2 });
  await expectRejected(await request.patch(endpoint(original.id), { headers, data: { ...draft, version: 1 } }));
  expect((await readJSON(await request.get(endpoint(original.id)))).skill).toEqual(saved);

  const exported = await request.get(`${endpoint(saved.id)}?download=1`);
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toMatch(/^attachment;.*\.json/);
  const text = await exported.text();
  expect(JSON.parse(text)).toEqual(saved);
  const before = (await readJSON(await request.get("/api/skills"))).skills;
  const imported = await readJSON(await request.post("/api/skills/import", { headers, data: { filename: "orchid.json", text } }));
  expect(imported.draft).toEqual(changes);
  expect((await readJSON(await request.get("/api/skills"))).skills).toEqual(before);
  const { skill: copy } = await readJSON(await request.post("/api/skills", { headers, data: imported.draft }));
  expect(copy).toMatchObject({ ...changes, source: "custom", version: 1 });
  expect(copy.id).not.toBe(saved.id);
  expect((await readJSON(await request.get(endpoint(saved.id)))).skill).toEqual(saved);
});

test("malformed uploads and unsupported entry fields leave library records unchanged", async ({ request, baseURL }) => {
  const headers = origin(baseURL);
  const before = (await readJSON(await request.get("/api/skills"))).skills;
  for (const data of [
    { filename: "guide.js", text: "Plain instructions" },
    { filename: "guide.json", text: '{"name":' },
    { filename: "guide.json", text: "[]" },
    { filename: "guide.json", text: JSON.stringify({ ...draft, command: "unsupported executable configuration" }) },
    { filename: "guide.md", text: "---\nname: Guide\nMissing closing delimiter" },
    { filename: "guide.md", text: "日".repeat(9000) },
    { filename: "guide.json", text: JSON.stringify({ ...draft, content: "x".repeat(12001) }) },
    { filename: "guide.json", text: 42 },
  ]) await expectRejected(await request.post("/api/skills/import", { headers, data }));
  for (const fields of [
    { ownerType: "admin" }, { kind: "script" }, { content: "" },
    { agentUrl: "javascript:alert(1)" }, { agentUrl: "https://user:password@example.test" },
    { name: "x".repeat(101) }, { content: "x".repeat(12001) },
  ]) await expectRejected(await request.post("/api/skills", { headers, data: { ...draft, ...fields } }));
  await expectRejected(await request.post("/api/skills", {
    headers: { ...headers, "Content-Type": "application/json" }, data: '{"name":',
  }));
  expect((await readJSON(await request.get("/api/skills"))).skills).toEqual(before);
});

test("library rejects cross-tenant access, cross-origin changes, and connected-agent edits", async ({ request, playwright, baseURL }) => {
  const headers = origin(baseURL);
  const { skill } = await readJSON(await request.post("/api/skills", { headers, data: draft }));
  const { skills }: { skills: LibrarySkill[] } = await readJSON(await request.get("/api/skills"));
  const connected = skills.find(item => item.source === "connected")!;
  await expectRejected(await request.patch(endpoint(connected.id), { headers, data: { ...draft, version: connected.version } }));
  for (const [path, method, data] of [
    ["/api/skills", "POST", draft],
    [endpoint(skill.id), "PATCH", { ...draft, version: 1 }],
    ["/api/skills/import", "POST", { filename: "guide.json", text: JSON.stringify(draft) }],
  ] as const) await expectRejected(await request.fetch(path, { method, headers: { Origin: "https://unrelated.example" }, data }));

  const otherTenant = await playwright.request.newContext({ baseURL });
  try {
    const otherBefore = (await readJSON(await otherTenant.get("/api/skills"))).skills;
    const foreignIds = [skill.id, connected.id, skills.find(item => item.source === "example")!.id];
    for (const id of foreignIds) {
      await expectRejected(await otherTenant.get(endpoint(id)));
      await expectRejected(await otherTenant.get(`${endpoint(id)}?download=1`));
      await expectRejected(await otherTenant.patch(endpoint(id), { headers, data: { ...draft, version: 1 } }));
    }
    expect((await readJSON(await otherTenant.get("/api/skills"))).skills).toEqual(otherBefore);
  } finally {
    await otherTenant.dispose();
  }
  expect((await readJSON(await request.get(endpoint(skill.id)))).skill).toEqual(skill);
  expect((await readJSON(await request.get(endpoint(connected.id)))).skill).toEqual(connected);
});

test("phone users publish an agent and import a personal skill, then reopen both after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#skills");
  await expect(page.getByRole("heading", { name: "Agent Hub", exact: true })).toBeVisible();
  await expect(page.locator(".library-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Add agent or skill", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add agent or skill", exact: true });
  await expect(editor.getByRole("button", { name: "Close Agent Hub dialog", exact: true })).toBeFocused();
  await editor.getByLabel("Entry name", { exact: true }).fill("Orchid phone concierge");
  await editor.getByLabel("Entry type", { exact: true }).selectOption("agent");
  await editor.getByLabel("Owner type", { exact: true }).selectOption("business");
  const publication = editor.getByRole("checkbox", { name: "Let other customers discover this business", exact: true });
  await expect(publication).not.toBeChecked();
  await publication.check();
  await editor.getByLabel("Owner name", { exact: true }).fill("Orchid Guest House");
  await editor.getByLabel("Category", { exact: true }).fill("Guest services");
  await editor.getByLabel("Short description", { exact: true }).fill(draft.summary);
  await editor.getByLabel("Instructions", { exact: true }).fill(draft.content);
  await editor.getByLabel("External agent link", { exact: true }).fill("https://agents.example.test/orchid");
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const refreshedFromDatabase = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/skills" && url.searchParams.get("metadata") === "1";
  });
  await editor.getByRole("button", { name: "Publish business agent", exact: true }).click();
  const publishedResults = await readJSON(await refreshedFromDatabase);
  expect(publishedResults.skills.some((entry: LibrarySkill) => entry.name === "Orchid phone concierge")).toBe(true);
  for (const entry of publishedResults.skills) expect(entry).not.toHaveProperty("content");
  await expect(editor).not.toBeVisible();
  const agentCard = page.locator(".library-card").filter({ has: page.getByRole("heading", { name: "Orchid phone concierge", exact: true }) });
  await expect(agentCard).toContainText("Your entry");
  await expect(agentCard).toContainText("Business · Orchid Guest House");
  await expect(agentCard).toContainText("Discoverable by other customers");

  const beforeImport = (await readJSON(await page.request.get("/api/skills"))).skills.length;
  await page.getByLabel("Import skill file", { exact: true }).setInputFiles({
    name: "neighborhood.md", mimeType: "text/markdown",
    buffer: Buffer.from("---\nname: Personal neighborhood checklist\ndescription: Questions to prepare before visiting a neighborhood.\n---\n\nAsk about dates, budget, and access preferences. Confirm missing details with the owner."),
  });
  const imported = page.getByRole("dialog", { name: "Review imported entry", exact: true });
  await expect(imported).toBeVisible();
  await expect(imported.getByLabel("Entry name", { exact: true })).toHaveValue("Personal neighborhood checklist");
  await expect(imported.getByLabel("Instructions", { exact: true })).toHaveValue(/Ask about dates, budget, and access preferences\. Confirm missing details with the owner\./);
  expect((await readJSON(await page.request.get("/api/skills"))).skills).toHaveLength(beforeImport);
  await imported.getByLabel("Owner type", { exact: true }).selectOption("customer");
  await imported.getByLabel("Entry type", { exact: true }).selectOption("skill");
  await imported.getByLabel("Owner name", { exact: true }).fill("Orchid traveler");
  await imported.getByLabel("Category", { exact: true }).fill("Travel planning");
  await expect(imported.getByRole("checkbox", { name: "Let other customers discover this business", exact: true })).toHaveCount(0);
  await imported.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(imported).not.toBeVisible();
  const personalCard = page.locator(".library-card").filter({ has: page.getByRole("heading", { name: "Personal neighborhood checklist", exact: true }) });
  await expect(personalCard).toContainText("Personal · Orchid traveler");
  await expect(personalCard).toContainText("Private to your workspace");
  await page.reload();
  await expect(agentCard).toBeVisible();
  await expect(personalCard).toBeVisible();
  await page.getByLabel("Search agents and skills", { exact: true }).fill("neighborhood checklist");
  await page.getByRole("group", { name: "Filter by owner", exact: true }).getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.locator(".library-card")).toHaveCount(1);
  await personalCard.getByRole("button", { name: "View Personal neighborhood checklist", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Personal neighborhood checklist", exact: true });
  await expect(details.locator(".library-content")).toHaveCount(0);
  await expect(details).not.toContainText("Confirm missing details with the owner.");
  await details.getByRole("button", { name: "Edit entry", exact: true }).click();
  const savedEditor = page.getByRole("dialog", { name: "Edit entry", exact: true });
  await expect(savedEditor.getByLabel("Instructions", { exact: true })).toHaveValue(/Ask about dates, budget, and access preferences\. Confirm missing details with the owner\./);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await savedEditor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("phone connected-agent management refreshes saved business knowledge in the library", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#skills");
  await expect(page.locator(".library-card").first()).toBeVisible();
  const { skills }: { skills: LibrarySkill[] } = await readJSON(await page.request.get("/api/skills"));
  const business = skills.find(skill => skill.source === "connected")!;
  const card = page.locator(".library-card").filter({ has: page.getByRole("heading", { name: business.name, exact: true }) });
  await card.getByRole("button", { name: `Manage ${business.name}`, exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(editor.getByLabel("Business name", { exact: true })).toHaveValue(business.name);
  await editor.getByLabel("Short introduction", { exact: true }).fill("Guest guidance updated through the Agent Hub.");
  await editor.getByLabel("Business knowledge", { exact: true }).fill("Luggage can be stored at reception after 09:00. Ask the host about late arrival.");
  await editor.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Hub", exact: true })).toBeVisible();
  await expect(card).toContainText("Guest guidance updated through the Agent Hub.");
  await card.getByRole("button", { name: `View ${business.name}`, exact: true }).click();
  const details = page.getByRole("dialog", { name: business.name, exact: true });
  await expect(details.locator(".library-content")).toHaveCount(0);
  await expect(details).not.toContainText("Luggage can be stored at reception after 09:00.");
  await expect(details.locator(".library-version")).toContainText(`Version ${business.version + 1}`);
  await details.getByRole("button", { name: "Close Agent Hub dialog", exact: true }).click();
  await page.reload();
  await expect(card).toContainText("Guest guidance updated through the Agent Hub.");
  const { skill: saved } = await readJSON(await page.request.get(endpoint(business.id)));
  expect(saved).toMatchObject({ id: business.id, businessId: business.businessId, source: "connected", version: business.version + 1 });
  expect(saved.content).toContain("Luggage can be stored at reception after 09:00.");
});

test("phone customers find another business by service and chat without owner controls or raw instructions", async ({ page, request, baseURL }) => {
  const headers = origin(baseURL);
  const details = {
    ...draft, name: "Glimmer repair test agent", ownerName: "Glimmer fictional workshop", category: "Bicycle repair",
    summary: "Fictional bicycle repair and wheel puncture service for test conversations.",
    content: "Owner-instructions-marker. Explain the saved repair offer and ask the customer to review it. Never perform real work or take payment.",
    serviceOffer: { title: "Wheel puncture repair", items: [{ label: "Repair labor", amountCents: 3500 }, { label: "Inner tube", amountCents: 1200 }] },
  };
  const { skill: shared } = await readJSON(await request.post("/api/skills", { headers, data: { ...details, visibility: "public" } }));
  const { skill: privateAgent } = await readJSON(await request.post("/api/skills", { headers, data: { ...details, name: "Glimmer private repair agent" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#skills");
  await expect(page.locator(".library-card").first()).toBeVisible();
  await page.getByLabel("Search agents and skills", { exact: true }).fill("wheel puncture");
  const card = page.locator(".library-card").filter({ has: page.getByRole("heading", { name: shared.name, exact: true }) });
  await expect(card).toBeVisible();
  await expect(page.getByRole("heading", { name: privateAgent.name, exact: true })).toHaveCount(0);
  await expect(card).not.toContainText("Your entry");
  await expect(card.getByRole("button", { name: `Edit ${shared.name}`, exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: `View ${shared.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: shared.name, exact: true });
  await expect(dialog).not.toContainText("Owner-instructions-marker");
  await expect(dialog.getByRole("button", { name: "Edit entry", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Use as template", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Download entry" })).toHaveCount(0);
  const { skill: metadata } = await readJSON(await page.request.get(`${endpoint(shared.id)}?metadata=1`));
  expect(metadata).toMatchObject({ id: shared.id, visibility: "public", canEdit: false });
  expect(metadata).not.toHaveProperty("content");
  const directory = await readJSON(await page.request.get("/api/skills", { params: { q: "wheel puncture" } }));
  expect(directory.skills.find((entry: LibrarySkill) => entry.id === shared.id)).not.toHaveProperty("content");
  await expectRejected(await page.request.get(endpoint(shared.id)));
  await expectRejected(await page.request.get(`${endpoint(shared.id)}?download=1`));
  await expectRejected(await page.request.get(`${endpoint(shared.id)}?metadata=1&download=1`));
  await dialog.getByRole("button", { name: `Chat with ${shared.name}`, exact: true }).click();
  await expect(dialog.getByLabel("Message selected agent", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("Owner-instructions-marker");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("public accommodation operations hide owner guidance and its downloadable manifest", async ({ request, playwright, baseURL }) => {
  const headers = origin(baseURL);
  const { businesses } = await readJSON(await request.get("/api/actions/state"));
  const original = businesses[0];
  const { business } = await readJSON(await request.post("/api/actions/save-skill", { headers, data: {
    businessId: original.id, version: original.version, summary: "Fictional public hotel for privacy checks.", knowledge: "Private-room-guidance-marker.", visibility: "public",
  } }));
  const customer = await playwright.request.newContext({ baseURL });
  const path = `/api/businesses/${encodeURIComponent(business.id)}`;
  try {
    await expectRejected(await customer.get(path));
    const profile = await readJSON(await customer.post(path, { headers, data: { action: "profile", input: {} } }));
    expect(profile.result).toMatchObject({ id: business.id, canEdit: false, visibility: "public" });
    expect(profile.result).not.toHaveProperty("knowledge");
    const details = await readJSON(await customer.post(path, { headers, data: { action: "get_stay_details", input: { listingId: business.listingIds[0] } } }));
    expect(details.result.businessSkill).not.toHaveProperty("knowledge");
    expect(JSON.stringify(details)).not.toContain("Private-room-guidance-marker");
    expect((await readJSON(await request.get(path))).knowledge).toBe("Private-room-guidance-marker.");
  } finally {
    await customer.dispose();
    await readJSON(await request.patch(endpoint(business.id), { headers, data: { version: business.version, visibility: "private" } }));
  }
});
