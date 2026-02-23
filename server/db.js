const Database = require("./utils/sqlite-compat");
const path = require("path");
const fs = require("fs");
const env = require("./config/env");

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = path.resolve(__dirname, "..", env.DB_PATH);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Clear stale wasm-sqlite locks if they exist (common on shared hosting after a crash)
  const lockPath = dbPath + ".lock";
  if (fs.existsSync(lockPath)) {
    try {
      fs.rmdirSync(lockPath, { recursive: true });
      console.log("[DB] Cleared stale lock directory");
    } catch (e) {
      console.warn("[DB] Could not clear lock directory:", e.message);
    }
  }

  db = new Database(dbPath);

  migrate(db);
  seedDefaults(db);
  return db;
}

function migrate(db) {
  db.exec(`
    -- Event settings (key-value store, all admin-tunable)
    CREATE TABLE IF NOT EXISTS event_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Admin accounts
    CREATE TABLE IF NOT EXISTS admins (
      id           TEXT PRIMARY KEY,
      username     TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );

    -- User accounts (optional — used when auth is on)
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      name         TEXT,
      phone        TEXT,
      password     TEXT,
      google_id    TEXT,
      created_at   INTEGER NOT NULL
    );

    -- Serial number counters per ticket type
    CREATE TABLE IF NOT EXISTS serial_counters (
      type  TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );

    -- Guest list codes (VIP / Special Guest URL codes)
    CREATE TABLE IF NOT EXISTS guest_list_codes (
      id                 TEXT PRIMARY KEY,
      code_plain         TEXT UNIQUE NOT NULL,
      code_url_safe      TEXT NOT NULL,
      label              TEXT NOT NULL,
      created_by_admin   TEXT NOT NULL,
      max_registrations  INTEGER NOT NULL DEFAULT 10,
      used_count         INTEGER NOT NULL DEFAULT 0,
      plus_one_allowed   INTEGER NOT NULL DEFAULT 0,
      auto_approve       INTEGER NOT NULL DEFAULT 1,
      expires_at         INTEGER,
      revoked            INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL
    );

    -- Volunteer codes (tied to specific email)
    CREATE TABLE IF NOT EXISTS volunteer_codes (
      id              TEXT PRIMARY KEY,
      code            TEXT UNIQUE NOT NULL,
      linked_email    TEXT NOT NULL,
      created_by      TEXT NOT NULL,
      expires_at      INTEGER,
      revoked         INTEGER NOT NULL DEFAULT 0,
      used            INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL
    );

    -- Registrations (core state machine)
    CREATE TABLE IF NOT EXISTS registrations (
      id                    TEXT PRIMARY KEY,
      serial                TEXT UNIQUE,
      user_id               TEXT,
      email                 TEXT NOT NULL,
      name                  TEXT NOT NULL DEFAULT '',
      phone                 TEXT DEFAULT '',
      ticket_type           TEXT NOT NULL CHECK(ticket_type IN ('free','paid','vip','guest','volunteer')),
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','pending_draw','pending_payment','approved','confirmed','checked_in','expired','draw_lost','revoked')),
      guest_code_id         TEXT,
      volunteer_code_id     TEXT,
      plus_one              INTEGER NOT NULL DEFAULT 0,
      payment_lock_expires  INTEGER,
      paid_order_id         TEXT,
      draw_entry            INTEGER NOT NULL DEFAULT 0,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(guest_code_id) REFERENCES guest_list_codes(id),
      FOREIGN KEY(volunteer_code_id) REFERENCES volunteer_codes(id)
    );

    -- Tickets (QR codes)
    CREATE TABLE IF NOT EXISTS tickets (
      id              TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL UNIQUE,
      qr_hash         TEXT NOT NULL UNIQUE,
      used            INTEGER NOT NULL DEFAULT 0,
      used_at         INTEGER,
      generated_at    INTEGER NOT NULL,
      guest_code_id   TEXT,
      FOREIGN KEY(registration_id) REFERENCES registrations(id),
      FOREIGN KEY(guest_code_id)   REFERENCES guest_list_codes(id)
    );

    -- Audit logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id    TEXT NOT NULL,
      action      TEXT NOT NULL,
      target_id   TEXT,
      details     TEXT,
      created_at  INTEGER NOT NULL
    );

    -- Phone OTP store (ephemeral)
    CREATE TABLE IF NOT EXISTS phone_otps (
      phone      TEXT PRIMARY KEY,
      otp        TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_reg_email       ON registrations(email);
    CREATE INDEX IF NOT EXISTS idx_reg_status      ON registrations(status);
    CREATE INDEX IF NOT EXISTS idx_reg_type        ON registrations(ticket_type);
    CREATE INDEX IF NOT EXISTS idx_tickets_hash    ON tickets(qr_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
  `);

  // Additive migrations (safe to run on existing DB)
  const safeAlter = (sql) => {
    try {
      db.exec(sql);
    } catch {}
  };
  safeAlter("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
  safeAlter(
    "CREATE INDEX IF NOT EXISTS idx_users_firebase ON users(firebase_uid)",
  );

  console.log("[DB] Migrations applied");
}

function seedDefaults(db) {
  const defaults = {
    // Auth toggles
    auth_email_enabled: "1",
    auth_google_enabled: "1",
    auth_phone_enabled: "1",
    // Tier toggles
    free_enabled: "1",
    paid_enabled: "1",
    vip_enabled: "1",
    volunteer_enabled: "1",
    draw_enabled: "1",
    draw_accepting: "1",
    // Quotas
    fcfs_limit: "200",
    total_free_cap: "400",
    total_paid_cap: "600",
    max_paid_per_person: "3",
    checkout_timeout_mins: "5",
    late_cutoff_mins: "30",
    paid_price: "499",
    vip_price: "999",
    event_start_epoch: "0",
    event_name: "LocalHost Festival",
    // Random selection auto-schedule
    draw_auto_run: "1",
    draw_run_offset_mins: "120",
    draw_has_run: "0",
    // +1 controls
    plus_one_vip_enabled: "1",
    plus_one_volunteer_enabled: "0",
  };

  const insert = db.prepare(
    "INSERT OR IGNORE INTO event_settings (key, value) VALUES (?, ?)",
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
  });
  tx();
  console.log("[DB] Default settings seeded");
}

module.exports = { getDb };
