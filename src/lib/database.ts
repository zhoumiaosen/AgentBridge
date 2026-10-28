import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Libsql from "libsql";

type Row = Record<string, SQLOutputValue>;
export type SyncDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: SQLInputValue[]): Row | undefined;
    all(...values: SQLInputValue[]): Row[];
    run(...values: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  close(): void;
};

function remoteUrl(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("TURSO_DATABASE_URL must be a libsql:// or https:// database URL."); }
  if (!["libsql:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("TURSO_DATABASE_URL must be a libsql:// or https:// database URL without credentials or query parameters.");
  }
  return value;
}

export function databasePath(env: Record<string, string | undefined> = process.env) {
  const url = env.TURSO_DATABASE_URL?.trim();
  const token = env.TURSO_AUTH_TOKEN?.trim();
  if (url || token) {
    if (!url || !token) throw new Error("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent storage.");
    return remoteUrl(url);
  }
  return env.AGENTBRIDGE_DB_PATH || "./data/agentbridge.sqlite";
}

export function openDatabase(path: string, options: { authToken?: string } = {}): SyncDatabase {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    remoteUrl(path);
    const authToken = (options.authToken ?? process.env.TURSO_AUTH_TOKEN)?.trim();
    if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required for persistent storage.");
    // shortcut: synchronous remote queries block Node; use an async store before scaling traffic.
    // The stable package supports authToken at runtime but omits it from its published types.
    const connectionOptions: NonNullable<ConstructorParameters<typeof Libsql>[1]> & { authToken: string } = { authToken };
    const db = new Libsql(path, connectionOptions);
    db.exec("PRAGMA foreign_keys=ON");
    return db as SyncDatabase;
  }
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  return db;
}
