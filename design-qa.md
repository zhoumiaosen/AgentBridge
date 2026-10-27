# AgentBridge redesign QA

Source visual truth: `/Users/miaosenzhou/.codex/generated_images/01a1756f-2b5b-7942-a21a-5689eefa0c32/exec-f59e5da0-735e-4bd8-bad6-b87b2c64a2ff.png` (selected option 1).

Implementation: `work/home-desktop.png`, captured by the browser suite at a 1440 × 1000 CSS viewport, full page 1440 × 2404 pixels, density 1. Additional in-app browser evidence: `/Users/miaosenzhou/.codex/visualizations/2026/10/25/01a1756f-2b5b-7942-a21a-5689eefa0c32/agentbridge-audit/06-redesign-hero.png` and `07-redesign-faq-cta.png` in the same folder. State: overview, first FAQ expanded, no dialog.

## Comparison

Source and full-page implementation were opened together in one comparison input. Compare normalized content widths: generated concept is a full-page composition, rather than a literal browser viewport. Full-view review covers hero, three-step explanation, listing grid, FAQ, closing traveler and host actions. Focused browser captures additionally verify narrow-screen hero and closing actions.

- Typography: sans-serif hierarchy, black display headings, readable neutral supporting text; no decorative italics.
- Layout: horizontal navigation, split text/photo hero, unboxed three-column stays, ruled FAQ, split traveler/host close. Narrow screens stack these regions without horizontal overflow.
- Colors: warm white #faf9f6, black #191919, neutral dividers and secondary text. No green landing-page decoration or gradients.
- Assets: generated local hero photograph matches the sunlit bedroom direction. Existing illustrative listing photographs intentionally retained instead of changing listing imagery throughout the booking experience. This is an accepted content difference, not a missing asset.
- Content: actual listing neighborhoods and prices retained instead of copying inaccurate generated mock details. Demo and explicit-approval disclosures remain. Existing workspace, preferences and host entry controls remain accessible in the header; invented legal/footer links were not added.
- Interaction: native keyboard-accessible FAQ disclosures; both traveler CTAs lead to discovery; view changes reset scroll and focus. No booking backend changes.

## Findings and history

Initial full-view comparison: no actionable P0/P1/P2 findings. Accept intentional differences above. P3: listing photographs have a darker tone than the generated concept; they remain illustrative source assets.

## Verification

30 unit tests, 7 browser tests, typecheck, production build, and whitespace checks passed. Browser coverage includes host onboarding, discovery, quote approval, booking, date changes, cancellation, preferences, date synchronization, mobile overflow, dialog focus, FAQ and final CTA. Live model execution and external payment/inventory connections were not tested; these remain outside the demo scope.

final result: passed

## Business-first positioning update — October 25

The user clarified that AgentBridge connects businesses with customers through personal AI; accommodation is only the first demonstration. This update supersedes the earlier travel-led content hierarchy while retaining the neutral palette, typography, horizontal navigation, FAQ, and responsive layout.

- The headline now reads “Where businesses meet personal AI.” A connection diagram replaces the hero room photo, and the primary action opens the network vision.
- The homepage explains business publication, customer matching, and approved actions. Future categories are explicitly marked planned.
- The room photo now belongs to a compact, labeled demonstration of a newly published offer meeting an unmet customer need. Both business and customer paths remain accessible.
- Business workspace, Room demo, and Demo bookings clearly distinguish the implemented accommodation experience. External assistants and general business onboarding are not claimed as working.
- Desktop and mobile screenshots were visually inspected. All 30 unit tests, seven browser journeys, typecheck, release build, and whitespace checks passed. After the final button wrapping adjustment, the mobile check passed at both 320px and 390px, and the release build passed again.

Current hero evidence: `outputs/agentbridge-business-first.png`. Full-page desktop and mobile evidence: `work/home-desktop.png` and `work/home-mobile.png`.

## Workspace app update — October 25

The user requested a working app presentation and removal of demo branding. The operational Overview now replaces the marketing homepage. A persistent sidebar connects business listings, the customer assistant, bookings, preferences, and network vision. Overview metrics and rows use saved inventory and reservations, and every workflow action opens an implemented screen or dialog. URL fragments preserve the selected screen through browser history and refresh.

The design uses compact headings, a neutral workspace background, readable data tables, and consistent controls. Landing-page hero, FAQ, and demo calls to action are removed. Product labels and new assistant replies use ordinary workflow names. A quiet Sample workspace indicator and accurate offline status preserve the current integration limits. Existing user-entered data and conversation history were not rewritten.

Verification: 30 unit tests and seven browser journeys pass; typecheck, final production build, and whitespace checks pass. Browser coverage includes publishing, discovery, approval, booking, rescheduling, cancellation, saved preferences, history/reload, and 320px/390px mobile overflow. Desktop, mobile, and assistant screenshots were visually inspected. Current desktop evidence: `outputs/agentbridge-workspace.png`.

## Minimal app and phone redesign — October 25

This update supersedes the sidebar dashboard above. The user requested the landing-page-design visual system, a simpler start screen, and phone support while retaining the app workflows.

Home now has one primary action, Add listing, and two shortcuts showing saved listings and confirmed bookings. The floating desktop navigation becomes a four-item bottom navigation on phones. More contains preferences and the network vision. Manrope, Phosphor icons, a warm neutral palette, and consistent controls replace the mixed typography and legacy marketing styles. The app contains no visible demo branding; a quiet sample-workspace disclosure remains accurate.

Phone forms fill the viewport, keep inputs at 16px, and provide large tap targets. Dialogs trap keyboard focus and return it to their opener, including the More → Preferences transition. Loading uses a shaped skeleton, and reduced-motion preferences are respected. Privacy and scope notices, a branded missing-page screen, favicon, and local social image are present. The development badge is hidden to avoid covering phone navigation.

Verification: all 30 unit tests and seven browser journeys passed. After the final screenshot and development-badge adjustments, the complete booking journey and phone journey passed again, including exact 390 × 844 approval dialog bounds and 320px/390px overflow checks. Typecheck, final production build, and whitespace checks passed. Desktop Home, phone Home, and phone booking approval were visually inspected. Generated metadata includes noindex/nofollow. Live AI, external assistants, real inventory, and payments remain unconnected or untested.

Current evidence: `outputs/agentbridge-minimal-desktop.png`, `outputs/agentbridge-minimal-mobile.png`, and `outputs/agentbridge-mobile-approval.png`. The existing workspace is open in the in-app browser.


## Business skills and live phone flow — October 26

Added one server-side business skill per normalized business name in each workspace. Profiles expose owned listing IDs and discovery/details/quote capabilities. Property details and quotes pass through the owning skill, with cross-business and cross-tenant checks. The UI displays business agents, their offers, and the quote owner. Skill manifests are derived from saved business records; separately versioned hosting remains future work.

Live Nebius phone verification at 390 × 844: published Bridge House Courtyard Room at $149/night plus $30 cleaning; requested step-free access for two guests on November 18–20; observed search_stays, business_profile, stay_details, and create_quote. The quote identified Bridge House and totaled $328. Confirm was disabled before approval and enabled afterward. Explicit sample approval produced AB-7BA5046B in both customer and business views. No external inventory reservation or payment was made. Nebius inference used API credits. No horizontal overflow observed. Screenshots are under outputs/live-phone/.

Verification: 42 unit tests and typecheck passed, final production build passed, and seven selected browser regressions passed (six initially; the long onboarding test hit its overall timeout during concurrent work and passed on an isolated rerun in 8.5 seconds). The offline-only wording assertion was not run against the live-configured server; offline parsing remains covered by unit tests. The new stale-booking cancellation regression passed after fixing the dialog to use the fresh server reservation. Final assistant tests passed after the plain-language prompt adjustment.

Secret check: .env.local remains ignored and untracked; the current API key was absent from all publishable working files. No commit, push, deployment, or external booking integration was performed.


## Persistent skill database and app polish — October 26

This supersedes the derived-only business skills described above. Current definitions and immutable revisions are stored in SQLite `business_skills` and `business_skill_history`. Existing identities are backfilled without changing listing ownership. Saved guidance survives database reopen; adding an offer creates a new revision. Machine-readable directory/manifests and validated per-business invocation share the same dispatcher as the built-in assistant.

The phone-friendly Edit agent dialog supports introduction, business knowledge, saved version/time, exportable manifest, and optimistic conflict recovery. Conflicts preserve drafts. Textareas have stable accessible names; focus returns to Edit agent. Seed-only display aliases remove old demo host labels while preserving business IDs and guidance. Assistant inline formatting is rendered through safe React nodes. Active search criteria now survive booking, cancellation and other refreshes, including multiple amenities.

Live QA at 390 × 844 saved Bridge House version 2 with luggage storage from 10:00, courtyard hours 08:00–21:00, and no breakfast. A live quote for November 24–26, two guests, was $328. Confirmation was disabled until checked approval; sample confirmation AB-761E8C1F appeared in both customer and business views. No real reservation or payment occurred. Nebius calls used inference credits.

Live QA exposed unsupported service wording copied from old assistant history. Prompt wording alone did not correct it. Current code deterministically retrieves a uniquely named business's latest profile and renders factual replies from current saved evidence; the final live inquiry returned exact version-2 guidance without the invented meal arrangements. Quotes similarly use authoritative stored terms. Search-only/general travel and unnamed follow-ups without current evidence remain generative; this is not a claim that business-authored claims or every model response are independently verified.

Final checks: 64 unit tests, typecheck and production build pass. All 15 browser journeys pass, including direct HTTP boundaries, full accommodation lifecycle, phone layouts/editor, stale-edit recovery, saved preferences and active-filter preservation. The subsequent named-business lookup change is covered by five additional unit regressions and the final real Nebius phone inquiry. Whitespace checks pass. Independent audit found no API key/session secret in publishable files, Git history or browser bundles; .env.local is ignored and untracked.

Evidence: outputs/skill-db/01-phone-editor.png, 02-phone-quote.png, 03-confirmed.png, 04-business-reservation.png, and 05-live-published-guidance.png. Database inspection independently confirmed saved Bridge House version 2 and both skill tables. No commit, push or public deployment was performed.

## Business and personal skill library — October 26

Added a Skills navigation item with six reusable examples spanning room concierge, café services, cycle repairs, personal trip planning, accessibility inquiries, and work travel. Businesses and customers can publish standalone agent profiles or skills without creating a room, import Markdown or JSON for review, edit saved entries with version checks, and download portable JSON. Connected business agents retain their existing identity and editor. SQLite stores each workspace's entries and immutable revisions; custom entries stay first after reload. Imported instructions and external links remain reference data and do not execute code or contact remote agents.

Manual phone QA at 390 × 844 published Bridge House arrival guide and imported My relaxed weekend planner from Markdown. The import retained its complete source and required an explicit Publish entry action. Both appeared immediately and remained at the top after reload. A live Nebius request found the personal skill by name and returned its current saved version and instructions. No reservation, payment, or external-agent execution occurred. Nebius inference used API credits.

Final verification: 82 unit tests, typecheck, production build, and whitespace checks passed. Of 22 browser checks, 21 passed initially; the sole failure was an old assertion expecting four navigation items. After updating it to the five current labels, the phone check passed at 320px and 390px, including tap targets and approval layout. Seven new browser cases cover API boundaries, persistence, imports, version conflicts, tenant isolation, phone publication, and connected-agent refresh. Desktop and phone screenshots were visually inspected. The API key file remains ignored and untracked; no commit, push, or deployment was performed.

Evidence: outputs/skill-library/skills-phone.png and outputs/skill-library/skills-desktop.png. The Skills library remains open in the in-app browser. Storage is private to the current workspace, not a public cross-account marketplace.

## Agent Hub database discovery and selected conversations — October 26

The user confirmed searchable profile cards with source instructions confined to the editor. Agent Hub now requests server-side search with metadata-only responses as the query or owner filter changes. Publishing triggers a fresh database query. Cards and details expose descriptions and owners, while editing/templates explicitly retrieve saved source. Start conversation opens a phone-sized chat for the selected business agent or personal skill. Main Assistant search results can open the same selected conversation.

Nebius receives the selected entry's latest saved profile as lower-trust reference. Conversations are saved separately per workspace and entry; a completed user/reply pair is stored only on success. Locks reject overlapping turns, updated profiles invalidate stale replies, and unavailable inference preserves the draft. No uploaded code, external-agent connections, or booking/payment actions run inside these conversations.

Live 390 × 844 walkthrough: published Willow Stay Host (business agent) and Slow Sunday Planner (personal skill). A database search found Willow. The first live request naming both returned only one, exposing an incomplete discovery case. Named-entry lookup now reads each uniquely named saved entry within the existing action budget, skips duplicate-name ambiguity, and has a regression test. The repeat request returned both selectable cards. Willow answered that luggage storage is 09:30–18:00 and check-in starts at 15:00. Slow Sunday recommended two activities, a coffee break and an hour of free time, then asked for destination, date and budget. Both conversations reopened after reload with only their own messages. The workspace's existing two reservations were unchanged.

Verification: the full 91-test unit suite passed, followed by all 35 assistant tests after the new multi-name regression (92 tests in the current suite). Typecheck and the final production build passed. All 11 focused browser cases passed, covering real database search and publication refresh, metadata-only discovery, editor source, access boundaries, phone layouts, separate chat histories, failed-send drafts and Assistant-to-chat selection. Automated conversation replies were mocked; the two conversations above used real Nebius inference. Whitespace checks passed. The key file remains ignored and untracked; no commit, push or deployment was made.

Phone evidence: outputs/agent-hub-flow/01-phone-search.png, 03-business-conversation.png, and 04-personal-conversation.png. The phone view is left open on the saved personal conversation. Nebius inference used API credits; no new reservation, payment or external-agent execution occurred.

## Selected business chat test quotes and approval — October 26

Connected accommodation agents now use their business dispatcher to search owned sample rooms, read details and prepare a quote inside their own conversation. Uploaded profiles, examples and personal skills receive no inventory tools. Search results and current quote associations persist in `agent_chat_booking`. The quote card uses authoritative saved amounts, dates and policies. Approval starts unchecked; new messages, replacement quotes and failed confirmations reset it. Expired quotes are disabled, and failed new-date searches or quote attempts remove the old approval target.

The confirmation endpoint requires same-origin access and a signed approval bound to workspace, selected agent and current quote. It reuses the existing expiry, price, availability and idempotency checks. Typed “yes” directs the user to the approval control. The model has no confirmation/payment tools, and approval signatures never enter its context. A canceled local reservation remains labeled canceled on reopening the chat.

Live Nebius walkthrough: selected the connected Bridge House agent, searched its rooms for two guests on December 2–4, 2026 under $160/night, and received only Bridge House Courtyard Room. The Prepare quote button reused those stay details and returned two nights at $149 plus $30 cleaning, totaling $328. The 390 × 844 phone quote displayed itemized costs, flexible cancellation, expiry, test-only notices, and an unchecked approval box. Confirm test booking was verified disabled. The live walkthrough stopped there for the user's approval. Database inspection confirmed the pending quote had no confirmed reservation and the workspace still had its previous two reservations.

Verification: all 101 unit tests passed, including 17 selected-chat/backend cases covering scoped discovery, foreign rooms, missing capability, bounded tools, signed current-quote approval, repeated confirmation, expiry, changed prices, quote replacement and persistence. Five new browser cases and four existing Agent Hub cases passed. Browser positive-confirmation transport was mocked; real HTTP negative cases verified no mutation, and unit tests exercised real local-store confirmation. Typecheck, production build and whitespace checks passed. A final wording correction aligns the typed-approval guidance with the Confirm test booking button.

Evidence: outputs/selected-agent-booking/01-room-search.png (initial window layout), 02-phone-quote.png and 03-phone-approval.png. The user-facing tab remains open in phone layout at the unchecked approval step. No new user-workspace reservation, real booking, payment, external-agent call, commit, push or deployment was performed. Nebius inference used API credits.

## Approved selected-agent test booking — October 26

With the user's explicit authorization, refreshed the expired Bridge House quote through live Nebius and approved it using the checkbox and Confirm test booking control at 390 × 844. Confirmation AB-54F5DD74 covers Bridge House Courtyard Room, December 2–4, 2026, two guests, $149 per night plus $30 cleaning, totaling $328. The same confirmation, dates, guests and total are visible in customer Bookings and business Reservations. An independent read-only database check confirmed exactly one new reservation linked to its quote, selected chat and idempotency record; the previous two reservations are unchanged.

The initial refresh attempt exposed a text-only model response that described a renewed quote without saving one. The expired approval remained disabled. Explicit quote-refresh requests now require the create_quote tool, and success without a replacement quote is rejected, including after unrelated tool calls. Both regressions failed before their fixes and passed afterward. All 19 focused selected-chat tests passed. Typecheck, production build and whitespace checks passed. The live retry created a fresh saved quote with the original terms before approval.

Phone evidence: outputs/selected-agent-booking/04-test-confirmed.png, 05-customer-booking.png and 06-business-reservation.png. The browser remains on the business Reservations section in phone layout. This created only a local sample reservation; no external hotel booking or payment occurred. Live Nebius inference used API credits. The API key file remains ignored and untracked. No commit, push or deployment was performed.

## Same-chat approved test cancellation — October 26

Customers can request cancellation from the selected business conversation or choose Review test cancellation on its saved reservation. The review uses current reservation terms, has its own unchecked approval box and Confirm test cancellation control, and offers Keep test booking. Chat text never approves cancellation. A fresh server-issued signature binds the workspace, selected agent, reservation and revision; the endpoint enforces current conversation association, owned inventory, existing policy/date checks and action locking. A retry after a lost response returns the same canceled record without affecting other reservations. There is no cancellation tool available to the model.

Live phone walkthrough at 390 × 844: asked Bridge House to prepare cancellation of AB-54F5DD74 for December 2–4, 2026. Canonical guidance from saved state opened the review with approval unchecked and confirmation disabled. Checked I approve this test cancellation and selected Confirm test cancellation under the user's explicit instruction. Chat, customer Bookings and business Reservations all displayed Canceled for the same confirmation, two guests and $328 original total. The business confirmed-reservation count decreased from three to two and stay value from $984 to $656. Independent database comparison confirmed exactly one matching canceled reservation, its two occupied nights released, and both earlier reservations and occupied nights unchanged.

All 108 unit tests passed, including five new cancellation cases. Five new cancellation browser cases and five existing booking cases passed. Positive automated browser responses were mocked; unit tests exercised real local storage, HTTP negative cases checked forged/cross-origin requests, and the phone walkthrough above exercised the real local cancellation endpoint. A review identified stale parent views if the chat closed during a pending cancellation. A delayed-response regression failed before the fix and passed afterward; the approved request now completes and refreshes shared state after chat close. Typecheck, production build and whitespace checks passed. The key file remains ignored and untracked.

Evidence: outputs/selected-agent-booking/07-cancellation-review.png, 08-chat-canceled.png, 09-customer-canceled.png and 10-business-canceled.png. The phone browser remains on business Reservations. No real hotel reservation, payment, charge or refund occurred. This cancellation path used saved authoritative data, without a new Nebius inference call. No commit, push or deployment was performed.

## Same-chat approved test date change — October 26

Connected business chats now list their own active workspace reservations. Customers can select a confirmation, enter new dates and request an updated price in the same conversation. The review compares original dates/total against proposed dates, itemized charges and the price difference. Its separate checkbox begins unchecked; Keep current dates hides the proposal without altering the reservation. Requests use the existing quote tool and atomic booking engine, with an agent-change approval purpose distinct from booking/cancellation. The model can prepare a quote but cannot apply it. Original revision, policy, expiry, current pricing and availability are checked before changing occupied nights; reservation ID and confirmation are preserved.

At 390 × 844, selected Bridge House AB-761E8C1F (November 24–26, two guests, $328) and requested checkout November 27, 2026. Initial automated date edits were displayed but not committed by the browser; their same-date quotes remained unapproved. The native calendar committed November 27, and live Nebius produced the correct three-night quote: 3 × $149 plus $30 cleaning = $477, a $149 increase. The form now reads submitted control values through FormData, with a separate native-autofill regression. Before approval, independent database hashes confirmed all three reservations and their occupied nights were unchanged. Approved the correct quote through its checkbox and Confirm test date change control under the user's instruction.

Chat, customer Bookings and business Reservations now show AB-761E8C1F for November 24–27, two guests, $477. Independent verification confirmed the same reservation ID and confirmation, occupied nights November 24/25/26, no duplicate (three total records), and unchanged AB-7BA5046B and canceled AB-54F5DD74. The business count remains two confirmed reservations, with stay value $805.

Verification: all 116 unit tests passed, including eight date-change cases; all 32 focused chat/backend cases passed after the final typed-approval safeguard. Six date-change browser cases and ten existing booking/cancellation cases passed. The pending-date-quote/cancellation-review precedence regression failed before its fix and passed afterward. Positive automated browser transport was mocked, while the manual walkthrough used real Nebius and the real local confirmation endpoint. Tests cover explicit approval, quote replacement/expiry, stale or malformed responses, retry keys, native autofill and completion after closing chat. Typecheck, production build and whitespace checks passed. Free-text date clarification currently asks for two ISO dates; the date form supplies these automatically.

Evidence: outputs/selected-agent-booking/11-date-change-form.png, 12-date-change-quote.png, 13-date-change-approval.png, 14-chat-dates-updated.png, 15-customer-dates-updated.png and 16-business-dates-updated.png. The phone tab remains on business Reservations. No real hotel booking, payment or refund occurred; Nebius inference used API credits. The API key file remains ignored and untracked. No commit, push or deployment was performed.

## Live date-conflict test — October 26

Requested a test date-change quote in the Bridge House chat for AB-761E8C1F from November 24–27 to November 18–20, 2026, keeping two guests. November 18–20 is occupied by AB-7BA5046B. The live agent returned: “This room is not available for those dates. No reservation has been made or changed.” No replacement quote or approval control was offered, and no approval was submitted.

After reloading, customer Bookings and business Reservations still show AB-761E8C1F confirmed for November 24–27, two guests, $477. Independent read-only comparison confirmed all three reservation records and occupied nights exactly match their pre-test hashes; confirmed-quote associations are unchanged, with no duplicate or conflicting replacement quote. AB-7BA5046B remains confirmed for November 18–20 and AB-54F5DD74 remains canceled. Existing behavior passed without a product-code change.

Phone evidence: outputs/selected-agent-booking/17-date-conflict.png. This was entirely a local sample-inventory test; no real hotel booking or payment occurred. The availability conversation used live Nebius inference.

## Nearby date alternatives after a conflict — October 26

Connected business chats now suggest up to three available starts within seven days of an unavailable date-change request. Suggestions keep the same room, requested duration and guest count; prices come from saved inventory through the quote engine. The phone cards show the unchanged current booking, alternative dates, nights, total and price difference. Selecting an option rechecks its current price and availability and opens a separate, unchecked date-change approval. Stored suggestions are scoped to the conversation, business and original booking/profile revisions; they cannot be confirmed directly.

Live Bridge House walkthrough at 390 × 844: the first two Nebius replies failed safely (no saved date-change quote, then an incomplete reply). Temporary diagnostics recorded only response metadata, never prompts, argument values or credentials. A complete create_quote tool call on retry triggered the conflict handler, which returned November 16–18, November 20–22 and November 15–17, 2026. Each is two nights for two guests at $328 ($149 × 2 plus $30 cleaning), $149 less than the current three-night stay. The diagnostics were removed; no speculative inference changes were made. Live AI can still require a retry when its response is incomplete.

Selected November 16–18 using Review these dates. The refreshed quote showed $328 and its separate approval box remained unchecked, with Confirm test date change disabled. No confirmation was sent. Customer Bookings and business Reservations both still show AB-761E8C1F for November 24–27, two guests, $477. Independent verification found all three reservation records, all occupied nights and all four confirmed-quote associations exactly match baseline hashes. The selected quote is unconfirmed, and no duplicate or approved replacement exists.

Verification: 123 unit tests passed, including seven new alternatives cases and 39 focused selected-chat cases. Nineteen distinct browser checks passed: three alternatives, six existing date-change, five booking and five cancellation. Positive browser changes used mocked transport; backend tests used isolated SQLite stores, and real HTTP negative cases checked invalid and cross-origin requests. Tests cover authoritative alternatives, fresh pricing after expiry, stale/foreign selections, newly occupied dates, persistence, interruption of model tool calls after a conflict, explicit approval, phone overflow, cancellation interaction and both-view refresh. Typecheck, production build and whitespace checks passed. The key file remains ignored; no commit, push or deployment was performed.

Evidence: outputs/selected-agent-booking/18-available-date-alternatives.png, 19-alternative-price-review.png and 20-alternative-awaiting-approval.png. All booking actions remain local and test-only; no real booking or payment occurred. Live Nebius requests used inference credits.

## Approved nearby alternative — October 26

Under the user's explicit instruction, approved the Bridge House AB-761E8C1F test change to November 16–18, 2026, two guests, $328. The previous quote had expired, so the same chat refreshed it through live Nebius. Verified the fresh quote's exact dates, guests and $328 total before checking the separate approval box and selecting Confirm test date change.

The chat, customer Bookings and business Reservations now show the approved dates and total under the same confirmation. Independent read-only verification confirmed the original reservation ID is preserved, occupied nights are exactly November 16/17, and November 24/25/26 were released. There are still three reservation records, with exactly one newly confirmed quote for this change. AB-7BA5046B (November 18–20) and canceled AB-54F5DD74 remain unchanged. The business view shows two confirmed reservations and $656 total stay value.

Evidence: outputs/selected-agent-booking/21-alternative-chat-confirmed.png, 22-alternative-customer-updated.png and 23-alternative-business-updated.png. The phone remains on business Reservations. No product-code changes or repeated automated suite were needed; verification used the real local approval endpoint, both app views and database comparison. No real hotel booking, payment or refund occurred.

## Availability after the approved change — October 26

Verified new-booking availability for two guests, with no existing reservation excluded. November 24–27, 2026 is available again: the room is within its published availability bounds and has no occupied nights on November 24/25/26. November 16–18 is unavailable because AB-761E8C1F occupies November 16/17. The adjacent AB-7BA5046B continues to occupy November 18/19.

The customer assistant's regular search matched the saved data. With two guests and Step-free access (Bridge House is the matching property), November 24–27 returned one offer, Bridge House Courtyard Room; November 16–18 returned zero matching offers. Native calendar controls committed and verified both date ranges. Only searches and a room-details read were performed; no quote or approval control was used.

Independent before/after hashes confirmed all three reservations, occupied nights and five confirmed-quote associations are unchanged. No product change or repeated automated suite was needed. Evidence: outputs/selected-agent-booking/24-released-dates-available.png and 25-current-dates-blocked.png. The phone remains on the blocked-date search result. No real bookings, payments or external inventory actions occurred.

## General entry point and live inference recovery — October 27

Home now leads with business agents and personal skills through Open Agent Hub. Assistant introduces discovery and questions across categories; its room filters are explicitly the accommodation test-booking workflow. The connected transaction workflow remains accommodation. Uploaded profiles do not become external integrations or receive new execution permissions.

Both live assistant paths now share bounded inference retries, a total deadline, strict complete-response validation and sanitized errors. Whole tool batches are checked before execution. Successful quotes return saved terms immediately; conflicts cannot be replaced by a model's success claim. The personal assistant saves successful message pairs together, restores failed drafts and disables sending another turn while busy. Retry recovery does not replay tools or approval actions.

Verification: 140 unit tests passed, typecheck passed, production build passed and whitespace checks passed. The broad browser run passed 37 of 38 cases; its one failure exposed the old development-server singleton lacking the new conversation-save method. Restarted the local server with the existing stable session secret and reran that live journey plus both draft-recovery cases: all three passed. Thus all 38 distinct browser cases passed, including phone layouts at 320 and 390 pixels, selected-agent booking/cancellation/date-change/conflict alternatives, main-assistant discovery, saved-agent search, and approval controls.

Three additional live Nebius trials used fresh in-memory stores. Each published a new fictional business and room, prepared a $328 quote through both assistant paths, rejected unapproved confirmation, approved the selected-chat test quote, verified one matching customer/business reservation, replayed the same confirmation without duplication, and checked the dates became unavailable. Trial durations were 6.02, 2.99 and 3.03 seconds with 7, 4 and 3 inference requests; trial one also included database discovery and live questions for a café agent with no booking tools. These are observed smoke-test timings, not availability or latency guarantees. Injected unit failures separately verified recovery from transient and incomplete responses without repeated business execution.

Read-only hashes after browser testing confirmed the existing user's three reservations, occupied nights, fourteen quotes and five confirmed-quote associations were unchanged. No real bookings, payments or external inventory calls occurred. The server key remains in ignored, untracked `.env.local`; no push was performed. Final 390 × 844 home screenshot: outputs/agentbridge-general-home-mobile.png. The existing browser is left on Home.

## Full phone walkthrough with a new business — October 27

Completed the user's authorized live walkthrough at 390 × 844. Published Cedar House Garden Room through the business form ($139/night, $20 cleaning, two guests, Wi-Fi/step-free/workspace/garden). Its connected Cedar House agent appeared automatically; saved its introduction and guest guidance as version 2. The personal assistant found Cedar House through the saved Agent Hub records and opened the selected business chat from its result card.

The quote request included “cancellation policy,” exposing a preexisting intent check that treated the noun “cancellation” as an action request. No booking or quote was created by that failed attempt. Added failing regression tests, then narrowed the check to cancellation actions/review commands while preserving negation. Repeating the exact original request through live Nebius returned the correct quote and policy. All 142 unit tests, typecheck, production build and whitespace checks passed after this focused fix.

Reviewed November 12–14, 2026, two guests, $278 accommodation plus $20 cleaning, $298 total, with free cancellation before check-in. The approval box began unchecked and confirmation was disabled. Under the user's explicit test-only authorization, checked approval and confirmed once. Chat, customer Bookings and business Reservations show AB-6C1736AE with the same dates, guest count and total.

Independent read-only verification found exactly one new business, room, reservation and confirmed-quote association. Occupied nights are November 12 and 13. Existing rooms, business profiles, Bridge House reservations and their occupied nights match the baseline. No real hotel booking or payment occurred; this local sample record remains available for the user's walkthrough. Phone screenshots are in outputs/phone-business-flow/ (01-home through 08-business-reservation). The browser is left on business Reservations.

## Cedar House cancellation in the same agent chat — October 27

Under the user's explicit test-only instruction, reopened the Cedar House conversation and requested cancellation of AB-6C1736AE (November 12–14, 2026, two guests, $298). The agent showed the saved free-cancellation terms and an unchecked cancellation approval; confirmation remained disabled until the checkbox was selected. Approved and confirmed once through the separate cancellation control.

Verified Test booking canceled in chat, Canceled in customer Bookings, and Canceled in business Reservations. The business summary returned to two confirmed stays and $656. Independent read-only comparison confirmed only Cedar House's status changed; its ID, dates, guest count and total are preserved, November 12/13 occupied nights were released, and all Bridge House records/nights are unchanged. There are still four reservation records and six confirmed-quote associations, with no duplicates.

No product-code change or repeated automated suite was needed. Evidence: outputs/phone-business-flow/09-cancellation-review.png, 10-chat-canceled.png, 11-customer-canceled.png and 12-business-canceled.png. The phone remains on business Reservations. No real booking, charge, payment or refund occurred.

## Cedar House availability and fresh quote after cancellation — October 27

Verified November 12–14, 2026 is available for a new two-guest Cedar House booking: the stay is inside the published availability range, fits capacity, and neither occupied night exists. No existing reservation was excluded from this check.

The first live request for a fresh quote returned old quote text without creating a new quote. Read-only comparison confirmed no quote or reservation changes. Fixed the selected-chat path so a fresh/new stay quote after cancellation requires explicit dates and guest count plus a newly executed create_quote action. Missing details request clarification, negated requests stop, and mismatched model-supplied stay terms or an existing-reservation target are rejected. Regression tests reproduced the old text-only acceptance before the fix. All 145 unit tests, typecheck, production build and whitespace checks passed.

Retried the exact request through the same phone chat. It saved exactly one fresh, ordinary unconfirmed quote for November 12–14, two guests, $139 × 2 nights plus $20 cleaning = $298, with free cancellation before check-in. The approval checkbox remains unchecked and Confirm test booking disabled. Independent read-only verification confirmed the new quote ID, normal expiry, no reservationId target, no confirmation record, and current-chat association. All four reservations, previous quote records, occupied nights and six confirmed-quote associations match baseline; AB-6C1736AE remains canceled and Cedar House's dates remain available. A quote does not hold inventory.

Evidence: outputs/phone-business-flow/13-fresh-quote-dates.png and 14-fresh-quote-unapproved.png. The phone is left on the unapproved test quote. No real or local booking was made, and no payment occurred.

## Approved fresh Cedar House quote — October 27

Under the user's explicit instruction, reviewed the still-valid fresh Cedar House quote for November 12–14, 2026, two guests, $298 and free cancellation before check-in. Checked the separate test-booking approval and confirmed once. The chat returned new confirmation AB-B4CEC40E. Customer Bookings and business Reservations show the same confirmation, dates, guest count and total.

Independent read-only verification confirmed exactly one new reservation created from the existing fresh quote, occupying November 12/13; no extra quote or duplicate reservation was created. The previous Cedar House reservation AB-6C1736AE remains canceled, and all Bridge House records and previously occupied nights are unchanged. The business summary shows three confirmed reservations and $954 total stay value. No real hotel booking or payment occurred.

No product-code change or repeated automated suite was needed. Evidence: outputs/phone-business-flow/15-fresh-chat-confirmed.png, 16-fresh-customer-confirmed.png and 17-fresh-business-confirmed.png. The phone remains on business Reservations.

## Cedar House availability after fresh approval — October 27

Verified November 12–14, 2026 is blocked for a new two-guest booking, with no existing reservation excluded. The ordinary Assistant search returned four other offers and omitted Cedar House Garden Room. The saved occupancy confirms that AB-B4CEC40E occupies November 12 and 13; the checkout date is not an occupied night.

Customer Bookings and business Reservations both still show AB-B4CEC40E confirmed and old AB-6C1736AE canceled, each preserving November 12–14, two guests and $298. Independent before/after hashes confirmed all five reservations, sixteen quotes, occupied nights and seven confirmed-quote associations are unchanged. No quote, approval or booking action was performed.

No product-code change or repeated automated suite was needed. Evidence: outputs/phone-business-flow/18-cedar-blocked-reservation-status.png. The browser remains on business Reservations. Everything stayed local and test-only, with no real bookings or payments.

## Cedar House new-stay conflict and nearby dates — October 27

Asked the selected Cedar House agent to check a new two-guest stay for November 12–14, 2026, explain any conflict and suggest available two-night dates, while keeping AB-B4CEC40E unchanged. The first attempt misread “Do not book, change, cancel, or approve anything” as a cancellation request. Its approval remained unchecked; dismissed the review with Keep test booking. No reservation changed.

Reproduced that exact prompt in a failing regression, then fixed prohibited-action list handling and added a read-only new-stay availability path. It requires the requested dates and guests in a live discovery call, rejects changed tools or reservation exclusions, preserves the confirmed quote association, and computes nearby dates and totals from saved inventory. This uses no new quote records, schema or approval controls.

The identical live Nebius retry explained that AB-B4CEC40E occupies the requested dates and was included in the conflict check. It suggested November 10–12, November 14–16 and November 9–11, 2026: each two nights, two guests, $298 including cleaning. Independent verification confirmed all three are available for new bookings with no reservation excluded. All five reservations, sixteen quotes, occupied nights and seven confirmed-quote associations exactly match the original baseline. The chat remains attached to confirmed AB-B4CEC40E; AB-6C1736AE remains canceled.

All 148 unit tests, typecheck, production build and whitespace checks passed. The live phone retry verified the repaired behavior; no repeated broad browser suite was needed for this server-only change. Evidence: outputs/phone-business-flow/19-cedar-conflict-available-dates.png. The 390 × 844 browser remains on the conflict and alternatives message. No quote, booking, cancellation, date change or payment was created by the successful availability check; all activity stayed test-only.

## Fresh Cedar House quote for a separate stay — October 27

Requested a fresh test quote in the same Cedar House chat for November 14–16, 2026, two guests, $298, explicitly preserving confirmed booking AB-B4CEC40E. Live Nebius prepared the correct ordinary new-stay quote: $139 × two nights plus $20 cleaning, taxes included, free cancellation before check-in. The approval checkbox remains unchecked and Confirm test booking is disabled.

Independent read-only verification found exactly one fresh unconfirmed quote, associated with the current chat, with no existing-reservation target, confirmation record or confirmed association. All five reservations, occupied nights, sixteen prior quote records and seven confirmed-quote associations match baseline. AB-B4CEC40E stays confirmed for November 12–14; AB-6C1736AE stays canceled. No booking or payment was made, and the quote does not hold the November 14–16 inventory.

No product-code changes or repeated automated checks were needed. Evidence: outputs/phone-business-flow/20-cedar-nov14-quote-review.png and 21-cedar-nov14-quote-unapproved.png. The phone remains on the unapproved quote; availability will be checked again if the user later approves.
