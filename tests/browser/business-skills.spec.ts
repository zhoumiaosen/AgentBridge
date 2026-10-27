import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const protocol = "agentbridge.skill.v1";
const origin = { Origin: "http://127.0.0.1:3000" };
const endpoint = (id: string) => `/api/businesses/${encodeURIComponent(id)}`;
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function readJSON(response: APIResponse) {
  expect(response.ok()).toBe(true);
  return response.json();
}

async function expectRejected(response: APIResponse) {
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
  expect((await response.json()).error).toEqual(expect.any(String));
}

async function invoke(request: APIRequestContext, businessId: string, action: string, input: unknown = {}) {
  return request.post(endpoint(businessId), { headers: origin, data: { action, input } });
}

test("business directory links published rooms and saved knowledge survives a new client", async ({ request, playwright, baseURL }) => {
  const directory = await readJSON(await request.get("/api/businesses"));
  expect(directory.protocol).toBe(protocol);
  expect(directory.businesses).toHaveLength(3);
  expect(directory.businesses.every((business: { version: number }) => business.version === 1)).toBe(true);

  const published = await readJSON(await request.post("/api/actions/publish", {
    headers: origin,
    data: {
      name: "Business API Garden Room",
      hostName: "Business API Garden House",
      type: "private",
      neighborhood: "Lower Haight",
      description: "A sample garden room published by this isolated API test.",
      nightlyCents: 14500,
      cleaningCents: 2500,
      maxGuests: 2,
      amenities: ["Wi-Fi", "Step-free access"],
      checkInTime: "15:00",
      checkOutTime: "11:00",
      cancellation: "flexible",
      image: "/rooms/private.svg",
      availableFrom: day(1),
      availableTo: day(90),
    },
  }));
  const business = published.business;
  expect(published.listing.businessId).toBe(business.id);
  expect(business.listingIds).toContain(published.listing.id);
  expect(business.version).toBe(1);
  const updatedDirectory = await readJSON(await request.get("/api/businesses"));
  expect(updatedDirectory.businesses).toHaveLength(4);
  expect(updatedDirectory.businesses.find((item: { id: string }) => item.id === business.id)).toMatchObject({
    id: business.id,
    endpoint: endpoint(business.id),
  });

  const manifest = await readJSON(await request.get(endpoint(business.id)));
  expect(manifest).toMatchObject({ protocol, schemaVersion: "1.0", id: business.id, version: 1, requiresApproval: true });
  expect(Object.keys(manifest.operations).sort()).toEqual(["create_quote", "discover_stays", "get_stay_details", "profile"]);
  for (const operation of Object.values(manifest.operations) as Array<{ description: unknown; inputSchema: unknown }>) {
    expect(operation.description).toEqual(expect.any(String));
    expect(operation.inputSchema).toEqual(expect.objectContaining({ type: "object" }));
  }
  const profile = await readJSON(await invoke(request, business.id, "profile"));
  expect(profile).toMatchObject({ protocol, businessId: business.id, businessName: business.name, skillVersion: 1 });
  expect(profile.result).toMatchObject({ id: business.id, version: 1, listingIds: [published.listing.id] });

  const changes = {
    businessId: business.id,
    version: 1,
    summary: "Private garden rooms with step-free entry.",
    knowledge: "Luggage can be left with reception from 10:00. Quiet hours begin at 22:00.",
  };
  const saved = await readJSON(await request.post("/api/actions/save-skill", { headers: origin, data: changes }));
  expect(saved.business).toMatchObject({ id: business.id, version: 2, summary: changes.summary, knowledge: changes.knowledge });
  await expectRejected(await request.post("/api/actions/save-skill", {
    headers: origin,
    data: { ...changes, summary: "This stale update must not replace the saved profile." },
  }));

  const returningClient = await playwright.request.newContext({ baseURL, storageState: await request.storageState() });
  try {
    const reloaded = await readJSON(await returningClient.get(endpoint(business.id)));
    expect(reloaded).toMatchObject({ version: 2, summary: changes.summary, knowledge: changes.knowledge });
    const state = await readJSON(await returningClient.get("/api/actions/state"));
    expect(state.businesses.find((item: { id: string }) => item.id === business.id)).toMatchObject({ version: 2, knowledge: changes.knowledge });
    const response = await readJSON(await invoke(returningClient, business.id, "profile"));
    expect(response.skillVersion).toBe(2);
    expect(response.result.knowledge).toBe(changes.knowledge);
  } finally {
    await returningClient.dispose();
  }
});

test("business discovery, details, and quotes cannot cross business or tenant boundaries", async ({ request, playwright, baseURL }) => {
  const directory = await readJSON(await request.get("/api/businesses"));
  const [first, second] = directory.businesses;
  const input = { checkIn: day(20), checkOut: day(22), guests: 1 };
  const discovery = await readJSON(await invoke(request, first.id, "discover_stays", input));
  expect(discovery).toMatchObject({ protocol, businessId: first.id, businessName: first.name, skillVersion: first.version });
  expect(discovery.result.map((room: { id: string }) => room.id)).toEqual(first.listingIds);
  expect(discovery.result.every((room: { businessId: string }) => room.businessId === first.id)).toBe(true);
  const details = await readJSON(await invoke(request, first.id, "get_stay_details", { listingId: first.listingIds[0] }));
  expect(details.result).toMatchObject({ id: first.listingIds[0], businessId: first.id });

  await expectRejected(await invoke(request, first.id, "get_stay_details", { listingId: second.listingIds[0] }));
  await expectRejected(await invoke(request, first.id, "create_quote", { ...input, listingId: second.listingIds[0] }));

  const otherTenant = await playwright.request.newContext({ baseURL });
  try {
    const otherDirectory = await readJSON(await otherTenant.get("/api/businesses"));
    const otherBusiness = otherDirectory.businesses[0];
    expect(otherBusiness.id).not.toBe(first.id);
    await expectRejected(await otherTenant.get(endpoint(first.id)));
    await expectRejected(await invoke(otherTenant, first.id, "profile"));
    await expectRejected(await invoke(otherTenant, otherBusiness.id, "get_stay_details", { listingId: first.listingIds[0] }));
    await expectRejected(await invoke(otherTenant, otherBusiness.id, "create_quote", { ...input, listingId: first.listingIds[0] }));
    await expectRejected(await otherTenant.post("/api/actions/save-skill", {
      headers: origin,
      data: { businessId: first.id, version: first.version, summary: "Foreign update", knowledge: "Must be rejected." },
    }));
  } finally {
    await otherTenant.dispose();
  }
});

test("business quotes disclose authoritative terms without approval tokens or reservations", async ({ request }) => {
  const directory = await readJSON(await request.get("/api/businesses"));
  const business = directory.businesses[0];
  const details = await readJSON(await invoke(request, business.id, "get_stay_details", { listingId: business.listingIds[0] }));
  const quoted = await readJSON(await invoke(request, business.id, "create_quote", {
    listingId: details.result.id,
    checkIn: day(30),
    checkOut: day(32),
    guests: 2,
  }));
  expect(quoted).toMatchObject({ protocol, businessId: business.id, businessName: business.name, skillVersion: business.version });
  expect(quoted.result).toMatchObject({
    listingId: details.result.id,
    businessId: business.id,
    totalCents: details.result.nightlyCents * 2 + details.result.cleaningCents,
    cancellation: details.result.cancellation,
  });
  expect(quoted).not.toHaveProperty("approval");
  expect(quoted.result).not.toHaveProperty("approval");
  expect(quoted.result).not.toHaveProperty("confirmation");
  expect((await readJSON(await request.get("/api/actions/state"))).reservations).toEqual([]);

  await expectRejected(await request.post("/api/actions/confirm", {
    headers: origin,
    data: { quoteId: quoted.result.id, approved: true, idempotencyKey: "business-endpoint-cannot-approve" },
  }));
  for (const action of ["confirm", "cancel", "publish"]) {
    await expectRejected(await invoke(request, business.id, action, { quoteId: quoted.result.id, approved: true }));
  }
  expect((await readJSON(await request.get("/api/actions/state"))).reservations).toEqual([]);
});

test("business endpoints reject cross-origin calls and malformed input without changing profiles", async ({ request }) => {
  const directory = await readJSON(await request.get("/api/businesses"));
  const business = directory.businesses[0];
  await expectRejected(await request.post(endpoint(business.id), {
    headers: { Origin: "https://unrelated.example" },
    data: { action: "profile", input: {} },
  }));
  await expectRejected(await request.post("/api/actions/save-skill", {
    headers: { Origin: "https://unrelated.example" },
    data: { businessId: business.id, version: business.version, summary: "Cross-origin update", knowledge: "Must not persist." },
  }));
  await expectRejected(await request.post(endpoint(business.id), {
    headers: { ...origin, "Content-Type": "application/json" },
    data: '{"action":',
  }));
  for (const data of [
    [],
    { action: "profile", input: [] },
    { action: "discover_stays", input: { guests: -1 } },
    { action: "get_stay_details", input: { listingId: 42 } },
    { action: "create_quote", input: { listingId: business.listingIds[0], checkIn: "not-a-date", checkOut: day(32), guests: 1 } },
  ]) {
    await expectRejected(await request.post(endpoint(business.id), { headers: origin, data }));
  }
  await expectRejected(await request.post("/api/actions/save-skill", {
    headers: origin,
    data: { businessId: business.id, version: "1", summary: "Invalid version", knowledge: "Must not persist." },
  }));
  await expectRejected(await request.post("/api/actions/save-skill", {
    headers: origin,
    data: { businessId: business.id, version: business.version, summary: 42, knowledge: "Must not persist." },
  }));
  const unchanged = await readJSON(await request.get(endpoint(business.id)));
  expect(unchanged).toMatchObject({ version: business.version, summary: business.summary, knowledge: business.knowledge });
});
