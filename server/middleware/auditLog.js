/**
 * Audit log middleware.
 * Attach to routes that need logging via: auditLog('ACTION_NAME')
 */
function auditLog(action) {
  return (req, res, next) => {
    // Store action name for the route handler to call after it has a targetId
    req._auditAction = action;
    next();
  };
}

/**
 * Call this inside route handlers to write the log entry.
 */
function writeAudit(db, req, action, targetId, details = {}) {
  const adminId =
    req.session?.admin?.username || req.session?.user?.id || "ANON";
  try {
    db.prepare(
      "INSERT INTO audit_logs (admin_id, action, target_id, details, created_at) VALUES (?,?,?,?,?)",
    ).run(
      adminId,
      action,
      targetId || null,
      JSON.stringify(details),
      Date.now(),
    );
  } catch (e) {
    console.error("[AuditLog] Failed to write:", e.message);
  }
}

module.exports = { auditLog, writeAudit };
