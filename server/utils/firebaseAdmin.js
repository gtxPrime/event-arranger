/**
 * Firebase Admin SDK initializer.
 * Initialises lazily — only if Firebase credentials are configured.
 * Falls back to a mock verifier in dev when no credentials are set.
 */
const env = require("../config/env");

let _admin = null;

function getAdmin() {
  if (_admin) return _admin;

  try {
    const admin = require("firebase-admin");

    // Already initialised by a previous call
    if (admin.apps.length > 0) {
      _admin = admin;
      return _admin;
    }

    let credential;

    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // Inline JSON string
      const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(sa);
    } else if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Path to a JSON file
      credential = admin.credential.cert(
        require(require("path").resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH)),
      );
    } else {
      // No credentials — Firebase Admin won't be initialised
      console.warn(
        "[Firebase] No service account configured. Firebase token verification disabled.",
      );
      return null;
    }

    admin.initializeApp({ credential });
    _admin = admin;
    console.log("[Firebase] Admin SDK initialised ✓");
    return _admin;
  } catch (e) {
    console.error("[Firebase] Failed to initialise Admin SDK:", e.message);
    return null;
  }
}

/**
 * Verify a Firebase ID token.
 * Returns decoded token payload, or null if verification fails / SDK not configured.
 */
async function verifyIdToken(idToken) {
  const admin = getAdmin();
  if (!admin) return null;
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    console.warn("[Firebase] Token verification failed:", e.message);
    return null;
  }
}

module.exports = { verifyIdToken };
