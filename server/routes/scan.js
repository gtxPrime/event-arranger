const express = require("express");
const { verifyQRHash } = require("../utils/qr");

const router = express.Router();
let _db;
function setDb(db) {
  _db = db;
}

function getSetting(key) {
  return (
    (
      _db.prepare("SELECT value FROM event_settings WHERE key = ?").get(key) ||
      {}
    ).value || "0"
  );
}

// ── Scan a QR code ────────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { qrHash } = req.body;
  if (!qrHash)
    return res
      .status(400)
      .json({ result: "INVALID", reason: "No QR data provided" });

  // Step 1: Verify HMAC signature
  const verified = verifyQRHash(qrHash);
  if (!verified.valid) {
    return res.json({
      result: "INVALID",
      reason: "Tampered or unknown QR code",
    });
  }

  // Step 2: Look up ticket
  const ticket = _db
    .prepare("SELECT * FROM tickets WHERE qr_hash = ?")
    .get(qrHash);
  if (!ticket)
    return res.json({
      result: "INVALID",
      reason: "QR code not found in system",
    });

  // Step 3: Load registration
  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(ticket.registration_id);
  if (!reg)
    return res.json({ result: "INVALID", reason: "Registration not found" });

  // Step 4: Check for cascade revoke (guest-list code revoked?)
  if (reg.guest_code_id) {
    const guestCode = _db
      .prepare("SELECT revoked FROM guest_list_codes WHERE id = ?")
      .get(reg.guest_code_id);
    if (guestCode && guestCode.revoked) {
      return res.json({
        result: "INVALID",
        reason: "Revoked by admin (guest list revoked)",
        attendee: buildAttendeeCard(reg, ticket),
      });
    }
  }

  // Step 5: Check registration status
  if (
    [
      "expired",
      "revoked",
      "pending_payment",
      "pending_draw",
      "pending",
      "draw_lost",
    ].includes(reg.status)
  ) {
    return res.json({
      result: "INVALID",
      reason:
        reg.status === "revoked"
          ? "Ticket revoked by admin"
          : reg.status === "expired"
            ? "Ticket expired"
            : `Status: ${reg.status}`,
      attendee: buildAttendeeCard(reg, ticket),
    });
  }

  // Step 6: Already used?
  if (ticket.used) {
    const usedTime = new Date(ticket.used_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return res.json({
      result: "ALREADY_USED",
      reason: `Already scanned at ${usedTime}`,
      firstScanTime: ticket.used_at,
      attendee: buildAttendeeCard(reg, ticket),
    });
  }

  // Step 7: Late cutoff enforcement
  const eventStart = parseInt(getSetting("event_start_epoch"), 10);
  const cutoffMins = parseInt(getSetting("late_cutoff_mins"), 10) || 30;
  if (eventStart > 0) {
    const cutoffTime = eventStart + cutoffMins * 60 * 1000;
    if (Date.now() > cutoffTime) {
      const minsLate = Math.floor((Date.now() - eventStart) / 60_000);
      return res.json({
        result: "INVALID",
        reason: `Entry window closed — event started ${minsLate} min ago (cutoff: ${cutoffMins} min)`,
        minsLate,
        attendee: buildAttendeeCard(reg, ticket),
      });
    }
  }

  // Step 8: VALID — atomically mark as used
  const markUsed = _db.transaction(() => {
    // Double-check inside transaction
    const fresh = _db
      .prepare("SELECT used FROM tickets WHERE id = ?")
      .get(ticket.id);
    if (fresh.used) return { alreadyUsed: true };
    const now = Date.now();
    _db
      .prepare("UPDATE tickets SET used=1, used_at=? WHERE id=?")
      .run(now, ticket.id);
    _db
      .prepare(
        "UPDATE registrations SET status='checked_in', updated_at=? WHERE id=?",
      )
      .run(now, reg.id);
    return { ok: true, usedAt: now };
  });

  const markResult = markUsed();
  if (markResult.alreadyUsed) {
    const t2 = _db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticket.id);
    const usedTime = new Date(t2.used_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return res.json({
      result: "ALREADY_USED",
      reason: `Already scanned at ${usedTime}`,
      attendee: buildAttendeeCard(reg, t2),
    });
  }

  const updatedReg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(reg.id);
  res.json({
    result: "VALID",
    checkedInAt: markResult.usedAt,
    attendee: buildAttendeeCard(updatedReg, {
      ...ticket,
      used: 1,
      used_at: markResult.usedAt,
    }),
  });
});

function buildAttendeeCard(reg, ticket) {
  const typeLabel =
    {
      free: "Free Entry",
      paid: "Paid Entry",
      vip: "VIP Access",
      guest: "Special Guest",
      volunteer: "Volunteer",
    }[reg.ticket_type] || reg.ticket_type;

  // Get guest-list code label if applicable
  let codeLabel = null;
  if (reg.guest_code_id) {
    const gc = _db
      .prepare("SELECT label FROM guest_list_codes WHERE id = ?")
      .get(reg.guest_code_id);
    if (gc) codeLabel = gc.label;
  }

  return {
    name: reg.name,
    email: reg.email,
    serial: reg.serial,
    type: typeLabel,
    typeRaw: reg.ticket_type,
    plusOne: !!reg.plus_one,
    guestListLabel: codeLabel,
    status: reg.status,
    checkedInAt: ticket.used_at || null,
  };
}

// ── Offline cache endpoint — scanner fetches on startup ───────────────────────
router.get("/cache", (req, res) => {
  const validHashes = _db
    .prepare(
      `
    SELECT t.qr_hash, r.name, r.serial, r.ticket_type, r.plus_one, r.status, r.guest_code_id, t.used
    FROM tickets t
    JOIN registrations r ON r.id = t.registration_id
    WHERE r.status IN ('confirmed','checked_in','approved')
  `,
    )
    .all();

  res.json({ hashes: validHashes, generatedAt: Date.now() });
});

module.exports = { router, setDb };
