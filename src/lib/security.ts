import { createHmac, timingSafeEqual } from "node:crypto";
function mac(value: string, key: string) {
  return createHmac("sha256", key).update(value).digest("base64url");
}
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function signSession(tenant: string, key: string) {
  return `${tenant}.${mac(tenant, key)}`;
}
export function readSession(value: string, key: string): string | null {
  const [tenant, signature, ...extra] = value.split(".");
  return tenant &&
    signature &&
    !extra.length &&
    /^[a-zA-Z0-9-]{1,80}$/.test(tenant) &&
    safeEqual(signature, mac(tenant, key))
    ? tenant
    : null;
}
export function createApproval(
  tenant: string,
  action: string,
  target: string,
  key: string,
  now = Date.now(),
) {
  const data = Buffer.from(
    JSON.stringify({ tenant, action, target, expires: now + 600000 }),
  ).toString("base64url");
  return `${data}.${mac(data, key)}`;
}
export function verifyApproval(
  token: string,
  tenant: string,
  action: string,
  target: string,
  key: string,
  now = Date.now(),
) {
  try {
    const [data, signature, ...extra] = token.split(".");
    if (
      !data ||
      !signature ||
      extra.length ||
      !safeEqual(signature, mac(data, key))
    )
      return false;
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    return (
      p.tenant === tenant &&
      p.action === action &&
      p.target === target &&
      Number.isFinite(p.expires) &&
      p.expires > now
    );
  } catch {
    return false;
  }
}
export function isSameOrigin(
  origin: string | null,
  host: string | null,
): boolean {
  try {
    if (!origin || !host) return false;
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.host === host &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
