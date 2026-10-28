import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createStore } from "./store";
import { databasePath } from "./database";
import { readSession, signSession, isSameOrigin } from "./security";
const globals = globalThis as unknown as {
  bridgeStore?: ReturnType<typeof createStore>;
  bridgeSecret?: string;
};
export function secret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET must be at least 32 characters");
  return (
    process.env.SESSION_SECRET ||
    (globals.bridgeSecret ??= randomBytes(32).toString("hex"))
  );
}
export function store() {
  if (!globals.bridgeStore) {
    globals.bridgeStore = createStore(databasePath());
  }
  return globals.bridgeStore;
}
export async function tenant() {
  const jar = await cookies();
  let id = readSession(jar.get("agentbridge-session")?.value || "", secret());
  if (!id) {
    id = randomUUID();
    jar.set("agentbridge-session", signSession(id, secret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  store().ensureTenant(id);
  return id;
}
export function guardRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!isSameOrigin(origin, request.headers.get("host")))
    throw new Error("This action must be requested from AgentBridge.");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32000) throw new Error("Request is too large.");
}
