const crypto = require("crypto");
const env = require("../config/env");

const SECRET = env.QR_HMAC_SECRET;

/**
 * Generate a signed QR token.
 * Format: base64url(registrationId:generatedAt:hmac)
 */
function generateQRHash(registrationId) {
  const ts = Date.now().toString();
  const payload = `${registrationId}:${ts}`;
  const hmac = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
  const raw = `${payload}:${hmac}`;
  return Buffer.from(raw).toString("base64url");
}

/**
 * Verify and decode a QR token.
 * Returns { valid: true, registrationId, ts } or { valid: false }
 */
function verifyQRHash(token) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 3) return { valid: false, reason: "Malformed token" };
    const [registrationId, ts, hmac] = parts;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${registrationId}:${ts}`)
      .digest("hex");
    const match = crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expected, "hex"),
    );
    if (!match) return { valid: false, reason: "Signature mismatch" };
    return { valid: true, registrationId, ts: parseInt(ts, 10) };
  } catch {
    return { valid: false, reason: "Parse error" };
  }
}

module.exports = { generateQRHash, verifyQRHash };
