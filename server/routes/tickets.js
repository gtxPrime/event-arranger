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

const QRCode = require("qrcode");

// View printable ticket
router.get("/view/:ticketId", async (req, res) => {
  const ticket = _db
    .prepare("SELECT * FROM tickets WHERE id = ?")
    .get(req.params.ticketId);
  if (!ticket) return res.status(404).send("<h1>Ticket Not Found</h1>");

  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(ticket.registration_id);

  const qrDataUrl = await QRCode.toDataURL(ticket.qr_hash, { margin: 1 });
  const typeLabel =
    {
      free: "Free Entry",
      paid: "Paid Entry",
      vip: "VIP Access",
      guest: "Special Guest",
      volunteer: "Volunteer",
    }[reg.ticket_type] || reg.ticket_type;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LocalHost Ticket — ${reg.serial}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f4f3; display: flex; justify-content: center; padding: 40px 20px; }
        .ticket { background: #fff; width: 100%; max-width: 450px; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.1); text-align: center; }
        .header { background: #2f4f4f; color: #f5f5dc; padding: 40px 20px; }
        .header h1 { margin: 0; font-size: 24px; letter-spacing: 4px; }
        .content { padding: 40px; }
        .qr-box { background: #fff; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-bottom: 24px; }
        .serial { font-family: monospace; font-size: 20px; font-weight: bold; color: #2f4f4f; margin-bottom: 30px; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; border-top: 1px solid #eee; padding-top: 30px; }
        .label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 1px; }
        .value { font-size: 14px; font-weight: 600; color: #333; }
        .btn-print { margin-top: 40px; background: #2f4f4f; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        @media print { .btn-print { display: none; } body { background: #fff; padding: 0; } .ticket { box-shadow: none; border: 1px solid #eee; } }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="header">
          <h1>LOCAL&middot;HOST</h1>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 8px; letter-spacing: 2px;">MEMBER PASS</div>
        </div>
        <div class="content">
          <div class="qr-box">
            <img src="${qrDataUrl}" width="220" alt="QR">
          </div>
          <div class="serial">${reg.serial}</div>
          <div class="details">
            <div><div class="label">Attendee</div><div class="value">${reg.name}</div></div>
            <div><div class="label">Pass Type</div><div class="value">${typeLabel}</div></div>
            <div><div class="label">Date</div><div class="value">March 15, 2026</div></div>
            <div><div class="label">Plus One</div><div class="value">${reg.plus_one ? "Yes" : "No"}</div></div>
          </div>
          <button class="btn-print" onclick="window.print()">Print or Save as PDF</button>
        </div>
      </div>
    </body>
    </html>
  `);
});

module.exports = { router, setDb };
