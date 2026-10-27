import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  readSession,
  createApproval,
  verifyApproval,
} from "../src/lib/security.ts";
const key = "test-secret-that-is-at-least-32-characters";
test("sessions reject altered or foreign signatures", () => {
  const s = signSession("tenant-one", key);
  assert.equal(readSession(s, key), "tenant-one");
  assert.equal(readSession(s + "x", key), null);
  assert.equal(readSession(s, "different-key"), null);
});
test("approvals bind action, tenant, target and expiry", () => {
  const token = createApproval("tenant-one", "book", "quote-one", key, 1000);
  assert.equal(
    verifyApproval(token, "tenant-one", "book", "quote-one", key, 1001),
    true,
  );
  assert.equal(
    verifyApproval(token, "tenant-two", "book", "quote-one", key, 1001),
    false,
  );
  assert.equal(
    verifyApproval(token, "tenant-one", "cancel", "quote-one", key, 1001),
    false,
  );
  assert.equal(
    verifyApproval(token, "tenant-one", "book", "quote-two", key, 1001),
    false,
  );
  assert.equal(
    verifyApproval(token, "tenant-one", "book", "quote-one", key, 602000),
    false,
  );
});

test("same-origin validation uses request Host rather than internal proxy URL", async () => {
  const { isSameOrigin } = await import("../src/lib/security.ts");
  assert.equal(isSameOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
  assert.equal(isSameOrigin("https://evil.example", "127.0.0.1:3000"), false);
  assert.equal(isSameOrigin(null, "127.0.0.1:3000"), false);
  assert.equal(isSameOrigin("null", "127.0.0.1:3000"), false);
});
