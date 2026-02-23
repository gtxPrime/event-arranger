require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const path = require("path");

const env = require("./config/env");
const { getDb } = require("./db");
const { apiLimiter } = require("./middleware/rateLimit");

// Routes
const authRoute = require("./routes/auth");
const registerRoute = require("./routes/register");
const guestRoute = require("./routes/guest");
const scanRoute = require("./routes/scan");
const adminRoute = require("./routes/admin");
const ticketsRoute = require("./routes/tickets");

// Utils that need DB
const serial = require("./utils/serial");
const draw = require("./utils/draw");

// ── Init DB ────────────────────────────────────────────────────────────────
const db = getDb();
serial.setDb(db);
draw.setDb(db);

// Inject DB into routes
authRoute.setDb(db);
registerRoute.setDb(db);
guestRoute.setDb(db);
scanRoute.setDb(db);
adminRoute.setDb(db);
ticketsRoute.setDb(db);

// ── Express App ────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Passport (for Google OAuth)
app.use(passport.initialize());
app.use(passport.session());

// Rate limit all API routes
app.use("/api", apiLimiter);

// ── API Routes ─────────────────────────────────────────────────────────────
app.use("/api/auth", authRoute.router);
app.use("/api/register", registerRoute.router);
app.use("/api/guest", guestRoute.router);
app.use("/api/scan", scanRoute.router);
app.use("/api/admin", adminRoute.router);
app.use("/api/tickets", ticketsRoute.router);

// ── Static Files ───────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "../public");

// User site
app.use("/user", express.static(path.join(publicDir, "user")));
app.get("/user", (req, res) =>
  res.sendFile(path.join(publicDir, "user", "index.html")),
);
app.get("/user/checkout", (req, res) =>
  res.sendFile(path.join(publicDir, "user", "checkout.html")),
);
app.get("/user/confirm", (req, res) =>
  res.sendFile(path.join(publicDir, "user", "confirm.html")),
);

// Admin dashboard
app.use("/admin", express.static(path.join(publicDir, "admin")));
app.get("/admin", (req, res) =>
  res.sendFile(path.join(publicDir, "admin", "index.html")),
);

// Gate scanner
app.use("/scanner", express.static(path.join(publicDir, "scanner")));
app.get("/scanner", (req, res) =>
  res.sendFile(path.join(publicDir, "scanner", "index.html")),
);

// Hidden guest page (only accessible via /guest?code=XXXX)
app.use("/guest", express.static(path.join(publicDir, "guest")));
app.get("/guest", (req, res) => {
  if (!req.query.code) return res.redirect("/");
  res.sendFile(path.join(publicDir, "guest", "index.html"));
});

// Shared assets
app.use("/shared", express.static(path.join(publicDir, "shared")));

// Root → redirect to user site
app.get("/", (req, res) => res.redirect("/user"));

// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Background Jobs ────────────────────────────────────────────────────────
registerRoute.startPaymentExpiryJob();
draw.startDrawScheduler();

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║      LocalHost Ticketing System — Running             ║
║                                                       ║
║  👤 User Site:     http://localhost:${env.PORT}/user       ║
║  🛠  Admin:        http://localhost:${env.PORT}/admin      ║
║  📷 Scanner:       http://localhost:${env.PORT}/scanner    ║
║  🔒 Guest (URL):  http://localhost:${env.PORT}/guest?code= ║
╚═══════════════════════════════════════════════════════╝
`);
});

module.exports = app;
