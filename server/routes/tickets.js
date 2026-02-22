const express = require("express");
const router = express.Router();
let _db;
function setDb(db) {
  _db = db;
}

// Public settings for the user-facing site
router.get("/public-settings", (req, res) => {
  const keys = [
    "auth_email_enabled",
    "auth_google_enabled",
    "auth_phone_enabled",
    "free_enabled",
    "paid_enabled",
    "vip_enabled",
    "volunteer_enabled",
    "draw_enabled",
    "draw_accepting",
    "fcfs_limit",
    "max_paid_per_person",
    "event_name",
    "event_start_epoch",
    "paid_price",
    "vip_price",
  ];
  const result = {};
  const stmt = _db.prepare("SELECT value FROM event_settings WHERE key = ?");
  for (const k of keys) {
    const row = stmt.get(k);
    if (row) result[k] = row.value;
  }
  res.json(result);
});

// Get ticket by registration ID
router.get("/by-reg/:regId", (req, res) => {
  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(req.params.regId);
  if (!reg) return res.status(404).json({ error: "Not found" });
  const ticket = _db
    .prepare("SELECT * FROM tickets WHERE registration_id = ?")
    .get(reg.id);
  res.json({ registration: reg, ticket: ticket || null });
});

// Get all tickets for a paid order
router.get("/by-order/:orderId", (req, res) => {
  const regs = _db
    .prepare("SELECT * FROM registrations WHERE paid_order_id = ?")
    .all(req.params.orderId);
  if (!regs.length) return res.status(404).json({ error: "Order not found" });
  const tickets = regs.map((reg) => ({
    registration: reg,
    ticket: _db
      .prepare("SELECT * FROM tickets WHERE registration_id = ?")
      .get(reg.id),
  }));
  res.json({ tickets });
});

module.exports = { router, setDb };
