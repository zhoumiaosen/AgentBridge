"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import type { LibrarySkill } from "./skills-library";
import type { BusinessListing, BusinessQuote } from "@/lib/business-skills";
import type { Reservation } from "@/lib/store";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = {
  agent: LibrarySkill; messages: Message[]; mode: "live" | "unavailable";
  testOnly: true; canBook: boolean; listings?: BusinessListing[];
  quote?: BusinessQuote; approval?: string; reservation?: Reservation;
  cancellation?: { reservationId: string; revision: string; approval: string };
  cancellationRequested?: boolean;
  reservations?: Reservation[];
  dateChangePending?: boolean;
  dateAlternatives?: BusinessQuote[];
};
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function DateChangeForm({ reservation, busy, onReview, onKeep }: { reservation: Reservation; busy: boolean; onReview: (checkIn: string, checkOut: string) => Promise<void>; onKeep: () => void }) {
  const [checkIn, setCheckIn] = useState(reservation.checkIn);
  const [checkOut, setCheckOut] = useState(reservation.checkOut);
  return <form className="agent-date-form" onSubmit={event => {
    event.preventDefault();
    // Submit the visible control values, including native date-picker and autofill edits.
    const values = new FormData(event.currentTarget);
    const start = String(values.get("checkIn") || ""), end = String(values.get("checkOut") || "");
    if (!busy && start && end > start) void onReview(start, end);
  }}>
    <h3>Choose new dates</h3>
    <p>{reservation.listingName}<br />{reservation.confirmation} · {reservation.guests} guests</p>
    <p>Your current dates stay confirmed until you review the updated price and approve.</p>
    <label>New check-in<input name="checkIn" type="date" required value={checkIn} onChange={event => setCheckIn(event.target.value)} disabled={busy} /></label>
    <label>New check-out<input name="checkOut" type="date" required min={checkIn} value={checkOut} onChange={event => setCheckOut(event.target.value)} disabled={busy} /></label>
    <button type="submit" className="primary-button full-button" disabled={busy || !checkIn || checkOut <= checkIn}>{busy ? "Preparing updated price…" : "Review updated price"}</button>
    <button type="button" className="outline-button full-button" disabled={busy} onClick={onKeep}>Keep current dates</button>
  </form>;
}

export default function AgentConversation({ initialAgent, onBack, onReservationChange }: { initialAgent: LibrarySkill; onBack: () => void; onReservationChange?: () => void }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [approvedQuoteId, setApprovedQuoteId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [approvedCancellation, setApprovedCancellation] = useState<string | null>(null);
  const [loadingCancellation, setLoadingCancellation] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancellationError, setCancellationError] = useState("");
  const [dateChangeBooking, setDateChangeBooking] = useState<Reservation | null>(null);
  const [dismissedDateQuote, setDismissedDateQuote] = useState<string | null>(null);
  const [selectingAlternative, setSelectingAlternative] = useState<string | null>(null);
  const [alternativeError, setAlternativeError] = useState("");
  const [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const confirmationKey = useRef<{ quoteId: string; key: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const bookingCard = useRef<HTMLElement>(null);
  const cancellationCard = useRef<HTMLElement>(null);
  const activeBookingsCard = useRef<HTMLElement>(null);
  const dateChangeForm = useRef<HTMLElement>(null);
  const alternativesCard = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const agent = conversation?.agent || initialAgent;
  const path = `/api/skills/${encodeURIComponent(initialAgent.id)}/chat`;
  const quote = conversation?.testOnly && conversation.canBook ? conversation.quote : undefined;
  const reservation = conversation?.testOnly && conversation.canBook ? conversation.reservation : undefined;
  const stay = reservation || quote;
  const activeBookings = conversation?.testOnly && conversation.canBook ? conversation.reservations || [] : [];
  const changingDates = conversation?.dateChangePending === true && !!quote?.reservationId && quote.reservationId === reservation?.id && reservation.status === "confirmed";
  const showDateChange = changingDates && dismissedDateQuote !== quote?.id && !dateChangeBooking && !cancellationOpen;
  const dateAlternatives = conversation?.testOnly && conversation.canBook && reservation?.status === "confirmed"
    ? (conversation.dateAlternatives || []).filter(option => option.reservationId === reservation.id) : [];
  const showAlternatives = dateAlternatives.length > 0 && !dateChangeBooking && !cancellationOpen && !showDateChange;
  const cancellation = reservation?.status === "confirmed" && conversation?.cancellation?.reservationId === reservation.id && conversation.cancellation.approval && conversation.cancellation.revision ? conversation.cancellation : undefined;
  const cancellationKey = cancellation ? `${cancellation.reservationId}:${cancellation.revision}` : null;
  const busy = loading || sending || confirming || loadingCancellation || canceling || !!selectingAlternative;
  const secondsLeft = quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - now) / 1000)) : 0;
  const expired = !Number.isFinite(secondsLeft) || secondsLeft <= 0;
  const canConfirm = !!quote && (!reservation || (showDateChange && reservation.status === "confirmed")) && !!conversation?.approval && !expired && conversation.testOnly === true && conversation.canBook;

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    let active = true;
    setLoading(true); setError("");
    fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this conversation.");
        if (active) setConversation(data);
      })
      .catch(err => { if (active && !controller.signal.aborted) setError(err.message || "Could not load this conversation."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; request.current?.abort(); };
  }, [path, retry]);
  useEffect(() => {
    if (dateChangeBooking) dateChangeForm.current?.scrollIntoView({ block: "start" });
    else if (cancellationOpen && !sending) cancellationCard.current?.scrollIntoView({ block: "start" });
    else if (showAlternatives && !sending) alternativesCard.current?.scrollIntoView({ block: "start" });
    else if (reservation?.status === "canceled" && activeBookings.length) activeBookingsCard.current?.scrollIntoView({ block: "start" });
    else if ((quote || reservation) && !sending) bookingCard.current?.scrollIntoView({ block: "start" });
    else end.current?.scrollIntoView({ block: "nearest" });
  }, [conversation?.messages.length, quote?.id, reservation?.id, reservation?.status, sending, cancellationOpen, dateChangeBooking, showDateChange, showAlternatives, activeBookings.length]);
  useEffect(() => { setApprovedCancellation(null); }, [cancellationKey]);
  useEffect(() => {
    setApprovedQuoteId(null); setQuoteError(""); setNow(Date.now());
    if (!quote || (reservation && !changingDates)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote?.id, quote?.expiresAt, reservation?.id, changingDates]);

  const sendMessage = async (text: string, clearDraft = true, quoteListingId?: string) => {
    if (busy || !text.trim() || conversation?.mode !== "live") return false;
    const controller = new AbortController();
    request.current = controller;
    setSending(true); setError(""); setApprovedQuoteId(null); setApprovedCancellation(null); setCancellationError(""); setCancellationOpen(false); setAlternativeError("");
    try {
      const response = await fetch(path, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), ...(quoteListingId ? { quoteListingId } : {}) }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send your message. Please retry.");
      if (controller.signal.aborted) return false;
      setConversation(data); if (clearDraft) setDraft("");
      setCancellationOpen(data.testOnly === true && data.canBook === true && data.cancellationRequested === true && data.reservation?.status === "confirmed" && data.cancellation?.reservationId === data.reservation.id);
      if (!data.quote && !data.dateAlternatives?.length) input.current?.focus({ preventScroll: true });
      return true;
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not send your message. Please retry.");
      return false;
    } finally { if (!controller.signal.aborted) setSending(false); }
  };
  const send = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void sendMessage(draft); };
  const selectAlternative = async (alternative: BusinessQuote) => {
    if (busy || !showAlternatives || !reservation) return;
    const controller = new AbortController();
    request.current = controller;
    setSelectingAlternative(alternative.id); setAlternativeError(""); setApprovedQuoteId(null); setApprovedCancellation(null);
    try {
      const response = await fetch(`${path}/alternatives`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: alternative.id }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not review these dates. Ask the agent for fresh alternatives.");
      if (controller.signal.aborted) return;
      if (data.testOnly !== true || data.canBook !== true || data.agent?.id !== agent.id || data.dateChangePending !== true || data.reservation?.id !== reservation.id || data.reservation?.status !== "confirmed" || data.quote?.reservationId !== reservation.id || data.quote?.listingId !== alternative.listingId || data.quote?.checkIn !== alternative.checkIn || data.quote?.checkOut !== alternative.checkOut || data.quote?.guests !== alternative.guests)
        throw new Error("The updated quote could not be verified. Reopen the conversation to review the saved status. Your booking has not been changed by this request.");
      setConversation(data); setDismissedDateQuote(null); setDateChangeBooking(null); setCancellationOpen(false);
    } catch (err) {
      if (!controller.signal.aborted) setAlternativeError(err instanceof Error ? err.message : "Could not review these dates. Ask for fresh alternatives.");
    } finally { if (!controller.signal.aborted) setSelectingAlternative(null); }
  };
  const confirm = async () => {
    if (!quote || !canConfirm || approvedQuoteId !== quote.id || busy) return;
    if (confirmationKey.current?.quoteId !== quote.id) confirmationKey.current = { quoteId: quote.id, key: crypto.randomUUID() };
    const controller = new AbortController();
    // Keep approved mutations running after chat close so shared reservation views refresh.
    request.current = null;
    setConfirming(true); setQuoteError("");
    try {
      const response = await fetch(`${path}/confirm`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ quoteId: quote.id, approval: conversation!.approval, approved: true, idempotencyKey: confirmationKey.current.key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not confirm this test booking. Please review the quote and retry.");
      if (controller.signal.aborted) return;
      if (data.testOnly !== true || !data.reservation?.confirmation) throw new Error("The test booking status could not be verified. Reopen this conversation to check its saved status before trying again.");
      if (changingDates && (data.canBook !== true || data.agent?.id !== agent.id || data.dateChangePending === true || data.reservation.id !== reservation?.id || data.reservation.confirmation !== reservation?.confirmation || data.reservation.status !== "confirmed" || data.reservation.checkIn !== quote.checkIn || data.reservation.checkOut !== quote.checkOut || data.reservation.guests !== quote.guests || data.reservation.totalCents !== quote.totalCents)) throw new Error("The date change could not be verified. Reopen this conversation to check its saved status before trying again.");
      setConversation(data); setApprovedQuoteId(null); onReservationChange?.();
    } catch (err) {
      if (!controller.signal.aborted) {
        setApprovedQuoteId(null);
        setQuoteError(err instanceof Error ? err.message : "Could not confirm this test booking. Please review the quote and retry.");
      }
    } finally { if (!controller.signal.aborted) setConfirming(false); }
  };
  const reviewCancellation = async () => {
    if (busy || reservation?.status !== "confirmed") return;
    const controller = new AbortController();
    request.current = controller;
    setLoadingCancellation(true); setCancellationError(""); setApprovedCancellation(null); setCancellationOpen(false);
    try {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not review this test cancellation.");
      if (controller.signal.aborted) return;
      if (data.testOnly !== true || data.canBook !== true || data.agent?.id !== agent.id || !data.reservation) throw new Error("The saved test reservation could not be verified. Reopen this conversation to check its status.");
      setConversation(data);
      if (data.reservation.status === "canceled") { onReservationChange?.(); return; }
      if (!data.cancellation?.approval || data.cancellation.reservationId !== data.reservation.id) throw new Error("Cancellation is unavailable for this reservation. Check its policy and check-in date.");
      setCancellationOpen(true);
    } catch (err) {
      if (!controller.signal.aborted) setCancellationError(err instanceof Error ? err.message : "Could not review this test cancellation.");
    } finally { if (!controller.signal.aborted) setLoadingCancellation(false); }
  };
  const cancelReservation = async () => {
    if (busy || !cancellationOpen || !cancellation || !cancellationKey || approvedCancellation !== cancellationKey || !reservation) return;
    const controller = new AbortController();
    // Finish an approved cancellation after chat close so both reservation views still refresh.
    request.current = null;
    setCanceling(true); setCancellationError("");
    try {
      const response = await fetch(`${path}/cancel`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ reservationId: cancellation.reservationId, revision: cancellation.revision, approval: cancellation.approval, approved: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not cancel this test booking. Review it again before retrying.");
      if (controller.signal.aborted) return;
      if (data.testOnly !== true || data.canBook !== true || data.agent?.id !== agent.id || data.reservation?.id !== reservation.id || data.reservation?.confirmation !== reservation.confirmation || data.reservation?.status !== "canceled") throw new Error("Cancellation could not be verified. Review the saved reservation again before retrying.");
      setConversation(data); onReservationChange?.();
    } catch (err) {
      if (!controller.signal.aborted) setCancellationError(err instanceof Error ? err.message : "Could not cancel this test booking. Review it again before retrying.");
    } finally {
      if (!controller.signal.aborted) { setCanceling(false); setApprovedCancellation(null); setCancellationOpen(false); }
    }
  };

  return <div className="agent-conversation">
    <header className="agent-chat-heading">
      <button className="text-button agent-chat-back" onClick={onBack}><ArrowLeft size={18} />Back to Agent Hub</button>
      <span className="eyebrow">{agent.ownerType === "business" ? "Business agent" : "Personal AI"}{agent.source === "example" ? " · Example" : ""}</span>
      <h2 id="library-dialog-title">{agent.name}</h2>
      <p>{agent.ownerName} · {agent.category}</p>
      <small>{conversation?.mode === "live" ? "Powered by Nebius · Uses this saved profile" : loading ? "Opening your saved conversation…" : "Live AI unavailable"} · Version {agent.version}</small>
      {conversation?.canBook && <span className="agent-test-label">Test only · No real bookings or payments</span>}
    </header>
    <div className="agent-chat-messages" role="log" aria-label={`Conversation with ${agent.name}`} aria-live="polite" aria-busy={loading || sending}>
      {loading ? <p className="agent-chat-status" role="status">Loading conversation…</p> : !conversation?.messages.length ? <div className="agent-chat-welcome"><h3>How can I help?</h3><p>{agent.summary || "Ask a question about this agent’s services or preferences."}</p></div> : conversation.messages.map((message, index) => <div key={index} className={`agent-chat-message ${message.role}`}><span>{message.role === "user" ? "You" : agent.name}</span><p>{message.content}</p></div>)}
      {sending && <p className="agent-chat-status" role="status">Thinking about your message…</p>}
      {!loading && conversation?.canBook && conversation.listings && <section className="agent-room-results" aria-label="Rooms from this business">
        <h3>Rooms from {agent.name}</h3>
        {conversation.listings.length ? conversation.listings.map(room => <article className="agent-room-card" key={room.id}>
          <h4>{room.name}</h4><p>{room.neighborhood} · Up to {room.maxGuests} guests</p>
          <p>{money(room.nightlyCents)} / night · {money(room.cleaningCents)} cleaning</p>
          <button className="outline-button" disabled={busy || conversation.mode !== "live"} onClick={() => void sendMessage("Please prepare a test quote for the selected room using the dates and guest count we discussed. Ask me for any missing details.", false, room.id)}>Prepare quote for {room.name}</button>
        </article>) : <p>No rooms matched this search. Try other dates or preferences.</p>}
      </section>}
      {!loading && activeBookings.length > 0 && <section ref={activeBookingsCard} className="agent-room-results" aria-label="Your bookings with this business">
        <h3>Your bookings with {agent.name}</h3>
        {activeBookings.map(booking => <article className="agent-room-card" key={booking.id}>
          <h4>{booking.listingName}</h4>
          <p>{dateLabel(booking.checkIn)} – {dateLabel(booking.checkOut)}<br />{booking.guests} guests · {money(booking.totalCents)}<br />{booking.confirmation}</p>
          <button className="outline-button" disabled={busy || booking.cancellation !== "flexible" || conversation?.mode !== "live"} onClick={() => { setDateChangeBooking(booking); setApprovedQuoteId(null); setApprovedCancellation(null); setCancellationOpen(false); setError(""); }}>Change dates for {booking.confirmation}</button>
        </article>)}
      </section>}
      {!loading && dateChangeBooking && <section ref={dateChangeForm} className="agent-test-quote" aria-label="Test date change form">
        <span className="agent-test-label">Test only · No real bookings or payments</span>
        <DateChangeForm key={dateChangeBooking.id} reservation={dateChangeBooking} busy={busy} onKeep={() => setDateChangeBooking(null)} onReview={async (checkIn, checkOut) => {
          const sent = await sendMessage(`Prepare a test date-change quote for booking ${dateChangeBooking.confirmation}, check-in ${checkIn}, check-out ${checkOut}, keeping ${dateChangeBooking.guests} guests. Do not apply the change until I approve it.`, false);
          if (sent) setDateChangeBooking(null);
        }} />
      </section>}
      {!loading && showAlternatives && reservation && <section ref={alternativesCard} className="agent-test-quote agent-date-alternatives" aria-label="Available date alternatives">
        <span className="agent-test-label">Test only · No real bookings or payments</span>
        <h3>Available nearby dates</h3>
        <p className="agent-quote-policy">Those dates are unavailable. These options keep the same room, guest count and requested stay length.</p>
        <p className="agent-alternative-current"><strong>Your booking is unchanged</strong><br />{dateLabel(reservation.checkIn)} – {dateLabel(reservation.checkOut)}<br />{reservation.nights} {reservation.nights === 1 ? "night" : "nights"} · {reservation.guests} guests · {money(reservation.totalCents)}<br />{reservation.confirmation}</p>
        {dateAlternatives.map(option => <article key={option.id} className="agent-room-card">
          <h4>{dateLabel(option.checkIn)} – {dateLabel(option.checkOut)}</h4>
          <p>{option.nights} {option.nights === 1 ? "night" : "nights"} · {option.guests} guests · {option.listingName}</p>
          <p className="agent-alternative-price"><strong>{money(option.totalCents)} total</strong><br />{option.totalCents === reservation.totalCents ? "Same total as your current booking" : `${money(Math.abs(option.totalCents - reservation.totalCents))} ${option.totalCents < reservation.totalCents ? "less" : "more"} than your current booking`}</p>
          <p>Includes {money(option.cleaningCents)} cleaning. Taxes included.</p>
          <button className="outline-button" aria-label={`Review alternative for ${option.checkIn} to ${option.checkOut}`} disabled={busy} onClick={() => void selectAlternative(option)}>{selectingAlternative === option.id ? "Checking these dates…" : "Review these dates"}</button>
        </article>)}
        <p className="agent-quote-policy">Choose an option to check its latest price and availability. You’ll review and approve it separately. Your current booking stays confirmed until then.</p>
        {alternativeError && <div className="modal-error" role="alert">{alternativeError}</div>}
      </section>}
      {!loading && showDateChange && quote && reservation && <section ref={bookingCard} className="agent-test-quote" aria-label="Test date change quote">
        <span className="agent-test-label">Test only · No real bookings or payments</span>
        <h3>Review test date change</h3>
        <h4>{quote.listingName}</h4><p className="agent-quote-business">{reservation.confirmation} · {quote.guests} guests</p>
        <dl className="agent-quote-details">
          <div><dt>Current dates</dt><dd>{dateLabel(reservation.checkIn)}<br />to {dateLabel(reservation.checkOut)}</dd></div>
          <div><dt>Current total</dt><dd>{money(reservation.totalCents)}</dd></div>
          <div><dt>New dates</dt><dd>{dateLabel(quote.checkIn)}<br />to {dateLabel(quote.checkOut)}</dd></div>
          <div><dt>{money(quote.nightlyCents)} × {quote.nights} nights</dt><dd>{money(quote.nightlyCents * quote.nights)}</dd></div>
          <div><dt>Cleaning fee</dt><dd>{money(quote.cleaningCents)}</dd></div>
          <div><dt>Taxes</dt><dd>Included in nightly rate</dd></div>
          <div className="agent-quote-total"><dt>Updated total · USD</dt><dd>{money(quote.totalCents)}</dd></div>
          <div><dt>Price difference</dt><dd>{quote.totalCents > reservation.totalCents ? "+" : quote.totalCents < reservation.totalCents ? "−" : ""}{money(Math.abs(quote.totalCents - reservation.totalCents))}</dd></div>
        </dl>
        <p className="agent-quote-policy">{quote.cancellation === "flexible" ? "Free cancellation before check-in." : "Cancellation and date changes are not available for this stay."}</p>
        <p className="agent-quote-policy">Your original booking stays confirmed until approval. No real booking, payment or refund will occur.</p>
        <p className="agent-quote-expiry">{expired ? "This quote has expired. Request an updated price." : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}. Price and availability are checked again at approval.`}</p>
        {!conversation?.approval && !expired && <p className="agent-quote-policy">Approval is unavailable. Request an updated price.</p>}
        {quoteError && <div className="modal-error" role="alert">{quoteError}<p>Request an updated price if the dates or terms have changed.</p></div>}
        <label className="approval-check"><input type="checkbox" checked={approvedQuoteId === quote.id} onChange={event => setApprovedQuoteId(event.target.checked ? quote.id : null)} disabled={!canConfirm || busy} /><span>I approve this test date change</span></label>
        <button className="primary-button full-button" disabled={!canConfirm || approvedQuoteId !== quote.id || busy} onClick={confirm}>{confirming ? "Updating test booking…" : "Confirm test date change"}</button>
        <button className="outline-button full-button" disabled={busy} onClick={() => { setDismissedDateQuote(quote.id); setApprovedQuoteId(null); }}>Keep current dates</button>
      </section>}
      {!loading && stay && !showDateChange && !showAlternatives && <section ref={bookingCard} className="agent-test-quote" aria-label="Test booking quote">
        <span className="agent-test-label">Test only · No real bookings or payments</span>
        <h3>{reservation ? reservation.status === "canceled" ? "Test booking canceled" : "Test booking confirmed" : "Test quote"}</h3>
        <h4>{stay.listingName}</h4><p className="agent-quote-business">Prepared by {quote?.businessName || agent.name}</p>
        {reservation && <p className="agent-test-confirmation" role="status">Confirmation: <strong>{reservation.confirmation}</strong><br />{reservation.status === "canceled" ? "This local test reservation was canceled. Ask for a new quote to book again." : "Saved only in this sample workspace."} No real reservation or payment was made.</p>}
        <dl className="agent-quote-details">
          <div><dt>Check-in</dt><dd>{dateLabel(stay.checkIn)}</dd></div>
          <div><dt>Check-out</dt><dd>{dateLabel(stay.checkOut)}</dd></div>
          <div><dt>Guests</dt><dd>{stay.guests}</dd></div>
          <div><dt>{money(stay.nightlyCents)} × {stay.nights} {stay.nights === 1 ? "night" : "nights"}</dt><dd>{money(stay.nightlyCents * stay.nights)}</dd></div>
          <div><dt>Cleaning fee</dt><dd>{money(stay.cleaningCents)}</dd></div>
          <div><dt>Taxes</dt><dd>Included in nightly rate</dd></div>
          <div className="agent-quote-total"><dt>Total · USD</dt><dd>{money(stay.totalCents)}</dd></div>
        </dl>
        <p className="agent-quote-policy">{stay.cancellation === "flexible" ? "Free cancellation before check-in." : "Cancellation and date changes are not available for this stay."}</p>
        {cancellationError && <div className="modal-error" role="alert">{cancellationError}</div>}
        {reservation?.status === "confirmed" && !cancellationOpen && <button className="outline-button full-button" disabled={busy} onClick={reviewCancellation}>{loadingCancellation ? "Reviewing cancellation…" : "Review test cancellation"}</button>}
        {cancellationOpen && cancellation && reservation && <section ref={cancellationCard} aria-label="Test cancellation review" className="agent-cancellation-review">
          <h3>Cancel this test booking?</h3>
          <p><strong>{reservation.listingName}</strong><br />{dateLabel(reservation.checkIn)} – {dateLabel(reservation.checkOut)}<br />{reservation.guests} guests · {reservation.confirmation}</p>
          <p>Free cancellation. This releases the room in this sample workspace. No real booking, charge, or refund will occur.</p>
          <label className="approval-check"><input type="checkbox" checked={approvedCancellation === cancellationKey} onChange={event => setApprovedCancellation(event.target.checked ? cancellationKey : null)} disabled={busy} /><span>I approve this test cancellation</span></label>
          <button className="primary-button full-button" disabled={busy || approvedCancellation !== cancellationKey} onClick={cancelReservation}>{canceling ? "Canceling test booking…" : "Confirm test cancellation"}</button>
          <button className="outline-button full-button" disabled={busy} onClick={() => { setCancellationOpen(false); setApprovedCancellation(null); }}>Keep test booking</button>
        </section>}
        {!reservation && quote && <>
          <p className="agent-quote-expiry" aria-live="off">{expired ? "This quote has expired. Ask for a new quote." : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}. Availability is checked again at confirmation.`}</p>
          {!conversation?.approval && !expired && <p className="agent-quote-policy">Approval is unavailable for this quote. Ask the agent for a fresh quote.</p>}
          {quoteError && <div className="modal-error" role="alert">{quoteError}<p>Review the details before trying again. If availability or terms changed, ask for a new quote.</p></div>}
          <label className="approval-check"><input type="checkbox" checked={approvedQuoteId === quote.id} onChange={event => setApprovedQuoteId(event.target.checked ? quote.id : null)} disabled={!canConfirm || sending || confirming} /><span>I approve this test booking</span></label>
          <p className="agent-quote-policy">Approving creates a local test reservation at the total and cancellation terms above.</p>
          <button className="primary-button full-button" disabled={!canConfirm || approvedQuoteId !== quote.id || sending || confirming} onClick={confirm}>{confirming ? "Confirming test booking…" : "Confirm test booking"}</button>
        </>}
      </section>}
      <div ref={end} />
    </div>
    <div className="agent-chat-compose">
      {error && <div className="modal-error" role="alert">{error}{!conversation && !loading && <button className="text-button" onClick={() => setRetry(value => value + 1)}>Retry conversation</button>}</div>}
      {!loading && conversation?.mode === "unavailable" && <p className="agent-chat-status">Live AI needs a working server connection. Your saved profile and messages are still here.<button className="text-button" onClick={() => setRetry(value => value + 1)}>Check connection</button></p>}
      <form onSubmit={send}>
        <label className="sr-only" htmlFor="selected-agent-message">Message selected agent</label>
        <textarea ref={input} id="selected-agent-message" aria-label="Message selected agent" value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Ask ${agent.name}…`} maxLength={2000} rows={2} disabled={busy || conversation?.mode !== "live"} />
        <button className="primary-button" type="submit" aria-label="Send message" disabled={busy || !draft.trim() || conversation?.mode !== "live"}><ArrowUp size={20} /><span className="sr-only">Send message</span></button>
      </form>
      <p className="agent-chat-note">{conversation?.canBook ? "Search rooms and manage your test booking here. Booking, date changes and cancellation always need your explicit approval." : "Advice based on this profile. No booking, payment, or external action happens in this chat."}</p>
    </div>
  </div>;
}
