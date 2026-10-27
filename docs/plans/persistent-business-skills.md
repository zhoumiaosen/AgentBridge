# Persistent business skills

## Outcome

AgentBridge remains one frontend and Node backend application. Each business has a durable, versioned skill in the same SQLite database as its offers and reservations. Businesses can maintain their introduction and guest knowledge from the phone-friendly Listings screen. The personal assistant uses the latest saved skill for inquiries and quotes.

This extends the user's approved one-agent-per-business direction. It does not require a separate server or model per business. The existing sample workspace and explicit approval boundary remain in effect.

## Implementation

1. Persist each business skill and immutable revisions; migrate existing businesses without losing listing associations or identifiers. Validate content, scope reads by workspace, and reject stale edits.
2. Add a small business agent editor, saved version/time, and a downloadable machine-readable skill. Keep Home simple and reuse the accessible phone dialog.
3. Expose a session-scoped directory, manifest and one validated invocation endpoint per business. Use the same dispatcher from Nebius tools. Only discovery, profile, details and quote preparation are available.
4. Verify persistence after database reopen, revisions, cross-business isolation, invalid inputs, approval protection, editing on phones, and the complete business-to-customer flow. Recheck build and secret exclusion.

## Acceptance evidence

- Database tables contain skill records and history independently of a page render; reopening preserves edits and identities.
- Saved knowledge is returned by business profile/details and reaches live assistant replies.
- An updated skill changes inquiries without altering structured prices or authorizing transactions.
- Phone editing survives reload; stale edits produce a useful recovery path.
- Machine-readable manifests describe the actions the server accepts; unsupported actions and foreign business/listing requests fail.
- Booking remains an explicit UI approval, with identical customer and business records.

## Deployment boundary

The local app is the implemented target. A hosted instance needs persistent disk, a stable session secret, and HTTPS. Public accounts and external-assistant authentication are separate integrations; the current endpoint uses the existing private workspace session. `agentbridge.skill.v1` is AgentBridge's own interface, not a claim of MCP or A2A compatibility.


## Completion evidence

- Persistent records, immutable history, reopen survival, validation, version conflicts and ownership isolation: `tests/business-skills.test.ts` (17 tests) and actual local database inspection.
- Saved guidance reaching the live model and authoritative factual replies despite false history/no-tool completion: `tests/assistant.test.ts` (30 tests), plus real Nebius inquiry returning Bridge House's exact version-2 knowledge.
- Directory/manifests/invocation and transaction boundaries: four HTTP browser journeys.
- Phone skill save/reload, conflict recovery, focus and overflow: two phone editor journeys and inspected screenshots.
- Full booking lifecycle and retained active search: existing accommodation journeys plus availability-refresh regression. Both user and business views showed AB-761E8C1F for the approved local sample stay.
- Final unit suite: 64 passed. Browser suite: 15 passed. Typecheck, production build and whitespace checks passed. Secret audit passed. See `design-qa.md` for exact scope and remaining deployment/model limitations.
