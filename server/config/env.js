require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

module.exports = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  SESSION_SECRET:
    process.env.SESSION_SECRET || "dev-session-secret-change-in-prod",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "changeme123",
  QR_HMAC_SECRET: process.env.QR_HMAC_SECRET || "dev-qr-secret-change-in-prod",
  GUEST_CODE_KEY: process.env.GUEST_CODE_ENCRYPTION_KEY || "0".repeat(64), // 32 bytes hex
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:3000/api/auth/google/callback",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "tickets@localhosthq.com",
  DB_PATH: process.env.DB_PATH || "./data/tickets.db",
  // Firebase client config (public — safe to expose)
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "",
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || "",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || "",
  // Firebase Admin SDK
  FIREBASE_SERVICE_ACCOUNT_JSON:
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  FIREBASE_SERVICE_ACCOUNT_PATH:
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "",
};
