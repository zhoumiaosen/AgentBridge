"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SkillsLibrary from "./skills-library";
import { BooksIcon as Books } from "@phosphor-icons/react/dist/csr/Books";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { MagnifyingGlassIcon as Search } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { CompassIcon as Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { BuildingsIcon as Building2 } from "@phosphor-icons/react/dist/csr/Buildings";
import { CalendarDotsIcon as CalendarDays } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { GlobeHemisphereWestIcon as Globe2 } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { WifiHighIcon as Wifi } from "@phosphor-icons/react/dist/csr/WifiHigh";
import { LeafIcon as Leaf } from "@phosphor-icons/react/dist/csr/Leaf";
import { CaretRightIcon as ChevronRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { LinkIcon as Link2 } from "@phosphor-icons/react/dist/csr/Link";
import { SparkleIcon as Sparkles } from "@phosphor-icons/react/dist/csr/Sparkle";
import { ClockIcon as Clock3 } from "@phosphor-icons/react/dist/csr/Clock";
import { CheckCircleIcon as CheckCircle2 } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ChatCircleIcon as MessageCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { ArrowSquareOutIcon as ExternalLink } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { BookmarkSimpleIcon as Bookmark } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { SlidersIcon as Settings2 } from "@phosphor-icons/react/dist/csr/Sliders";
import { CaretDownIcon as ChevronDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { ArrowRightIcon as MoveRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { HouseIcon as LayoutDashboard } from "@phosphor-icons/react/dist/csr/House";
import { StorefrontIcon as Store } from "@phosphor-icons/react/dist/csr/Storefront";

type Listing = {
  id: string;
  name: string;
  hostName: string;
  businessName?: string;
  type: string;
  neighborhood: string;
  description: string;
  nightlyCents: number;
  cleaningCents: number;
  maxGuests: number;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  cancellation: string;
  image: string;
  availableFrom: string;
  availableTo: string;
};
type Quote = {
  id: string;
  listingId: string;
  listingName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  nightlyCents: number;
  cleaningCents: number;
  totalCents: number;
  cancellation: string;
  expiresAt: string | number;
  reservationId?: string;
  businessName?: string;
};
type BusinessSkill = {
  id: string;
  name: string;
  category: "accommodation";
  listingIds: string[];
  capabilities: string[];
  requiresApproval: true;
  version: number;
  summary: string;
  knowledge: string;
  updatedAt: string;
  schemaVersion: "1.0";
};
type Reservation = Quote & {
  confirmation: string;
  status: string;
  createdAt: string;
};
type Message = { role: string; content: string };
type AgentMatch = { id: string; name: string; ownerName: string; summary: string; kind: "agent" | "skill" };
type Preferences = { budget: number; roomType: string; amenities: string[] };
type Trace = { tool: string; detail: string };
type SearchCriteria = {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  maxNightlyCents?: number;
  amenities?: string[];
  type?: string;
};
const workspaceViews = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "host", label: "Listings", icon: Store },
  { id: "discover", label: "Assistant", icon: Sparkles },
  { id: "trips", label: "Bookings", icon: CalendarDays },
  { id: "skills", label: "Agent Hub", icon: Books },
  { id: "vision", label: "Network vision", icon: Globe2 },
];
const photos = [
  "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&auto=format&fit=crop&q=85",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1000&auto=format&fit=crop&q=85",
  "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1000&auto=format&fit=crop&q=85",
];
const money = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: c % 100 ? 2 : 0,
  }).format(c / 100);
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateLabel = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
async function api(action: string, body?: unknown) {
  const res = await fetch(
    `/api/actions/${action}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <Link2 size={small ? 17 : 23} />
      </span>
      {!small && (
        <>
          Agent<span>Bridge</span>
        </>
      )}
    </span>
  );
}
function Photo({ listing, index = 0 }: { listing: Listing; index?: number }) {
  return (
    <img
      src={
        listing.image?.startsWith("https://images.unsplash.com/")
          ? listing.image
          : photos[index % 3]
      }
      alt={`${listing.name} — illustrative room photograph`}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
function BusyIndicator() {
  return <span className="loading-inline" aria-hidden="true"><span /><span /><span /></span>;
}
export default function AgentBridge() {
  const [view, setView] = useState("home"),
    [menuOpen, setMenuOpen] = useState(false),
    [loaded, setLoaded] = useState(false),
    [all, setAll] = useState<Listing[]>([]),
    [listings, setListings] = useState<Listing[]>([]),
    [businesses, setBusinesses] = useState<BusinessSkill[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [prefs, setPrefs] = useState<Preferences>({
      budget: 180,
      roomType: "any",
      amenities: [],
    }),
    [mode, setMode] = useState("demo");
  const [checkIn, setCheckIn] = useState(day(12)),
    [checkOut, setCheckOut] = useState(day(14)),
    [guests, setGuests] = useState(1),
    [budget, setBudget] = useState(250),
    [kind, setKind] = useState("all"),
    [amenity, setAmenity] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [trace, setTrace] = useState<Trace[]>([]);
  const [modal, setModal] = useState<
      "host" | "preferences" | "quote" | "details" | "cancel" | "change" | "skill" | null
    >(null),
    [selected, setSelected] = useState<Listing | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [revision, setRevision] = useState(""),
    [approval, setApproval] = useState(""),
    [key, setKey] = useState(""),
    [approved, setApproved] = useState(false),
    [activeTrip, setActiveTrip] = useState<Reservation | null>(null),
    [itinerary, setItinerary] = useState<string | null>(null);
  const [hostType, setHostType] = useState("private"),
    [hostAmenities, setHostAmenities] = useState(["Wi-Fi"]),
    [prefDraft, setPrefDraft] = useState(prefs);
  const [agentMatches, setAgentMatches] = useState<AgentMatch[]>([]);
  const [openAgentId, setOpenAgentId] = useState<string>();
  const [editingSkill, setEditingSkill] = useState<BusinessSkill | null>(null),
    [skillSummary, setSkillSummary] = useState(""),
    [skillKnowledge, setSkillKnowledge] = useState("");
  const activeSearch = useRef<SearchCriteria>({
    checkIn, checkOut, guests, maxNightlyCents: budget * 100, amenities: [],
  });
  const chatBottom = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  const previousView = useRef(view);
  const initialized = useRef(false);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  };
  const refresh = async () => {
    const d = await api("state");
    const matches = await api("search", activeSearch.current);
    setAll(d.listings);
    setListings(matches.listings);
    setBusinesses(d.businesses || []);
    setReservations(d.reservations);
    setPrefs(d.preferences);
    setMessages(d.messages);
    setMode(d.mode);
    setLoaded(true);
  };
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const restoreView = () => {
      const id = window.location.hash.slice(1);
      setView(workspaceViews.some((item) => item.id === id) ? id : "home");
    };
    restoreView();
    window.addEventListener("hashchange", restoreView);
    return () => window.removeEventListener("hashchange", restoreView);
  }, []);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, busy]);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    const heading = main.current?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [view]);
  useEffect(() => {
    if (!loaded) return;
    const elements = main.current?.querySelectorAll<HTMLElement>(".reveal-item") || [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [loaded, view]);
  useEffect(() => {
    if (!modal && !menuOpen) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !active.closest(".workspace-menu, .modal")) {
      overlayTrigger.current = active;
    }
    const previous = overlayTrigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    };
    dialog?.addEventListener('keydown',trap);
    return () => { dialog?.removeEventListener('keydown',trap);document.body.style.overflow = overflow;if(previous?.isConnected)previous.focus(); };
  }, [modal, menuOpen]);
  const nav = (v: string) => {
    setView(v);
    setMenuOpen(false);
    window.location.hash = v;
    setError("");
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  };
  const search = () =>
    run("search", async () => {
      const criteria = {
        checkIn,
        checkOut,
        guests,
        maxNightlyCents: budget * 100,
        amenities: amenity ? [amenity] : [],
      };
      const d = await api("search", criteria);
      activeSearch.current = criteria;
      setListings(d.listings);
      nav("discover");
    });
  const send = async (text = message) => {
    if (!text.trim() || busy) return;
    const pendingMessage: Message = { role: "user", content: text.trim() };
    setMessage("");
    setApproved(false);
    setApproval("");
    setAgentMatches([]);
    nav("discover");
    setMessages((m) => [...m, pendingMessage]);
    await run("assistant", async () => {
      let d;
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: pendingMessage.content }),
        });
        d = await res.json();
        if (!res.ok) throw new Error(d.error || "The assistant could not respond. Please try again.");
        if (typeof d.reply !== "string" || !d.reply.trim()) throw new Error("The assistant returned an incomplete reply. Please try again.");
      } catch (error) {
        setMessages((current) => current.filter(item => item !== pendingMessage));
        setMessage(text);
        throw error;
      }
      setMessages((m) => [...m, { role: "assistant", content: d.reply }]);
      setTrace(d.trace || []);
      setAgentMatches(d.agents || []);
      if (d.listings) {
        if (d.searchCriteria) {
          activeSearch.current = d.searchCriteria;
          setAmenity(d.searchCriteria.amenities?.length === 1 ? d.searchCriteria.amenities[0] : "");
        }
        setListings(d.listings);
      }
      if (d.searchCriteria?.checkIn) setCheckIn(d.searchCriteria.checkIn);
      if (d.searchCriteria?.checkOut) setCheckOut(d.searchCriteria.checkOut);
      if (d.searchCriteria?.guests) setGuests(d.searchCriteria.guests);
      if (d.searchCriteria?.maxNightlyCents)
        setBudget(d.searchCriteria.maxNightlyCents / 100);
      if (d.searchCriteria?.type)
        setKind(
          d.searchCriteria.type === "any" ? "all" : d.searchCriteria.type,
        );
      if (d.quote) {
        setQuote(d.quote);
        setApproval(d.approval);
        setKey(crypto.randomUUID());
        setApproved(false);
        setCheckIn(d.quote.checkIn);
        setCheckOut(d.quote.checkOut);
        setGuests(d.quote.guests);
        setSelected(all.find((l) => l.id === d.quote.listingId) || null);
        setModal("quote");
      }
      setMode(d.mode);
    });
  };
  const getQuote = (l: Listing, reservation?: Reservation) =>
    run("quote", async () => {
      const d = await api("quote", {
        listingId: l.id,
        checkIn,
        checkOut,
        guests: reservation?.guests || guests,
        ...(reservation ? { reservationId: reservation.id } : {}),
      });
      setSelected(l);
      setQuote(d.quote);
      setApproval(d.approval);
      setKey(crypto.randomUUID());
      setApproved(false);
      setModal("quote");
    });
  const confirm = () =>
    run("confirm", async () => {
      const d = await api("confirm", {
        quoteId: quote?.id,
        approval,
        idempotencyKey: key,
        approved,
      });
      if (quote) activeSearch.current = {
        ...activeSearch.current,
        checkIn: quote.checkIn,
        checkOut: quote.checkOut,
        guests: quote.guests,
      };
      await refresh();
      setModal(null);
      setActiveTrip(d.reservation);
      nav("trips");
      notify(
        quote?.reservationId
          ? "Your dates have been updated."
          : "Your stay is confirmed. No payment has been taken.",
      );
    });
  const prepareCancel = (r: Reservation) =>
    run("cancel-prepare", async () => {
      const d = await api("prepare-cancel", { reservationId: r.id });
      setActiveTrip(d.reservation);
      setRevision(d.revision);
      setApproval(d.approval);
      setApproved(false);
      setModal("cancel");
    });
  const cancel = () =>
    run("cancel", async () => {
      await api("cancel", {
        reservationId: activeTrip?.id,
        approval,
        approved,
        revision,
      });
      await refresh();
      setModal(null);
      notify("Reservation canceled. The room is available again.");
    });
  const publish = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run("publish", async () => {
      await api("publish", {
        name: f.get("name"),
        hostName: f.get("hostName"),
        type: hostType,
        neighborhood: f.get("neighborhood"),
        description: f.get("description"),
        nightlyCents: Math.round(Number(f.get("nightly")) * 100),
        cleaningCents: Math.round(Number(f.get("cleaning")) * 100),
        maxGuests: Number(f.get("maxGuests")),
        amenities: hostAmenities,
        checkInTime: f.get("checkInTime"),
        checkOutTime: "11:00",
        cancellation: f.get("cancellation"),
        image: "/rooms/private.svg",
        availableFrom: f.get("availableFrom"),
        availableTo: f.get("availableTo"),
      });
      await refresh();
      setModal(null);
      notify("Your listing is published and available to the assistant.");
    });
  };
  const editSkill = (business: BusinessSkill) => {
    setEditingSkill(business);
    setSkillSummary(business.summary || "");
    setSkillKnowledge(business.knowledge || "");
    setError("");
    setModal("skill");
  };
  const saveSkill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingSkill) return;
    run("save-skill", async () => {
      const data = await api("save-skill", {
        businessId: editingSkill.id,
        version: editingSkill.version,
        summary: skillSummary,
        knowledge: skillKnowledge,
      });
      setEditingSkill(data.business);
      setBusinesses(current => current.map(business => business.id === data.business.id ? data.business : business));
      await refresh();
      setModal(null);
      notify("Your agent is updated. New conversations use the saved information.");
    });
  };
  const reloadSkill = () => run("reload-skill", async () => {
    const data = await api("state");
    const latest = (data.businesses as BusinessSkill[]).find(business => business.id === editingSkill?.id);
    if (!latest) throw new Error("This business is no longer available. Close this window and refresh your listings.");
    setBusinesses(data.businesses);
    setEditingSkill(latest);
    setSkillSummary(latest.summary || "");
    setSkillKnowledge(latest.knowledge || "");
    notify("The saved version is loaded. Your unsaved changes were replaced.");
  });
  const display = listings.filter((l) => kind === "all" || l.type === kind);
  const active = reservations.filter((r) => r.status === "confirmed");
  return (
    <div className="product-app">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <header className="app-header" inert={!!modal || menuOpen}>
        <button className="app-brand" aria-label="AgentBridge home" onClick={() => nav("home")}><Link2 size={24} /><span>AgentBridge</span></button>
        <nav className="app-navigation" aria-label="Main navigation">
          {workspaceViews.filter(({ id }) => id !== "vision").map(({ id, label, icon: Icon }) => (
            <button className="nav-item" key={id} aria-label={label} aria-current={view === id ? "page" : undefined} onClick={() => nav(id)}><Icon size={24} weight={view === id ? "fill" : "regular"} /><span className="nav-label">{label}</span></button>
          ))}
        </nav>
        <div className="app-header-actions">
          <span className="connection-status"><span className={mode === "live" ? "connected" : ""} />{mode === "live" ? "AI connected" : "Offline"}</span>
          <button className="menu-toggle" aria-label="More" aria-expanded={menuOpen} aria-controls="workspace-menu" data-open={menuOpen} onClick={() => setMenuOpen(true)}><span className="menu-line" /><span className="menu-line" /></button>
        </div>
      </header>
      <main ref={main} id="main-content" tabIndex={-1} className="workspace-main" inert={!!modal || menuOpen}>
        {error && !modal && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
            {!loaded && (
              <button
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {!loaded && !error && (
          <div className="workspace-skeleton" role="status" aria-label="Loading workspace">
            <span className="sr-only">Loading your workspace</span>
            <div className="skeleton-heading" aria-hidden="true" /><div className="skeleton-line" aria-hidden="true" /><div className="skeleton-action" aria-hidden="true" /><div className="skeleton-row" aria-hidden="true" /><div className="skeleton-row" aria-hidden="true" />
          </div>
        )}
        {loaded && view === "home" && (
          <div className="start-page reveal-item">
            <section className="start-intro" aria-labelledby="start-heading">
              <span className="start-eyebrow"><Link2 size={16} /> Your business. Connected.</span>
              <h1 id="start-heading" className="start-title">Connect your business<br />with personal AI.</h1>
              <p className="start-description">Publish your business agent. Help people discover what you offer, ask questions, and choose their next step through personal AI.</p>
              <button className="primary-button" onClick={() => nav("skills")}><Sparkles size={20} /> Open Agent Hub</button>
              <p className="start-note">Business agents and personal skills. No website required.</p>
            </section>
            <section className="start-shortcuts" aria-label="Your workspace">
              <button className="start-shortcut" aria-label="Ask your assistant" onClick={() => nav("discover")}><MessageCircle size={24} /><span><strong>Ask your assistant</strong><small>Find an agent or skill that can help</small></span><ArrowRight size={20} /></button>
              <button className="start-shortcut" aria-label="Manage listings" onClick={() => nav("host")}><Store size={24} /><span><strong>Your accommodation listings</strong><small>{all.length} published {all.length === 1 ? "offer" : "offers"}</small></span><ArrowRight size={20} /></button>
              <button className="start-shortcut" aria-label="View bookings" onClick={() => nav("trips")}><CalendarDays size={24} /><span><strong>Your test bookings</strong><small>{active.length} confirmed {active.length === 1 ? "booking" : "bookings"}</small></span><ArrowRight size={20} /></button>
            </section>
            <p className="start-context">Sample workspace · No real reservations or payments</p>
          </div>
        )}
        {loaded && view === "skills" && (
          <SkillsLibrary onNotify={notify} openAgentId={openAgentId} onAgentOpened={() => setOpenAgentId(undefined)} onReservationChange={() => { refresh().catch(error => setError(error.message)); }} businessRevision={businesses.map(business => `${business.id}:${business.version}`).join("|")} onManageBusiness={businessId => {
            const business = businesses.find(item => item.id === businessId);
            if (business) editSkill(business);
            else setError("This business is no longer available. Refresh your workspace and try again.");
          }} />
        )}
        {loaded && view === "discover" && (
          <div className="discover-page reveal-item">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  Personal AI
                </span>
                <h1>Your personal assistant</h1>
                <p>Find business agents and personal skills, ask questions, and review the next step.</p>
              </div>
              <button className="outline-button" onClick={() => nav("skills")}><Sparkles size={15} /> Browse Agent Hub</button>
            </div>
            <p className="category-chip"><Building2 size={15} /> Accommodation · Test booking workflow</p>
            <div className="booking-search">
              <label>
                <span>
                  <MapPin size={14} /> DESTINATION
                </span>
                <strong>San Francisco, CA</strong>
              </label>
              <label>
                <span>CHECK-IN</span>
                <input
                  aria-label="Check-in"
                  type="date"
                  min={day(0)}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </label>
              <label>
                <span>CHECK-OUT</span>
                <input
                  aria-label="Check-out"
                  type="date"
                  min={checkIn}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </label>
              <label>
                <span>GUESTS</span>
                <select
                  aria-label="Guests"
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                disabled={!!busy}
                onClick={search}
              >
                <Search size={18} /> Search
              </button>
            </div>
            <div className="discover-layout">
              <section className="assistant-panel">
                <header>
                  <div className="assistant-avatar">
                    <Sparkles size={19} />
                  </div>
                  <div>
                    <strong>Your personal assistant</strong>
                    <span>
                      <span className={mode === "live" ? "live-dot" : "offline-dot"} />
                      {mode === "live"
                        ? "Nemotron on Nebius"
                        : "Offline assistant · No model connected"}
                    </span>
                  </div>
                  <span
                    className="memory-dot"
                    title="Preferences persist in this workspace"
                  >
                    <Bookmark size={16} />
                  </span>
                </header>
                <div className="chat-messages">
                  <div className="chat-welcome">
                    <span className="soft-icon">
                      <Sparkles size={22} />
                    </span>
                    <h3>What are you looking for?</h3>
                    <p>
                      I can find business agents and personal skills, read their saved
                      information, and help with your questions. Connected accommodation
                      agents can also prepare test bookings for your approval.
                    </p>
                  </div>
                  {messages.length === 0 && (
                    <div className="suggestion-list">
                      {[
                        "Find a business agent for bike repairs",
                        "Find a personal skill for planning my day",
                        `Find a room for ${checkIn} to ${checkOut} under $160 per night`,
                      ].map((s) => (
                        <button key={s} onClick={() => send(s)}>
                          {s}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`chat-message ${m.role}`}>
                      <span>
                        {m.role === "assistant" ? (
                          <Sparkles size={14} />
                        ) : (
                          <span className="you-dot">Y</span>
                        )}
                      </span>
                      <p>{m.role === "assistant" ? <AssistantText text={m.content} /> : m.content}</p>
                    </div>
                  ))}
                  {busy === "assistant" && (
                    <div className="thinking">
                      <BusyIndicator /> Checking
                      saved information…
                    </div>
                  )}
                  {agentMatches.length > 0 && <section className="assistant-agent-results" aria-label="Agents found">
                    <h3>Found in Agent Hub</h3>
                    {agentMatches.map(agent => <button key={agent.id} className="start-shortcut" aria-label={`Chat with ${agent.name}`} onClick={() => { setOpenAgentId(agent.id); nav("skills"); }}>
                      <Sparkles size={20} /><span><strong>{agent.name}</strong><small>{agent.ownerName} · {agent.summary}</small></span><ArrowUpRight size={18} />
                    </button>)}
                  </section>}
                  {trace.length > 0 && (
                    <details className="trace">
                      <summary>
                        <Link2 size={13} /> {trace.length} agent{" "}
                        {trace.length === 1 ? "action" : "actions"} checked
                      </summary>
                      {trace.map((t, i) => (
                        <p key={i}>
                          <Check size={11} /> {t.tool.replaceAll("_", " ")}{" "}
                          <small>{t.detail}</small>
                        </p>
                      ))}
                    </details>
                  )}
                  <div ref={chatBottom} />
                </div>
                <form
                  className="chat-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <textarea
                    aria-label="Message your assistant"
                    placeholder="Find a business, ask a question, or tell me what you need…"
                    rows={2}
                    value={message}
                    disabled={busy === "assistant"}
                    maxLength={2000}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <div>
                    <span>
                      <ShieldCheck size={12} /> Your approval. Always.
                    </span>
                    <button
                      aria-label="Send message"
                      disabled={!!busy || !message.trim()}
                    >
                      <ArrowUp size={18} />
                    </button>
                  </div>
                </form>
              </section>
              <section className="search-results">
                <div className="results-toolbar">
                  <div>
                    <h2>{display.length} matching {display.length === 1 ? "offer" : "offers"}</h2>
                    <p>Independently hosted. Connected through AgentBridge.</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Edit saved preferences"
                    onClick={() => {
                      setPrefDraft(prefs);
                      setModal("preferences");
                    }}
                  >
                    <SlidersHorizontal size={19} />
                  </button>
                </div>
                <div className="filter-row">
                  {[
                    { value: "all", label: "All stays" },
                    { value: "hotel", label: "Hotels" },
                    { value: "private", label: "Private rooms" },
                  ].map((k) => (
                    <button
                      key={k.value}
                      className={kind === k.value ? "selected" : ""}
                      onClick={() => setKind(k.value)}
                    >
                      {k.label}
                    </button>
                  ))}
                  <label className="budget-filter">
                    Up to $
                    <input
                      type="number"
                      aria-label="Maximum nightly price"
                      min="10"
                      max="10000"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                    />
                    / night
                  </label>
                  <select
                    aria-label="Required amenity"
                    value={amenity}
                    onChange={(e) => setAmenity(e.target.value)}
                  >
                    <option value="">Any amenities</option>
                    <option>Wi-Fi</option>
                    <option>Step-free access</option>
                    <option>Kitchenette</option>
                    <option>Late check-in</option>
                  </select>
                </div>
                <div className="results-note">
                  <ShieldCheck size={14} /> Workspace listings. Quotes
                  include every listed fee.
                  {(activeSearch.current.amenities?.length || 0) > 1 && <span> Required: {activeSearch.current.amenities!.join(" · ")}.</span>}
                </div>
                <div className="results-grid">
                  {display.map((l, i) => (
                    <StayCard
                      key={l.id}
                      listing={l}
                      index={i}
                      onDetails={() => {
                        setSelected(l);
                        setModal("details");
                      }}
                      onBook={() => getQuote(l)}
                    />
                  ))}
                </div>
                {display.length === 0 && (
                  <div className="empty-state">
                    <Search size={30} />
                    <h3>No matching stays yet.</h3>
                    <p>
                      Try a different date or budget. Or connect a new host with
                      exactly what’s missing.
                    </p>
                    <button
                      className="outline-button"
                      onClick={() => setModal("host")}
                    >
                      <Plus size={16} /> Connect a host
                    </button>
                  </div>
                )}
                <p className="results-disclaimer">
                  Prices shown per night. Select a stay to review dates,
                  availability, and the complete total before booking.
                </p>
              </section>
            </div>
          </div>
        )}
        {loaded && view === "host" && (
          <div className="workspace-page reveal-item">
            <div className="page-heading">
              <div>
                <span className="eyebrow">Your business</span>
                <h1>Business listings</h1>
                <p>
                  Manage the rooms your customers can discover and book.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setModal("host")}
              >
                <Plus size={18} /> Add listing
              </button>
            </div>
            <div className="stats-row">
              <Stat
                label="Discoverable stays"
                value={String(all.length)}
                detail="Connected to the network"
              />
              <Stat
                label="Confirmed reservations"
                value={String(active.length)}
                detail="Booked with traveler approval"
              />
              <Stat
                label="Stay value"
                value={money(active.reduce((s, r) => s + r.totalCents, 0))}
                detail="Pay at property · Not collected"
              />
            </div>
            <div className="workspace-section">
              <div className="section-heading">
                <div>
                  <h2>Your connected properties</h2>
                  <p>Each listing represents one bookable room or unit.</p>
                </div>
                <span className="subtle-pill">
                  <span className="live-dot" /> Discoverable by AI
                </span>
              </div>
              <div className="host-list">
                {all.map((l, i) => (
                  <div className="host-row" key={l.id}>
                    <div className="host-thumb">
                      <Photo listing={l} index={i} />
                    </div>
                    <div className="host-row-main">
                      <strong>{l.name}</strong>
                      <span>
                        {l.type === "private" ? "Private room" : "Hotel room"} ·{" "}
                        {l.neighborhood}
                      </span>
                      <small>{l.amenities.slice(0, 3).join(" · ")}</small>
                    </div>
                    <div className="host-row-price">
                      <strong>
                        {money(l.nightlyCents)}
                        <small> / night</small>
                      </strong>
                      <span>Up to {l.maxGuests} guests</span>
                    </div>
                    <span className="status-tag">
                      <span /> Published
                    </span>
                    <button
                      aria-label={`View ${l.name}`}
                      className="icon-button"
                      onClick={() => {
                        setSelected(l);
                        setModal("details");
                      }}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <section className="workspace-section business-agents" aria-labelledby="business-agents-title">
              <div className="section-heading">
                <div>
                  <h2 id="business-agents-title">Your business agents</h2>
                  <p>Give each business its own introduction and answers for customers.</p>
                </div>
              </div>
              {businesses.map((business) => (
                <details className="business-skill" key={business.id}>
                  <summary>
                    <Sparkles size={24} />
                    <span><strong>{business.name} agent</strong><small>{business.listingIds.length} published {business.listingIds.length === 1 ? "offer" : "offers"}</small></span>
                    <ChevronDown size={18} />
                  </summary>
                  <div className="business-skill-body">
                    {business.summary && <p className="business-agent-intro">{business.summary}</p>}
                    <p>Checks availability, answers from published details, and prepares quotes for:</p>
                    <ul>{all.filter((listing) => business.listingIds.includes(listing.id)).map((listing) => <li key={listing.id}>{listing.name}</li>)}</ul>
                    <p className="business-approval-note"><ShieldCheck size={16} /> Booking always requires customer approval.</p>
                    <div className="business-agent-footer">
                      <small>Version {business.version || 1}{business.updatedAt && <> · Saved <SavedTime value={business.updatedAt} /></>}</small>
                      <div className="business-agent-actions">
                        <button className="outline-button" onClick={() => editSkill(business)}>Edit agent</button>
                        <a className="text-button" href={`/api/businesses/${encodeURIComponent(business.id)}`} target="_blank" rel="noopener noreferrer">View skill <ExternalLink size={16} /></a>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </section>
            <div className="workspace-section">
              <h2>Reservations</h2>
              {reservations.length === 0 ? (
                <div className="empty-state compact">
                  <CalendarDays size={25} />
                  <h3>Your next guest is a conversation away.</h3>
                  <p>
                    Confirmed reservations will appear here as soon as a
                    traveler approves.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => nav("discover")}
                  >
                    Open customer assistant <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="reservation-table">
                  {reservations.map((r) => (
                    <div key={r.id}>
                      <strong>
                        {r.listingName}
                        <small>{r.confirmation}</small>
                      </strong>
                      <span>
                        {dateLabel(r.checkIn)} – {dateLabel(r.checkOut)}
                        <small>{r.guests} guest(s)</small>
                      </span>
                      <span>{money(r.totalCents)}</span>
                      <span
                        className={`status-tag ${r.status === "canceled" ? "muted" : ""}`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="host-info">
              <ShieldCheck size={19} />
              <p>
                Business and customer views share the same reservation records in this workspace. Sample properties are not connected to live hotel inventory.
              </p>
            </div>
          </div>
        )}
        {loaded && view === "trips" && (
          <div className="workspace-page trips-page reveal-item">
            <div className="page-heading">
              <div>
                <span className="eyebrow">Your activity</span>
                <h1>Bookings</h1>
                <p>
                  Review confirmations, manage dates, and keep track of your plans.
                </p>
              </div>
              <button
                className="outline-button"
                onClick={() => nav("discover")}
              >
                Find another stay <ArrowUpRight size={17} />
              </button>
            </div>
            {reservations.length === 0 ? (
              <div className="empty-state big-empty">
                <Compass size={40} />
                <h2>No bookings yet</h2>
                <p>Find an offer with your assistant. Your approved bookings will appear here.</p>
                <button
                  className="primary-button"
                  onClick={() => nav("discover")}
                >
                  Open customer assistant <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <div className="trip-grid">
                {reservations.map((r) => {
                  const l = all.find((l) => l.id === r.listingId);
                  return (
                    <article className="trip-card" key={r.id}>
                      <div className="trip-photo">
                        {l && <Photo listing={l} />}
                        <span
                          className={`trip-status ${r.status === "canceled" ? "canceled" : ""}`}
                        >
                          <CheckCircle2 size={14} />
                          {r.status === "confirmed"
                            ? "Confirmed stay"
                            : "Canceled"}
                        </span>
                      </div>
                      <div className="trip-content">
                        <span className="eyebrow">SAN FRANCISCO</span>
                        <h2>{r.listingName}</h2>
                        <div className="trip-dates">
                          <CalendarDays size={17} />
                          {dateLabel(r.checkIn)} – {dateLabel(r.checkOut)}
                          <span>
                            {r.nights} nights · {r.guests} guest(s)
                          </span>
                        </div>
                        <div className="confirmation-row">
                          <span>
                            Confirmation <strong>{r.confirmation}</strong>
                          </span>
                          <span>
                            Total <strong>{money(r.totalCents)}</strong>
                          </span>
                        </div>
                        <p className="payment-note">
                          {r.status === "canceled" ? "No payment was taken. No refund is needed." : "Pay at property. No payment has been taken."}
                        </p>
                        {r.status === "confirmed" && (
                          <>
                            <div className="trip-actions">
                              <button
                                className="outline-button"
                                onClick={() => {
                                  setActiveTrip(r);
                                  setCheckIn(r.checkIn);
                                  setCheckOut(r.checkOut);
                                  setModal("change");
                                }}
                              >
                                Change dates
                              </button>
                              <button
                                className="text-button danger-text"
                                onClick={() => prepareCancel(r)}
                              >
                                Cancel stay
                              </button>
                            </div>
                            <button
                              className="itinerary-toggle"
                              onClick={() =>
                                setItinerary(itinerary === r.id ? null : r.id)
                              }
                            >
                              <Compass size={17} /> A little inspiration for
                              your trip <ChevronDown size={16} />
                            </button>
                            {itinerary === r.id && (
                              <div className="itinerary">
                                <p>
                                  Suggested day from{" "}
                                  {l?.neighborhood || "your stay"}. Check
                                  opening hours and routes before visiting.
                                </p>
                                {[
                                  {
                                    time: "Morning",
                                    name: "Ferry Building",
                                    desc: "Coffee, local food, and a waterfront wander.",
                                    url: "https://www.ferrybuildingmarketplace.com/",
                                  },
                                  {
                                    time: "Afternoon",
                                    name: "Golden Gate Park",
                                    desc: "Gardens, open space, and time to slow down.",
                                    url: "https://sfrecpark.org/770/Golden-Gate-Park",
                                  },
                                  {
                                    time: "Evening",
                                    name: "North Beach",
                                    desc: "Explore the neighborhood and choose a dinner spot.",
                                    url: "https://www.sftravel.com/neighborhoods/north-beach",
                                  },
                                ].map((p) => (
                                  <div key={p.time}>
                                    <span>{p.time}</span>
                                    <strong>{p.name}</strong>
                                    <p>{p.desc}</p>
                                    <a
                                      href={p.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Explore <ExternalLink size={11} />
                                    </a>
                                  </div>
                                ))}
                                <small>
                                  Curated suggestions · No activities booked.
                                </small>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {view === "vision" && (
          <div className="vision-page reveal-item">
            <span className="eyebrow">The bigger picture</span>
            <h1>
              A world your AI
              <br />
              can <em>do business with.</em>
            </h1>
            <p className="vision-lede">
              Personal AI understands what you need. AgentBridge connects it
              with businesses that can fulfill it.
            </p>
            <div className="vision-flow">
              <div>
                <Sparkles size={30} />
                <h3>Your personal AI</h3>
                <p>Your preferences, context, and approval.</p>
              </div>
              <MoveRight size={27} />
              <div className="vision-bridge">
                <Logo />
                <p>
                  Discover businesses.
                  <br />
                  Understand their capabilities.
                  <br />
                  Complete approved actions.
                </p>
              </div>
              <MoveRight size={27} />
              <div>
                <Building2 size={30} />
                <h3>A connected business</h3>
                <p>Its offers, policies, availability, and actions.</p>
              </div>
            </div>
            <div className="vision-categories">
              {[
                {
                  icon: Building2,
                  title: "Accommodation",
                  copy: "Discover, inquire, book, change, cancel.",
                  status: "Available",
                },
                {
                  icon: CalendarDays,
                  title: "Appointments",
                  copy: "Find the right service and reserve a time.",
                  status: "Future category",
                },
                {
                  icon: MessageCircle,
                  title: "Purchases & support",
                  copy: "Buy what you need. Get help afterward.",
                  status: "Future category",
                },
              ].map(({ icon: Icon, ...c }) => (
                <div key={c.title}>
                  <Icon size={25} />
                  <span
                    className={
                      c.status === "Available" ? "live-pill" : "future-pill"
                    }
                  >
                    {c.status}
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.copy}</p>
                </div>
              ))}
            </div>
            <div className="vision-thesis">
              <Leaf size={28} />
              <h2>
                Every new business gives your AI
                <br />
                one more way to help.
              </h2>
              <p>
                We’re proving the network with room booking. The same
                discovery-and-action pattern can expand into other business
                categories, each with its own integrations.
              </p>
              <button
                className="primary-button"
                onClick={() => nav("discover")}
              >
                Open customer assistant <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="app-footer" inert={!!modal || menuOpen}><span>AgentBridge</span><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>
      <div id="workspace-menu" className={`workspace-menu ${menuOpen ? "menu-open" : ""}`} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? true : undefined} aria-label="Workspace menu" aria-hidden={!menuOpen} inert={!menuOpen} onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
        <div className="menu-surface">
          <div className="menu-heading"><span className="app-brand"><Link2 size={24} /> AgentBridge</span><button className="menu-toggle" data-open={menuOpen} aria-label="Close menu" onClick={() => setMenuOpen(false)}><span className="menu-line" /><span className="menu-line" /></button></div>
          <div className="menu-links">
            <button onClick={() => nav("vision")}><Globe2 size={24} /><span>Network vision</span><ArrowUpRight size={20} /></button>
            <button aria-label="Your personal space Preferences & memory" disabled={!loaded} onClick={() => { setMenuOpen(false); setPrefDraft(prefs); setModal("preferences"); }}><Settings2 size={24} /><span>Preferences</span><ArrowUpRight size={20} /></button>
            <button onClick={() => nav("home")}><LayoutDashboard size={24} /><span>Back to home</span><ArrowRight size={20} /></button>
          </div>
          <div className="menu-footer"><p>Sample workspace. No real reservations or payments.</p><p>{mode === "live" ? "AI model connected." : "The assistant works offline. A live AI model is not connected."}</p><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "host" ? "wide-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setModal(null);
            }}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              disabled={!!busy}
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
            {modal === "host" && (
              <>
                <span className="eyebrow">CONNECT Your business</span>
                <h2 id="modal-title">Add a room</h2>
                <p className="modal-intro">
                  Publish your room’s details, pricing, availability, and policies.
                </p>
                <form onSubmit={publish} className="host-form">
                  <div className="segmented">
                    <button
                      type="button"
                      className={hostType === "private" ? "selected" : ""}
                      onClick={() => setHostType("private")}
                    >
                      Private room
                    </button>
                    <button
                      type="button"
                      className={hostType === "hotel" ? "selected" : ""}
                      onClick={() => setHostType("hotel")}
                    >
                      Hotel room
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field label="Listing name">
                      <input
                        name="name"
                        required
                        maxLength={80}
                        defaultValue="The Garden Room"
                      />
                    </Field>
                    <Field label="Host or business name">
                      <input
                        name="hostName"
                        required
                        maxLength={60}
                        defaultValue="Alex’s home"
                      />
                    </Field>
                    <Field label="San Francisco neighborhood">
                      <input
                        name="neighborhood"
                        required
                        defaultValue="Lower Haight"
                        maxLength={80}
                      />
                    </Field>
                    <Field label="Maximum guests">
                      <input
                        name="maxGuests"
                        required
                        type="number"
                        min="1"
                        max="12"
                        defaultValue="2"
                      />
                    </Field>
                  </div>
                  <Field label="About your space">
                    <textarea
                      name="description"
                      required
                      maxLength={1500}
                      defaultValue="A peaceful private room with garden views, step-free entry, and space to unwind. A welcoming base for a San Francisco stay."
                      rows={3}
                    />
                  </Field>
                  <span className="field-title">
                    Amenities your AI can match
                  </span>
                  <div className="amenity-options">
                    {[
                      "Wi-Fi",
                      "Step-free access",
                      "Kitchenette",
                      "Late check-in",
                      "Workspace",
                      "Garden",
                    ].map((a) => (
                      <button
                        type="button"
                        key={a}
                        className={hostAmenities.includes(a) ? "selected" : ""}
                        onClick={() =>
                          setHostAmenities((p) =>
                            p.includes(a)
                              ? p.filter((x) => x !== a)
                              : [...p, a],
                          )
                        }
                      >
                        {hostAmenities.includes(a) && <Check size={12} />} {a}
                      </button>
                    ))}
                  </div>
                  <div className="form-grid">
                    <Field label="Nightly price · USD · taxes included">
                      <input
                        name="nightly"
                        type="number"
                        min="10"
                        max="10000"
                        step="0.01"
                        required
                        defaultValue="135"
                      />
                    </Field>
                    <Field label="Cleaning fee · USD">
                      <input
                        name="cleaning"
                        type="number"
                        min="0"
                        max="10000"
                        step="0.01"
                        required
                        defaultValue="20"
                      />
                    </Field>
                    <Field label="Available from">
                      <input
                        name="availableFrom"
                        type="date"
                        required
                        min={day(0)}
                        defaultValue={day(0)}
                      />
                    </Field>
                    <Field label="Available until (checkout date)">
                      <input
                        name="availableTo"
                        type="date"
                        required
                        min={day(1)}
                        defaultValue={day(180)}
                      />
                    </Field>
                    <Field label="Check-in from">
                      <input
                        name="checkInTime"
                        type="time"
                        defaultValue="15:00"
                        required
                      />
                    </Field>
                    <Field label="Cancellation policy">
                      <select name="cancellation">
                        <option value="flexible">
                          Free cancellation before check-in
                        </option>
                        <option value="restricted">
                          Cancellation not available
                        </option>
                      </select>
                    </Field>
                  </div>
                  <div className="notice">
                    <ShieldCheck size={17} />
                    <span>
                      Sample workspace. Listings are stored here and available to this workspace’s assistant. No live hotel inventory or payments are connected.
                    </span>
                  </div>
                  <button
                    className="primary-button full-button"
                    disabled={!!busy}
                  >
                    {busy === "publish" ? (
                      <BusyIndicator />
                    ) : (
                      <Link2 size={17} />
                    )}
                    Publish to AgentBridge
                  </button>
                </form>
              </>
            )}
            {modal === "skill" && editingSkill && (
              <>
                <span className="eyebrow">Your business agent</span>
                <h2 id="modal-title">Edit agent</h2>
                <p className="modal-intro">Help your agent introduce your business and answer customer questions. Room prices, availability, and booking terms still come from your listings.</p>
                <form className="skill-editor" onSubmit={saveSkill}>
                  <Field label="Business name">
                    <input name="businessName" value={editingSkill.name} readOnly />
                  </Field>
                  <Field label="Short introduction">
                    <textarea name="summary" aria-label="Short introduction" value={skillSummary} maxLength={240} rows={3} aria-describedby="skill-summary-help" placeholder="Introduce your business and what makes it special." onChange={event => setSkillSummary(event.target.value)} />
                    <small id="skill-summary-help" className="field-help">A brief introduction for customers. <span>{skillSummary.length}/240</span></small>
                  </Field>
                  <Field label="Business knowledge">
                    <textarea name="knowledge" aria-label="Business knowledge" value={skillKnowledge} maxLength={4000} rows={9} aria-describedby="skill-knowledge-help" placeholder={"Add helpful answers, for example:\nWhere can guests store luggage?\nHow do they reach reception?\nWhat is nearby?"} onChange={event => setSkillKnowledge(event.target.value)} />
                    <small id="skill-knowledge-help" className="field-help">FAQs and guest guidance only. Keep passwords, access codes, and private details out. <span>{skillKnowledge.length}/4,000</span></small>
                  </Field>
                  <div className="skill-save-meta">
                    <span>Version {editingSkill.version || 1}</span>
                    {editingSkill.updatedAt && <span>Saved <SavedTime value={editingSkill.updatedAt} /></span>}
                  </div>
                  <button className="primary-button full-button" type="submit" disabled={!!busy}>
                    {busy === "save-skill" ? <><BusyIndicator /> Saving…</> : <><Check size={18} /> Save agent</>}
                  </button>
                  <div className="skill-secondary-actions">
                    <button className="text-button" type="button" disabled={!!busy} onClick={reloadSkill}>{busy === "reload-skill" ? "Loading saved version…" : "Reload saved version"}</button>
                    <a className="text-button" href={`/api/businesses/${encodeURIComponent(editingSkill.id)}`} target="_blank" rel="noopener noreferrer">View skill <ExternalLink size={16} /></a>
                  </div>
                  {error && <p className="skill-reload-note">Reloading the saved version replaces your unsaved edits.</p>}
                </form>
              </>
            )}
            {modal === "preferences" && (
              <>
                <span className="eyebrow">YOUR Personal AI MEMORY</span>
                <h2 id="modal-title">A little more you.</h2>
                <p className="modal-intro">
                  Save your preferences for future conversations. A request for
                  this trip always takes priority.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("preferences", async () => {
                      const d = await api("preferences", prefDraft);
                      setPrefs(d.preferences);
                      setModal(null);
                      notify("Preferences saved for your next conversation.");
                    });
                  }}
                >
                  <Field label="Usual nightly budget · USD">
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={prefDraft.budget || 180}
                      onChange={(e) =>
                        setPrefDraft((p) => ({
                          ...p,
                          budget: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Preferred stay type">
                    <select
                      value={prefDraft.roomType || "any"}
                      onChange={(e) =>
                        setPrefDraft((p) => ({
                          ...p,
                          roomType: e.target.value,
                        }))
                      }
                    >
                      <option value="any">Any stay</option>
                      <option value="private">Private room</option>
                      <option value="hotel">Hotel</option>
                    </select>
                  </Field>
                  <span className="field-title">What matters to you</span>
                  <div className="amenity-options">
                    {[
                      "Wi-Fi",
                      "Step-free access",
                      "Kitchenette",
                      "Late check-in",
                      "Workspace",
                    ].map((a) => (
                      <button
                        type="button"
                        key={a}
                        className={
                          prefDraft.amenities?.includes(a) ? "selected" : ""
                        }
                        onClick={() =>
                          setPrefDraft((p) => ({
                            ...p,
                            amenities: p.amenities?.includes(a)
                              ? p.amenities.filter((v) => v !== a)
                              : [...(p.amenities || []), a],
                          }))
                        }
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary-button full-button"
                    disabled={!!busy}
                  >
                    Save preferences <Check size={17} />
                  </button>
                  <button
                    type="button"
                    className="text-button full-button"
                    onClick={() =>
                      run("preferences", async () => {
                        const p = {
                          budget: 180,
                          roomType: "any",
                          amenities: [],
                        };
                        await api("preferences", p);
                        setPrefs(p);
                        setPrefDraft(p);
                        notify("Preferences reset.");
                      })
                    }
                  >
                    Reset saved preferences
                  </button>
                </form>
              </>
            )}
            {modal === "details" && selected && (
              <>
                <div className="detail-photo">
                  <Photo listing={selected} />
                </div>
                <span className="eyebrow">
                  {selected.type === "private" ? "INDEPENDENT HOST" : "HOTEL"} ·
                  PROPERTY DETAILS
                </span>
                <h2 id="modal-title">{selected.name}</h2>
                <p className="location">
                  <MapPin size={14} />
                  {selected.neighborhood}, San Francisco
                </p>
                <p className="detail-description">{selected.description}</p>
                <p className="business-owner"><Sparkles size={16} /> Managed by {selected.businessName || selected.hostName} agent</p>
                <div className="amenity-options">
                  {selected.amenities.map((a) => (
                    <span className="amenity-tag" key={a}>
                      <Check size={12} />
                      {a}
                    </span>
                  ))}
                </div>
                <div className="policy-grid">
                  <div>
                    <Clock3 size={17} />
                    <strong>Arrival & departure</strong>
                    <p>
                      Check-in from {selected.checkInTime}
                      <br />
                      Check-out by {selected.checkOutTime}
                    </p>
                  </div>
                  <div>
                    <ShieldCheck size={17} />
                    <strong>Cancellation</strong>
                    <p>
                      {selected.cancellation === "flexible"
                        ? "Free cancellation before check-in."
                        : "This stay cannot be canceled."}
                    </p>
                  </div>
                </div>
                <div className="detail-price">
                  <strong>
                    {money(selected.nightlyCents)}
                    <small> / night</small>
                  </strong>
                  <span>
                    + {money(selected.cleaningCents)} cleaning · Taxes included
                  </span>
                </div>
                <button
                  className="primary-button full-button"
                  disabled={!!busy}
                  onClick={() => getQuote(selected)}
                >
                  Check dates & review total <ArrowRight size={17} />
                </button>
              </>
            )}
            {modal === "quote" && quote && (
              <>
                <span className="eyebrow">You’re in control</span>
                <h2 id="modal-title">
                  {quote.reservationId
                    ? "Review your date change."
                    : "Make it your next stay."}
                </h2>
                <p className="modal-intro">
                  Review the details. Nothing is confirmed until you approve.
                </p>
                <div className="quote-property">
                  <Building2 size={22} />
                  <div>
                    <strong>{quote.listingName}</strong>
                    {quote.businessName && <span>Prepared by {quote.businessName} agent</span>}
                    <span>San Francisco · Sample property</span>
                  </div>
                </div>
                <div className="quote-dates">
                  <div>
                    <span>CHECK-IN</span>
                    <strong>{dateLabel(quote.checkIn)}</strong>
                  </div>
                  <ArrowRight size={17} />
                  <div>
                    <span>CHECK-OUT</span>
                    <strong>{dateLabel(quote.checkOut)}</strong>
                  </div>
                  <div>
                    <span>GUESTS</span>
                    <strong>{quote.guests}</strong>
                  </div>
                </div>
                <div className="price-breakdown">
                  <div>
                    <span>
                      {money(quote.nightlyCents)} × {quote.nights} nights
                    </span>
                    <span>{money(quote.nightlyCents * quote.nights)}</span>
                  </div>
                  <div>
                    <span>Cleaning fee</span>
                    <span>{money(quote.cleaningCents)}</span>
                  </div>
                  <div>
                    <span>Taxes</span>
                    <span>Included in nightly rate</span>
                  </div>
                  <div className="price-total">
                    <strong>Total · USD</strong>
                    <strong>{money(quote.totalCents)}</strong>
                  </div>
                </div>
                <div className="notice">
                  <ShieldCheck size={18} />
                  <span>
                    {quote.cancellation === "flexible"
                      ? "Free cancellation before check-in."
                      : "Cancellation is not available for this stay."}
                    <br />
                    Pay at property. No card or payment required.
                  </span>
                </div>
                <label className="approval-check">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  <span>
                    I approve this{" "}
                    {quote.reservationId ? "date change" : "booking"}, the total
                    price, and the cancellation terms.
                  </span>
                </label>
                <button
                  className="primary-button full-button"
                  disabled={!approved || !!busy}
                  onClick={confirm}
                >
                  {busy === "confirm" ? (
                    <BusyIndicator />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}{" "}
                  {quote.reservationId
                    ? "Confirm date change"
                    : "Approve & confirm stay"}
                </button>
                <p className="fine-print">
                  Quote valid for 10 minutes. Availability is rechecked at
                  confirmation.
                </p>
              </>
            )}
            {modal === "cancel" && activeTrip && (
              <>
                <span className="eyebrow">MANAGE YOUR STAY</span>
                <h2 id="modal-title">Cancel this reservation?</h2>
                <p className="modal-intro">
                  {activeTrip.listingName}
                  <br />
                  {dateLabel(activeTrip.checkIn)} –{" "}
                  {dateLabel(activeTrip.checkOut)}
                </p>
                <div className="notice">
                  <ShieldCheck size={18} />
                  <span>
                    {activeTrip.cancellation === "flexible"
                      ? "This reservation allows free cancellation before check-in. No payment was collected."
                      : "This reservation does not allow cancellation."}
                  </span>
                </div>
                {activeTrip.cancellation === "flexible" && (
                  <>
                    <label className="approval-check">
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={(e) => setApproved(e.target.checked)}
                      />
                      <span>I approve canceling this reservation.</span>
                    </label>
                    <button
                      className="primary-button full-button"
                      disabled={!approved || !!busy}
                      onClick={cancel}
                    >
                      Confirm cancellation
                    </button>
                  </>
                )}
              </>
            )}
            {modal === "change" && activeTrip && (
              <>
                <span className="eyebrow">A CHANGE OF PLANS</span>
                <h2 id="modal-title">Find new dates.</h2>
                <p className="modal-intro">
                  Your existing reservation stays confirmed until you approve an
                  available replacement.
                </p>
                <Field label="New check-in">
                  <input
                    type="date"
                    min={day(0)}
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </Field>
                <Field label="New check-out">
                  <input
                    type="date"
                    min={checkIn}
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </Field>
                <button
                  className="primary-button full-button"
                  disabled={!!busy}
                  onClick={() => {
                    const l = all.find((l) => l.id === activeTrip.listingId);
                    if (l) getQuote(l, activeTrip);
                  }}
                >
                  Review new dates <ArrowRight size={17} />
                </button>
              </>
            )}
            {error && modal !== "skill" && (
              <div className="modal-error" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function AssistantText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<!\*)\*[^*\s](?:[^*\n]*?[^*\s])?\*(?!\*))/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={index} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
    return part;
  })}</>;
}
function SavedTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>recently</>;
  return <time dateTime={value} title={date.toLocaleString("en-US")}>{date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>;
}
function StayCard({
  listing: l,
  index,
  onDetails,
  onBook,
}: {
  listing: Listing;
  index: number;
  onDetails: () => void;
  onBook: () => void;
}) {
  return (
    <article className="stay-card">
      <button
        className="stay-photo"
        onClick={onDetails}
        aria-label={`View details for ${l.name}`}
      >
        <Photo listing={l} index={index} />
        <span className="property-type">
          {l.type === "private" ? "Private room" : "Boutique hotel"}
        </span>
        <span className="photo-arrow">
          <ArrowUpRight size={17} />
        </span>
      </button>
      <div className="stay-body">
        <p className="stay-location">
          <MapPin size={12} />
          {l.neighborhood}, San Francisco
        </p>
        <button className="stay-title" onClick={onDetails}>
          {l.name}
        </button>
        <p className="stay-description">{l.description}</p>
        <div className="stay-amenities">
          {l.amenities.slice(0, 3).map((a) => (
            <span key={a}>
              {a === "Wi-Fi" ? <Wifi size={12} /> : <Check size={12} />} {a}
            </span>
          ))}
        </div>
        <div className="stay-bottom">
          <div>
            <strong>{money(l.nightlyCents)}</strong>
            <span> / night</span>
            <small>Taxes included</small>
          </div>
          <button className="book-button" onClick={onBook}>
            View stay <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
