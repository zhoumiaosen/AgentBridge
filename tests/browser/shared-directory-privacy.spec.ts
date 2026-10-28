import { test, expect, type APIResponse } from "@playwright/test";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

async function data(response: APIResponse) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("public service metadata never exposes editor content or permits foreign owner actions", async ({ request, playwright, baseURL }) => {
  const headers = { Origin: new URL(baseURL || "http://127.0.0.1:3000").origin };
  const profile = {
    name: "Amber testing workshop", ownerName: "Amber testing workshop", ownerType: "business", kind: "agent", category: "Bike repair",
    summary: "Fictional bike repair for directory privacy checks.", content: "Private-source-marker-amber. Answer only from the saved test offer.",
  };
  const { skill: publicAgent } = await data(await request.post("/api/skills", { headers, data: { ...profile, visibility: "public" } }));
  const { skill: privateAgent } = await data(await request.post("/api/skills", { headers, data: { ...profile, name: "Private amber workshop" } }));
  const { skill: personal } = await data(await request.post("/api/skills", { headers, data: { ...profile, ownerType: "customer", name: "Private amber personal helper" } }));
  const customer = await playwright.request.newContext({ baseURL });
  try {
    const list = await data(await customer.get("/api/skills"));
    const shared = list.skills.find((skill: { id: string }) => skill.id === publicAgent.id);
    expect(shared).toMatchObject({ canEdit: false, visibility: "public" });
    expect(shared).not.toHaveProperty("content");
    expect(JSON.stringify(list)).not.toContain("Private-source-marker-amber");
    const metadata = await data(await customer.get(`/api/skills/${publicAgent.id}?metadata=1`));
    expect(metadata.skill).not.toHaveProperty("content");
    for (const field of ["ownerTenantId", "owner_tenant_id", "tenant_id"]) {
      expect(shared).not.toHaveProperty(field);
      expect(metadata.skill).not.toHaveProperty(field);
    }
    for (const query of ["", "?download=1", "?metadata=1&download=1"]) {
      expect((await customer.get(`/api/skills/${publicAgent.id}${query}`)).status()).toBe(404);
    }
    for (const skill of [privateAgent, personal]) {
      expect(list.skills.some((entry: { id: string }) => entry.id === skill.id)).toBe(false);
      expect((await customer.get(`/api/skills/${skill.id}?metadata=1`)).status()).toBe(404);
    }
    expect((await customer.patch(`/api/skills/${publicAgent.id}`, { headers, data: { ...profile, version: publicAgent.version } })).status()).toBeGreaterThanOrEqual(400);
    expect((await customer.patch(`/api/skills/${publicAgent.id}`, { headers, data: { visibility: "private", version: publicAgent.version } })).status()).toBeGreaterThanOrEqual(400);
    expect((await customer.get(`/api/skills/${publicAgent.id}/chat`)).ok()).toBe(true);
    expect((await data(await request.get(`/api/skills/${publicAgent.id}`))).skill.content).toBe(profile.content);
    expect((await data(await request.get(`/api/skills/${publicAgent.id}?download=1`))).content).toBe(profile.content);
    const imported = await data(await request.post("/api/skills/import", { headers, data: { filename: "published.json", text: JSON.stringify(publicAgent) } }));
    expect(imported.draft).not.toHaveProperty("visibility");
  } finally { await customer.dispose(); }
});

test("public connected rooms expose their published facts without private knowledge or owner access", async ({ request, playwright, baseURL }) => {
  const headers = { Origin: new URL(baseURL || "http://127.0.0.1:3000").origin };
  const state = await data(await request.get("/api/actions/state"));
  const original = state.businesses[0];
  const saved = await data(await request.post("/api/actions/save-skill", { headers, data: {
    businessId: original.id, version: original.version, summary: "Fictional rooms for cross-customer privacy tests.",
    knowledge: "Private-room-guidance-marker-amber.", visibility: "public",
  } }));
  const business = saved.business;
  const customer = await playwright.request.newContext({ baseURL });
  try {
    const customerState = await data(await customer.get("/api/actions/state"));
    expect(customerState.businesses.some((entry: { id: string }) => entry.id === business.id)).toBe(false);
    expect(customerState.listings.some((entry: { id: string }) => entry.id === business.listingIds[0])).toBe(false);
    expect((await customer.get(`/api/businesses/${business.id}`)).status()).toBe(404);
    expect((await customer.get(`/api/skills/${business.id}?download=1`)).status()).toBe(404);
    const metadata = await data(await customer.get(`/api/skills/${business.id}?metadata=1`));
    expect(metadata.skill).toMatchObject({ canEdit: false, visibility: "public" });
    expect(metadata.skill).not.toHaveProperty("content");
    const publicProfile = await data(await customer.post(`/api/businesses/${business.id}`, { headers, data: { action: "profile", input: {} } }));
    expect(publicProfile.result).not.toHaveProperty("knowledge");
    const details = await data(await customer.post(`/api/businesses/${business.id}`, { headers, data: { action: "get_stay_details", input: { listingId: business.listingIds[0] } } }));
    expect(details.result.id).toBe(business.listingIds[0]);
    expect(details.result.businessSkill).not.toHaveProperty("knowledge");
    for (const entry of [metadata.skill, publicProfile.result, details.result]) {
      for (const field of ["ownerTenantId", "owner_tenant_id", "tenant_id"]) expect(entry).not.toHaveProperty(field);
    }
    expect(JSON.stringify([metadata, publicProfile, details])).not.toContain("Private-room-guidance-marker-amber");
    expect((await customer.post("/api/actions/save-skill", { headers, data: { businessId: business.id, version: business.version, summary: "Changed by customer", knowledge: "No", visibility: "private" } })).status()).toBeGreaterThanOrEqual(400);
    expect((await data(await request.get(`/api/businesses/${business.id}`))).knowledge).toBe("Private-room-guidance-marker-amber.");
  } finally { await customer.dispose(); }
});
