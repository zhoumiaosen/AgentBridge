# Selected business chat: test booking

The selected connected business agent can search its own saved rooms, prepare an authoritative quote, and request approval inside the same conversation. All inventory and reservations remain local sample data. No external inventory or payment system is connected.

Use the existing business dispatcher and booking engine. Only a server-resolved connected business identity grants room tools; uploaded profiles, examples, and personal skills cannot acquire capabilities from their prose or owner name. The model may search, read details, and prepare a quote, but cannot confirm a reservation. Missing dates or guest details require a follow-up.

Save the current quote association with the selected conversation so it survives reopening. Return signed approval separately from the model context. A strict confirmation endpoint binds approval to the workspace, selected agent, and current quote, then reuses the engine's expiry, availability, price, and idempotency checks.

The phone chat shows the room, dates, guests, price breakdown, cancellation terms, and an explicit test-only notice. Approval starts unchecked and resets on a new quote or chat request. Confirmation creates a local test reservation, appears in the conversation, and refreshes Bookings/business state.

Verification covers own-business search, foreign room rejection, personal/unconnected restrictions, no confirmation tool, token and ownership checks, stale/expired quotes, repeated confirmation, persistence, and phone approval controls. Isolated tests exercise confirmation; the live Nebius user-workspace walkthrough stops at the unchecked quote so the user can approve it themselves. API credentials remain server-side and excluded from Git.

## Same-chat test cancellation

Extend the existing approval controls and local booking engine. A customer can request cancellation in the selected business conversation or choose Review test cancellation on its saved reservation. Both paths show the current reservation, cancellation terms, and an unchecked cancellation-specific approval box. Keep test booking closes the review. Sending a new message, reopening the conversation, changing reservation terms, or a failed cancellation clears consent. The current saved reservation supplies dates and price, even if it changed after the original quote.

The server issues a separate cancellation approval bound to workspace, selected business agent, reservation and current revision. The strict cancellation endpoint validates those bindings, checks the current conversation association and business ownership, serializes chat actions, and reuses the store's policy and date rules. Chat text and model tools cannot cancel a reservation. A retried completed cancellation returns its saved canceled state without canceling another booking.

Implementation and verification: add the scoped endpoint and canonical chat guidance with unit tests; add phone review and approval controls with browser regressions; verify forged, stale, cross-agent and cross-workspace requests cannot mutate data; then cancel only the explicitly authorized Bridge House test booking AB-54F5DD74 through the phone UI and verify canceled status in chat, customer Bookings and business Reservations. Earlier reservations remain unchanged. No real booking, charge or refund is connected.

## Same-chat test date changes

Reuse the existing quote engine's reservation replacement behavior and chat confirmation endpoint. List only the selected business's active reservations from the current workspace so customers can choose a booking, including one made outside this conversation. A date form sends its confirmation, proposed dates and unchanged guest count to the business chat; customers may also request a change in their message. Missing dates or ambiguous bookings require clarification. The model may prepare a scoped replacement quote, but cannot apply it.

Show the current dates and total beside proposed dates, itemized updated charges and price difference. A separate unchecked date-change approval control is required; Keep current dates hides the review without changing the saved booking. A new message, proposal, failed approval or reopening clears consent. The original reservation remains confirmed until the approved replacement commits.

Bind approval to the selected business, workspace and saved replacement quote using a distinct agent-change purpose. The quote stores the original reservation revision. Reuse atomic confirmation checks for original state, expiry, policy, listing terms and availability; preserve the reservation ID and confirmation number, and replace occupied nights without creating a second reservation. Reject ordinary booking approvals for date changes. Completed requests still refresh shared views if the chat closes while they finish.

Verify server scope, missing inputs, price/availability changes, stale original bookings, expired/wrong-purpose approval, no duplicate, persistence and both phone views. For the authorized test walkthrough, use active Bridge House booking AB-761E8C1F for two guests, extending November 24–26 to November 24–27, 2026 unless the user specifies different test dates. Verify the saved quote before approval and independently compare all other reservations afterward. Keep all activity local and test-only.

## Available dates after a conflict

When a valid date-change quote fails availability, check nearby starts within seven days on either side. Keep the original room, requested stay length and guest count. Suggest up to three available options, nearest first (earlier dates win ties), using saved inventory and the existing quote engine for prices. Show dates, nights, total and difference from the current booking. An unsuccessful search explains the conflict without inventing alternatives.

Persist suggested quotes with the selected conversation and original booking/profile revision. Selecting one through a strict `/chat/alternatives` request rechecks ownership, original terms and current availability, and creates a fresh quote with current prices. The selection does not confirm anything. It opens the existing date-change review with consent unchecked; only the separately signed confirmation can update the reservation. New proposals invalidate prior suggestions and approvals.

Verify deterministic availability and prices, stale/foreign suggestions, fresh pricing on selection, the explicit approval boundary, and both reservation views in isolated tests. In the real local workspace, request the conflicting November 18–20 dates for AB-761E8C1F, inspect alternatives and select a quote for review only. Keep its November 24–27 stay unchanged, with approval unchecked.
