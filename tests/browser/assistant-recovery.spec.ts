import { test, expect } from "@playwright/test";

test.use({ ...(process.env.AGENTBRIDGE_TEST_URL ? { baseURL: process.env.AGENTBRIDGE_TEST_URL } : {}) });

test("personal assistant preserves a failed draft and retries without duplicate conversation entries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#discover");
  await expect(page.getByRole("heading", { name: "Your personal assistant", exact: true })).toBeVisible();
  const question = "Find a business agent that can answer bicycle repair questions.";
  const reply = "I found a cycle shop agent. Open its conversation to ask about your repair.";
  let attempts = 0;
  let releaseFailure!: () => void;
  const fail = new Promise<void>(resolve => { releaseFailure = resolve; });
  await page.route("**/api/assistant", async route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ message: question });
    if (attempts === 1) {
      await fail;
      await route.fulfill({ status: 503, json: { error: "Live AI is temporarily unavailable. Please try again." } });
    } else {
      await route.fulfill({ json: { reply, mode: "live", trace: [], agents: [] } });
    }
  });
  const composer = page.getByLabel("Message your assistant", { exact: true });
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await composer.fill(question);
  await send.click();
  await expect(page.locator(".chat-message.user").filter({ hasText: question })).toHaveCount(1);
  await expect(composer).toBeDisabled();
  await expect(send).toBeDisabled();
  releaseFailure();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(composer).toHaveValue(question);
  await expect(composer).toBeEnabled();
  await expect(page.locator(".chat-message.user").filter({ hasText: question })).toHaveCount(0);
  await expect(page.locator(".chat-message.assistant")).toHaveCount(0);
  expect(attempts).toBe(1);
  await send.click();
  await expect(page.locator(".chat-message.assistant")).toHaveText(reply);
  await expect(page.locator(".chat-message.user").filter({ hasText: question })).toHaveCount(1);
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("main").getByRole("alert")).not.toBeVisible();
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a successful HTTP response with no assistant answer preserves the draft", async ({ page }) => {
  await page.goto("/#discover");
  await expect(page.getByRole("heading", { name: "Your personal assistant", exact: true })).toBeVisible();
  await page.route("**/api/assistant", route => route.fulfill({ json: { mode: "live", reply: "" } }));
  const composer = page.getByLabel("Message your assistant", { exact: true });
  await composer.fill("Find a personal planning skill.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("incomplete reply");
  await expect(composer).toHaveValue("Find a personal planning skill.");
  await expect(page.locator(".chat-message")).toHaveCount(0);
});
