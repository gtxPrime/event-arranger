const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const env = require("../config/env");

const router = express.Router();
let _db;

function setDb(db) {
  _db = db;

  // Configure Google Strategy only if credentials present
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL,
        },
        (accessToken, refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value;
          if (!email)
            return done(null, false, { message: "No email from Google" });

          let user = _db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);
          if (!user) {
            const id = uuid();
            _db
              .prepare(
                "INSERT INTO users (id, email, name, google_id, created_at) VALUES (?,?,?,?,?)",
              )
              .run(
                id,
                email,
                profile.displayName || "",
                profile.id,
                Date.now(),
              );
            user = _db.prepare("SELECT * FROM users WHERE id = ?").get(id);
          }
          return done(null, user);
        },
      ),
    );

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => {
      const user = _db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      done(null, user || false);
    });
  }
}

function getSetting(key) {
  const row = _db
    .prepare("SELECT value FROM event_settings WHERE key = ?")
    .get(key);
  return row ? row.value : "0";
}

// ── Email / Password Register ────────────────────────────────────────────────
router.post("/email/register", async (req, res) => {
  if (getSetting("auth_email_enabled") !== "1")
    return res.status(403).json({ error: "Email auth disabled" });
  const { email, password, name, phone } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const existing = _db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email.toLowerCase().trim());
  if (existing)
    return res.status(409).json({ error: "Email already registered" });

  const hash = await bcrypt.hash(password, 12);
  const id = uuid();
  _db
    .prepare(
      "INSERT INTO users (id, email, name, phone, password, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      id,
      email.toLowerCase().trim(),
      name || "",
      phone || "",
      hash,
      Date.now(),
    );

  const user = _db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.json({ ok: true, user: req.session.user });
});

// ── Email / Password Login ───────────────────────────────────────────────────
router.post("/email/login", async (req, res) => {
  if (getSetting("auth_email_enabled") !== "1")
    return res.status(403).json({ error: "Email auth disabled" });
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const user = _db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim());
  if (!user || !user.password)
    return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.json({ ok: true, user: req.session.user });
});

// ── Google OAuth ─────────────────────────────────────────────────────────────
router.get("/google", (req, res, next) => {
  if (getSetting("auth_google_enabled") !== "1")
    return res.status(403).json({ error: "Google auth disabled" });
  passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next,
  );
});

router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", {
    failureRedirect: "/user?auth_error=google",
  })(req, res, (err) => {
    if (err || !req.user) return res.redirect("/user?auth_error=google");
    req.session.user = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
    };
    res.redirect("/user?auth=success");
  });
});

// ── Phone OTP ────────────────────────────────────────────────────────────────
router.post("/phone/send-otp", (req, res) => {
  if (getSetting("auth_phone_enabled") !== "1")
    return res.status(403).json({ error: "Phone auth disabled" });
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  // Generate 6-digit OTP (MOCK — replace with Twilio/MSG91 in production)
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

  _db
    .prepare(
      "INSERT OR REPLACE INTO phone_otps (phone, otp, expires_at) VALUES (?,?,?)",
    )
    .run(phone, otp, expiresAt);

  console.log(`[OTP MOCK] Phone: ${phone}  OTP: ${otp} (expires in 10min)`);

  // In production: send via SMS provider
  res.json({ ok: true, mock_otp: otp }); // Remove mock_otp in production
});

router.post("/phone/verify-otp", (req, res) => {
  if (getSetting("auth_phone_enabled") !== "1")
    return res.status(403).json({ error: "Phone auth disabled" });
  const { phone, otp, name, email } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ error: "Phone and OTP required" });

  const stored = _db
    .prepare("SELECT * FROM phone_otps WHERE phone = ?")
    .get(phone);
  if (!stored)
    return res.status(400).json({ error: "No OTP found for this phone" });
  if (Date.now() > stored.expires_at)
    return res.status(400).json({ error: "OTP expired" });
  if (stored.otp !== otp)
    return res.status(400).json({ error: "Incorrect OTP" });

  _db.prepare("DELETE FROM phone_otps WHERE phone = ?").run(phone);

  // Find or create user
  let user = _db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
  if (!user && email)
    user = _db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim());
  if (!user) {
    const id = uuid();
    _db
      .prepare(
        "INSERT INTO users (id, email, name, phone, created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        id,
        email ? email.toLowerCase().trim() : `${phone}@phone.local`,
        name || "",
        phone,
        Date.now(),
      );
    user = _db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, phone };
  res.json({ ok: true, user: req.session.user });
});

// ── No-Auth Entry (all auth toggles off) ────────────────────────────────────
router.post("/noauth", (req, res) => {
  const emailOn = getSetting("auth_email_enabled") === "1";
  const googleOn = getSetting("auth_google_enabled") === "1";
  const phoneOn = getSetting("auth_phone_enabled") === "1";

  // Allow no-auth when all auth methods are off, OR when Firebase is not configured
  // (frontend falls back to no-auth form when Firebase isn't set up)
  const firebaseConfigured = !!(
    env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID
  );
  if ((emailOn || googleOn || phoneOn) && firebaseConfigured) {
    return res
      .status(400)
      .json({ error: "Auth methods are enabled — use login" });
  }

  const { email, phone, name } = req.body;
  if (!email || !phone)
    return res.status(400).json({ error: "Email and phone required" });

  // Create a lightweight pseudo-session
  req.session.user = {
    id: null,
    email: email.toLowerCase().trim(),
    name: name || "",
    phone,
  };
  res.json({ ok: true, user: req.session.user });
});

// ── Firebase Token Auth ──────────────────────────────────────────────────────
// Client calls this after signing in via Firebase Auth (any provider).
// Sends the Firebase ID token; server verifies it and creates a session.
router.post("/firebase", async (req, res) => {
  const { idToken, name: clientName, phone: clientPhone } = req.body;
  if (!idToken) return res.status(400).json({ error: "idToken required" });

  const { verifyIdToken } = require("../utils/firebaseAdmin");
  const decoded = await verifyIdToken(idToken);

  let uid, email, fbName, fbPhone;

  if (decoded) {
    // Fully verified via Admin SDK
    uid = decoded.uid;
    email = decoded.email || "";
    fbName = decoded.name || clientName || "";
    fbPhone = decoded.phone_number || clientPhone || "";
  } else {
    // Admin SDK not configured — trust the client's decoded JWT payload
    // (only acceptable for dev/staging where you control the environment)
    try {
      const parts = idToken.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      uid = payload.user_id || payload.sub;
      email = payload.email || "";
      fbName = payload.name || clientName || "";
      fbPhone = payload.phone_number || clientPhone || "";
      console.warn("[Firebase] Using unverified token payload (no Admin SDK)");
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  if (!uid)
    return res
      .status(401)
      .json({ error: "Could not identify user from token" });

  // Upsert user in DB
  let user = email
    ? _db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email.toLowerCase().trim())
    : _db.prepare("SELECT * FROM users WHERE firebase_uid = ?").get(uid);

  if (!user) {
    const id = uuid();
    const safeEmail = email
      ? email.toLowerCase().trim()
      : `${uid}@firebase.local`;
    _db
      .prepare(
        "INSERT INTO users (id, email, name, phone, firebase_uid, created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(id, safeEmail, fbName, fbPhone, uid, Date.now());
    user = _db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  } else if (!user.firebase_uid) {
    // Link existing user to Firebase UID
    _db.prepare("UPDATE users SET firebase_uid=? WHERE id=?").run(uid, user.id);
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name || fbName,
    phone: user.phone || fbPhone,
  };
  res.json({ ok: true, user: req.session.user });
});

// ── Firebase Public Config (served to frontend) ──────────────────────────────
router.get("/firebase-config", (req, res) => {
  const env = require("../config/env");
  res.json({
    apiKey: env.FIREBASE_API_KEY,
    authDomain: env.FIREBASE_AUTH_DOMAIN,
    projectId: env.FIREBASE_PROJECT_ID,
    appId: env.FIREBASE_APP_ID,
    configured: !!(env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID),
  });
});

// ── Me / Logout ──────────────────────────────────────────────────────────────
router.get("/me", (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = { router, setDb };
