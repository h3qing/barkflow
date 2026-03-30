/**
 * Context Detector — Identifies the active (frontmost) application on macOS
 *
 * Uses NSWorkspace via osascript to get the frontmost app's bundle ID and name.
 * Maps apps to optimal polish presets for context-aware formatting.
 *
 * Competitors (Wispr Flow, Aqua Voice, DictaFlow, VoiceInk) all do this.
 * WhisperWoof differentiates by making it fully local + configurable.
 */

const { execFile } = require("child_process");
const debugLogger = require("../../helpers/debugLogger");

// AppleScript (JXA) to get frontmost app info — runs in ~50ms
const DETECT_SCRIPT = `
ObjC.import("AppKit");
const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
const bundleId = ObjC.unwrap(app.bundleIdentifier) || "";
const name = ObjC.unwrap(app.localizedName) || "";
JSON.stringify({ bundleId, name });
`;

/**
 * Get the currently active (frontmost) application.
 * Returns { bundleId, name } or null on failure.
 */
function detectActiveApp() {
  if (process.platform !== "darwin") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", DETECT_SCRIPT],
      { timeout: 2000 },
      (err, stdout) => {
        if (err) {
          debugLogger.debug("[WhisperWoof] Context detection failed", { error: err.message });
          resolve(null);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          debugLogger.debug("[WhisperWoof] Active app detected", result);
          resolve(result);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/**
 * App → Polish Preset mapping.
 *
 * Maps bundle IDs to the optimal polish preset for that context.
 * Users can override via settings — this is the smart default.
 *
 * Categories:
 * - "professional": Email, docs, business tools → confident, formal
 * - "casual": Chat, messaging → light cleanup, keep conversational
 * - "structured": IDEs, notes, writing tools → Markdown with headings
 * - "clean": Default for everything else → filler removal + punctuation
 * - "minimal": Terminal, code-only contexts → just remove fillers
 */
const APP_PRESET_MAP = {
  // Email — professional tone
  "com.apple.mail": "professional",
  "com.google.Chrome": null, // Handled by URL detection below
  "com.microsoft.Outlook": "professional",
  "com.readdle.smartemail-macos": "professional",
  "com.superhuman.electron": "professional",

  // Chat / Messaging — casual, conversational
  "com.tinyspeck.slackmacgap": "casual",
  "com.hnc.Discord": "casual",
  "com.apple.MobileSMS": "casual",
  "ru.keepcoder.Telegram": "casual",
  "net.whatsapp.WhatsApp": "casual",
  "com.facebook.archon.developerID": "casual", // Messenger
  "com.microsoft.teams2": "casual",

  // IDEs / Code editors — structured or minimal
  "com.microsoft.VSCode": "structured",
  "com.todesktop.230313mzl4w4u92": "structured", // Cursor
  "dev.zed.Zed": "structured",
  "com.jetbrains.intellij": "structured",
  "com.sublimetext.4": "structured",
  "com.apple.dt.Xcode": "structured",
  "com.googlecode.iterm2": "minimal",
  "com.apple.Terminal": "minimal",

  // Notes / Writing — structured
  "com.apple.Notes": "structured",
  "md.obsidian": "structured",
  "com.electron.logseq": "structured",
  "com.notion.id": "structured",
  "com.bear-writer.bear": "structured",
  "com.ulyssesapp.mac": "structured",
  "net.ia.iawriter": "clean",

  // Documents — professional
  "com.apple.iWork.Pages": "professional",
  "com.microsoft.Word": "professional",
  "com.google.android.apps.docs": "professional",

  // Spreadsheets — minimal (data entry)
  "com.apple.iWork.Numbers": "minimal",
  "com.microsoft.Excel": "minimal",

  // Presentations — professional
  "com.apple.iWork.Keynote": "professional",
  "com.microsoft.Powerpoint": "professional",

  // Task managers — clean (concise action items)
  "com.todoist.mac.Todoist": "clean",
  "com.culturedcode.ThingsMac": "clean",
  "com.linear": "clean",
  "com.asana.macOS": "clean",

  // Browsers — default to clean (URL-based detection would be better)
  "com.apple.Safari": "clean",
  "org.mozilla.firefox": "clean",
  "com.brave.Browser": "clean",
  "company.thebrowser.Browser": "clean", // Arc

  // Social media — casual
  "com.buffer.publish": "casual",
};

/**
 * Get the recommended polish preset for the active app.
 * Returns the preset ID string or null (use user's default).
 */
function getPresetForApp(bundleId) {
  if (!bundleId) return null;
  return APP_PRESET_MAP[bundleId] ?? null;
}

/**
 * Detect the active app and return a recommended polish preset.
 * Combines detection + mapping in one call.
 */
async function detectContextPreset() {
  const app = await detectActiveApp();
  if (!app) return { app: null, preset: null };

  const preset = getPresetForApp(app.bundleId);
  return { app, preset };
}

/**
 * Get the full app-to-preset mapping (for settings UI).
 */
function getAppPresetMap() {
  return { ...APP_PRESET_MAP };
}

/**
 * Update a single app mapping (user override).
 * Pass null to remove the override and revert to default.
 */
function setAppPreset(bundleId, presetId) {
  if (presetId === null) {
    delete APP_PRESET_MAP[bundleId];
  } else {
    APP_PRESET_MAP[bundleId] = presetId;
  }
}

module.exports = {
  detectActiveApp,
  getPresetForApp,
  detectContextPreset,
  getAppPresetMap,
  setAppPreset,
};
