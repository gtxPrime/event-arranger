const express = require("express");
const { v4: uuid } = require("uuid");
const {
  generateGuestListCode,
  parseGuestCodeParam,
} = require("../utils/codeEncrypt");
const { nextSerial } = require("../utils/serial");
const { sendTicketConfirmation } = require("../config/email");
const { generateQRHash } = require("../utils/qr");

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

function getGuestCode(urlSafeParam) {
  const plain = parseGuestCodeParam(urlSafeParam);
  if (!plain) return null;
  return _db
    .prepare("SELECT * FROM guest_list_codes WHERE code_plain = ?")
    .get(plain);
}

// ── Validate a guest-list code (called when guest lands on /guest?code=XXX) ──
router.get("/validate", (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "No code provided" });

  if (getSetting("vip_enabled") !== "1") {
    return res.status(403).json({
      error: "Special guest registration is currently disabled",
      code: "VIP_DISABLED",
    });
  }

  const guestCode = getGuestCode(code);
  if (!guestCode)
    return res
      .status(404)
      .json({ error: "Invalid guest code", code: "INVALID" });
  if (guestCode.revoked)
    return res
      .status(403)
      .json({ error: "This guest list has been revoked", code: "REVOKED" });
  if (guestCode.expires_at && Date.now() > guestCode.expires_at) {
    return res
      .status(403)
      .json({ error: "Guest list has expired", code: "EXPIRED" });
  }
  if (guestCode.used_count >= guestCode.max_registrations) {
    return res
      .status(409)
      .json({ error: "This guest list is full", code: "FULL" });
  }

  res.json({
    ok: true,
    label: guestCode.label,
    slotsLeft: guestCode.max_registrations - guestCode.used_count,
    plusOneAllowed: !!guestCode.plus_one_allowed,
    autoApprove: !!guestCode.auto_approve,
  });
});

// ── Register via guest-list URL code ─────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { code, email: rawEmail, name, phone, plusOne } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });

    if (getSetting("vip_enabled") !== "1") {
      return res.status(403).json({
        error: "Special guest registration disabled",
        code: "VIP_DISABLED",
      });
    }

    const email = (rawEmail || "").toLowerCase().trim();
    if (!email || !name)
      return res.status(400).json({ error: "Name and email required" });

    const existing = _db
      .prepare("SELECT id FROM registrations WHERE email = ?")
      .get(email);
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    const tx = _db.transaction(() => {
      const guestCode = getGuestCode(code);
      if (!guestCode) return { error: "Invalid guest code", code: "INVALID" };
      if (guestCode.revoked)
        return { error: "Guest list revoked", code: "REVOKED" };
      if (guestCode.expires_at && Date.now() > guestCode.expires_at)
        return { error: "Guest list expired", code: "EXPIRED" };
      if (guestCode.used_count >= guestCode.max_registrations)
        return { error: "Guest list full", code: "FULL" };

      const plusOneAllowed =
        getSetting("plus_one_vip_enabled") === "1" &&
        !!guestCode.plus_one_allowed;
      const wantsPlusOne = plusOne && plusOneAllowed;

      const status = guestCode.auto_approve ? "approved" : "pending";
      const serial = nextSerial("guest");
      const regId = uuid();
      const now = Date.now();

      _db
        .prepare(
          `
      INSERT INTO registrations (id, serial, email, name, phone, ticket_type, status, guest_code_id, plus_one, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,
        )
        .run(
          regId,
          serial,
          email,
          name,
          phone || "",
          "guest",
          status,
          guestCode.id,
          wantsPlusOne ? 1 : 0,
          now,
          now,
        );

      _db
        .prepare(
          "UPDATE guest_list_codes SET used_count = used_count + 1 WHERE id = ?",
        )
        .run(guestCode.id);

      return { ok: true, regId, serial, status, plusOneAllowed, wantsPlusOne };
    });

    const result = tx();
    if (result.error) return res.status(403).json(result);

    const reg = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(result.regId);

    if (result.status === "approved") {
      // Issue ticket
      const qrHash = generateQRHash(reg.id);
      const ticketId = uuid();
      _db
        .prepare(
          "INSERT INTO tickets (id, registration_id, qr_hash, used, generated_at, guest_code_id) VALUES (?,?,?,0,?,?)",
        )
        .run(ticketId, reg.id, qrHash, Date.now(), reg.guest_code_id);
      _db
        .prepare(
          "UPDATE registrations SET status='confirmed', updated_at=? WHERE id=?",
        )
        .run(Date.now(), reg.id);

      const updated = _db
        .prepare("SELECT * FROM registrations WHERE id = ?")
        .get(reg.id);
      sendTicketConfirmation(updated, null, null).catch(console.error);
    }

    res.json({
      ok: true,
      status: result.status,
      serial: result.serial,
      registrationId: result.regId,
      plusOne: result.wantsPlusOne,
      message:
        result.status === "approved"
          ? "Confirmed! Check your email for your QR code."
          : "Your request is pending admin approval.",
    });
  } catch (e) {
    console.error("[Guest Register Error]", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});

module.exports = { router, setDb };
