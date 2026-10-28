# AgentBridge

**Where businesses meet personal AI.**

[Open the working demo](https://agentbridge-i7vl.onrender.com). All bookings are test-only, with no real reservations or payments. The free host may take a moment to wake after inactivity; sample data can reset between runs.

AgentBridge connects businesses with people through personal AI. The product vision is a shared network where businesses publish their offers, policies, availability, and supported actions; personal assistants discover relevant businesses, ask questions, and prepare transactions for explicit user approval.

The working MVP supports finding and talking with published business agents and private personal skills across categories. A hotel or individual room host can publish an offer without an existing website; a customer's built-in assistant discovers it and prepares a test booking for approval. Other businesses can offer itemized test service quotes in the same chat. Real appointments, purchases, and connections to external personal assistants remain part of the broader vision.

The app opens to a simple conversation screen. Ask for a service in ordinary language, then select a matching agent to start its chat. **More** opens **Agent Hub**, business **Listings**, customer **Bookings**, **Network vision**, and **Preferences**. Workspace navigation and full-screen phone dialogs keep those tools accessible. Each screen has a URL fragment, so browser back/forward and reloading retain the selected view.

Manrope typography, Phosphor icons, and spacious layouts give the workspace a consistent visual system. Dialogs fill the screen on phones, with readable form fields and touch-sized controls. Bookings and service quotes are explicitly test-only.

## Run locally

Requires Node.js 24 or later and npm. No external database required.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. Without a Nebius key, the interface identifies the assistant as offline. It uses deterministic request parsing and real local database operations. This mode does not satisfy the hackathon's live-model requirement by itself.

To enable the live assistant, set the following in `.env.local`, then restart:

```dotenv
NEBIUS_API_KEY=your-key
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1
SESSION_SECRET=replace-with-a-random-value-at-least-32-characters-long
```

Confirm the model identifier and regional endpoint against your Nebius account's available catalog. The integration uses the OpenAI-compatible `/chat/completions` API. Credentials are server-only. Live API errors are shown honestly and never replaced by simulated model success.

Both assistant surfaces share bounded inference recovery: transient failures and incomplete replies receive up to two retries within a 60-second turn budget. Executed tools and approval actions are never replayed by this retry handler. Saved quotes return immediately with their authoritative terms. Failed personal-assistant turns preserve the draft and do not save a partial conversation. Authentication and quota errors require correcting the server/account configuration. Restart the development server after changing stored service methods so its cached connection loads the new code.

On October 27, three isolated live runs verified new business publication, main-assistant and selected-agent quotes, explicit test approval, matching customer/business reservations, duplicate-confirmation protection, and blocked inventory. A café profile was also discovered and used in live chat. These checks used temporary in-memory data; the existing Bridge House records were unchanged. See `design-qa.md` for verification details. These earlier checks covered the accommodation workflow; test service quote approval was added afterward.

Live Nebius search and quote preparation were verified on October 26, 2026 with Nemotron Super and the endpoint above. The model called `search_stays` and `create_quote`, then opened the approval dialog for two guests on November 10–12: $230 accommodation plus $25 cleaning, $255 total. Approval stayed unchecked, confirmation stayed disabled, and the workspace still had zero bookings. This verifies live inference against the sample inventory; real inventory, external personal assistants, and payments remain unconnected. `.env.local` is ignored by Git and must stay untracked.

## What works

- A simple conversation-first Home and a separate network vision in More.
- Agent Hub with eight shared fictional business examples: bicycle repair, home cleaning, pet grooming, hair salon, tutoring, café, tech support, and creative design. Existing private examples and connected accommodation agents remain available.
- Explicitly publish a business agent so other customers can discover it by service and start their own private conversation. Personal agents and skills stay private.
- Import Markdown/JSON as a private draft for review; owners can edit with version protection and download their own entries. Shared cards show profiles, not uploaded source instructions.
- Responsive navigation and full-screen dialogs on phones.
- Host onboarding, structured amenities, pricing, availability range, and cancellation policy.
- Discover/filter accommodation by dates, guests, budget, room type, and amenities.
- Persistent conversations and explicit preference memory.
- Nemotron tool calling through Nebius when configured; labeled offline demonstration otherwise.
- One persisted, versioned skill per business, with its own offers, guest knowledge, and quote capability. Edit agents on phones in Listings; the personal assistant reads the saved guidance through a shared, validated skill dispatcher.
- Authoritative itemized quotes; no hidden taxes or additional fees.
- Explicit approval cards for booking, cancellation, and date changes.
- Business agents can also publish itemized test service prices in Agent Hub. A service quote stays pending until the customer checks the approval box and selects **Approve test quote**; acceptance records no appointment, work authorization, or payment.
- Atomic reservation changes, unique occupied-night constraints, and idempotent confirmation.
- Customers see their own bookings; businesses see reservations for their owned rooms. All customers share the same availability for a published room.
- Curated San Francisco itinerary suggestions with official destination links.

## Walk through the business-to-customer workflow

For a service example, choose one of the eight fictional business agents in **Agent Hub**, or add a business agent with **Offer a test service quote** enabled and saved USD price items. To let another customer's workspace find your agent, check **Let other customers discover this business**. In a separate browser session, ask the home assistant for the service without naming the business, open the matching agent's chat, and request a test quote. Review the scope and total before approving. Quotes expire after ten minutes; changing the saved business profile requires a fresh quote.

1. In the business workspace, open **More → Listings → Add listing**. Add a fictional room with **Step-free access**, a price, and availability covering future test dates.
2. Check **Let other customers discover this business and its rooms**, then select **Save room**. Visibility applies to all rooms belonging to that business; it can also be changed in **Edit agent**.
3. In a separate browser session, ask the home assistant: `Find a step-free room for YYYY-MM-DD to YYYY-MM-DD under $160 per night`.
4. Select the matching business agent and ask it to prepare a quote using those dates and guest count.
5. Review the quote, check the approval box, and confirm the test stay.
6. Show the confirmation in the customer's **Bookings**, then refresh the business workspace's **Listings** to see the same reservation. Other customers cannot book its occupied dates.
7. Change dates or cancel with another explicit approval; both views update.

All listings and bookings are fictional demonstrations. No card details are collected and no payment is taken. Illustrative room photographs are delivered by Unsplash; typography by Google Fonts, with system fallbacks.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Browser checks, with the local app already running:

```sh
npx playwright install chromium
npm run test:browser
```

The browser runner uses Chromium by default. Set `PLAYWRIGHT_CHROME_PATH` if using an existing Chrome installation. Browser tests cover Home and workspace navigation, host onboarding → discovery → quote → approval → booking → date change → cancellation, preference persistence, conversational date synchronization, and phone navigation, forms, approval, and overflow.

Current local checkpoint (October 27, 2026): 220 unit tests and two API checks passed for the shared directory and booking changes. Phone verification across separate workspaces and restart testing are in progress. Remote Turso persistence is not yet verified; account connection is pending.

Earlier verified checkpoint: 150 unit tests, type checking, and the production build passed. Live phone checks verified Cedar House's booking, cancellation, date conflicts, nearby availability, and a separate unapproved quote while preserving its existing confirmed booking. Fresh-quote regressions cover newly published rooms both in a new chat and after discovery. Each selected business agent receives its current owned room IDs before preparing a quote; server ownership checks and explicit approval remain required. An isolated live Nebius retest produced the new room's correct $298 quote with zero reservations. See [the QA record](design-qa.md) for scope and evidence. Local captures are kept outside the source release.

## Data and deployment

SQLite defaults to `data/agentbridge.sqlite`; override with `AGENTBRIDGE_DB_PATH`. Back up this database (including its SQLite journal/WAL when active) to retain business skills, their history, offers and reservations. Data and credentials are ignored by Git. A signed, HTTP-only browser session identifies a workspace. Explicitly published business agents and their offers are discoverable across workspaces; personal skills, chats, preferences, approvals, and customer bookings remain private. Businesses see reservations for their owned rooms. The cookie is prototype identity, not a verified customer or business account.

Set the Nebius key and session secret only in the server's environment or local `.env.local`. Never put them in browser code, a `NEXT_PUBLIC_` variable, a recording, or a repository file. The source release excludes local databases, `.env.local`, generated builds, screenshots, and recordings; `.env.example` contains placeholders only.

Set a stable `SESSION_SECRET` before deployment so returning browsers keep access to their workspace after a process restart. Without one, local development uses a process-lifetime random secret; old browser sessions become inaccessible after restarting even though their SQLite records remain. Clearing cookies also starts a new workspace.

The server needs one Node.js 24 instance and HTTPS. Set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for remote persistent storage, or use a writable local SQLite directory for development. The remote mode uses the official synchronous libSQL driver and keeps transactions on the remote database; it does not depend on Render's filesystem. Incomplete cloud settings fail rather than silently using a local database. Run `npm run build`, then `npm start`; set the hostname/bind address for your environment. Move the store to asynchronous database access before scaling traffic. See [free persistent storage](docs/persistence.md) for setup, migration and verification.

### Docker and Render

The Docker image uses the Next.js standalone server and runs as a non-root user. Its build context includes only app source, public assets and package/build configuration; it excludes credentials, databases, local captures and test results.

```sh
docker build -t agentbridge .
docker run --rm -p 3000:3000 \
  --env-file .env.local \
  -e AGENTBRIDGE_DB_PATH=/var/data/agentbridge.sqlite \
  -v agentbridge-data:/var/data \
  agentbridge
```

For Render, create a Blueprint from the published repository using `render.yaml`. It defines one free Docker service with no paid disk. Supply `NEBIUS_API_KEY`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Render's private environment settings. A free Turso database provides storage across app restarts and deployments within its free-plan limits; keep paid overages disabled. The Blueprint generates `SESSION_SECRET` for a new service and keeps automatic redeployment disabled. Preserve the existing secret when updating a service. Never place secrets in `render.yaml` or build arguments. Live model calls still use Nebius credits.

Connecting an empty remote database starts with new records; existing local or hosted records are not copied automatically. Export and import the current hosted database before switching if its test history needs to be retained. Without both Turso settings, the app uses local storage, which resets on free Render when the service sleeps, restarts or redeploys. The free web service still has a cold start after inactivity even with remote storage. Each new browser workspace receives sample inventory. Choose future stay dates when testing or recording.

The public demo uses test data on Render's free tier. Real hotel inventory connections, payments, verified hosts, exact addresses, identity verification, and production abuse prevention are outside this demo. New sessions are available without registration, so the per-session inference limit is only a demo guard; a production service would need account/global limits and operational retention controls. Keep the service available and inference credits funded throughout judging.

See [the implementation plan](docs/plans/agentbridge-mvp.md) and [capability interface](docs/capabilities.md).

## Business skills and live phone verification

On October 26, 2026, the 390 × 844 phone flow was verified using real Nebius inference: publish Bridge House Courtyard Room → discover the step-free room for two guests on November 18–20 → read the Bridge House skill profile and room policy → prepare its $328 quote → explicitly approve → see the same confirmation in customer and business views. Only local sample inventory was reserved; no external reservation or payment was made. Live inference uses Nebius credits.

The shared Node server hosts the skill handlers. SQLite stores business offers, reservations, current skills and immutable skill revisions. Listings → Edit agent saves business introductions and guest guidance with conflict protection; View skill opens an exportable JSON manifest. The directory and business invocation API share the same dispatcher as Nebius. Reusable code and operation schemas belong in the repository; business-specific knowledge and revision history live in the database. A separate model or server per business is not required. Verified accounts and external-assistant authentication remain future integrations. See the capability interface for the endpoint contract and approval boundaries.

## Publish your own agent or skill

Open **Agent Hub → Add agent or skill**. Describe the entry and its instructions. Entries start private: select **Save entry**, or choose Business + Agent and check **Let other customers discover this business** before selecting **Publish business agent**. Personal entries remain private. **Import file** reads Markdown or JSON into a private draft for review; an imported file cannot authorize publication. **Use as template** copies an example in your own workspace; shared example cards are read-only.

Agent Hub searches saved SQLite records as you type or change the owner filter. Cards and details show the name, owner, and description; the uploaded source stays in the editor. After publishing, the app retrieves the saved entry from the database again. The main Assistant can also find entries and offer a card that opens the selected conversation.

Choose **Start conversation** to talk with a business agent or use a personal skill. Nebius reads that entry's latest saved profile for each reply. Each entry has its own saved conversation; switching agents keeps their histories separate. A missing or unavailable AI connection produces an error and preserves your draft.

Connected business agents can search their own published rooms and prepare an itemized **Test quote** in that same chat. Supply check-in, check-out and guest count. Review the price, dates and cancellation terms, check **I approve this test booking**, then choose **Confirm test booking**. This creates only a test reservation; there are no real bookings or payments. A typed “yes” does not confirm anything. Other business agents with saved service prices can prepare service quotes for separate explicit approval; profiles without a connected inventory or service offer remain conversational.

To cancel that saved test reservation in the same chat, ask the agent to cancel or choose **Review test cancellation**. Review the current stay and policy, check **I approve this test cancellation**, then choose **Confirm test cancellation**. **Keep test booking** closes the review without changing anything. Only eligible reservations can be canceled; chat messages alone cannot approve the action. The canceled status appears in customer Bookings and business Reservations. No real booking, charge or refund occurs.

To change dates, choose a booking under **Your bookings** in the same business chat, enter the new dates, and choose **Review updated price**. Compare the original dates and total with the new itemized quote, check **I approve this test date change**, then choose **Confirm test date change**. The original stay remains confirmed until approval. The updated reservation keeps its confirmation number and appears in both customer and business views. **Keep current dates** leaves the booking unchanged. All changes remain test-only.

If those dates are unavailable, the agent suggests up to three nearby stays for the same room, guest count and requested length. Each shows its total and price difference. Choose **Review these dates** to check the latest price and availability, then approve separately in the same chat. Selecting an option leaves your current booking unchanged.

For a separate new stay, ask the agent to check availability with explicit dates and guest count. Existing confirmed reservations remain part of the availability check. If the requested room is unavailable, the chat can suggest up to three nearby ranges with full prices without creating a quote or changing a booking. Request a fresh quote for your chosen dates, then review and approve it separately. A quote alone does not hold inventory.

An optional external agent link is stored for reference only. Chats do not run uploaded code, authenticate or contact an external agent, or create a real-world transaction. Publishing shares the business profile and offers; each customer's conversation and approvals stay in their own workspace.
