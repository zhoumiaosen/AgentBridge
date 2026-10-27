# AgentBridge

**Where businesses meet personal AI.**

AgentBridge connects businesses with people through personal AI. The product vision is a shared network where businesses publish their offers, policies, availability, and supported actions; personal assistants discover relevant businesses, ask questions, and prepare transactions for explicit user approval.

The working local MVP supports finding and talking with business agents and personal skills across categories. It demonstrates transactions through accommodation: a hotel or individual room host publishes an offer without an existing website, the built-in assistant discovers it, and a person approves the test booking. Travel planning supports this example. Appointments, purchases, and connections to external personal assistants are the broader vision, not implemented features.

The app opens to a simple **Home** screen with **Open Agent Hub** as its main action. Businesses and customers can publish or discover agents and personal skills across categories, without needing a website. Shortcuts open the personal assistant, accommodation listings, and test bookings. **Assistant** leads with finding agents, skills and answers; its date filters are labeled as the accommodation test-booking workflow. Floating desktop navigation and a phone bottom bar connect **Home**, **Listings**, **Assistant**, **Bookings**, and **Agent Hub**. **More** opens **Network vision** and **Preferences**. Each screen has a URL fragment, so browser back/forward and reloading retain the selected view.

Manrope typography, Phosphor icons, and spacious layouts give the workspace a consistent visual system. Dialogs fill the screen on phones, with readable form fields and touch-sized controls. A quiet **Sample workspace** label identifies the fictional inventory. Accommodation is the implemented transaction category; other business profiles can be published, discovered and used for conversation.

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

On October 27, three isolated live runs verified new business publication, main-assistant and selected-agent quotes, explicit test approval, matching customer/business reservations, duplicate-confirmation protection, and blocked inventory. A café profile was also discovered and used in live chat. These checks used temporary in-memory data; the existing Bridge House records were unchanged. See `design-qa.md` for verification details. Accommodation remains the only connected transaction category.

Live Nebius search and quote preparation were verified on October 26, 2026 with Nemotron Super and the endpoint above. The model called `search_stays` and `create_quote`, then opened the approval dialog for two guests on November 10–12: $230 accommodation plus $25 cleaning, $255 total. Approval stayed unchecked, confirmation stayed disabled, and the workspace still had zero bookings. This verifies live inference against the sample inventory; real inventory, external personal assistants, and payments remain unconnected. `.env.local` is ignored by Git and must stay untracked.

## What works

- Simple Home centered on Agent Hub, with personal-assistant and accommodation workspace shortcuts; a separate network vision in More.
- Agent Hub with six business/personal examples, connected accommodation agents, search and owner filters.
- Publish business or personal agent profiles/skills; import Markdown/JSON for review, edit with version protection, and download entries. Newly saved entries appear immediately and survive reload.
- Responsive navigation and full-screen dialogs on phones.
- Host onboarding, structured amenities, pricing, availability range, and cancellation policy.
- Discover/filter accommodation by dates, guests, budget, room type, and amenities.
- Persistent conversations and explicit preference memory.
- Nemotron tool calling through Nebius when configured; labeled offline demonstration otherwise.
- One persisted, versioned skill per business, with its own offers, guest knowledge, and quote capability. Edit agents on phones in Listings; the personal assistant reads the saved guidance through a shared, validated skill dispatcher.
- Authoritative itemized quotes; no hidden taxes or additional fees.
- Explicit approval cards for booking, cancellation, and date changes.
- Atomic reservation changes, unique occupied-night constraints, and idempotent confirmation.
- Bookings and Business listings backed by the same SQLite records.
- Curated San Francisco itinerary suggestions with official destination links.

## Walk through the business-to-customer workflow

1. Start at **Home → Open Agent Hub** to show the general network of business agents and personal skills. **More → Network vision** explains how each participating business gives personal AI another way to help people. Accommodation is the first supported transaction workflow.
2. Select **Assistant** and choose future dates.
3. Ask: `Find a step-free room for YYYY-MM-DD to YYYY-MM-DD under $160 per night`.
4. The seeded properties have no step-free access, so no property matches.
5. Open **Listings → Add listing**. Publish the example room with **Step-free access** selected and availability covering the requested dates.
6. Repeat the request in **Assistant**. The new room is immediately discoverable: the business has created a new option for the customer.
7. View the room's quote, check the approval box, and confirm the stay.
8. Show the confirmation in **Bookings** and the identical reservation in **Listings**. Both views read the same saved accommodation reservation.
9. Change dates or cancel with another explicit approval.

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

Latest verified checkpoint (October 27, 2026): all 150 unit tests, type checking, and the production build passed. Live phone checks verified Cedar House's booking, cancellation, date conflicts, nearby availability, and a separate unapproved quote while preserving its existing confirmed booking. Fresh-quote regressions cover newly published rooms both in a new chat and after discovery. Each selected business agent receives its current owned room IDs before preparing a quote; server ownership checks and explicit approval remain required. An isolated live Nebius retest produced the new room's correct $298 quote with zero reservations. See [the QA record](design-qa.md) for scope and evidence. Local captures are kept outside the source release.

## Data and deployment

SQLite defaults to `data/agentbridge.sqlite`; override with `AGENTBRIDGE_DB_PATH`. Back up this database (including its SQLite journal/WAL when active) to retain business skills, their history, offers and reservations. Data and credentials are ignored by Git. A signed, HTTP-only browser session selects an isolated demo tenant; all data access is tenant scoped. Each demo tenant owns both host and traveler experiences. This is demonstration identity, not production host authentication.

Set the Nebius key and session secret only in the server's environment or local `.env.local`. Never put them in browser code, a `NEXT_PUBLIC_` variable, a recording, or a repository file. The source release excludes local databases, `.env.local`, generated builds, screenshots, and recordings; `.env.example` contains placeholders only.

Set a stable `SESSION_SECRET` before deployment so returning browsers keep access to their workspace after a process restart. Without one, local development uses a process-lifetime random secret; old browser sessions become inaccessible after restarting even though their SQLite records remain. Clearing cookies also starts a new workspace.

The server needs one Node.js 24 instance with a writable data directory and HTTPS. Mount persistent storage when records must survive restarts; the free demo configuration below uses temporary storage. This version is not suitable for stateless/serverless replicas or Sites Workers: it uses Node's built-in SQLite module and a local disk. Run `npm run build`, then `npm start`; set the hostname/bind address for your deployment environment. Move the transaction store to PostgreSQL before horizontal scaling.

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

For Render, create a Blueprint from the published repository using `render.yaml`. It defines one free Docker service with no paid disk, so no hosting purchase is required. Supply `NEBIUS_API_KEY` in Render's private environment settings. The Blueprint generates `SESSION_SECRET` and keeps automatic redeployment disabled. Never place the key in `render.yaml` or build arguments. Live model calls still use Nebius credits.

A hosted instance starts with a new database. Local rooms, conversations and reservations are not copied to hosting. The free service has a cold start after inactivity, and its temporary database can reset when it sleeps, restarts or redeploys. Each new browser workspace receives sample inventory and can publish its own business offer for the walkthrough. Choose future stay dates when testing or recording. Use persistent storage only if upgrading intentionally; it is not included in this free demo configuration.

The app is not publicly deployed. Real hotel inventory connections, payments, verified hosts, exact addresses, identity verification, and production abuse prevention are outside this demo. New sessions are available without registration, so the per-session inference limit is only a demo guard; a public launch needs account/global limits and operational retention controls. Keep the demo and inference credits funded throughout judging.

See [the implementation plan](docs/plans/agentbridge-mvp.md) and [capability interface](docs/capabilities.md).

## Business skills and live phone verification

On October 26, 2026, the 390 × 844 phone flow was verified using real Nebius inference: publish Bridge House Courtyard Room → discover the step-free room for two guests on November 18–20 → read the Bridge House skill profile and room policy → prepare its $328 quote → explicitly approve → see the same confirmation in customer and business views. Only local sample inventory was reserved; no external reservation or payment was made. Live inference uses Nebius credits.

The shared Node server hosts the skill handlers. SQLite stores business offers, reservations, current skills and immutable skill revisions. Listings → Edit agent saves business introductions and guest guidance with conflict protection; View skill opens an exportable JSON manifest. The directory and business invocation API share the same dispatcher as Nebius. Reusable code and operation schemas belong in the repository; business-specific knowledge and revision history live in the database. A separate model or server per business is not required. Public hosting, verified accounts and external-assistant authentication remain future integrations. See the capability interface for the endpoint contract and approval boundaries.

## Publish your own agent or skill

Open **Agent Hub → Add agent or skill**. Choose Business or Personal, describe what the entry helps with, add its instructions, and select **Publish entry**. The new card appears immediately. **Import file** can populate the same form from an existing Markdown or JSON file; review it before publishing. **Use as template** copies one of the examples into a new editable draft.

Agent Hub searches saved SQLite records as you type or change the owner filter. Cards and details show the name, owner, and description; the uploaded source stays in the editor. After publishing, the app retrieves the saved entry from the database again. The main Assistant can also find entries and offer a card that opens the selected conversation.

Choose **Start conversation** to talk with a business agent or use a personal skill. Nebius reads that entry's latest saved profile for each reply. Each entry has its own saved conversation; switching agents keeps their histories separate. A missing or unavailable AI connection produces an error and preserves your draft.

Connected business agents can search their own published rooms and prepare an itemized **Test quote** in that same chat. Supply check-in, check-out and guest count. Review the price, dates and cancellation terms, check **I approve this test booking**, then choose **Confirm test booking**. This creates only a local sample reservation; there are no real bookings or payments. A typed “yes” does not confirm anything. Uploaded profiles and personal skills without a connected room inventory remain conversational.

To cancel that saved test reservation in the same chat, ask the agent to cancel or choose **Review test cancellation**. Review the current stay and policy, check **I approve this test cancellation**, then choose **Confirm test cancellation**. **Keep test booking** closes the review without changing anything. Only eligible reservations can be canceled; chat messages alone cannot approve the action. The canceled status appears in customer Bookings and business Reservations. No real booking, charge or refund occurs.

To change dates, choose a booking under **Your bookings** in the same business chat, enter the new dates, and choose **Review updated price**. Compare the original dates and total with the new itemized quote, check **I approve this test date change**, then choose **Confirm test date change**. The original stay remains confirmed until approval. The updated reservation keeps its confirmation number and appears in both customer and business views. **Keep current dates** leaves the booking unchanged. All changes remain test-only.

If those dates are unavailable, the agent suggests up to three nearby stays for the same room, guest count and requested length. Each shows its total and price difference. Choose **Review these dates** to check the latest price and availability, then approve separately in the same chat. Selecting an option leaves your current booking unchanged.

For a separate new stay, ask the agent to check availability with explicit dates and guest count. Existing confirmed reservations remain part of the availability check. If the requested room is unavailable, the chat can suggest up to three nearby ranges with full prices without creating a quote or changing a booking. Request a fresh quote for your chosen dates, then review and approve it separately. A quote alone does not hold inventory.

An optional external agent link is stored for reference only. Chats do not run uploaded code, authenticate or contact an external agent, or create a real-world transaction. All records remain scoped to the current private workspace.
