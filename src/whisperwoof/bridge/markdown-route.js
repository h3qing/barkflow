/**
 * Markdown Route — Save polished text as a .md file
 *
 * Triggered by Fn+N hotkey routing. Saves voice transcript
 * as a Markdown file to a configurable directory.
 *
 * Default: ~/Documents/WhisperWoof Notes/
 * Filename: YYYY-MM-DD-HHMMSS.md
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const DEFAULT_NOTES_DIR = path.join(
  app.getPath("documents"),
  "WhisperWoof Notes"
);

function getNotesDir() {
  // TODO: Read from settings once settings integration is done
  const customDir = process.env.WHISPERWOOF_NOTES_DIR;
  return customDir || DEFAULT_NOTES_DIR;
}

function generateFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.md`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save text as a Markdown file.
 * @param {string} text - The polished (or raw) text to save
 * @returns {{ success: boolean, filePath?: string, error?: string }}
 */
function saveAsMarkdown(text) {
  if (!text || !text.trim()) {
    return { success: false, error: "No text to save" };
  }

  try {
    const dir = getNotesDir();
    ensureDir(dir);

    const filename = generateFilename();
    const filePath = path.join(dir, filename);

    fs.writeFileSync(filePath, text.trim(), "utf-8");

    debugLogger.info("[WhisperWoof] Saved markdown note", {
      filePath,
      textLength: text.length,
    });

    return { success: true, filePath };
  } catch (err) {
    debugLogger.error("[WhisperWoof] Failed to save markdown note", {
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Get the current notes directory path.
 * @returns {string}
 */
function getNotesDirectory() {
  return getNotesDir();
}

module.exports = { saveAsMarkdown, getNotesDirectory, DEFAULT_NOTES_DIR };
