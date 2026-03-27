/**
 * BarkFlow App Initialization (CommonJS — loaded by main.js)
 *
 * This is the main-process entry point for BarkFlow.
 * TypeScript modules in src/barkflow/core/ are used for the renderer
 * and test builds (via Vite/Vitest). This JS file bridges the main process.
 *
 * Phase 0: Logs initialization only.
 * Phase 1a: StorageProvider wired up — creates BarkFlow tables in OpenWhispr DB.
 */

const crypto = require("crypto");
const { app, clipboard } = require("electron");
const Database = require("better-sqlite3");
const path = require("path");
const debugLogger = require("../../helpers/debugLogger");

let initialized = false;
let barkflowDb = null;
let clipboardInterval = null;
let lastClipboardText = "";

function createBarkFlowTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bf_entries (
      id TEXT PRIMARY KEY,
      created_at TEXT,
      source TEXT CHECK(source IN ('voice','clipboard','meeting','import')),
      raw_text TEXT,
      polished TEXT,
      routed_to TEXT,
      hotkey_used TEXT,
      duration_ms INTEGER,
      project_id TEXT,
      audio_path TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS bf_projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT,
      integration_target TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS bf_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      action TEXT,
      entity_id TEXT,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bf_entries_created_at ON bf_entries(created_at);
    CREATE INDEX IF NOT EXISTS idx_bf_entries_source ON bf_entries(source);
    CREATE INDEX IF NOT EXISTS idx_bf_entries_project_id ON bf_entries(project_id);
  `);
}

function createFtsTables(db) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bf_entries_fts USING fts5(
      raw_text,
      polished,
      content=bf_entries
    );
  `);

  // FTS triggers: keep bf_entries_fts in sync with bf_entries
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS bf_entries_fts_insert
    AFTER INSERT ON bf_entries BEGIN
      INSERT INTO bf_entries_fts(rowid, raw_text, polished)
      VALUES (NEW.rowid, NEW.raw_text, NEW.polished);
    END;

    CREATE TRIGGER IF NOT EXISTS bf_entries_fts_delete
    AFTER DELETE ON bf_entries BEGIN
      INSERT INTO bf_entries_fts(bf_entries_fts, rowid, raw_text, polished)
      VALUES ('delete', OLD.rowid, OLD.raw_text, OLD.polished);
    END;

    CREATE TRIGGER IF NOT EXISTS bf_entries_fts_update
    AFTER UPDATE ON bf_entries BEGIN
      INSERT INTO bf_entries_fts(bf_entries_fts, rowid, raw_text, polished)
      VALUES ('delete', OLD.rowid, OLD.raw_text, OLD.polished);
      INSERT INTO bf_entries_fts(rowid, raw_text, polished)
      VALUES (NEW.rowid, NEW.raw_text, NEW.polished);
    END;
  `);
}

function startClipboardMonitor() {
  // Poll every 500ms for clipboard changes
  lastClipboardText = clipboard.readText() || "";

  clipboardInterval = setInterval(() => {
    try {
      const currentText = clipboard.readText() || "";

      // Skip if same as last capture
      if (currentText === lastClipboardText) return;
      // Skip if empty
      if (!currentText.trim()) return;
      // Skip very short text (likely accidental)
      if (currentText.trim().length < 2) return;

      lastClipboardText = currentText;

      // Save to bf_entries
      saveBarkFlowEntry({
        source: "clipboard",
        rawText: currentText,
        polished: null,
        routedTo: null,
        hotkeyUsed: null,
        durationMs: null,
        projectId: null,
        audioPath: null,
        metadata: {},
      });

      debugLogger.debug("[BarkFlow] Clipboard entry captured", {
        length: currentText.length,
      });
    } catch (err) {
      // Never crash the poll loop
      debugLogger.debug("[BarkFlow] Clipboard poll error", { error: err.message });
    }
  }, 500);

  debugLogger.log("[BarkFlow] Clipboard monitoring started");
}

function stopClipboardMonitor() {
  if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
    debugLogger.log("[BarkFlow] Clipboard monitoring stopped");
  }
}

async function initializeBarkFlow() {
  if (initialized) return;

  debugLogger.log("[BarkFlow] Initializing...");

  // Open the same database that OpenWhispr uses
  try {
    const dbFileName =
      process.env.NODE_ENV === "development" ? "transcriptions-dev.db" : "transcriptions.db";
    const dbPath = path.join(app.getPath("userData"), dbFileName);

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    createBarkFlowTables(db);
    createFtsTables(db);

    barkflowDb = db;
    debugLogger.log("[BarkFlow] Database tables initialized");
  } catch (error) {
    debugLogger.log(`[BarkFlow] Database initialization failed: ${error.message}`);
    throw error;
  }

  // TODO: Start OllamaService (detect, auto-start)
  // TODO: Register BarkFlow hotkey routes

  startClipboardMonitor();

  initialized = true;
  debugLogger.log("[BarkFlow] Initialized (Phase 1a — StorageProvider ready, clipboard monitoring active)");
}

async function shutdownBarkFlow() {
  if (!initialized) return;

  debugLogger.log("[BarkFlow] Shutting down...");

  stopClipboardMonitor();

  // Close the BarkFlow database connection
  if (barkflowDb) {
    try {
      barkflowDb.close();
      debugLogger.log("[BarkFlow] Database connection closed");
    } catch (error) {
      debugLogger.log(`[BarkFlow] Database close failed: ${error.message}`);
    }
    barkflowDb = null;
  }

  initialized = false;
  debugLogger.log("[BarkFlow] Shutdown complete");
}

function saveBarkFlowEntry({ source, rawText, polished, routedTo, hotkeyUsed, durationMs, projectId, audioPath, metadata }) {
  if (!barkflowDb) return null;

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const insertEntry = barkflowDb.prepare(`
      INSERT INTO bf_entries (id, created_at, source, raw_text, polished, routed_to, hotkey_used, duration_ms, project_id, audio_path, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEntry.run(id, createdAt, source, rawText, polished, routedTo, hotkeyUsed, durationMs, projectId, audioPath, JSON.stringify(metadata ?? {}));

    const insertAudit = barkflowDb.prepare(`
      INSERT INTO bf_audit_log (action, entity_id, detail)
      VALUES (?, ?, ?)
    `);
    insertAudit.run("entry_created", id, `source=${source}`);

    debugLogger.log(`[BarkFlow] Entry saved: ${id} (source=${source})`);
    return { id, createdAt };
  } catch (error) {
    debugLogger.log(`[BarkFlow] Failed to save entry: ${error.message}`);
    return null;
  }
}

function getBarkFlowEntries(limit = 50, offset = 0) {
  if (!barkflowDb) return [];
  const rows = barkflowDb.prepare(
    'SELECT * FROM bf_entries ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  return rows;
}

function searchBarkFlowEntries(query, limit = 50) {
  if (!barkflowDb) return [];
  const rows = barkflowDb.prepare(
    `SELECT e.* FROM bf_entries e
     INNER JOIN bf_entries_fts fts ON e.rowid = fts.rowid
     WHERE bf_entries_fts MATCH ?
     ORDER BY e.created_at DESC LIMIT ?`
  ).all(query, limit);
  return rows;
}

function deleteBarkFlowEntry(id) {
  if (!barkflowDb) return;
  barkflowDb.prepare('DELETE FROM bf_entries WHERE id = ?').run(id);
}

module.exports = {
  initializeBarkFlow,
  shutdownBarkFlow,
  saveBarkFlowEntry,
  getBarkFlowEntries,
  searchBarkFlowEntries,
  deleteBarkFlowEntry,
  startClipboardMonitor,
  stopClipboardMonitor,
};
