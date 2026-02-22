const crypto = require("crypto");
const env = require("../config/env");

// 32-byte key from hex string in env
function getKey() {
  const hex = env.GUEST_CODE_KEY;
  if (hex.length < 64) {
    return crypto.createHash("sha256").update(hex).digest();
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

/**
 * Encrypt a plaintext code to a URL-safe token (legacy, kept for backward compat).
 */
function encryptCode(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt an encrypted token back to plaintext (legacy).
 * Returns null on failure.
 */
function decryptCode(token) {
  try {
    const [ivHex, encHex] = token.split(":");
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const enc = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

/**
 * Generate a new short random guest-list code.
 * Returns { plain, urlSafe } where urlSafe is an 8-char alphanumeric token
 * suitable for use as a short URL parameter.
 */
function generateGuestListCode() {
  // short 8-char alphanumeric token (case-insensitive friendly)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O,0,I,1 for clarity
  let urlSafe = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    urlSafe += chars[bytes[i] % chars.length];
  }
  // plain == urlSafe for short codes (no encryption needed — it's a random opaque token)
  const plain = urlSafe;
  return { plain, urlSafe };
}

/**
 * Parse a guest code param from the query string.
 * Supports both new short codes (just alphanumeric) and legacy long codes.
 * Returns the plain code string (to look up in DB by code_plain).
 */
function parseGuestCodeParam(urlSafe) {
  if (!urlSafe) return null;
  // Short code: alphanumeric only, length <= 16
  if (/^[A-Z0-9]{4,16}$/i.test(urlSafe)) {
    return urlSafe.toUpperCase();
  }
  // Legacy long code: try base64url decode + AES decrypt
  try {
    const encrypted = Buffer.from(urlSafe, "base64url").toString("utf8");
    return decryptCode(encrypted);
  } catch {
    return null;
  }
}

module.exports = {
  encryptCode,
  decryptCode,
  generateGuestListCode,
  parseGuestCodeParam,
};
