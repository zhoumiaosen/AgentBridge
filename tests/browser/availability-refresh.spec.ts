import { test, expect } from "@playwright/test";

test("booking and cancellation refresh the same-date results without dropping assistant filters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const date = (offset: number) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10); };
  const criteria = {
    checkIn: date(35), checkOut: date(37), guests: 2,
    maxNightlyCents: 13000, amenities: ["Wi-Fi", "Workspace"], type: "private",
  };
  const matching = await page.request.post("/api/actions/search", {
    headers: { Origin: new URL(page.url()).origin }, data: criteria,
  });
  expect(matching.ok()).toBe(true);
  const { listings } = await matching.json();
  expect(listings).toHaveLength(1);
  const room = listings[0];
  await page.route("/api/assistant", route => route.fulfill({ json: {
    reply: "This private room matches your dates, budget, Wi-Fi, and workspace requirements. Review the quote before approving.",
    mode: "demo", trace: [], searchCriteria: criteria, listings,
  } }));
  const refreshedSearches: unknown[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/actions/search")
      refreshedSearches.push(request.postDataJSON());
  });
  await page.getByLabel("Message your assistant").fill("Find a private room for two guests with Wi-Fi and a workspace.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(1);
  await expect(page.locator(".results-grid")).toContainText(room.name);
  await page.getByRole("button", { name: "View stay", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve & confirm stay", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".trip-card")).toContainText("Confirmed stay");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveValue(criteria.checkIn);
  await expect(page.getByLabel("Check-out", { exact: true })).toHaveValue(criteria.checkOut);
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(0);
  await expect(page.getByText("No matching stays yet.", { exact: true })).toBeVisible();
  expect(refreshedSearches.at(-1)).toEqual(criteria);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await page.getByRole("button", { name: "Cancel stay", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(1);
  await expect(page.locator(".results-grid")).toContainText(room.name);
  expect(refreshedSearches.at(-1)).toEqual(criteria);
  await expect(page.getByLabel("Guests", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Maximum nightly price", { exact: true })).toHaveValue("130");
});
