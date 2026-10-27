import { test, expect } from "@playwright/test";
test("onboard host, discover, explicitly approve booking, reschedule, cancel, persist preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect your business with personal AI.", exact: true })).toBeVisible();
  await page.screenshot({ path: "work/home-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Assistant", exact: true }).first().click();
  await page.getByLabel("Required amenity").selectOption("Step-free access");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No matching stays yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Connect a host", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step-free access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish to AgentBridge", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(1);
  await expect(page.locator(".results-grid")).toContainText("The Garden Room");
  await page.getByRole("button", { name: "View stay", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$290");
  await expect(
    page.getByRole("button", { name: "Approve & confirm stay" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve & confirm stay" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".trip-card")).toContainText("Confirmed stay");
  await page.screenshot({ path: "work/trip-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Change dates", exact: true }).click();
  const newIn = new Date();
  newIn.setDate(newIn.getDate() + 20);
  const newOut = new Date();
  newOut.setDate(newOut.getDate() + 23);
  await page.getByLabel("New check-in").fill(newIn.toISOString().slice(0, 10));
  await page
    .getByLabel("New check-out")
    .fill(newOut.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Review new dates" }).click();
  await expect(page.getByRole("dialog")).toContainText("$425");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm date change" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".trip-card")).toContainText("$425");
  await page
    .getByRole("button", { name: "Listings", exact: true })
    .click();
  await expect(page.locator(".reservation-table")).toContainText(
    "The Garden Room",
  );
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await page.getByRole("button", { name: "Cancel stay", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".trip-card")).toContainText("Canceled");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Your personal space Preferences & memory",
    })
    .click();
  await page.getByLabel("Usual nightly budget").fill("155");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Your personal space Preferences & memory",
    })
    .click();
  await expect(page.getByLabel("Usual nightly budget")).toHaveValue("155");
});
test("assistant discovers actual listings and syncs requested dates", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant", exact: true }).first().click();
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const e = new Date();
  e.setDate(e.getDate() + 32);
  const start = d.toISOString().slice(0, 10),
    end = e.toISOString().slice(0, 10);
  await page
    .getByLabel("Message your assistant")
    .fill(`Find a room for ${start} to ${end} under $130 per night`);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".results-grid .stay-card")).toHaveText([
    /A little room in the Sunset/,
  ]);
  await expect(page.locator(".results-grid .stay-card")).toHaveCount(1);
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveValue(start);
  await page.screenshot({ path: "work/assistant-desktop.png", fullPage: true, animations: "disabled" });
});
test("phone navigation, room form, and booking approval stay usable without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect your business with personal AI.", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("button")).toHaveText(["Home", "Listings", "Assistant", "Bookings", "Agent Hub"]);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const navBounds = await navigation.boundingBox();
    expect(navBounds).not.toBeNull();
    expect(navBounds!.y).toBeGreaterThan(700);
    expect(navBounds!.y + navBounds!.height).toBeLessThanOrEqual(844);
    for (const button of await navigation.getByRole("button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Listings", exact: true }).click();
    await page.getByRole("button", { name: "Add listing", exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Listing name", { exact: true })).toBeVisible();
    await expect(form.getByLabel("Listing name", { exact: true })).toHaveCSS("font-size", "16px");
    expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const formBounds = await form.boundingBox();
    expect(formBounds!.x).toBe(0);
    expect(formBounds!.width).toBe(width);
    await form.getByRole("button", { name: "Close dialog", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add listing", exact: true })).toBeFocused();
  }
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Agent Hub", exact: true })).toBeVisible();
  await page.screenshot({ path: "work/home-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "work/discover-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "View stay", exact: true }).first().click();
  const quote = page.getByRole("dialog");
  await expect(quote).toContainText("$338");
  expect(await quote.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const quoteBounds = await quote.boundingBox();
  expect(quoteBounds!.y).toBe(0);
  expect(quoteBounds!.height).toBe(844);
  expect(quoteBounds!.width).toBe(390);
  await expect(quote.getByRole("button", { name: "Approve & confirm stay", exact: true })).toBeDisabled();
  await quote.getByRole("checkbox").check();
  await expect(quote.getByRole("button", { name: "Approve & confirm stay", exact: true })).toBeEnabled();
  await page.screenshot({ path: "work/approval-mobile.png", fullPage: false, animations: "disabled" });
  await quote.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(quote).not.toBeVisible();
});

test('HTTP transactions require same-origin explicit approval and reject stale cancellation',async({request})=>{
 const origin={Origin:'http://127.0.0.1:3000'};
 const initial=await (await request.get('/api/actions/state')).json();
 const listing=initial.listings[0];
 const date=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};
 const q=await (await request.post('/api/actions/quote',{headers:origin,data:{listingId:listing.id,checkIn:date(40),checkOut:date(42),guests:1}})).json();
 const missing=await request.post('/api/actions/confirm',{headers:origin,data:{quoteId:q.quote.id,idempotencyKey:'missing',approved:true}});
 expect(missing.status()).toBe(400);
 const cross=await request.post('/api/actions/confirm',{headers:{Origin:'https://other.example'},data:{quoteId:q.quote.id,approval:q.approval,idempotencyKey:'cross',approved:true}});
 expect(cross.status()).toBe(400);
 const booked=await (await request.post('/api/actions/confirm',{headers:origin,data:{quoteId:q.quote.id,approval:q.approval,idempotencyKey:'approved',approved:true}})).json();
 expect(booked.reservation.status).toBe('confirmed');
 const cancellation=await (await request.post('/api/actions/prepare-cancel',{headers:origin,data:{reservationId:booked.reservation.id}})).json();
 const change=await (await request.post('/api/actions/quote',{headers:origin,data:{listingId:listing.id,reservationId:booked.reservation.id,checkIn:date(43),checkOut:date(45),guests:1}})).json();
 const changed=await request.post('/api/actions/confirm',{headers:origin,data:{quoteId:change.quote.id,approval:change.approval,idempotencyKey:'change',approved:true}});
 expect(changed.ok()).toBe(true);
 const stale=await request.post('/api/actions/cancel',{headers:origin,data:{reservationId:booked.reservation.id,revision:cancellation.revision,approval:cancellation.approval,approved:true}});
 expect(stale.status()).toBe(400);
 expect((await stale.json()).error).toContain('Reservation changed');
 const state=await (await request.get('/api/actions/state')).json();
 expect(state.reservations[0].status).toBe('confirmed');
});

test('assistant-prepared quote opens approval with its exact dates; dialog traps keyboard focus',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Assistant',exact:true}).first().click();
 const data=await (await page.request.get('/api/actions/state')).json();
 const d=new Date();d.setDate(d.getDate()+35);const e=new Date();e.setDate(e.getDate()+37);
 const start=d.toISOString().slice(0,10),end=e.toISOString().slice(0,10);
 const q=await (await page.request.post('/api/actions/quote',{headers:{Origin:'http://127.0.0.1:3000'},data:{listingId:data.listings[0].id,checkIn:start,checkOut:end,guests:2}})).json();
 await page.route('**/api/assistant',route=>route.fulfill({json:{reply:'Please review this prepared quote.',mode:'live',trace:[],quote:q.quote,approval:q.approval}}));
 await page.getByLabel('Message your assistant').fill('Prepare a quote for my trip');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('$338');
 await expect(page.getByLabel('Check-in',{exact:true})).toHaveValue(start);
 await expect(page.getByRole('button',{name:'Approve & confirm stay'})).toBeDisabled();
 await page.getByRole('button',{name:'Close dialog'}).focus();await page.keyboard.press('Shift+Tab');
 expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test("cancellation from a stale booking card reviews the current reservation dates", async ({ page }) => {
  const origin = { Origin: new URL(test.info().project.use.baseURL!).origin };
  const post = async (action: string, data: Record<string, unknown>) => {
    const response = await page.request.post(`/api/actions/${action}`, { headers: origin, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const date = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const label = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const state = await (await page.request.get("/api/actions/state")).json();
  const room = state.listings.find((listing: { cancellation: string }) => listing.cancellation === "flexible");
  const originalDates = { checkIn: date(50), checkOut: date(52) };
  const originalQuote = await post("quote", { listingId: room.id, ...originalDates, guests: 1 });
  const booked = await post("confirm", { quoteId: originalQuote.quote.id, approval: originalQuote.approval, idempotencyKey: "stale-card-booking", approved: true });

  await page.goto("/#trips");
  const card = page.locator(".trip-card");
  await expect(card).toContainText(label(originalDates.checkIn));
  await expect(card).toContainText(label(originalDates.checkOut));

  // Another client changes the persisted dates while this page keeps its original card.
  const currentDates = { checkIn: date(55), checkOut: date(57) };
  const replacementQuote = await post("quote", { listingId: room.id, reservationId: booked.reservation.id, ...currentDates, guests: 1 });
  await post("confirm", { quoteId: replacementQuote.quote.id, approval: replacementQuote.approval, idempotencyKey: "stale-card-date-change", approved: true });
  await expect(card).toContainText(label(originalDates.checkIn));
  await expect(card).not.toContainText(label(currentDates.checkIn));

  await card.getByRole("button", { name: "Cancel stay", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(label(currentDates.checkIn));
  await expect(dialog).toContainText(label(currentDates.checkOut));
  await expect(dialog).not.toContainText(label(originalDates.checkIn));
  await expect(dialog).not.toContainText(label(originalDates.checkOut));
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card).toContainText("Canceled");
});
