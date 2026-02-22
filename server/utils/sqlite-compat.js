/**
 * better-sqlite3 compatibility shim using node-sqlite3-wasm (pure WebAssembly).
 * Provides a synchronous API identical to better-sqlite3 so all server code
 * works without any native compilation.
 *
 * Supported:
 *   db.prepare(sql)  → Statement { run, get, all }
 *   db.exec(sql)
 *   db.pragma(str)
 *   db.transaction(fn) → wraps fn in BEGIN / COMMIT / ROLLBACK
 */

const { Database: WasmDatabase } = require("node-sqlite3-wasm");

/* ── Statement wrapper ─────────────────────────────────────────────────── */
class Statement {
  constructor(wstmt, dbRef) {
    this._s = wstmt;
    this._db = dbRef; // Database instance (not the raw wasm one)
  }

  // better-sqlite3 passes params as variadic args; wasm driver wants an array
  _arr(args) {
    if (args.length === 0) return [];
    if (Array.isArray(args[0])) return args[0];
    return args;
  }

  run(...args) {
    this._s.run(this._arr(args));
    // Retrieve changes / last rowid via aliased prepared statements on raw driver
    const cRow = this._db._raw.prepare("SELECT changes() AS n").get([]);
    const lRow = this._db._raw
      .prepare("SELECT last_insert_rowid() AS n")
      .get([]);
    return {
      changes: cRow ? cRow.n : 0,
      lastInsertRowid: lRow ? lRow.n : 0,
    };
  }

  get(...args) {
    return this._s.get(this._arr(args));
  }

  all(...args) {
    return this._s.all(this._arr(args));
  }
}

/* ── Database wrapper ──────────────────────────────────────────────────── */
class Database {
  constructor(pathOrMemory) {
    this._raw = new WasmDatabase(pathOrMemory);
    // Enable WAL and foreign keys once at open time
    // this._raw.run("PRAGMA journal_mode = WAL");
    this._raw.run("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new Statement(this._raw.prepare(sql), this);
  }

  exec(sql) {
    // node-sqlite3-wasm does not support multiple statements in one exec call;
    // split on ';' and run each non-empty statement individually.
    for (const stmt of sql.split(";")) {
      const s = stmt.trim();
      if (s) this._raw.run(s);
    }
    return this;
  }

  pragma(str) {
    try {
      this._raw.run(`PRAGMA ${str}`);
    } catch {
      /* silently ignore */
    }
  }

  /**
   * Returns a callable that runs fn inside BEGIN … COMMIT / ROLLBACK.
   * Matches better-sqlite3's db.transaction() behaviour exactly.
   */
  transaction(fn) {
    return (...args) => {
      this._raw.run("BEGIN");
      try {
        const result = fn(...args);
        this._raw.run("COMMIT");
        return result;
      } catch (e) {
        try {
          this._raw.run("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      }
    };
  }
}

module.exports = Database;
