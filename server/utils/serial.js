/**
 * Serial number generator.
 * Atomically increments a per-type counter in the DB and returns a zero-padded serial.
 * Format: TYPE-NNNN (e.g. FREE-0001, PAID-0007, VIP-0003)
 */

let _db = null;
function setDb(db) {
  _db = db;
}

const PREFIX = {
  free: "FREE",
  draw: "DRAW",
  paid: "PAID",
  vip: "VIP",
  guest: "GST",
  volunteer: "VOL",
};

function nextSerial(type) {
  if (!_db) throw new Error("DB not initialised in serial.js");
  const prefix = PREFIX[type] || type.toUpperCase();

  // Atomic increment — no transaction wrapper since this is always called
  // inside a parent transaction (register.js, guest.js, admin.js, etc.)
  // and node-sqlite3-wasm does NOT support nested transactions.
  _db
    .prepare(
      "INSERT INTO serial_counters (type, count) VALUES (?, 1) ON CONFLICT(type) DO UPDATE SET count = count + 1",
    )
    .run(type);
  const row = _db
    .prepare("SELECT count FROM serial_counters WHERE type = ?")
    .get(type);
  const n = row ? row.count : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

module.exports = { setDb, nextSerial };
