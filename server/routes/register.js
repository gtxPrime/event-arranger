const express = require("express");
const { v4: uuid } = require("uuid");
const QRCode = require("qrcode");
const { generateQRHash } = require("../utils/qr");
const { nextSerial } = require("../utils/serial");
const {
  sendTicketConfirmation,
  sendWaitlistPromoEmail,
} = require("../config/email");
const { writeAudit } = require("../middleware/auditLog");

const router = express.Router();
let _db;
function setDb(db) {
  _db = db;
}

function getSetting(key) {
  const row = _db
    .prepare("SELECT value FROM event_settings WHERE key = ?")
    .get(key);
  return row ? row.value : "0";
}

function getUser(req) {
  return req.session?.user || null;
}

// Generate a ticket (QR hash + QR data URL) for a registration
async function issueTicket(registration) {
  const qrHash = generateQRHash(registration.id);
  const ticketId = uuid();
  const now = Date.now();
  _db
    .prepare(
      "INSERT INTO tickets (id, registration_id, qr_hash, used, generated_at, guest_code_id) VALUES (?,?,?,0,?,?)",
    )
    .run(
      ticketId,
      registration.id,
      qrHash,
      now,
      registration.guest_code_id || null,
    );

  // Update registration to confirmed
  _db
    .prepare(
      "UPDATE registrations SET status='confirmed', updated_at=? WHERE id=?",
    )
    .run(now, registration.id);

  return { ticketId, qrHash };
}

// ── FREE Registration ─────────────────────────────────────────────────────────
router.post("/free", async (req, res) => {
  try {
    if (getSetting("free_enabled") !== "1") {
      return res
        .status(403)
        .json({ error: "Free registration is closed", code: "FREE_CLOSED" });
    }

    const user = getUser(req);
    const email = (req.body.email || user?.email || "").toLowerCase().trim();
    const name = req.body.name || user?.name || "";
    const phone = req.body.phone || user?.phone || "";

    if (!email) return res.status(400).json({ error: "Email required" });

    // Check already registered
    const existing = _db
      .prepare("SELECT id, status FROM registrations WHERE email = ?")
      .get(email);
    if (existing)
      return res
        .status(409)
        .json({ error: "Email already registered", status: existing.status });

    const now = Date.now();
    const regId = uuid();

    // ── PESSIMISTIC LOCKING: BEGIN IMMEDIATE transaction ─────────────────────
    const tx = _db.transaction(() => {
      const fcfsLimit = parseInt(getSetting("fcfs_limit"), 10);
      const totalFreeCap = parseInt(getSetting("total_free_cap"), 10);

      const confirmedCount = _db
        .prepare(
          "SELECT COUNT(*) as c FROM registrations WHERE ticket_type='free' AND status IN ('approved','confirmed','checked_in')",
        )
        .get().c;

      const totalFreeCount = _db
        .prepare(
          "SELECT COUNT(*) as c FROM registrations WHERE ticket_type='free' AND status NOT IN ('expired','draw_lost','revoked')",
        )
        .get().c;

      if (totalFreeCount >= totalFreeCap) {
        return { full: true };
      }

      let status, drawEntry;
      if (confirmedCount < fcfsLimit) {
        // Phase 1: FCFS guaranteed slot
        status = "approved";
        drawEntry = 0;
      } else {
        // Phase 2: Lucky draw
        if (
          getSetting("draw_enabled") !== "1" ||
          getSetting("draw_accepting") !== "1"
        ) {
          return { drawClosed: true };
        }
        status = "pending_draw";
        drawEntry = 1;
      }

      const serial = nextSerial(status === "pending_draw" ? "draw" : "free");
      _db
        .prepare(
          `
      INSERT INTO registrations (id, serial, user_id, email, name, phone, ticket_type, status, draw_entry, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,
        )
        .run(
          regId,
          serial,
          user?.id || null,
          email,
          name,
          phone,
          "free",
          status,
          drawEntry,
          now,
          now,
        );

      return { status, serial };
    });

    const result = tx();

    if (result.full)
      return res
        .status(409)
        .json({ error: "Event is fully booked", code: "FULL" });
    if (result.drawClosed)
      return res
        .status(403)
        .json({ error: "Lucky draw is closed", code: "DRAW_CLOSED" });

    const reg = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(regId);

    // If approved (FCFS), issue ticket immediately
    if (result.status === "approved") {
      await issueTicket(reg);
      const updatedReg = _db
        .prepare("SELECT * FROM registrations WHERE id = ?")
        .get(regId);
      sendTicketConfirmation(updatedReg, null, null).catch(console.error);
      return res.json({
        ok: true,
        status: "confirmed",
        serial: result.serial,
        registrationId: regId,
      });
    }

    // If draw entry
    return res.json({
      ok: true,
      status: "pending_draw",
      serial: result.serial,
      registrationId: regId,
      message:
        "You are in the lucky draw! Results will be announced before the event.",
    });
  } catch (e) {
    console.error("[Free Register Error]", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});

// ── PAID Registration (multi-ticket) ─────────────────────────────────────────
router.post("/paid", async (req, res) => {
  try {
    if (getSetting("paid_enabled") !== "1") {
      return res
        .status(403)
        .json({ error: "Paid registration is closed", code: "PAID_CLOSED" });
    }

    const user = getUser(req);
    const { tickets: ticketList } = req.body;
    if (!Array.isArray(ticketList) || ticketList.length === 0) {
      return res.status(400).json({ error: "ticket list required" });
    }

    const maxPerPerson = parseInt(getSetting("max_paid_per_person"), 10) || 3;
    if (ticketList.length > maxPerPerson) {
      return res
        .status(400)
        .json({ error: `Max ${maxPerPerson} tickets per purchase` });
    }

    const emails = ticketList.map((t) => (t.email || "").toLowerCase().trim());
    if (new Set(emails).size !== emails.length) {
      return res
        .status(400)
        .json({ error: "Each ticket must have a unique email address" });
    }
    if (emails.some((e) => !e))
      return res.status(400).json({ error: "All tickets must have an email" });

    const timeoutMins = parseInt(getSetting("checkout_timeout_mins"), 10) || 5;
    const lockExpires = Date.now() + timeoutMins * 60 * 1000;
    const orderId = uuid();
    const now = Date.now();
    const regIds = [];

    const tx = _db.transaction(() => {
      const totalPaidCap = parseInt(getSetting("total_paid_cap"), 10);
      const currentPaid = _db
        .prepare(
          "SELECT COUNT(*) as c FROM registrations WHERE ticket_type='paid' AND status NOT IN ('expired','revoked')",
        )
        .get().c;

      if (currentPaid + ticketList.length > totalPaidCap) {
        return { full: true };
      }

      for (const t of ticketList) {
        const email = t.email.toLowerCase().trim();
        const existing = _db
          .prepare("SELECT id FROM registrations WHERE email = ?")
          .get(email);
        if (existing) return { duplicateEmail: email };

        const id = uuid();
        const serial = nextSerial("paid");
        _db
          .prepare(
            `
        INSERT INTO registrations (id, serial, user_id, email, name, phone, ticket_type, status, payment_lock_expires, paid_order_id, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `,
          )
          .run(
            id,
            serial,
            user?.id || null,
            email,
            t.name || "",
            t.phone || "",
            "paid",
            "pending_payment",
            lockExpires,
            orderId,
            now,
            now,
          );
        regIds.push({ id, serial, email });
      }
      return { ok: true };
    });

    const result = tx();
    if (result.full)
      return res
        .status(409)
        .json({ error: "Paid tickets sold out", code: "PAID_FULL" });
    if (result.duplicateEmail)
      return res
        .status(409)
        .json({ error: `Email already registered: ${result.duplicateEmail}` });

    res.json({
      ok: true,
      orderId,
      registrations: regIds,
      lockExpires,
      timeoutMins,
    });
  } catch (e) {
    console.error("[Paid Register Error]", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});
router.post("/vip", async (req, res) => {
  try {
    if (getSetting("vip_enabled") !== "1") {
      return res
        .status(403)
        .json({ error: "VIP registration is closed", code: "VIP_CLOSED" });
    }

    const user = getUser(req);
    const { tickets: ticketList } = req.body;
    if (!Array.isArray(ticketList) || ticketList.length === 0)
      return res.status(400).json({ error: "ticket list required" });

    const emails = ticketList.map((t) => (t.email || "").toLowerCase().trim());
    const timeoutMins = parseInt(getSetting("checkout_timeout_mins"), 10) || 5;
    const lockExpires = Date.now() + timeoutMins * 60 * 1000;
    const orderId = uuid();
    const now = Date.now();
    const regIds = [];

    const tx = _db.transaction(() => {
      for (const t of ticketList) {
        const email = t.email.toLowerCase().trim();
        const existing = _db
          .prepare("SELECT id FROM registrations WHERE email = ?")
          .get(email);
        if (existing) return { duplicateEmail: email };

        const id = uuid();
        const serial = nextSerial("vip");
        _db
          .prepare(
            `
        INSERT INTO registrations (id, serial, user_id, email, name, phone, ticket_type, status, payment_lock_expires, paid_order_id, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `,
          )
          .run(
            id,
            serial,
            user?.id || null,
            email,
            t.name || "",
            t.phone || "",
            "vip",
            "pending_payment",
            lockExpires,
            orderId,
            now,
            now,
          );
        regIds.push({ id, serial, email });
      }
      return { ok: true };
    });

    const result = tx();
    if (result.duplicateEmail)
      return res
        .status(409)
        .json({ error: `Email already registered: ${result.duplicateEmail}` });

    res.json({
      ok: true,
      orderId,
      registrations: regIds,
      lockExpires,
      timeoutMins,
    });
  } catch (e) {
    console.error("[VIP Register Error]", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});
router.post("/confirm-payment", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const regs = _db
      .prepare(
        "SELECT * FROM registrations WHERE paid_order_id = ? AND status = 'pending_payment'",
      )
      .all(orderId);

    if (!regs.length)
      return res
        .status(404)
        .json({ error: "Order not found or already processed" });

    // Check none expired
    const expired = regs.filter((r) => r.payment_lock_expires < Date.now());
    if (expired.length > 0) {
      _db
        .prepare(
          "UPDATE registrations SET status='expired', updated_at=? WHERE paid_order_id=? AND status='pending_payment'",
        )
        .run(Date.now(), orderId);
      return res.status(410).json({
        error: "Payment window expired — seats released",
        code: "TIMEOUT",
      });
    }

    const issued = [];
    for (const reg of regs) {
      await issueTicket(reg);
      const updated = _db
        .prepare("SELECT * FROM registrations WHERE id = ?")
        .get(reg.id);
      sendTicketConfirmation(updated, null, null).catch(console.error);
      issued.push({ id: reg.id, serial: reg.serial, email: reg.email });
    }

    res.json({ ok: true, confirmed: issued });
  } catch (e) {
    console.error("[Confirm Payment Error]", e);
    res
      .status(500)
      .json({ error: "Payment confirmation failed: " + e.message });
  }
});
router.post("/volunteer", async (req, res) => {
  try {
    if (getSetting("volunteer_enabled") !== "1") {
      return res
        .status(403)
        .json({
          error: "Volunteer registration is closed",
          code: "VOL_CLOSED",
        });
    }

    const user = getUser(req);
    const { code, email: reqEmail, name, phone } = req.body;
    const email = (reqEmail || user?.email || "").toLowerCase().trim();

    if (!code)
      return res.status(400).json({ error: "Volunteer code required" });
    if (!email) return res.status(400).json({ error: "Email required" });

    const volCode = _db
      .prepare("SELECT * FROM volunteer_codes WHERE code = ?")
      .get(code);
    if (!volCode)
      return res.status(404).json({ error: "Invalid volunteer code" });
    if (volCode.revoked)
      return res
        .status(403)
        .json({ error: "This volunteer code has been revoked" });
    if (volCode.expires_at && Date.now() > volCode.expires_at)
      return res.status(403).json({ error: "Volunteer code expired" });
    if (volCode.used)
      return res
        .status(409)
        .json({ error: "This volunteer code has already been used" });
    if (volCode.linked_email.toLowerCase() !== email) {
      return res.status(403).json({
        error: "Email does not match this volunteer code",
        code: "EMAIL_MISMATCH",
      });
    }

    const existing = _db
      .prepare("SELECT id FROM registrations WHERE email = ?")
      .get(email);
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    const now = Date.now();
    const regId = uuid();
    const serial = nextSerial("volunteer");

    _db.prepare("UPDATE volunteer_codes SET used=1 WHERE id=?").run(volCode.id);
    _db
      .prepare(
        `
    INSERT INTO registrations (id, serial, user_id, email, name, phone, ticket_type, status, volunteer_code_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `,
      )
      .run(
        regId,
        serial,
        user?.id || null,
        email,
        name || "",
        phone || "",
        "volunteer",
        "approved",
        volCode.id,
        now,
        now,
      );

    const reg = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(regId);
    await issueTicket(reg);
    const updated = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(regId);
    sendTicketConfirmation(updated, null, null).catch(console.error);

    res.json({ ok: true, status: "confirmed", serial, registrationId: regId });
  } catch (e) {
    console.error("[Volunteer Register Error]", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});
function startPaymentExpiryJob() {
  setInterval(() => {
    const expired = _db
      .prepare(
        "SELECT id, email, name FROM registrations WHERE status='pending_payment' AND payment_lock_expires < ?",
      )
      .all(Date.now());

    if (expired.length === 0) return;

    _db
      .prepare(
        "UPDATE registrations SET status='expired', updated_at=? WHERE status='pending_payment' AND payment_lock_expires < ?",
      )
      .run(Date.now(), Date.now());

    console.log(`[Payment Expiry] Expired ${expired.length} timed-out seat(s)`);

    // Notify waitlist (next pending_draw person if any)
    const nextWaitlist = _db
      .prepare(
        "SELECT * FROM registrations WHERE status='pending_draw' ORDER BY created_at ASC LIMIT 1",
      )
      .get();
    if (nextWaitlist) {
      sendWaitlistPromoEmail(nextWaitlist).catch(console.error);
    }
  }, 30_000);
  console.log("[Payment Expiry] Job started — checks every 30s");
}

module.exports = { router, setDb, startPaymentExpiryJob };
