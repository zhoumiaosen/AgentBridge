import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Libsql from "libsql";
import { databasePath, openDatabase } from "../src/lib/database.ts";

test("cloud configuration requires both settings and a secure database URL", () => {
  assert.equal(databasePath({}), "./data/agentbridge.sqlite");
  assert.equal(databasePath({ AGENTBRIDGE_DB_PATH: "/tmp/local.sqlite" }), "/tmp/local.sqlite");
  for (const env of [
    { TURSO_DATABASE_URL: "libsql://example.turso.io" },
    { TURSO_AUTH_TOKEN: "private-test-token" },
    { TURSO_DATABASE_URL: "http://example.turso.io", TURSO_AUTH_TOKEN: "private-test-token" },
    { TURSO_DATABASE_URL: "file:local.sqlite", TURSO_AUTH_TOKEN: "private-test-token" },
    { TURSO_DATABASE_URL: "https://user:private-test-token@example.turso.io", TURSO_AUTH_TOKEN: "private-test-token" },
    { TURSO_DATABASE_URL: "https://example.turso.io?token=private-test-token", TURSO_AUTH_TOKEN: "private-test-token" },
  ]) {
    assert.throws(() => databasePath(env), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("private-test-token"));
      return true;
    });
  }
  for (const url of ["libsql://example.turso.io", "https://example.turso.io"]) {
    assert.equal(databasePath({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "private-test-token" }), url);
  }
});

test("explicit local databases use Node SQLite and keep data after reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "agentbridge-database-"));
  const path = join(dir, "nested", "records.sqlite");
  try {
    const first = openDatabase(path);
    assert.ok(first instanceof DatabaseSync);
    first.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    first.prepare("INSERT INTO records VALUES (?,?)").run("agent", "published test agent");
    first.close();
    const reopened = openDatabase(path);
    try {
      assert.equal(reopened.prepare("SELECT value FROM records WHERE id=?").get("agent")?.value, "published test agent");
    } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the local driver enforces foreign keys and rolls back a transaction", () => {
  const db = openDatabase(":memory:");
  try {
    db.exec("CREATE TABLE parents(id TEXT PRIMARY KEY); CREATE TABLE children(parent_id TEXT REFERENCES parents(id))");
    assert.throws(() => db.prepare("INSERT INTO children VALUES (?)").run("missing"), /FOREIGN KEY/);
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO parents VALUES (?)").run("test");
    db.exec("ROLLBACK");
    assert.equal(db.prepare("SELECT id FROM parents").get(), undefined);
  } finally { db.close(); }
});

test("invalid remote configuration cannot create a local fallback database", () => {
  assert.throws(() => openDatabase("libsql://example.turso.io", { authToken: "" }), /TURSO_AUTH_TOKEN/);
  assert.throws(() => openDatabase("http://example.turso.io", { authToken: "private-test-token" }), /libsql.*https/i);
});

test("the installed libSQL native driver supports the store's synchronous transaction contract", () => {
  const db = new Libsql(":memory:");
  try {
    db.exec("CREATE TABLE reservations(id TEXT PRIMARY KEY, status TEXT NOT NULL)");
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO reservations VALUES (?,?)").run("test-booking", "confirmed");
    db.exec("COMMIT");
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE reservations SET status=? WHERE id=?").run("canceled", "test-booking");
    db.exec("ROLLBACK");
    assert.deepEqual(db.prepare("SELECT id,status FROM reservations").all(), [{ id: "test-booking", status: "confirmed" }]);
  } finally { db.close(); }
});
