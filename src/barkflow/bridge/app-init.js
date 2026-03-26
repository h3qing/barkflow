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

const { app } = require("electron");
const Database = require("better-sqlite3");
const path = require("path");
const debugLogger = require("../../helpers/debugLogger");

let initialized = false;
let barkflowDb = null;

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
  // TODO: Start ClipboardMonitor

  initialized = true;
  debugLogger.log("[BarkFlow] Initialized (Phase 1a — StorageProvider ready, other subsystems pending)");
}

async function shutdownBarkFlow() {
  if (!initialized) return;

  debugLogger.log("[BarkFlow] Shutting down...");

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

  // TODO: Stop ClipboardMonitor

  initialized = false;
  debugLogger.log("[BarkFlow] Shutdown complete");
}

module.exports = { initializeBarkFlow, shutdownBarkFlow };
