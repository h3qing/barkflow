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
const fs = require("fs");
const { app, clipboard, nativeImage } = require("electron");
const Database = require("better-sqlite3");
const path = require("path");
const debugLogger = require("../../helpers/debugLogger");

let initialized = false;
let barkflowDb = null;
let clipboardInterval = null;
let lastClipboardText = "";

// Dedup: track recent voice transcriptions so clipboard monitor skips them.
// When voice text is pasted at cursor, it appears on clipboard — we don't want
// to capture it again as a "clipboard" entry.
const recentVoiceTexts = new Set();
const VOICE_DEDUP_TTL_MS = 5000; // forget after 5 seconds

function markAsVoiceTranscription(text) {
  if (!text) return;
  const trimmed = text.trim();
  recentVoiceTexts.add(trimmed);
  setTimeout(() => recentVoiceTexts.delete(trimmed), VOICE_DEDUP_TTL_MS);
}

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
      // Check for image on clipboard FIRST (image copy may also have text)
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const imgSize = img.getSize();
        // Dedup by dimensions (reuse lastClipboardText variable)
        const imgKey = `img_${imgSize.width}x${imgSize.height}`;
        if (imgKey !== lastClipboardText) {
          lastClipboardText = imgKey;

          // Save image to disk
          const imgId = crypto.randomUUID();
          const imgDir = path.join(app.getPath("userData"), "barkflow-images");
          if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

          const imgPath = path.join(imgDir, `${imgId}.png`);
          fs.writeFileSync(imgPath, img.toPNG());

          // Create a thumbnail (max 200px wide)
          const thumb = img.resize({ width: Math.min(200, imgSize.width) });
          const thumbPath = path.join(imgDir, `${imgId}_thumb.png`);
          fs.writeFileSync(thumbPath, thumb.toPNG());

          saveBarkFlowEntry({
            source: "clipboard",
            rawText: `[Image ${imgSize.width}\u00d7${imgSize.height}]`,
            polished: null,
            routedTo: null,
            hotkeyUsed: null,
            durationMs: null,
            projectId: null,
            audioPath: imgPath,
            metadata: { type: "image", width: imgSize.width, height: imgSize.height, thumbPath },
          });

          debugLogger.debug("[BarkFlow] Clipboard image captured", {
            width: imgSize.width,
            height: imgSize.height,
          });
          return; // Image handled — skip text check this cycle
        }
      }

      const currentText = clipboard.readText() || "";

      // Skip if same as last capture
      if (currentText === lastClipboardText) return;
      // Skip if empty
      if (!currentText.trim()) return;
      // Skip very short text (likely accidental)
      if (currentText.trim().length < 2) return;
      // BarkFlow dedup: skip if this text was just voice-transcribed
      // (pasting voice text puts it on clipboard — don't double-capture)
      if (recentVoiceTexts.has(currentText.trim())) {
        lastClipboardText = currentText;
        return;
      }

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

    // Migration: add favorite column (idempotent)
    try {
      db.exec("ALTER TABLE bf_entries ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
    } catch (err) {
      // Column already exists — ignore
      if (!err.message.includes("duplicate column")) throw err;
    }

    barkflowDb = db;
    debugLogger.log("[BarkFlow] Database tables initialized");

    // Dedup cleanup: remove clipboard entries that duplicate voice entries
    // (voice text gets auto-pasted to clipboard, creating duplicates)
    try {
      const result = db.prepare(`
        DELETE FROM bf_entries WHERE id IN (
          SELECT c.id FROM bf_entries c
          INNER JOIN bf_entries v ON c.raw_text = v.raw_text
          WHERE c.source = 'clipboard'
            AND v.source = 'voice'
            AND abs(julianday(c.created_at) - julianday(v.created_at)) * 86400 < 10
        )
      `).run();
      if (result.changes > 0) {
        debugLogger.log(`[BarkFlow] Dedup cleanup: removed ${result.changes} duplicate clipboard entries`);
      }
    } catch (err) {
      debugLogger.debug("[BarkFlow] Dedup cleanup skipped", { error: err.message });
    }
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

  // Dedup: mark voice text so clipboard monitor skips it
  if (source === "voice") {
    if (polished) markAsVoiceTranscription(polished);
    if (rawText) markAsVoiceTranscription(rawText);
  }

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

// Map SQLite snake_case columns to camelCase for the renderer
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    rawText: row.raw_text,
    polished: row.polished,
    routedTo: row.routed_to,
    hotkeyUsed: row.hotkey_used,
    durationMs: row.duration_ms,
    projectId: row.project_id,
    audioPath: row.audio_path,
    metadata: row.metadata,
    favorite: row.favorite || 0,
  };
}

function getBarkFlowEntries(limit = 50, offset = 0) {
  if (!barkflowDb) return [];
  const rows = barkflowDb.prepare(
    'SELECT * FROM bf_entries ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  return rows.map(mapRow);
}

function searchBarkFlowEntries(query, limit = 50) {
  if (!barkflowDb) return [];
  const rows = barkflowDb.prepare(
    `SELECT e.* FROM bf_entries e
     INNER JOIN bf_entries_fts fts ON e.rowid = fts.rowid
     WHERE bf_entries_fts MATCH ?
     ORDER BY e.created_at DESC LIMIT ?`
  ).all(query, limit);
  return rows.map(mapRow);
}

function deleteBarkFlowEntry(id) {
  if (!barkflowDb) return;
  barkflowDb.prepare('DELETE FROM bf_entries WHERE id = ?').run(id);
}

function toggleBarkFlowFavorite(id) {
  if (!barkflowDb) return false;
  const entry = barkflowDb.prepare('SELECT favorite FROM bf_entries WHERE id = ?').get(id);
  if (!entry) return false;
  const newValue = entry.favorite ? 0 : 1;
  barkflowDb.prepare('UPDATE bf_entries SET favorite = ? WHERE id = ?').run(newValue, id);
  return newValue === 1;
}

function getBarkFlowFavorites(limit = 50) {
  if (!barkflowDb) return [];
  return barkflowDb.prepare('SELECT * FROM bf_entries WHERE favorite = 1 ORDER BY created_at DESC LIMIT ?').all(limit).map(mapRow);
}

function createBarkFlowProject(name) {
  if (!barkflowDb) return null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  barkflowDb.prepare(
    'INSERT INTO bf_projects (id, name, created_at, integration_target, metadata) VALUES (?, ?, ?, NULL, NULL)'
  ).run(id, name, createdAt);
  // audit log
  barkflowDb.prepare(
    'INSERT INTO bf_audit_log (action, entity_id, detail) VALUES (?, ?, ?)'
  ).run('project_created', id, JSON.stringify({ name }));
  return { id, name, createdAt };
}

function getBarkFlowProjects() {
  if (!barkflowDb) return [];
  return barkflowDb.prepare('SELECT * FROM bf_projects ORDER BY created_at DESC').all();
}

function deleteBarkFlowProject(id) {
  if (!barkflowDb) return;
  // Set entries' project_id to null (don't delete entries)
  barkflowDb.prepare('UPDATE bf_entries SET project_id = NULL WHERE project_id = ?').run(id);
  barkflowDb.prepare('DELETE FROM bf_projects WHERE id = ?').run(id);
}

function getProjectEntries(projectId, limit = 50) {
  if (!barkflowDb) return [];
  return barkflowDb.prepare(
    'SELECT * FROM bf_entries WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit).map(mapRow);
}

module.exports = {
  initializeBarkFlow,
  shutdownBarkFlow,
  saveBarkFlowEntry,
  getBarkFlowEntries,
  searchBarkFlowEntries,
  deleteBarkFlowEntry,
  toggleBarkFlowFavorite,
  getBarkFlowFavorites,
  startClipboardMonitor,
  stopClipboardMonitor,
  createBarkFlowProject,
  getBarkFlowProjects,
  deleteBarkFlowProject,
  getProjectEntries,
};
