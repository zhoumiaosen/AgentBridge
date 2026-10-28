import { test, expect, type Page } from "@playwright/test";

async function openView(page: Page, name: string) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog", { name: "Workspace menu", exact: true }).getByRole("button", { name, exact: true }).click();
}

test("workspace navigation resets scroll, restores focus, and survives history and reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AgentBridge", exact: true })).toBeVisible();
  await openView(page, "Listings");
  await expect(page.getByRole("heading", { name: "Business listings", exact: true })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Business listings", exact: true })).toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AgentBridge", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByLabel("Message your assistant", { exact: true })).toBeVisible();
});

test("conversation home keeps Agent Hub, business tools, and bookings reachable through the menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AgentBridge", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await openView(page, "Agent Hub");
  await expect(page.getByRole("heading", { name: "Agent Hub", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Add agent or skill", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await openView(page, "Assistant");
  await expect(page.getByRole("heading", { name: "AgentBridge", exact: true })).toBeFocused();
  await expect(page.getByLabel("Message your assistant", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Room results", exact: true })).toHaveCount(0);
  await openView(page, "Listings");
  await page.getByRole("button", { name: "Add listing", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Listing name", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save room", exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Let other customers discover this business and its rooms", exact: true })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Add listing", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Business listings", exact: true })).toBeVisible();
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.click();
  const menu = page.getByRole("dialog", { name: "Workspace menu", exact: true });
  for (const name of ["Home", "Listings", "Assistant", "Bookings", "Agent Hub", "Network vision"])
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Close menu", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(more).toBeFocused();
  await openView(page, "Network vision");
  await expect(page.locator(".vision-page h1")).toBeFocused();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await openView(page, "Bookings");
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeFocused();
});

test("the first conversation stays general and reveals room tools only for room results", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const composer = page.getByLabel("Message your assistant", { exact: true });
  await expect(composer).toBeVisible();
  await expect(page.getByRole("region", { name: "Room results", exact: true })).toHaveCount(0);
  const state = await (await page.request.get("/api/actions/state")).json();
  const date = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const criteria = { checkIn: date(60), checkOut: date(62), guests: 2 };
  const generic = "Find a business agent for bicycle repairs.";
  const room = "Find a room for my next trip.";
  await page.route("**/api/assistant", route => {
    const message = route.request().postDataJSON().message;
    expect([generic, room]).toContain(message);
    return route.fulfill({ json: message === generic
      ? { reply: "I found a bicycle repair agent in Agent Hub.", mode: "live", trace: [], agents: [{ id: "cycle-test", name: "Cycle shop service desk", ownerName: "Neighborhood Cycles", summary: "Help with bicycle repairs.", kind: "agent" }] }
      : { reply: "This room matches your requested dates.", mode: "live", trace: [], agents: [], listings: [state.listings[0]], searchCriteria: criteria },
    });
  });
  await composer.fill(generic);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chat with Cycle shop service desk", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Room results", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveCount(0);
  await composer.fill(room);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("region", { name: "Room results", exact: true })).toBeVisible();
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(1);
  await page.getByText("Room search details", { exact: true }).click();
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveValue(criteria.checkIn);
  await expect(page.getByLabel("Check-out", { exact: true })).toHaveValue(criteria.checkOut);
  await expect(page.getByLabel("Guests", { exact: true })).toHaveValue("2");
  await openView(page, "Home");
  await expect(page.getByRole("heading", { name: "AgentBridge", exact: true })).toBeFocused();
  await expect(page.locator(".chat-message")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Room results", exact: true })).toHaveCount(0);
  await openView(page, "Assistant");
  await expect(page.locator(".chat-message.user")).toHaveText([generic, room]);
});
