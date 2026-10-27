import { test, expect, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}),
});

async function openAgent(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Manage listings", exact: true }).click();
  const business = page.locator(".business-skill").first();
  await business.locator("summary").click();
  const edit = business.getByRole("button", { name: "Edit agent", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
  return { business, edit, dialog };
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.width).toBe(390);
}

test("phone business agent editing saves answers, reloads saved content, and restores focus", async ({ page }) => {
  const { business, edit, dialog } = await openAgent(page);
  await expect(dialog.getByLabel("Business name", { exact: true })).toHaveAttribute("readonly", "");
  const introduction = dialog.getByLabel("Short introduction", { exact: true });
  const knowledge = dialog.getByLabel("Business knowledge", { exact: true });
  await expect(introduction).toHaveAttribute("maxlength", "240");
  await expect(knowledge).toHaveAttribute("maxlength", "4000");
  await expect(knowledge).toHaveCSS("font-size", "16px");
  await expectNoOverflow(page);
  await introduction.fill("A quiet place to stay with helpful local hosts.");
  await knowledge.fill("Guests may leave luggage at reception from 09:00. Ask reception for neighborhood suggestions.");
  await dialog.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
  await expect(business).toContainText("A quiet place to stay with helpful local hosts.");
  await expect(business).toContainText("Version 2");
  await edit.click();
  await expect(introduction).toHaveValue("A quiet place to stay with helpful local hosts.");
  await expect(knowledge).toHaveValue("Guests may leave luggage at reception from 09:00. Ask reception for neighborhood suggestions.");
  await introduction.fill("Unsaved introduction");
  await knowledge.fill("Unsaved answer");
  await dialog.getByRole("button", { name: "Reload saved version", exact: true }).click();
  await expect(introduction).toHaveValue("A quiet place to stay with helpful local hosts.");
  await expect(knowledge).toHaveValue("Guests may leave luggage at reception from 09:00. Ask reception for neighborhood suggestions.");
  await expectNoOverflow(page);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(edit).toBeFocused();
  await page.reload();
  const restoredBusiness = page.locator(".business-skill").first();
  await restoredBusiness.locator("summary").click();
  await restoredBusiness.getByRole("button", { name: "Edit agent", exact: true }).click();
  await expect(page.getByLabel("Short introduction", { exact: true })).toHaveValue("A quiet place to stay with helpful local hosts.");
});

test("phone stale editor preserves its draft and recovers by reloading the latest version", async ({ page }) => {
  const { edit, dialog } = await openAgent(page);
  const introduction = dialog.getByLabel("Short introduction", { exact: true });
  const knowledge = dialog.getByLabel("Business knowledge", { exact: true });
  await introduction.fill("My unsaved introduction");
  await knowledge.fill("My unsaved guest guidance");
  const stateResponse = await page.request.get("/api/actions/state");
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json();
  const business = state.businesses[0];
  const concurrent = await page.request.post("/api/actions/save-skill", {
    headers: { Origin: new URL(page.url()).origin },
    data: { businessId: business.id, version: business.version, summary: "Saved in another window", knowledge: "Reception can help guests from 08:00." },
  });
  expect(concurrent.ok()).toBe(true);
  await dialog.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("version conflict");
  await expect(introduction).toHaveValue("My unsaved introduction");
  await expect(knowledge).toHaveValue("My unsaved guest guidance");
  await expect(dialog).toContainText("Reloading the saved version replaces your unsaved edits.");
  await expectNoOverflow(page);
  await dialog.getByRole("button", { name: "Reload saved version", exact: true }).click();
  await expect(introduction).toHaveValue("Saved in another window");
  await expect(knowledge).toHaveValue("Reception can help guests from 08:00.");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.locator(".skill-save-meta")).toContainText(`Version ${business.version + 1}`);
  await knowledge.fill("Reception can help guests from 08:00. Luggage storage is available.");
  await dialog.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
  const finalState = await (await page.request.get("/api/actions/state")).json();
  const saved = finalState.businesses.find((candidate: { id: string }) => candidate.id === business.id);
  expect(saved.version).toBe(business.version + 2);
  expect(saved.summary).toBe("Saved in another window");
  expect(saved.knowledge).toBe("Reception can help guests from 08:00. Luggage storage is available.");
});
