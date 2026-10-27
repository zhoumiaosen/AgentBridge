import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Listing = {
  id: string;
  name: string;
  hostName: string;
  type: "hotel" | "private";
  neighborhood: string;
  description: string;
  nightlyCents: number;
  cleaningCents: number;
  maxGuests: number;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  cancellation: "flexible" | "restricted";
  image: string;
  availableFrom: string;
  availableTo: string;
};
export type Quote = {
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
  cancellation: "flexible" | "restricted";
  expiresAt: string;
  reservationId?: string;
};
export type Reservation = Quote & {
  confirmation: string;
  status: "confirmed" | "canceled";
  createdAt: string;
};
export type Preferences = {
  budget: number;
  roomType: string;
  amenities: string[];
};
export type Message = { role: "user" | "assistant"; content: string };
export type SearchFilters = {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  maxNightlyCents?: number;
  amenities?: string[];
  type?: string;
};
export type QuoteInput = {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  reservationId?: string;
};
type Row = Record<string, unknown>;
const DAY = 86_400_000;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const parse = <T>(row: Row | undefined): T => {
  if (!row) throw new Error("Record not found.");
  return JSON.parse(row.data as string) as T;
};
function text(value: unknown, name: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(
      `${name} is required and must be at most ${max} characters.`,
    );
  return value.trim();
}
function integer(value: unknown, name: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}
function date(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error("Use a valid date in YYYY-MM-DD format.");
  return value;
}
export function todaySF() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function plusDays(value: string, n: number) {
  return new Date(Date.parse(value) + n * DAY).toISOString().slice(0, 10);
}
function stay(checkIn: unknown, checkOut: unknown, guests: unknown) {
  const start = date(checkIn),
    end = date(checkOut);
  const nights = (Date.parse(end) - Date.parse(start)) / DAY;
  if (start < todaySF() || nights < 1 || nights > 30)
    throw new Error("Choose a future stay of 1 to 30 nights.");
  integer(guests, "Guests", 1, 12);
  return { start, end, nights };
}
function stringList(value: unknown) {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error("Choose at most 20 amenities.");
  return [...new Set(value.map((x) => text(x, "Amenity", 60)))];
}
function validateListing(input: unknown): Listing {
  if (!input || typeof input !== "object")
    throw new Error("Listing details are required.");
  const x = input as Record<string, unknown>;
  if (x.type !== "hotel" && x.type !== "private")
    throw new Error("Choose hotel or private room.");
  if (x.cancellation !== "flexible" && x.cancellation !== "restricted")
    throw new Error("Choose a cancellation policy.");
  const availableFrom = date(x.availableFrom),
    availableTo = date(x.availableTo);
  if (
    availableFrom < todaySF() ||
    availableTo <= availableFrom ||
    (Date.parse(availableTo) - Date.parse(availableFrom)) / DAY > 366
  )
    throw new Error(
      "Availability must start today or later and cover at most 366 nights.",
    );
  const image =
    typeof x.image === "string" && x.image ? x.image : "/rooms/private.svg";
  if (!/^\/rooms\/[a-z0-9_-]+\.(svg|webp|jpg|png)$/.test(image))
    throw new Error("Choose a provided room image.");
  const checkInTime = text(x.checkInTime, "Check-in time", 5),
    checkOutTime = text(x.checkOutTime, "Check-out time", 5);
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkInTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOutTime)
  )
    throw new Error("Use 24-hour check-in/out times.");
  return {
    id: randomUUID(),
    name: text(x.name, "Property name", 100),
    hostName: text(x.hostName, "Host name", 80),
    type: x.type,
    neighborhood: text(x.neighborhood, "Neighborhood", 100),
    description: text(x.description, "Description", 2000),
    nightlyCents: integer(x.nightlyCents, "Nightly price", 1000, 1_000_000),
    cleaningCents: integer(x.cleaningCents, "Cleaning fee", 0, 1_000_000),
    maxGuests: integer(x.maxGuests, "Capacity", 1, 12),
    amenities: stringList(x.amenities),
    checkInTime,
    checkOutTime,
    cancellation: x.cancellation,
    image,
    availableFrom,
    availableTo,
  };
}
function listingTerms(listing: Listing) {
  return hash(listing);
}
export function reservationRevision(r: Reservation) {
  return hash({
    id: r.id,
    listingId: r.listingId,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    guests: r.guests,
    totalCents: r.totalCents,
    cancellation: r.cancellation,
    status: r.status,
  });
}

export function createStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS listings_tenant ON listings(tenant_id);
    CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),data TEXT NOT NULL,expires_at TEXT NOT NULL,listing_terms TEXT NOT NULL,reservation_terms TEXT,confirmed_reservation_id TEXT);
    CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reservations_tenant ON reservations(tenant_id);
    CREATE TABLE IF NOT EXISTS occupied_nights(tenant_id TEXT NOT NULL,listing_id TEXT NOT NULL,date TEXT NOT NULL,reservation_id TEXT NOT NULL REFERENCES reservations(id),PRIMARY KEY(tenant_id,listing_id,date));
    CREATE TABLE IF NOT EXISTS idempotency(tenant_id TEXT NOT NULL,key TEXT NOT NULL,quote_id TEXT NOT NULL,reservation_id TEXT NOT NULL,PRIMARY KEY(tenant_id,key));
    CREATE TABLE IF NOT EXISTS preferences(tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL REFERENCES tenants(id),role TEXT NOT NULL,content TEXT NOT NULL);
  `);
  function atomic<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function tenant(id: string) {
    text(id, "Session", 200);
    if (!db.prepare("SELECT id FROM tenants WHERE id=?").get(id))
      throw new Error("Session not found.");
  }
  function listing(tenantId: string, id: string) {
    return parse<Listing>(
      db
        .prepare("SELECT data FROM listings WHERE tenant_id=? AND id=?")
        .get(tenantId, text(id, "Listing ID")) as Row | undefined,
    );
  }
  function reservation(tenantId: string, id: string) {
    return parse<Reservation>(
      db
        .prepare("SELECT data FROM reservations WHERE tenant_id=? AND id=?")
        .get(tenantId, text(id, "Reservation ID")) as Row | undefined,
    );
  }
  function canUse(
    tenantId: string,
    l: Listing,
    start: string,
    end: string,
    ignore?: string,
  ) {
    if (start < l.availableFrom || end > l.availableTo) return false;
    return !db
      .prepare(
        "SELECT 1 FROM occupied_nights WHERE tenant_id=? AND listing_id=? AND date>=? AND date<? AND reservation_id != ? LIMIT 1",
      )
      .get(tenantId, l.id, start, end, ignore || "");
  }
  function changeAllowed(r: Reservation) {
    if (r.status !== "confirmed")
      throw new Error("Reservation is no longer active.");
    if (r.checkIn <= todaySF())
      throw new Error("Changes must be made before the check-in date.");
    if (r.cancellation === "restricted")
      throw new Error(
        "This reservation policy does not allow cancellation or date changes.",
      );
  }
  const api = {
    db,
    close() {
      db.close();
    },
    ensureTenant(tenantId: string) {
      text(tenantId, "Session", 200);
      atomic(() => {
        if (db.prepare("SELECT id FROM tenants WHERE id=?").get(tenantId))
          return;
        db.prepare("INSERT INTO tenants VALUES (?,?)").run(
          tenantId,
          new Date().toISOString(),
        );
        const base = {
          hostName: "AgentBridge demo host",
          maxGuests: 2,
          amenities: ["Wi-Fi", "Workspace"],
          checkInTime: "15:00",
          checkOutTime: "11:00",
          cancellation: "flexible" as const,
          availableFrom: todaySF(),
          availableTo: plusDays(todaySF(), 180),
        };
        const seeds = [
          {
            ...base,
            name: "The Pacific House",
            type: "hotel",
            neighborhood: "Marina District",
            description:
              "A fictional boutique hotel with warm interiors, a quiet courtyard, and a dedicated workspace. Late check-in is available until 23:00. Taxes are included in the nightly rate.",
            nightlyCents: 16900,
            cleaningCents: 0,
            amenities: ["Wi-Fi", "Workspace", "Breakfast", "Late check-in"],
            image: "/rooms/hotel.svg",
          },
          {
            ...base,
            name: "A little room in the Sunset",
            type: "private",
            neighborhood: "Inner Sunset",
            hostName: "Maya · demo host",
            description:
              "A fictional private room in a shared home near Golden Gate Park. Shared bathroom, no pets, quiet hours from 22:00. Check-in is 15:00–20:00. Taxes are included in the nightly rate.",
            nightlyCents: 11500,
            cleaningCents: 2500,
            amenities: ["Wi-Fi", "Workspace", "Kitchen"],
            image: "/rooms/private.svg",
          },
          {
            ...base,
            name: "The Mission Studio",
            type: "private",
            neighborhood: "Mission District",
            hostName: "Alex · demo host",
            description:
              "A fictional self-contained studio with a kitchenette. Self check-in is available after 15:00. No smoking or parties. Taxes are included in the nightly rate.",
            nightlyCents: 14500,
            cleaningCents: 3500,
            cancellation: "restricted",
            amenities: [
              "Wi-Fi",
              "Kitchenette",
              "Late check-in",
              "Pet-friendly",
            ],
            image: "/rooms/studio.svg",
          },
        ];
        for (const seed of seeds) {
          const data = validateListing(seed);
          db.prepare("INSERT INTO listings VALUES (?,?,?)").run(
            data.id,
            tenantId,
            JSON.stringify(data),
          );
        }
      });
    },
    listListings(tenantId: string, filters: SearchFilters = {}) {
      tenant(tenantId);
      if (filters.guests !== undefined)
        integer(filters.guests, "Guests", 1, 12);
      if (filters.maxNightlyCents !== undefined)
        integer(filters.maxNightlyCents, "Budget", 0, 1_000_000);
      const amenities =
        filters.amenities === undefined ? [] : stringList(filters.amenities);
      if (Boolean(filters.checkIn) !== Boolean(filters.checkOut))
        throw new Error("Provide both check-in and check-out dates.");
      const dates =
        filters.checkIn && filters.checkOut
          ? stay(filters.checkIn, filters.checkOut, filters.guests ?? 1)
          : null;
      return (
        db
          .prepare("SELECT data FROM listings WHERE tenant_id=? ORDER BY rowid")
          .all(tenantId) as Row[]
      )
        .map((row) => parse<Listing>(row))
        .filter(
          (l) =>
            (!filters.guests || l.maxGuests >= filters.guests) &&
            (filters.maxNightlyCents === undefined ||
              l.nightlyCents <= filters.maxNightlyCents) &&
            (!filters.type ||
              filters.type === "any" ||
              l.type === filters.type) &&
            amenities.every((a) =>
              l.amenities.some((v) => v.toLowerCase() === a.toLowerCase()),
            ) &&
            (!dates || canUse(tenantId, l, dates.start, dates.end)),
        );
    },
    publishListing(tenantId: string, input: unknown) {
      tenant(tenantId);
      const l = validateListing(input);
      const count = db
        .prepare("SELECT COUNT(*) AS count FROM listings WHERE tenant_id=?")
        .get(tenantId) as { count: number };
      if (count.count >= 30)
        throw new Error("This demo supports up to 30 listings per session.");
      db.prepare("INSERT INTO listings VALUES (?,?,?)").run(
        l.id,
        tenantId,
        JSON.stringify(l),
      );
      return l;
    },
    createQuote(tenantId: string, input: QuoteInput) {
      tenant(tenantId);
      const { start, end, nights } = stay(
        input.checkIn,
        input.checkOut,
        input.guests,
      );
      const l = listing(tenantId, input.listingId);
      if (input.guests > l.maxGuests)
        throw new Error("This room cannot accommodate that many guests.");
      let original: Reservation | undefined;
      if (input.reservationId) {
        original = reservation(tenantId, input.reservationId);
        changeAllowed(original);
        if (original.listingId !== l.id)
          throw new Error("Date changes must use the same property.");
      }
      if (!canUse(tenantId, l, start, end, original?.id))
        throw new Error("This room is not available for those dates.");
      const q: Quote = {
        id: randomUUID(),
        listingId: l.id,
        listingName: l.name,
        checkIn: start,
        checkOut: end,
        guests: input.guests,
        nights,
        nightlyCents: l.nightlyCents,
        cleaningCents: l.cleaningCents,
        totalCents: l.nightlyCents * nights + l.cleaningCents,
        cancellation: l.cancellation,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        ...(original ? { reservationId: original.id } : {}),
      };
      db.prepare(
        "INSERT INTO quotes(id,tenant_id,data,expires_at,listing_terms,reservation_terms) VALUES (?,?,?,?,?,?)",
      ).run(
        q.id,
        tenantId,
        JSON.stringify(q),
        q.expiresAt,
        listingTerms(l),
        original ? reservationRevision(original) : null,
      );
      return q;
    },
    confirmQuote(
      tenantId: string,
      input: { quoteId: string; idempotencyKey: string },
    ) {
      tenant(tenantId);
      text(input.quoteId, "Quote ID");
      text(input.idempotencyKey, "Idempotency key", 128);
      return atomic(() => {
        const previous = db
          .prepare("SELECT * FROM idempotency WHERE tenant_id=? AND key=?")
          .get(tenantId, input.idempotencyKey) as Row | undefined;
        if (previous) {
          if (previous.quote_id !== input.quoteId)
            throw new Error(
              "Idempotency key was already used for another quote.",
            );
          return reservation(tenantId, previous.reservation_id as string);
        }
        const row = db
          .prepare("SELECT * FROM quotes WHERE tenant_id=? AND id=?")
          .get(tenantId, input.quoteId) as Row | undefined;
        if (!row) throw new Error("Quote not found.");
        if (row.confirmed_reservation_id) {
          const result = reservation(
            tenantId,
            row.confirmed_reservation_id as string,
          );
          db.prepare("INSERT INTO idempotency VALUES (?,?,?,?)").run(
            tenantId,
            input.idempotencyKey,
            input.quoteId,
            result.id,
          );
          return result;
        }
        const q = parse<Quote>(row);
        if (Date.parse(row.expires_at as string) <= Date.now())
          throw new Error("This quote has expired. Request a new quote.");
        const l = listing(tenantId, q.listingId);
        if (listingTerms(l) !== row.listing_terms)
          throw new Error(
            "Property details or prices have changed. Review a new quote.",
          );
        stay(q.checkIn, q.checkOut, q.guests);
        let original: Reservation | undefined;
        if (q.reservationId) {
          original = reservation(tenantId, q.reservationId);
          changeAllowed(original);
          if (reservationRevision(original) !== row.reservation_terms)
            throw new Error(
              "The original reservation has changed. Request a new quote.",
            );
        }
        if (!canUse(tenantId, l, q.checkIn, q.checkOut, original?.id))
          throw new Error(
            "This room is no longer available. Choose another stay.",
          );
        const r: Reservation = {
          ...q,
          id: original?.id ?? randomUUID(),
          confirmation:
            original?.confirmation ??
            `AB-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: "confirmed",
          createdAt: original?.createdAt ?? new Date().toISOString(),
        };
        if (original) {
          db.prepare(
            "DELETE FROM occupied_nights WHERE tenant_id=? AND reservation_id=?",
          ).run(tenantId, r.id);
          db.prepare(
            "UPDATE reservations SET data=? WHERE tenant_id=? AND id=?",
          ).run(JSON.stringify(r), tenantId, r.id);
        } else
          db.prepare("INSERT INTO reservations VALUES (?,?,?)").run(
            r.id,
            tenantId,
            JSON.stringify(r),
          );
        for (let n = 0; n < q.nights; n++)
          db.prepare("INSERT INTO occupied_nights VALUES (?,?,?,?)").run(
            tenantId,
            q.listingId,
            plusDays(q.checkIn, n),
            r.id,
          );
        db.prepare(
          "UPDATE quotes SET confirmed_reservation_id=? WHERE id=? AND tenant_id=?",
        ).run(r.id, q.id, tenantId);
        db.prepare("INSERT INTO idempotency VALUES (?,?,?,?)").run(
          tenantId,
          input.idempotencyKey,
          q.id,
          r.id,
        );
        return r;
      });
    },
    listReservations(tenantId: string) {
      tenant(tenantId);
      return (
        db
          .prepare(
            "SELECT data FROM reservations WHERE tenant_id=? ORDER BY rowid DESC",
          )
          .all(tenantId) as Row[]
      ).map((row) => parse<Reservation>(row));
    },
    cancelReservation(
      tenantId: string,
      reservationId: string,
      expectedState?: string,
    ) {
      tenant(tenantId);
      return atomic(() => {
        const r = reservation(tenantId, reservationId);
        if (
          expectedState !== undefined &&
          reservationRevision(r) !== expectedState
        )
          throw new Error("Reservation changed. Review cancellation again.");
        if (r.status === "canceled") return r;
        changeAllowed(r);
        const canceled = { ...r, status: "canceled" as const };
        db.prepare(
          "UPDATE reservations SET data=? WHERE tenant_id=? AND id=?",
        ).run(JSON.stringify(canceled), tenantId, r.id);
        db.prepare(
          "DELETE FROM occupied_nights WHERE tenant_id=? AND reservation_id=?",
        ).run(tenantId, r.id);
        return canceled;
      });
    },
    getPreferences(tenantId: string): Preferences {
      tenant(tenantId);
      const row = db
        .prepare("SELECT data FROM preferences WHERE tenant_id=?")
        .get(tenantId) as Row | undefined;
      return row
        ? parse<Preferences>(row)
        : { budget: 200, roomType: "any", amenities: [] };
    },
    savePreferences(tenantId: string, input: Preferences) {
      tenant(tenantId);
      if (
        typeof input.budget !== "number" ||
        !Number.isFinite(input.budget) ||
        input.budget < 10 ||
        input.budget > 10000
      )
        throw new Error("Budget must be between $10 and $10,000.");
      if (!["any", "hotel", "private"].includes(input.roomType))
        throw new Error("Choose any, hotel or private room.");
      const p = {
        budget: input.budget,
        roomType: input.roomType,
        amenities: stringList(input.amenities),
      };
      db.prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(tenant_id) DO UPDATE SET data=excluded.data",
      ).run(tenantId, JSON.stringify(p));
      return p;
    },
    getMessages(tenantId: string): Message[] {
      tenant(tenantId);
      return db
        .prepare(
          "SELECT role,content FROM (SELECT id,role,content FROM messages WHERE tenant_id=? ORDER BY id DESC LIMIT 20) ORDER BY id",
        )
        .all(tenantId) as Message[];
    },
    addMessage(tenantId: string, role: "user" | "assistant", content: string) {
      tenant(tenantId);
      if (role !== "user" && role !== "assistant")
        throw new Error("Invalid message role.");
      text(content, "Message", 12000);
      atomic(() => {
        db.prepare(
          "INSERT INTO messages(tenant_id,role,content) VALUES (?,?,?)",
        ).run(tenantId, role, content);
        db.prepare(
          "DELETE FROM messages WHERE tenant_id=? AND id NOT IN (SELECT id FROM messages WHERE tenant_id=? ORDER BY id DESC LIMIT 20)",
        ).run(tenantId, tenantId);
      });
    },
    addConversationTurn(tenantId: string, userContent: string, assistantContent: string) {
      tenant(tenantId);
      text(userContent, "Message", 12000);
      text(assistantContent, "Message", 12000);
      atomic(() => {
        const insert = db.prepare("INSERT INTO messages(tenant_id,role,content) VALUES (?,?,?)");
        insert.run(tenantId, "user", userContent);
        insert.run(tenantId, "assistant", assistantContent);
        db.prepare("DELETE FROM messages WHERE tenant_id=? AND id NOT IN (SELECT id FROM messages WHERE tenant_id=? ORDER BY id DESC LIMIT 20)").run(tenantId, tenantId);
      });
    },
  };
  return api;
}
export type Store = ReturnType<typeof createStore>;
