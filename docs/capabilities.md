# AgentBridge capability interface

The network separates discovery, published business facts, and approved transactions. This MVP implements one category: accommodation. The Next.js API is ready for our own assistant; an authenticated third-party assistant adapter is a future integration, not a currently public API.

## Business publication

A host submits one independently bookable room through **Add listing**. It publishes property type, neighborhood, capacity, amenities, an availability range, fixed nightly rate, cleaning fee, and structured policies. No website is required. Unspecified/out-of-range nights are not available.

The directory is scoped to the browser's demo workspace. It is not a global hotel inventory service.

## One saved skill per business

The shared Node server stores current business skills in SQLite's `business_skills` table and immutable revisions in `business_skill_history`. Existing listings are backfilled automatically with their original business IDs. Each skill contains a name, category, owned listing IDs, fixed capabilities, approval requirement, schema version, content version, introduction, business knowledge and update time. Publishing another room or editing guidance creates a new saved revision; reopening the database preserves these records.

Rooms with the same normalized host/business name in the same workspace share a skill. This remains an MVP identity convention, not verified business ownership. Display aliases remove legacy demo labels only from the three known seeded businesses, retaining the raw names used for their stable IDs.

In **Listings → Your business agents → Edit agent**, the host can edit a short introduction and up to 4,000 characters of guest guidance. Saving checks the version reviewed by the editor; stale edits are rejected without discarding the draft, and the editor can reload the saved version. This content is business-provided data, never executable instructions. Structured room prices, availability and policies remain authoritative. Skills cannot authorize a booking or payment.

The personal Nebius assistant reads the current profile and room details through the same business dispatcher used by the HTTP interface. When a message uniquely names a known business or room, the server first retrieves its current profile using normalized full-name matching. This read is included in the action budget and trace, even if the model tries to answer from old conversation history. Ambiguous names are left for clarification/tool routing. When a turn retrieves a profile, room details, quote, search results or saved reservations, the final factual reply is assembled from those current results rather than accepting model additions. This preserves exact business guidance, inventory results and quote totals; general questions and unnamed follow-ups without retrieved evidence can remain generative. Factual replies may include more published guidance than the specific question asks. Details include the current skill introduction and knowledge; quotes identify their business and skill version. The offline assistant can display saved business guidance in a business-profile inquiry; it does not interpret arbitrary guidance in property-specific questions.

## Business communication interface

This is AgentBridge's own `agentbridge.skill.v1` protocol. It is session-scoped and is not advertised as MCP or A2A compatibility. External assistants need a future account/token adapter; these routes currently use the same signed private workspace session as the app.

- `GET /api/businesses` returns the saved business directory and each business endpoint.
- `GET /api/businesses/{businessId}` returns a machine-readable skill manifest including version, knowledge, owned rooms and operation input schemas. **View skill** opens this exportable JSON.
- `POST /api/businesses/{businessId}` accepts `{ "action": "profile", "input": {} }` (or another declared action). Responses carry protocol, business ID/name, skill version and result.
- `POST /api/actions/save-skill` accepts `businessId`, expected `version`, `summary`, and `knowledge`; only the app's management flow exposes it, not the model tools.

Declared operations are `profile`, `discover_stays`, `get_stay_details`, and `create_quote`. Fields and types are validated against the published schemas. Discovery through a business endpoint returns only that business's rooms; details and quotes reject foreign listings. Workspace identity is taken from the signed session, never the request payload. POST requests require a matching Origin. Responses are private and uncached.

Skill invocation only prepares quotes: it returns neither a reservation nor an approval credential. Booking approval remains in the separate signed UI transaction flow. The reusable schemas, handlers, routing and tests are maintained source assets; business guidance and its revision history are durable database assets. A hosted instance must back up its SQLite data directory. No public service, real inventory or payment connection is created by this implementation.

## Agent Hub

The **Agent Hub** screen brings connected accommodation agents and standalone business/customer entries into one searchable library. Six reference examples cover room concierge, café guest services, cycle repairs, personal trip planning, accessibility questions and work-trip preferences. Examples are seeded once per workspace and are clearly labeled; they do not claim live services or inventory.

Anyone in the current private workspace can publish an agent profile or skill without first creating a room. The form records name, owner type/name, agent-or-skill type, category, summary, instructions and an optional HTTPS reference link. Standalone records and immutable versions live in `skill_library` and `skill_library_history`; connected room agents remain in the existing business tables and appear through a read-only library projection. Agent Hub's **Manage agent** button uses their existing business editor.

**Import file** accepts Markdown or JSON up to 24,000 bytes. It populates a reviewable draft; the user must choose **Publish entry** before any library record is created. Markdown source is preserved as plain text, with name/description extracted from a heading or common descriptive frontmatter. JSON accepts portable fields and the app's exported entries, ignoring generated identity/version fields during import; unrecognized executable configuration is rejected. Instructions are limited to 12,000 characters. No uploaded code is executed, and registered agent URLs are never contacted automatically.

- `GET /api/skills` lists entries; optional `q`, `ownerType` and `kind` filters search saved records. `metadata=1` omits uploaded content for discovery.
- `POST /api/skills` publishes validated portable fields and creates a new identity/version 1.
- `GET /api/skills/{skillId}` reads a workspace-owned entry. `?metadata=1` omits source instructions; `?download=1` downloads exportable JSON.
- `PATCH /api/skills/{skillId}` saves full editable fields with an expected version; conflicts preserve the existing record.
- `POST /api/skills/import` accepts `filename` and `text`, and returns a draft without publishing it.

Agent Hub tools `search_skills` and `read_skill` let the main assistant discover new entries and read current metadata. A uniquely named standalone skill is fetched directly, so a newly published entry is available without relying on old chat history. The UI searches the server as queries and owner filters change, and retrieves persisted results again after publication. Cards and detail views show metadata; raw source is available in the editor or explicit export. Assistant results include cards that open the selected entry's conversation.

- `GET /api/skills/{skillId}/chat` returns the current profile metadata, separate saved messages and live/unavailable AI status.
- `POST /api/skills/{skillId}/chat` accepts only `message` (up to 2,000 characters). The server resolves the entry in the signed workspace, reads its current profile, and asks Nebius for a conversational reply. It does not accept client-supplied history or instructions.
- `POST /api/skills/{skillId}/chat/confirm` accepts only `quoteId`, `approval`, `approved: true`, and `idempotencyKey`. It confirms a local test reservation only for the current quote associated with that selected business conversation.
- `POST /api/skills/{skillId}/chat/cancel` accepts only `reservationId`, `revision`, `approval`, and `approved: true`. It cancels only the saved reservation currently associated with that selected business conversation.
- `POST /api/skills/{skillId}/chat/alternatives` accepts only `quoteId` from a saved date alternative. It rechecks the original booking, selected business, availability and current price, then prepares a fresh date-change quote without applying it.

Conversation history lives in `agent_chat_threads`, scoped by workspace and entry. The latest 40 messages are kept; up to 12 prior messages enter each model call. A successful pair is saved atomically. Overlapping replies, changed profile versions, unavailable AI, and malformed replies do not record a successful turn. SQLite locks and a tenant-wide 12-per-minute chat limit bound requests.

Selected conversations use saved profile content as lower-trust reference, not privileged system instructions. Business agents answer from supplied facts; personal skills can inform planning suggestions. Only server-resolved connected business identities receive `discover_stays`, `get_stay_details`, and `create_quote`. Calls are limited to six per turn and dispatch to the selected business's owned rooms. No confirm, payment, cancellation, or date-change tool is exposed. Uploaded profiles, examples and personal skills cannot grant themselves inventory access, including by copying a business's name.

Saved room results and the current quote association live in `agent_chat_booking`. The quote card uses the booking engine's authoritative amounts and policies, survives reopening the conversation, and starts with approval unchecked. Signing happens in the HTTP route after inference; approval credentials never enter the model context. The signature binds the workspace, `agent-book` action, selected skill ID and quote ID. Confirmation checks the current chat quote, owned room, expiry, availability and price terms, then uses the existing idempotent local reservation engine. Test confirmations appear in Bookings and the business reservation view. Typing “yes” cannot approve or create a reservation.

Cancellation uses a separate `agent-cancel` signature bound to the workspace, selected skill, reservation ID and current reservation revision. Review reads fresh saved terms; the checkbox begins unchecked and resets on messages, failed attempts and reopening. The endpoint validates current conversation and business ownership, rejects pending chat actions and stale approvals, and applies existing cancellation policy/date checks. Replaying the same completed cancellation is safe if the terms are unchanged. Cancellation guidance is generated from saved state; the model has no cancellation tool. Customer and business views refresh from the same local reservation record.

For date changes, selected chats expose only the business's active workspace reservations. The existing `create_quote` tool can prepare a replacement for an owned reservation, with its original revision captured by the booking engine. Pending replacements return `dateChangePending: true`, the proposed quote and current saved reservation. HTTP signing uses the separate `agent-change` purpose; `/chat/confirm` determines the expected purpose from the saved quote. Confirmation preserves reservation ID/confirmation and atomically validates original terms, policy, price, expiry and availability before replacing occupied nights. The UI compares original/new dates, totals and price difference, with a separate unchecked approval. Typed agreement never applies a date change, and no mutation tool is exposed to the model.

An availability conflict can return `dateAlternatives`, containing up to three authoritative quotes for the same room, guest count and requested duration. Starts are checked within seven days before and after the request, nearest first, skipping past dates. Suggestions have no confirmation approval. Selection validates the saved conversation association and original booking/profile revisions, then refreshes availability and price through the quote engine. Only that selected current quote receives an `agent-change` approval, and the customer must explicitly approve it before any reservation or occupied night changes.

All selected-chat booking state is marked `testOnly: true`. There are no remote-agent calls, real inventory reservations or payments. Imported material never grants extra tools or transaction authority. Uploading an agent profile is registration/storage, not deployment or external-agent authentication. Personal entries remain inside the same private workspace; this is not public sharing between separate user accounts.

## Read and quote tools available to the model

| Tool           | Inputs                                                      | Outputs                                         |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `search_skills` | query, ownerType, kind | Matching saved agent/skill metadata |
| `read_skill` | skillId | Current saved profile metadata |
| `search_stays` | checkIn, checkOut, guests, maxNightlyCents, amenities, type | Matching, available published listings          |
| `stay_details` | listingId                                                   | Published facts and policies                    |
| `business_profile` | businessId                                            | Current saved skill, guest guidance, version, offers and capabilities |
| `create_quote` | listingId, checkIn, checkOut, guests                        | Stored quote, total cents, policies, expiration |
| `my_bookings`  | None; identity from session                                 | Current traveler's reservation records          |

Dates are property-local `YYYY-MM-DD`, check-out exclusive. Prices use integer USD cents. Maximum stay is 30 nights. Quotes expire after 10 minutes. A quote is not a reservation and does not hold inventory; confirmation rechecks availability and immutable quote terms.

The UI opens a returned live quote as an approval card. Approval credentials are attached only after model reasoning is finished; they are never sent to the model.

## Live inference recovery

The personal assistant and selected-agent chats use the same server-side Nebius helper. Each user turn has a 60-second inference deadline, at most 20 seconds per request, and two additional attempts shared across the turn. Transient network/HTTP failures, truncated responses, malformed tool envelopes and missing required tools can be retried. Retry-After is honored within the deadline; authentication, billing/quota, invalid configuration and unsupported action names fail without a retry loop. Error messages omit raw provider bodies and credentials. The exact default Nemotron model uses its supported thinking-off option; other configured models do not inherit that setting.

Inference retries never execute business tools. Both callers validate the entire proposed batch before executing any action. Successfully prepared quotes and business conflicts end the turn with saved terms or the actual error, avoiding an unnecessary narration call. An explicit saved-agent discovery request requires a database search/read; a ready-to-quote request can require the quote tool instead of accepting an unsupported prose claim. User and assistant messages are saved together after a successful personal-assistant turn; failures restore the editable draft. Confirmation, changes and cancellation continue to use their separate approval endpoints and are never automatically retried by the model helper. A provider outage can still produce an honest error when the retry budget is exhausted.

## User-approved transaction endpoints

`POST /api/actions/quote` prepares a quote and a signed approval credential for the UI.

`POST /api/actions/confirm` requires quoteId, approval, approved=true, and idempotencyKey. It checks ownership and approval, validates quote expiry and unchanged terms, then atomically claims occupied nights and creates/updates the reservation. Repeated identical confirmations return the stored result.

Date changes reuse quote and confirm with `reservationId`, preserving the existing booking until successful confirmation. The original reservation state must still match the state reviewed when the replacement quote was created.

`POST /api/actions/prepare-cancel` returns the current owned reservation, revision, and a cancellation approval credential. `POST /api/actions/cancel` requires the ID, revision, approval, and approved=true. Revision is checked inside the database transaction so an old dialog cannot cancel a newly changed reservation.

These actions are deliberately unavailable to the model as transaction tools. They require the application's explicit approval controls. The user's own browser session may call its own endpoints; these are consent boundaries, not a claim that an API can distinguish a human from automation controlling that same authorized browser.

## Security and behavior

- Signed HTTP-only, SameSite session cookies; all records are tenant scoped.
- Mutation requests require a matching Origin and Host.
- Approval signatures bind tenant, action, target/revision, and expiry.
- Unique listing/night rows prevent overlapping bookings even across concurrent database connections.
- Structured policy rules control cancellation and changes. No payments/refunds execute.
- Host prose is untrusted source material; it does not grant tool permissions.
- Unknown facts stay unknown; assistant explanations are not proof of transaction success.
- Bounded requests, bounded tool execution, model timeouts, and per-session message limits support the demo.

## Future categories

The reusable pattern is discover → inspect offers/policies → prepare → approve → execute → manage. Appointments, purchases, and support would each need their own validation, transaction semantics, and real business integrations. The MVP does not implement or guarantee those extensions.
