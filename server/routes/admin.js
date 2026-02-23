const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const QRCode = require("qrcode");
const {
  generateGuestListCode,
  parseGuestCodeParam,
} = require("../utils/codeEncrypt");
const { nextSerial } = require("../utils/serial");
const { generateQRHash } = require("../utils/qr");
const { runDraw } = require("../utils/draw");
const { sendTicketConfirmation, sendMail } = require("../config/email");
const { writeAudit } = require("../middleware/auditLog");
const env = require("../config/env");

const router = express.Router();
let _db;
function setDb(db) {
  _db = db;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Admin Auth Guard ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.session?.admin)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Admin Login / Logout ────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    req.session.admin = { username };
    return res.json({ ok: true });
  }
  // Also check DB admins
  const admin = _db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get(username);
  if (admin && (await bcrypt.compare(password, admin.password))) {
    req.session.admin = { username: admin.username, id: admin.id };
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

router.post("/logout", (req, res) => {
  delete req.session.admin;
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ admin: req.session?.admin || null });
});

// ── Settings helper ───────────────────────────────────────────────────────────
function getSetting(key) {
  return (
    _db.prepare("SELECT value FROM event_settings WHERE key = ?").get(key) || {
      value: "0",
    }
  ).value;
}

// ── Settings ────────────────────────────────────────────────────────────────
router.get("/settings", requireAdmin, (req, res) => {
  const rows = _db.prepare("SELECT key, value FROM event_settings").all();
  const settings = {};
  rows.forEach((r) => (settings[r.key] = r.value));
  res.json(settings);
});

router.patch("/settings", requireAdmin, (req, res) => {
  const allowed = [
    "auth_email_enabled",
    "auth_google_enabled",
    "auth_phone_enabled",
    "free_enabled",
    "paid_enabled",
    "vip_enabled",
    "volunteer_enabled",
    "draw_enabled",
    "draw_accepting",
    "draw_has_run",
    "fcfs_limit",
    "total_free_cap",
    "total_paid_cap",
    "max_paid_per_person",
    "checkout_timeout_mins",
    "late_cutoff_mins",
    "event_start_epoch",
    "event_name",
    "draw_auto_run",
    "draw_run_offset_mins",
    "plus_one_vip_enabled",
    "plus_one_volunteer_enabled",
  ];

  // Handle event_start_datetime → convert to epoch ms
  if (req.body.event_start_datetime) {
    const dt = new Date(req.body.event_start_datetime);
    if (!isNaN(dt.getTime())) {
      req.body.event_start_epoch = String(dt.getTime());
    }
    delete req.body.event_start_datetime;
  }

  // Validate: fcfs_limit must not exceed total_free_cap
  const bodyFcfs =
    req.body.fcfs_limit !== undefined
      ? parseInt(req.body.fcfs_limit, 10)
      : null;
  const bodyCap =
    req.body.total_free_cap !== undefined
      ? parseInt(req.body.total_free_cap, 10)
      : null;
  const currentFcfs = parseInt(getSetting("fcfs_limit"), 10);
  const currentCap = parseInt(getSetting("total_free_cap"), 10);
  const effectiveFcfs = bodyFcfs !== null ? bodyFcfs : currentFcfs;
  const effectiveCap = bodyCap !== null ? bodyCap : currentCap;
  if (effectiveFcfs > effectiveCap) {
    return res.status(400).json({
      error: `FCFS Guaranteed Slots (${effectiveFcfs}) cannot exceed Total Free Capacity (${effectiveCap}). Please reduce FCFS Slots first.`,
      code: "FCFS_EXCEEDS_CAP",
    });
  }

  const upsert = _db.prepare(
    "INSERT OR REPLACE INTO event_settings (key, value) VALUES (?, ?)",
  );
  const changes = {};
  const tx = _db.transaction(() => {
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        upsert.run(k, String(v));
        changes[k] = v;
      }
    }
  });
  tx();
  writeAudit(_db, req, "SETTINGS_UPDATED", null, changes);
  res.json({ ok: true, updated: changes });
});

// ── Stats Overview ───────────────────────────────────────────────────────────
router.get("/stats", requireAdmin, (req, res) => {
  const q = (sql) => _db.prepare(sql).get();
  const totalFreeCap = parseInt(
    (
      _db
        .prepare("SELECT value FROM event_settings WHERE key='total_free_cap'")
        .get() || { value: "400" }
    ).value,
    10,
  );
  const totalPaidCap = parseInt(
    (
      _db
        .prepare("SELECT value FROM event_settings WHERE key='total_paid_cap'")
        .get() || { value: "600" }
    ).value,
    10,
  );

  res.json({
    free: {
      approved: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='free' AND status='approved'",
      ).c,
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='free' AND status='confirmed'",
      ).c,
      checkedIn: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='free' AND status='checked_in'",
      ).c,
      pendingDraw: q(
        "SELECT COUNT(*) c FROM registrations WHERE status='pending_draw'",
      ).c,
      cap: totalFreeCap,
    },
    paid: {
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='paid' AND status='confirmed'",
      ).c,
      checkedIn: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='paid' AND status='checked_in'",
      ).c,
      cap: totalPaidCap,
    },
    vip: {
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='vip' AND status='confirmed'",
      ).c,
      checkedIn: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='vip' AND status='checked_in'",
      ).c,
    },
    guest: {
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='guest' AND status='confirmed'",
      ).c,
      checkedIn: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='guest' AND status='checked_in'",
      ).c,
    },
    volunteer: {
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE ticket_type='volunteer' AND status='confirmed'",
      ).c,
    },
    total: {
      checkedIn: q(
        "SELECT COUNT(*) c FROM registrations WHERE status='checked_in'",
      ).c,
      confirmed: q(
        "SELECT COUNT(*) c FROM registrations WHERE status IN ('confirmed','checked_in')",
      ).c,
    },
  });
});

// ── Registrations List ────────────────────────────────────────────────────────
router.get("/registrations", requireAdmin, (req, res) => {
  const { status, type, q: search, page = 1, limit = 50 } = req.query;
  let sql =
    "SELECT r.*, t.qr_hash, t.used, t.used_at FROM registrations r LEFT JOIN tickets t ON t.registration_id = r.id WHERE 1=1";
  const params = [];

  if (status) {
    sql += " AND r.status = ?";
    params.push(status);
  }
  if (type) {
    sql += " AND r.ticket_type = ?";
    params.push(type);
  }
  if (search) {
    sql += " AND (r.name LIKE ? OR r.email LIKE ? OR r.serial LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  sql += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const rows = _db.prepare(sql).all(...params);
  const total = _db.prepare("SELECT COUNT(*) c FROM registrations").get().c;
  res.json({ registrations: rows, total });
});

// ── Approve ────────────────────────────────────────────────────────────────
router.post("/approve/:id", requireAdmin, async (req, res) => {
  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(req.params.id);
  if (!reg) return res.status(404).json({ error: "Not found" });

  const now = Date.now();
  _db
    .prepare(
      "UPDATE registrations SET status='approved', updated_at=? WHERE id=?",
    )
    .run(now, reg.id);

  // Issue ticket if not already
  const existing = _db
    .prepare("SELECT id FROM tickets WHERE registration_id = ?")
    .get(reg.id);
  if (!existing) {
    const qrHash = generateQRHash(reg.id);
    _db
      .prepare(
        "INSERT INTO tickets (id,registration_id,qr_hash,used,generated_at,guest_code_id) VALUES (?,?,?,0,?,?)",
      )
      .run(uuid(), reg.id, qrHash, now, reg.guest_code_id || null);
    _db
      .prepare(
        "UPDATE registrations SET status='confirmed', updated_at=? WHERE id=?",
      )
      .run(now, reg.id);
    const updated = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(reg.id);
    sendTicketConfirmation(updated, null, null).catch(console.error);
  }

  writeAudit(_db, req, "APPROVE", reg.id, { previousStatus: reg.status });
  res.json({ ok: true });
});

// ── Revoke ─────────────────────────────────────────────────────────────────
router.post("/revoke/:id", requireAdmin, (req, res) => {
  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(req.params.id);
  if (!reg) return res.status(404).json({ error: "Not found" });

  const now = Date.now();
  _db
    .prepare(
      "UPDATE registrations SET status='revoked', updated_at=? WHERE id=?",
    )
    .run(now, reg.id);
  writeAudit(_db, req, "REVOKE", reg.id, { reason: req.body.reason || "" });
  res.json({ ok: true });
});

// ── Reissue QR ────────────────────────────────────────────────────────────
router.post("/reissue/:id", requireAdmin, async (req, res) => {
  const reg = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(req.params.id);
  if (!reg) return res.status(404).json({ error: "Not found" });

  // Delete old ticket
  _db.prepare("DELETE FROM tickets WHERE registration_id = ?").run(reg.id);

  // Issue new
  const qrHash = generateQRHash(reg.id);
  const now = Date.now();
  _db
    .prepare(
      "INSERT INTO tickets (id,registration_id,qr_hash,used,generated_at,guest_code_id) VALUES (?,?,?,0,?,?)",
    )
    .run(uuid(), reg.id, qrHash, now, reg.guest_code_id || null);
  _db
    .prepare(
      "UPDATE registrations SET status='confirmed', updated_at=? WHERE id=?",
    )
    .run(now, reg.id);

  const updated = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(reg.id);
  sendTicketConfirmation(updated, null, null).catch(console.error);
  writeAudit(_db, req, "REISSUE", reg.id, {});
  res.json({ ok: true });
});

// ── Run Lucky Draw ────────────────────────────────────────────────────────
router.post("/run-draw", requireAdmin, async (req, res) => {
  const count = req.body.count ? parseInt(req.body.count) : undefined;
  try {
    const result = await runDraw(count, req.session.admin.username);
    writeAudit(_db, req, "MANUAL_DRAW_RUN", null, result);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Guest List Codes ──────────────────────────────────────────────────────
router.get("/guest-codes", requireAdmin, (req, res) => {
  const codes = _db
    .prepare("SELECT * FROM guest_list_codes ORDER BY created_at DESC")
    .all();
  res.json({ codes });
});

router.post("/guest-codes", requireAdmin, (req, res) => {
  const {
    label,
    maxRegistrations = 10,
    plusOneAllowed = false,
    autoApprove = true,
    expiresAt,
  } = req.body;
  if (!label) return res.status(400).json({ error: "Label required" });

  const { plain, urlSafe } = generateGuestListCode();
  const id = uuid();
  const now = Date.now();

  _db
    .prepare(
      `
    INSERT INTO guest_list_codes (id, code_plain, code_url_safe, label, created_by_admin, max_registrations, plus_one_allowed, auto_approve, expires_at, revoked, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,0,?)
  `,
    )
    .run(
      id,
      plain,
      urlSafe,
      label,
      req.session.admin.username,
      maxRegistrations,
      plusOneAllowed ? 1 : 0,
      autoApprove ? 1 : 0,
      expiresAt || null,
      now,
    );

  writeAudit(_db, req, "CREATE_GUEST_CODE", id, { label });
  const guestUrl = `/guest?code=${urlSafe}`;
  res.json({ ok: true, id, url: guestUrl, label });
});

router.delete("/guest-codes/:id", requireAdmin, (req, res) => {
  const code = _db
    .prepare("SELECT * FROM guest_list_codes WHERE id = ?")
    .get(req.params.id);
  if (!code) return res.status(404).json({ error: "Not found" });

  _db
    .prepare("UPDATE guest_list_codes SET revoked=1 WHERE id=?")
    .run(req.params.id);
  writeAudit(_db, req, "REVOKE_GUEST_CODE", req.params.id, {
    label: code.label,
  });
  res.json({
    ok: true,
    message: "Code revoked — all associated QRs are now invalid",
  });
});

// ── Edit Guest Code ───────────────────────────────────────────────────────
router.patch("/guest-codes/:id", requireAdmin, (req, res) => {
  const code = _db
    .prepare("SELECT * FROM guest_list_codes WHERE id = ?")
    .get(req.params.id);
  if (!code) return res.status(404).json({ error: "Not found" });

  const { label, maxRegistrations, plusOneAllowed, autoApprove, expiresAt } =
    req.body;
  const updates = [];
  const params = [];

  if (label !== undefined) {
    updates.push("label=?");
    params.push(label);
  }
  if (maxRegistrations !== undefined) {
    updates.push("max_registrations=?");
    params.push(parseInt(maxRegistrations));
  }
  if (plusOneAllowed !== undefined) {
    updates.push("plus_one_allowed=?");
    params.push(plusOneAllowed ? 1 : 0);
  }
  if (autoApprove !== undefined) {
    updates.push("auto_approve=?");
    params.push(autoApprove ? 1 : 0);
  }
  if (expiresAt !== undefined) {
    updates.push("expires_at=?");
    params.push(expiresAt ? new Date(expiresAt).getTime() : null);
  }

  if (updates.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  params.push(req.params.id);
  _db
    .prepare(`UPDATE guest_list_codes SET ${updates.join(", ")} WHERE id=?`)
    .run(...params);
  writeAudit(_db, req, "EDIT_GUEST_CODE", req.params.id, req.body);
  res.json({ ok: true });
});

// Admin generates a QR directly for a guest (no self-registration needed)
router.post(
  "/guest-codes/:codeId/generate-qr",
  requireAdmin,
  async (req, res) => {
    const { name, email: rawEmail } = req.body;
    const email = (rawEmail || "").toLowerCase().trim();
    if (!name || !email)
      return res.status(400).json({ error: "Name and email required" });

    const guestCode = _db
      .prepare("SELECT * FROM guest_list_codes WHERE id = ?")
      .get(req.params.codeId);
    if (!guestCode || guestCode.revoked)
      return res.status(404).json({ error: "Code not found or revoked" });
    if (guestCode.used_count >= guestCode.max_registrations)
      return res.status(409).json({ error: "Guest list full" });

    const existing = _db
      .prepare("SELECT id FROM registrations WHERE email = ?")
      .get(email);
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    const regId = uuid();
    const serial = nextSerial("guest");
    const now = Date.now();
    const plusOne =
      getSetting("plus_one_vip_enabled") === "1" && !!guestCode.plus_one_allowed
        ? req.body.plusOne
          ? 1
          : 0
        : 0;

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
        req.body.phone || "",
        "guest",
        "confirmed",
        guestCode.id,
        plusOne,
        now,
        now,
      );

    _db
      .prepare("UPDATE guest_list_codes SET used_count=used_count+1 WHERE id=?")
      .run(guestCode.id);

    const qrHash = generateQRHash(regId);
    _db
      .prepare(
        "INSERT INTO tickets (id,registration_id,qr_hash,used,generated_at,guest_code_id) VALUES (?,?,?,0,?,?)",
      )
      .run(uuid(), regId, qrHash, now, guestCode.id);

    const reg = _db
      .prepare("SELECT * FROM registrations WHERE id = ?")
      .get(regId);
    sendTicketConfirmation(reg, null, null).catch(console.error);
    writeAudit(_db, req, "ADMIN_GENERATED_QR", regId, { name, email, serial });

    res.json({ ok: true, serial, registrationId: regId, qrHash });
  },
);

// ── Volunteer Codes ────────────────────────────────────────────────────────
router.get("/volunteer-codes", requireAdmin, (req, res) => {
  res.json({
    codes: _db
      .prepare("SELECT * FROM volunteer_codes ORDER BY created_at DESC")
      .all(),
  });
});

router.post("/volunteer-codes", requireAdmin, (req, res) => {
  const { linkedEmail, expiresAt } = req.body;
  if (!linkedEmail)
    return res.status(400).json({ error: "linkedEmail required" });

  const code = uuid().replace(/-/g, "").slice(0, 12).toUpperCase();
  const id = uuid();
  _db
    .prepare(
      `INSERT INTO volunteer_codes (id,code,linked_email,created_by,expires_at,revoked,used,created_at)
    VALUES (?,?,?,?,?,0,0,?)`,
    )
    .run(
      id,
      code,
      linkedEmail.toLowerCase().trim(),
      req.session.admin.username,
      expiresAt || null,
      Date.now(),
    );

  writeAudit(_db, req, "CREATE_VOLUNTEER_CODE", id, { linkedEmail });
  res.json({ ok: true, code, linkedEmail });
});

router.delete("/volunteer-codes/:id", requireAdmin, (req, res) => {
  _db
    .prepare("UPDATE volunteer_codes SET revoked=1 WHERE id=?")
    .run(req.params.id);
  writeAudit(_db, req, "REVOKE_VOLUNTEER_CODE", req.params.id, {});
  res.json({ ok: true });
});

// ── Edit Volunteer Code ────────────────────────────────────────────────────
router.patch("/volunteer-codes/:id", requireAdmin, (req, res) => {
  const code = _db
    .prepare("SELECT * FROM volunteer_codes WHERE id = ?")
    .get(req.params.id);
  if (!code) return res.status(404).json({ error: "Not found" });

  const { linkedEmail, expiresAt } = req.body;
  const updates = [];
  const params = [];

  if (linkedEmail !== undefined) {
    updates.push("linked_email=?");
    params.push(linkedEmail.toLowerCase().trim());
  }
  if (expiresAt !== undefined) {
    updates.push("expires_at=?");
    params.push(expiresAt ? new Date(expiresAt).getTime() : null);
  }

  if (updates.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  params.push(req.params.id);
  _db
    .prepare(`UPDATE volunteer_codes SET ${updates.join(", ")} WHERE id=?`)
    .run(...params);
  writeAudit(_db, req, "EDIT_VOLUNTEER_CODE", req.params.id, req.body);
  res.json({ ok: true });
});

// ── Bulk CSV Upload ────────────────────────────────────────────────────────
router.post(
  "/bulk-upload",
  requireAdmin,
  upload.single("csv"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "No CSV file uploaded" });

    let records;
    try {
      records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (e) {
      return res.status(400).json({ error: "Invalid CSV: " + e.message });
    }

    const results = [];
    const ticketType = req.body.ticketType || "guest";

    for (const record of records) {
      const email = (record.email || "").toLowerCase().trim();
      const name = record.name || "";
      if (!email || !name) {
        results.push({ email, error: "Missing email or name" });
        continue;
      }

      const existing = _db
        .prepare("SELECT id FROM registrations WHERE email = ?")
        .get(email);
      if (existing) {
        results.push({ email, error: "Already registered" });
        continue;
      }

      try {
        const regId = uuid();
        const serial = nextSerial(
          ticketType === "volunteer" ? "volunteer" : "guest",
        );
        const now = Date.now();
        _db
          .prepare(
            `INSERT INTO registrations (id,serial,email,name,phone,ticket_type,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            regId,
            serial,
            email,
            name,
            record.phone || "",
            ticketType,
            "confirmed",
            now,
            now,
          );

        const qrHash = generateQRHash(regId);
        _db
          .prepare(
            "INSERT INTO tickets (id,registration_id,qr_hash,used,generated_at) VALUES (?,?,?,0,?)",
          )
          .run(uuid(), regId, qrHash, now);

        const reg = _db
          .prepare("SELECT * FROM registrations WHERE id = ?")
          .get(regId);
        sendTicketConfirmation(reg, null, null).catch(console.error);
        results.push({ email, serial, status: "created" });
      } catch (e) {
        results.push({ email, error: e.message });
      }
    }

    writeAudit(_db, req, "BULK_UPLOAD", null, {
      count: results.length,
      ticketType,
    });
    res.json({ ok: true, results });
  },
);

// ── Export CSV ─────────────────────────────────────────────────────────────
router.get("/export", requireAdmin, (req, res) => {
  const rows = _db
    .prepare(
      `
    SELECT r.serial, r.name, r.email, r.phone, r.ticket_type, r.status, r.plus_one,
           t.qr_hash, t.used, t.used_at,
           datetime(r.created_at/1000, 'unixepoch') as registered_at
    FROM registrations r LEFT JOIN tickets t ON t.registration_id = r.id
    ORDER BY r.created_at ASC
  `,
    )
    .all();

  const headers = [
    "serial",
    "name",
    "email",
    "phone",
    "ticket_type",
    "status",
    "plus_one",
    "qr_hash",
    "used",
    "used_at",
    "registered_at",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => `"${(r[h] ?? "").toString().replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="registrations.csv"',
  );
  res.send(csv);
});

// ── Audit Logs ─────────────────────────────────────────────────────────────
router.get("/audit-logs", requireAdmin, (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const logs = _db
    .prepare(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const total = _db.prepare("SELECT COUNT(*) c FROM audit_logs").get().c;
  res.json({ logs, total });
});

// ── Get ticket QR data for a registration ─────────────────────────────────
router.get("/ticket/:regId", requireAdmin, (req, res) => {
  const t = _db
    .prepare("SELECT * FROM tickets WHERE registration_id = ?")
    .get(req.params.regId);
  const r = _db
    .prepare("SELECT * FROM registrations WHERE id = ?")
    .get(req.params.regId);
  if (!t || !r) return res.status(404).json({ error: "Not found" });
  res.json({ ticket: t, registration: r });
});

// ── SMTP Test ─────────────────────────────────────────────────────────────
router.post("/test-email", requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const result = await sendMail({
      to: email,
      subject: "LocalHost — SMTP Test Check",
      text: "If you are reading this, your SMTP server configuration on LocalHost is working perfectly!",
    });
    res.json({
      ok: true,
      message: "Email sent successfully!",
      messageId: result.messageId,
    });
  } catch (e) {
    console.error("[SMTP Test Error]", e);
    res.status(500).json({
      error: e.message,
      code: e.code,
      response: e.response,
      command: e.command,
      stack: e.stack,
    });
  }
});

module.exports = { router, setDb };
