const { sendDrawWinnerEmail, sendDrawLoserEmail } = require("../config/email");

let _db = null;
let _drawTimer = null;

function setDb(db) {
  _db = db;
}

/**
 * Run the random selection:
 * - Randomly select `count` from pending_draw pool
 * - Promote winners to approved
 * - Mark losers as draw_lost
 * - Fire emails
 * - Log in audit_logs
 */
async function runDraw(count, adminId = "SYSTEM") {
  if (!_db) throw new Error("DB not init in draw.js");

  const getSetting = _db.prepare(
    "SELECT value FROM event_settings WHERE key = ?",
  );
  const drawHasRun = getSetting.get("draw_has_run");
  if (drawHasRun && drawHasRun.value === "1") {
    return { skipped: true, reason: "Draw already run" };
  }

  // Total free cap remaining check
  const fcfsLimit = parseInt(
    (getSetting.get("fcfs_limit") || { value: "200" }).value,
    10,
  );
  const totalFreeCap = parseInt(
    (getSetting.get("total_free_cap") || { value: "400" }).value,
    10,
  );
  const approvedCount = _db
    .prepare(
      "SELECT COUNT(*) as c FROM registrations WHERE ticket_type='free' AND status IN ('approved','confirmed','checked_in')",
    )
    .get().c;

  const availableSeats = Math.max(0, totalFreeCap - approvedCount);
  const actualCount =
    count !== undefined ? Math.min(count, availableSeats) : availableSeats;

  if (actualCount === 0)
    return { winners: [], losers: 0, reason: "No seats available" };

  const pool = _db
    .prepare(
      "SELECT id, email, name, serial FROM registrations WHERE status = 'pending_draw' ORDER BY RANDOM() LIMIT ?",
    )
    .all(actualCount);

  const winnerIds = pool.map((r) => r.id);
  const allPending = _db
    .prepare(
      "SELECT id, email, name FROM registrations WHERE status = 'pending_draw'",
    )
    .all();
  const loserIds = allPending
    .filter((r) => !winnerIds.includes(r.id))
    .map((r) => r.id);

  const now = Date.now();
  const updateWinner = _db.prepare(
    "UPDATE registrations SET status='approved', updated_at=? WHERE id=?",
  );
  const updateLoser = _db.prepare(
    "UPDATE registrations SET status='draw_lost', updated_at=? WHERE id=?",
  );
  const insertAudit = _db.prepare(
    "INSERT INTO audit_logs (admin_id, action, target_id, details, created_at) VALUES (?,?,?,?,?)",
  );
  const setSetting = _db.prepare(
    "INSERT OR REPLACE INTO event_settings (key,value) VALUES (?,?)",
  );

  const tx = _db.transaction(() => {
    for (const id of winnerIds) updateWinner.run(now, id);
    for (const id of loserIds) updateLoser.run(now, id);
    setSetting.run("draw_has_run", "1");
    insertAudit.run(
      adminId,
      "AUTO_DRAW_RUN",
      null,
      JSON.stringify({ winners: winnerIds.length, losers: loserIds.length }),
      now,
    );
  });
  tx();

  // Fire emails async (non-blocking)
  for (const r of pool) {
    sendDrawWinnerEmail(r).catch((e) => console.error("[Draw email error]", e));
  }
  for (const r of allPending.filter((r) => loserIds.includes(r.id))) {
    sendDrawLoserEmail(r.email, r.name).catch((e) =>
      console.error("[Draw loser email error]", e),
    );
  }

  console.log(
    `[Draw] Ran: ${winnerIds.length} winners, ${loserIds.length} losers`,
  );
  return { winners: pool, losers: loserIds.length };
}

/**
 * Start a background timer that checks every minute if it's time
 * to auto-run the draw.
 */
function startDrawScheduler() {
  if (_drawTimer) clearInterval(_drawTimer);
  _drawTimer = setInterval(async () => {
    if (!_db) return;
    const getSetting = _db.prepare(
      "SELECT value FROM event_settings WHERE key = ?",
    );

    const autoRun = getSetting.get("draw_auto_run");
    if (!autoRun || autoRun.value !== "1") return;

    const hasRun = getSetting.get("draw_has_run");
    if (hasRun && hasRun.value === "1") return;

    const eventStart = getSetting.get("event_start_epoch");
    const offsetMins = getSetting.get("draw_run_offset_mins");
    if (!eventStart || !eventStart.value || eventStart.value === "0") return;

    const runAt =
      parseInt(eventStart.value, 10) -
      parseInt((offsetMins || { value: "120" }).value, 10) * 60 * 1000;
    if (Date.now() >= runAt) {
      console.log("[Draw Scheduler] Triggering auto draw...");
      try {
        await runDraw(undefined, "SCHEDULER");
      } catch (e) {
        console.error("[Draw Scheduler] Error:", e);
      }
    }
  }, 60_000); // check every minute

  console.log("[Draw Scheduler] Started — checks every 60s");
}

function stopDrawScheduler() {
  if (_drawTimer) {
    clearInterval(_drawTimer);
    _drawTimer = null;
  }
}

module.exports = { setDb, runDraw, startDrawScheduler, stopDrawScheduler };
