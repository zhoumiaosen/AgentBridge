# Free persistent storage

AgentBridge can use one remote Turso/libSQL database while the app stays on Render's free web-service plan. All reservations and service quotes remain test-only. This changes where records are saved; it does not connect real inventory, appointments, or payments.

## Configure

1. Create a **Free** Turso account and a libSQL-compatible database near the Render service. Keep paid overages disabled. [Turso pricing](https://turso.tech/pricing) currently includes 5 GB storage, 500 million monthly rows read and 10 million written without a credit card.
2. Put the database URL in Render's private `TURSO_DATABASE_URL` environment setting. Put a database-scoped read/write token in `TURSO_AUTH_TOKEN`.
3. Keep the existing `SESSION_SECRET` unchanged. It signs the browser cookie that identifies each workspace. Rotating it or clearing cookies starts a new workspace even when the old records remain in the database.
4. Redeploy after both database settings are saved. Setting only one causes a configuration error; the app does not fall back to temporary storage after a remote connection failure.

Neither setting belongs in Git, a browser field, a `NEXT_PUBLIC_` variable, a build argument, or a recording. `.env.example` contains empty placeholders only. The Nebius key remains a separate server-only setting.

When neither Turso setting is configured, local development uses Node SQLite at `AGENTBRIDGE_DB_PATH` (default `data/agentbridge.sqlite`). An explicit in-memory test database always stays local. Render's free local filesystem is temporary, so that local mode does **not** preserve records across hosted restarts or deployments. [Render's free-service limitations](https://render.com/docs/free) also explain idle cold starts and the 30-day expiration of its free Postgres product.

## Existing records

Connecting an empty cloud database does not copy existing local or Render records. Before replacing the current deployment, export a consistent SQLite backup from that running deployment if its existing test records need to be retained. Import that backup into the new libSQL database before switching the app. Preserve all tables, tenant IDs, record IDs and history rows, then verify the same browser can still read its prior reservations and approved quotes. A laptop database is a separate database and is not a backup of the hosted service.

Do not claim a migration is complete without an export/import and read-back check. Keep database backups private and outside the repository; they include uploaded business instructions and private conversation history.

## Verification

After configuring a real remote database:

- Publish a test business in one browser workspace and find it from another.
- Prepare a quote without approval and verify no reservation exists.
- Approve a test booking; verify customer and business views agree.
- Restart or redeploy the app, retain the same browser cookies, and verify the saved agent, conversation and approval status still exist.
- Submit competing approvals for the same room and nights; only one can occupy those nights. Also check rollback, idempotent approval and a 30-night stay.

The local automated database checks cover settings validation, disk reopen persistence, foreign keys and rollback. They do not replace the remote restart and concurrency checks above.

## Driver constraints

The server uses the official stable `libsql` synchronous driver in remote-authoritative mode. It retains SQLite transactions and does not use a local replica, background snapshots or offline writes. [The driver](https://github.com/tursodatabase/libsql-js) maintains its own remote connection; there is no custom synchronous HTTP bridge.

Synchronous remote queries block the Node event loop, so this is intended for the single-instance test app. Move the store to an asynchronous driver before scaling traffic. Turso's [interactive transactions](https://docs.turso.tech/sdk/ts/reference) have a five-second timeout: keep model calls outside transactions and batch long insertion loops. The SQLite `busy_timeout` setting applies only locally and is not a remote network timeout. [Turso Cloud limitations](https://docs.turso.tech/cloud/limitations) document this distinction.

Turso publishes [durability guarantees](https://docs.turso.tech/cloud/durability) for acknowledged commits, independent of Render's temporary disk. Availability and usage limits still apply to the selected free plans.
