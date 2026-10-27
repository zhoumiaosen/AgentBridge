# AgentBridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track completion with the checkboxes below.

**Goal:** Demonstrate a network where businesses publish discoverable capabilities that personal AI can use to complete transactions, with accommodation booking as the first implemented category.

**Architecture:** One web application contains a traveler assistant, host workspace, shared business directory, and accommodation transaction service. The assistant uses NVIDIA Nemotron through Nebius Token Factory to call typed server tools; the server owns prices, availability, authorization, and reservation state. Hosts publish structured listings without needing their own websites.

**Tech stack, proposed defaults:** TypeScript, Next.js, PostgreSQL, a lightweight database access library, schema validation, and a server-side Nebius inference client. Use Vitest for transaction and tool tests and Playwright for the central browser journey. Choose currently supported dependency versions and verify model availability during Day 1; there is no existing application in this workspace to preserve.

**Spec:** The approved scope in this conversation: connecting businesses with people through personal AI is the product vision; accommodation booking is the first working demonstration, with travel planning as a supporting feature. This document preserves that distinction between the broader product and the implemented demo.

## Product narrative

**Vision:** Personal AI becomes a way to interact with the economy. Businesses publish what they offer, their policies, and the actions an assistant may perform. A user's assistant discovers suitable businesses, makes inquiries, and completes approved transactions while remembering preferences.

**First demonstration:** Hotels and individual room hosts publish stays. A personal assistant discovers, compares, books, changes, and cancels those stays. It creates a small itinerary after booking.

**Expansion story:** Accommodation proves the interaction pattern. Future categories could add restaurant reservations, appointments, product purchases, and support. They would require category-specific actions and integrations; the MVP must not imply these already work.

**Positioning:** “Where businesses meet personal AI.”

The app opens to a simple Home screen with a short introduction, one primary “Add listing” action, and two saved-work shortcuts showing listing and booking counts. “Add listing” opens the room publication form. Floating desktop navigation and a phone bottom bar provide Home, Listings, Assistant, and Bookings. A separate More menu contains Network vision and Preferences. The broader business network is expressed in the Home introduction and secondary vision screen; marketing sections and demo calls to action stay out of the main flow.

The visual system uses Manrope typography, Phosphor icons, and generous spacing. Phone dialogs fill the screen, with readable form fields and touch-sized controls. The starter screen stays focused on publishing an offer and returning to saved work; inventory detail belongs in Listings and Bookings.

Product screens use normal workflow labels, without “demo” branding. A quiet “Sample workspace” indicator identifies fictional inventory and the absence of real payments. The assistant clearly shows offline status until a live model is connected. Accommodation is the implemented category; other categories and external personal-assistant connections remain planned. Hash-based navigation supports browser history and restores the selected view after refresh.

## Global constraints

- Deadline: October 30, 2026, 10:00 a.m. PDT. Aim to submit October 29; retain October 30 as contingency.
- One destination area: San Francisco. One currency: USD. Nightly stays only.
- Each listing is one independently bookable unit; one hotel can create several listings.
- Three clearly labeled fictional demo properties plus working onboarding for another demo host.
- No required pre-existing host website and no scraping required to onboard.
- Fixed nightly price plus optional fixed cleaning fee. For this demo, the host-entered nightly rate includes applicable taxes; show “Taxes included in the listed nightly rate” and separately show the cleaning fee. No additional fees may appear after approval.
- Pay at property. No payment processing, deposits, card collection, or claims of a charged payment.
- Public demonstration uses seeded demo identities and properties. Do not solicit real bookings or real residential addresses.
- Persist customer preferences, conversations, listings, quotes, and reservations.
- NVIDIA open-source model through Nebius must perform the central assistant reasoning, not a cosmetic task.
- Explicit approval is required for booking, cancellation, and date changes. Approval is enforced by the server and UI, not by the model deciding that consent occurred.
- Demonstrate our own assistant and publish a documented capability interface. Do not build multiple third-party assistant integrations.
- No external hotel inventory, flights, activity purchases, reviews, host messaging, or production host verification.
- Keep the deployed demo available through judging, subject to the published official requirements. Plan hosting and inference costs beyond the six-day build.

## Review focus

1. Concurrent booking attempts for the same nights: only one can succeed.
2. Stale quotes, changing prices, and repeated confirmations: revalidate before committing, and do not duplicate reservations.
3. Ambiguous dates, impossible ranges, and guest counts: clarify or reject rather than guessing a booking.
4. Untrusted host descriptions and invented amenities: treat host text as data, answer with published evidence, and expose unknowns.
5. Cross-user or cross-host access: a model-supplied ID never authorizes reading or modifying someone else's records.

Each condition has an owning task and concrete checks below.

## Application structure

Proposed paths for implementation; these are new files, not existing application files.

| Path                                    | Responsibility                                                  |
| --------------------------------------- | --------------------------------------------------------------- |
| `src/app/page.tsx`                      | Broad vision, accommodation entry points, honest roadmap        |
| `src/app/traveler/page.tsx`             | Assistant, results, approval cards, booking and itinerary views |
| `src/app/host/page.tsx`                 | Host listings, onboarding, availability, reservation dashboard  |
| `src/app/api/assistant/route.ts`        | Authenticated model interaction and bounded tool execution      |
| `src/app/api/actions/[action]/route.ts` | Validated capability requests and authorization                 |
| `src/features/businesses/schema.ts`     | Business, listing, policy, and capability validation            |
| `src/features/businesses/service.ts`    | Publish listings, directory queries, published information      |
| `src/features/bookings/schema.ts`       | Date, quote, reservation, and approval request types            |
| `src/features/bookings/service.ts`      | Availability, quotes, atomic booking/change/cancel              |
| `src/features/assistant/client.ts`      | Server-only Nebius model client and error handling              |
| `src/features/assistant/tools.ts`       | Tool schemas and server-bound action handlers                   |
| `src/features/assistant/preferences.ts` | Explicitly saved preferences and traveler memory                |
| `src/features/travel/itinerary.ts`      | Supporting itinerary generation                                 |
| `src/lib/session.ts`                    | Signed demo sessions and identity boundaries                    |
| `src/lib/db.ts`                         | Database connection                                             |
| `db/schema.sql`                         | Schema, constraints, indexes                                    |
| `db/seed.ts`                            | Three properties, demo users, reproducible availability         |
| `tests/bookings.test.ts`                | Price, availability, concurrency, idempotency, changes          |
| `tests/actions.test.ts`                 | Validation, permissions, approval enforcement                   |
| `tests/assistant.test.ts`               | Tool contracts, unknown information, failure behavior           |
| `tests/journey.spec.ts`                 | Browser tests of host-to-traveler workflow                      |
| `docs/capabilities.md`                  | Business discovery/action interface and accommodation example   |
| `README.md`, `LICENSE`                  | Public submission setup and open-source license                 |

Keep this as one application. Do not add microservices, a generic plugin framework, vector search, or a multi-agent orchestration layer for this MVP.

## Data and action contracts

Use integer cents for money and property-local `YYYY-MM-DD` dates for stays. Check-out is exclusive, so one guest may check out on another guest's check-in date.

Core records:

- **Business:** ID, owner ID, name, business category, published status, supported actions.
- **Listing:** ID, business ID, room type, description, photos, approximate location, named nearby transit, timezone, maximum guests, amenities, nightly rate, cleaning fee, check-in/out details, structured cancellation policy, FAQ, published status.
- **Available night:** listing ID and date, with an explicit open/blocked state. Unspecified nights are unavailable.
- **Quote:** ID, user ID, listing ID, dates, guests, price breakdown, policy snapshot, listing revision, expiration, and status.
- **Reservation:** ID, confirmation number, user ID, listing ID, dates, guests, price and policy snapshot, confirmed/canceled status, idempotency key.
- **Traveler preferences:** user ID, budget, amenities, room preference, and location preferences explicitly saved by that user.
- **Conversation/action history:** user ID, conversation ID, messages, action name, outcome, and reservation reference; exclude secrets.

Capability service signatures use validated input objects and return a typed success/error union:

| Action              | Inputs                                                | Result                                                                            |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `discoverStays`     | dates, guests, optional total budget and amenities    | Available matching listings with price summaries and matching facts               |
| `getStayDetails`    | listing ID                                            | Published room facts, policies, FAQ; unknown fields remain unknown                |
| `createQuote`       | listing ID, check-in, check-out, guests               | Authoritative total, line items, policy snapshot, quote ID; expires in 10 minutes |
| `confirmBooking`    | quote ID, approval token, idempotency key             | Confirmed reservation, or explicit expired/unavailable/reconfirmation error       |
| `getMyReservations` | session identity, optional reservation ID             | Only that traveler's reservations                                                 |
| `quoteDateChange`   | reservation ID, proposed dates                        | Replacement quote tied to current reservation; original booking stays active      |
| `confirmDateChange` | replacement quote ID, approval token, idempotency key | Atomic change or original booking preserved                                       |
| `cancelBooking`     | reservation ID, approval token, idempotency key       | Canceled reservation or policy restriction                                        |

Session identity comes from the server session, never a model-supplied user ID. Scope approval tokens to user, action, quote or reservation, and expiry. Create them only through the explicit approval UI; never expose them to the model. UI confirmation calls the transaction service directly. Record the resulting action in conversation history.

The assistant may propose a booking but cannot call an unrestricted commit tool. Host text cannot change tool permissions or system instructions. Search hard constraints deterministically; use the model to interpret requests and explain comparisons. Do not assert exact walking distances without verified geographic data.

## Day 1 — October 24: Foundation and host publishing

**Deliverable:** A host can publish a stay without a website, and that stay appears in the directory.

### Task 1: Establish the application, identities, and listing model

**Files:** application shell, business schemas/service, session helper, database schema/seed, action tests.

- [ ] Verify access to Nebius and an available NVIDIA Nemotron model; record the selected model identifier in server configuration and README.
- [ ] Set up one application, PostgreSQL, environment template, and documented local run commands. Keep credentials server-side.
- [ ] Add signed demo sessions: one traveler and a separate host role. Each public demo session gets an isolated dataset or tenant so visitors cannot corrupt each other's demonstration.
- [ ] Write validation tests: required fields, positive integer prices/capacity, invalid date availability, and host ownership rejection.
- [ ] Implement business/listing records, availability, publication, and seeded properties with deliberately different prices, amenities, and policies.
- [ ] Build the host form and dashboard; save unpublished drafts and publish only valid listings.
- [ ] Verify a new listing becomes searchable and another host cannot edit it; commit the working deliverable.

**Exit check:** Publish a fourth demo room in under two minutes. No website URL is required. Verify the actual Nebius model call succeeds on the deployed or local server.

## Day 2 — October 25: Reliable transaction engine

**Deliverable:** Rooms can be quoted, booked, changed, and canceled through server actions before adding conversational orchestration.

### Task 2: Availability and transparent quotes

**Files:** booking schema/service, booking tests, capability action route.

- [ ] Write failing tests for same-day/negative stays, past dates, guest over-capacity, blocked or unspecified nights, and adjacent bookings.
- [ ] Implement availability using check-in-inclusive/check-out-exclusive intervals.
- [ ] Write quote tests: a two-night stay at $120 plus $25 cleaning totals $265; display an all-inclusive nightly rate and no hidden fees.
- [ ] Implement persisted 10-minute quotes with user ownership, revision, price, and policy snapshots.
- [ ] Run the tests and commit when they pass.

### Task 3: Atomic booking lifecycle and approval

**Files:** booking service, session/approval helper, booking and action tests.

- [ ] Write tests proving that two concurrent overlapping confirmations produce one success, while adjacent stays both succeed.
- [ ] Write tests for expired quotes, changed terms, missing or wrong-user approval, foreign reservation IDs, and replayed requests.
- [ ] Implement transactions with a database-enforced overlap restriction for confirmed reservations. Recheck availability and quote terms inside the transaction.
- [ ] Bind idempotency keys to user/action and return the existing result on a repeated identical request; reject mismatched reuse.
- [ ] Implement cancellation with a structured policy. Demo listings offer either free cancellation before check-in or a clearly disclosed restricted policy; there is no payment or refund execution.
- [ ] Implement atomic date changes. If new dates fail, the original dates and reservation remain intact.
- [ ] Verify cancellation releases inventory, forbidden cancellation is refused, and failed changes preserve the original booking; commit.

**Exit check:** Automated tests prove pricing, overlap protection, idempotency, ownership, and the full reservation lifecycle.

## Day 3 — October 26: Personal assistant completes a booking

**Deliverable:** A conversational request becomes a confirmed reservation through visible user approval.

### Task 4: Grounded discovery and inquiries

**Files:** assistant client/tools, assistant route, traveler page, assistant tests.

- [ ] Define validated tool schemas over the established capability services; bind handlers to the authenticated session.
- [ ] Implement server-side Nemotron requests, a maximum of eight tool steps per user message, timeouts, and user-visible retry states.
- [ ] Test ambiguous dates: the assistant asks for dates instead of creating a quote with invented values.
- [ ] Implement discovery and up to three result cards showing total stay price, constraints met, and policies.
- [ ] Answer property questions from structured facts and FAQ. An unknown late-check-in policy produces “Not provided by this host,” not an invented answer.
- [ ] Test a malicious host description asking the model to ignore the user's budget or reveal secrets; it must not gain authorization or execute a transaction.
- [ ] Commit after deterministic tool tests and a real model smoke check pass.

### Task 5: Approval and confirmation interface

**Files:** traveler page, approval endpoint, action tests, journey test.

- [ ] Show a final approval card with property, dates, guests, nightly breakdown, cleaning fee, total, cancellation terms, and “Pay at property.”
- [ ] Wire the explicit confirmation button to the server-side approval/booking flow; the model cannot bypass it.
- [ ] Handle expired quotes and lost availability by offering a refreshed quote or alternatives without claiming success.
- [ ] Show a confirmation number only after database commit; update the host dashboard from persisted state.
- [ ] Run the browser journey from request to approved booking and verify the same reservation appears on both sides; commit.

**Exit check:** The complete discovery–inquiry–approval–booking journey runs through a real Nebius model call.

## Day 4 — October 27: Memory, changes, and supporting travel plan

**Deliverable:** The assistant behaves like a continuing personal assistant and the broader network story is visible.

### Task 6: Preferences and reservation management

**Files:** preferences module, traveler UI, assistant tools/tests, journey test.

- [ ] Add “Remember this preference” with visible saved values and edit/delete controls. Do not silently store sensitive information.
- [ ] Use preferences as defaults; explicit instructions for this trip override saved values.
- [ ] Add “My bookings,” cancellation approval, and date-change quoting/approval using Day 2 services.
- [ ] Test budget override, preference persistence across a new conversation, and ownership checks on history.
- [ ] Commit once booking, change, and cancellation work in the browser.

### Task 7: Small itinerary and network positioning

**Files:** itinerary module, traveler page, landing page, capability documentation.

- [ ] Create a one- or two-day suggested itinerary from the booked property's approximate location and traveler interests. Link places; label suggestions and avoid unsupported opening-hours or travel-time claims.
- [ ] Prefer a small curated set of verified places for reliability. Live research is a stretch goal after the booking journey passes.
- [ ] Add the broad vision to the landing page, then clearly label accommodation as the live demonstration.
- [ ] Document business discovery, capability descriptions, authorization, inputs, outputs, and errors. List future categories as examples only.
- [ ] Rehearse the network effect: no suitable room → onboard a host with the missing amenity → rerun search → quote and book.
- [ ] Commit the completed product story.

**Exit check:** A new business expands search results immediately, preferences survive a return visit, and an itinerary accompanies the actual booked stay.

## Day 5 — October 28: Verification, deployment, and product polish

**Deliverable:** A public demo that another person can use successfully.

### Task 8: Verify and harden the critical journey

**Files:** journey tests, deployment configuration, error states, README.

- [ ] Run type checking, production build, transaction/action tests, and browser journeys against the deployment candidate.
- [ ] Cover three principal scenarios: normal booking; no match followed by host onboarding; unavailable room or expired quote followed by recovery.
- [ ] Verify cancellation and rescheduling, session isolation, and host/traveler permissions on deployed storage.
- [ ] Check phone and desktop layouts, keyboard access, readable prices, loading states, and actionable error messages.
- [ ] Verify the Nebius API key never reaches the browser and logs omit secrets and unnecessary personal content.
- [ ] Add per-session inference limits and bounded tool use. If the model is unavailable, show a clear error; never substitute a fabricated success.
- [ ] Confirm dataset reset is session-scoped and unavailable for arbitrary cross-user IDs.
- [ ] Ask someone unfamiliar with the app to complete a booking; fix observed blockers and commit.

**Exit check:** A fresh visitor can publish a demo room and complete an approved reservation. All required checks pass on the release candidate.

## Day 6 — October 29: Demonstration and submission

**Deliverable:** Submitted project with a working demo, public code, and a concise statement of the larger opportunity.

### Task 9: Package and submit

**Files:** README, LICENSE, capability documentation, submission copy, demo script.

- [ ] Freeze features. Fix only submission blockers or failures in the central journey.
- [ ] Complete setup instructions, environment variables, seed/reset instructions, architecture explanation, and exact NVIDIA/Nebius usage.
- [ ] Add an open-source license, inspect the repository for credentials, and verify setup from a clean checkout.
- [ ] Prepare screenshots of the assistant, host onboarding, approval card, and host reservation dashboard.
- [ ] Record and upload a public YouTube video under three minutes. Show actual working software and label all demo properties.
- [ ] Submit the hosted demo URL, public repository, category, description, video, testing instructions, and constructive platform feedback.
- [ ] Verify every link from a signed-out browser and confirm Devpost records the submission before October 30 at 10 a.m. PDT.
- [ ] Keep the demo funded and accessible through judging; record the owner responsible for hosting and model credits.

### Suggested video timing: 2 minutes 50 seconds

| Time      | Story                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Big picture: personal AI can research businesses, but completing actions across them requires business capabilities. Introduce the network vision.  |
| 0:20–0:35 | Explain the first category: hotels and individual hosts can become discoverable without building a website.                                         |
| 0:35–1:00 | Traveler asks for a stay with concrete constraints. The initial search has no suitable match.                                                       |
| 1:00–1:25 | Host publishes a room with the missing amenity. The assistant discovers it on the next search.                                                      |
| 1:25–2:05 | Assistant answers a policy question, displays the total, gets approval, and books. Show the matching host reservation.                              |
| 2:05–2:25 | Show saved preferences and a short itinerary tied to the stay.                                                                                      |
| 2:25–2:40 | Briefly show the capability interface and explain that Nemotron on Nebius powers interpretation and action selection.                               |
| 2:40–2:50 | Close with the expansion thesis: each new business adds useful actions to personal AI. Accommodation works today; other categories are the roadmap. |

## Cut order if the schedule slips

1. Remove live itinerary research; retain a small curated itinerary.
2. Reduce itinerary customization to one day of suggestions.
3. Defer date-change UI, retaining booking, viewing, cancellation, and the tested transaction foundation. Explicitly update demo claims if cut.
4. Reduce optional visual polish and preference fields.

Never cut real Nebius integration, working host publication, authoritative prices, approval, double-booking protection, public demo access, or submission materials. Do not add real payments, external inventory integrations, generic business categories, or multi-agent orchestration during these six days.

## Final acceptance checklist

- [ ] A viewer understands the broad business network vision and the current accommodation-only scope.
- [ ] A host publishes a listing without an existing website.
- [ ] A new listing is immediately discoverable through a shared capability interface.
- [ ] A real NVIDIA model on Nebius interprets requests and invokes useful read/quote tools.
- [ ] Prices, policies, and availability are grounded in persisted host information.
- [ ] Only explicit approval can commit a transaction.
- [ ] Concurrent or repeated requests do not create conflicting or duplicate reservations.
- [ ] The traveler and host see the same persisted booking.
- [ ] Cancellation and date-change claims match what is implemented.
- [ ] Preferences persist, and the travel plan supports the booked stay.
- [ ] Public demo identities and properties are clearly labeled and isolated.
- [ ] Public demo, repository, license, README, video, and submission links are verified.

## Self-review

The plan covers the approved traveler flow, host flow, persistent memory, transaction lifecycle, itinerary, Nebius requirement, business capability interface, public demo, and submission. The five principal failure modes map to Days 1–3 and Day 5 checks. Proposed technology and demo pricing/identity policies are implementation defaults, not previously agreed business commitments. The broad vision is communicated in product copy, interface documentation, and the video without claiming unimplemented categories work.

## Execution ledger — October 25

- Project name confirmed: AgentBridge.
- Work begins October 25. Original day labels are milestones; target submission stays October 29.
- Ruling: use Node SQLite for the runnable local MVP because no PostgreSQL service is configured. Database transactions and unique occupied-night records enforce booking integrity. A persistent single-instance Node host is required; migrate to PostgreSQL for multiple instances.
- Ruling: wire live Nebius via server environment variables; clearly label deterministic demo assistance until credentials are available. Never claim a live model call without verification.
- Ruling: build in the empty user-selected AgentBridge folder; no existing branch or worktree needs protection.

## Implemented local MVP — October 25

The working project is **AgentBridge**, at `/Users/miaosenzhou/Desktop/Apps/AgentBridge`.

- Overview and vision pages communicate the broader business discovery/action network, with future categories explicitly labeled.
- Host onboarding publishes hotels and individual rooms without websites. Three fictional seed properties initialize once per isolated workspace.
- Traveler discovery supports dates, budget, guests, room type, and amenities.
- The assistant supports persistent conversations/preferences, deterministic labeled demo mode, and configured live Nemotron tool calling. Follow-up constraints persist and returned live quotes open the approval interface.
- SQLite stores listings, quotes, preferences, messages, and reservations. Unique occupied-night records, transactions, immutable terms, expiry, tenant checks, and idempotency protect transactions.
- Explicit approval is required for booking, changes, and cancellation; cancellation approvals bind the reviewed reservation revision.
- Demo bookings and Business workspace share persisted reservations within the accommodation demo; curated San Francisco travel suggestions support the stay.
- README, MIT license, environment template, and capability documentation are present.

### As-built file mapping

The implementation keeps one Next.js application. The shared business/booking schema and service live in `src/lib/store.ts`; assistant tools and model client in `src/lib/assistant.ts`; sessions/runtime in `src/lib/runtime.ts` and `src/lib/security.ts`. UI flows live in `src/app/ui.tsx` and `src/app/globals.css`. The capability handlers use `src/app/api/actions/[action]/route.ts`, with the model loop exposed through `src/app/api/assistant/route.ts`. The proposed separate feature files were consolidated to avoid unnecessary layers for the first MVP.

### Review and verification record

- Independent review identified dropped live quotes, follow-up constraint loss, unused room-type preferences, and stale cancellation approvals. Each has been corrected with regression coverage.
- Integration checks found the framework's internal request URL differed from the browser's Host header; same-origin validation now checks the actual Host and has a regression test.
- UI initialization now avoids duplicate Strict Mode session bootstrap requests, and preference controls wait for workspace loading so a fast return visit cannot show unsaved defaults.
- Node tests cover actual simultaneous confirmations through separate connections, persisted state after reopening the database, quote expiry/changes, atomic rescheduling, cancellation revisions, tenant isolation, model limits, and approval signatures.
- Browser checks exercise host publication, discovery, approval, booking, rescheduling, cancellation, saved preferences, chat/date synchronization, mobile layout, stale cancellation rejection, and assistant-prepared quote review.

### Remaining external milestones

- Add a Nebius API key and validate a real model/tool-calling session. Configured integration and mocked contract tests are not evidence of a successful live call.
- Choose a persistent Node host and deploy. No public deployment, shared production business directory, verified host identity, payment processing, or external hotel inventory is claimed.
- Record the real end-to-end demo, publish the code repository, and submit to Devpost. These have not been done.
- Set a persistent session secret before deployment; current unconfigured development sessions use a process-lifetime key.
- Travel planning is currently a curated set of San Francisco suggestions tied to the stay view, not live itinerary research or transport booking.

### Verified checkpoint

- `npm test`: 30 passing tests, zero failures.
- `npm run typecheck`: passed.
- `npm run build`: passed without warnings.
- Browser suite: five passing journeys, including approval/stale-cancellation regressions and mobile layout. The live-quote UI test substitutes the model response while using a real server-generated quote; it does not validate live inference.
- Preview: `http://127.0.0.1:3000`.
- Local branch: `feat/agentbridge-mvp`. No remote push, public deployment, or submission performed.
