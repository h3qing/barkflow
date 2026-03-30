/**
 * Keybinding Customization — Rebind all hotkeys
 *
 * Stores user keybinding overrides in a JSON file.
 * Merged with defaults at startup — user overrides win.
 *
 * Features:
 * - Rebind any action to a different key combo
 * - Conflict detection (no two actions on same key)
 * - Reset individual or all keybindings to defaults
 * - Export/import keybinding profiles
 * - Validate key combo format
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-keybindings.json
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const KEYBINDINGS_FILE = path.join(app.getPath("userData"), "whisperwoof-keybindings.json");

// --- Default keybindings ---

const DEFAULT_KEYBINDINGS = {
  // Core actions
  "toggle-recording": { key: "Fn", label: "Toggle recording", category: "core" },
  "command-bar": { key: "CommandOrControl+K", label: "Command bar", category: "core" },
  "paste-at-cursor": { key: "Fn", label: "Paste at cursor", category: "routing" },

  // Routing
  "save-markdown": { key: "Fn+N", label: "Save as Markdown", category: "routing" },
  "route-project": { key: "Fn+P", label: "Route to project", category: "routing" },
  "route-todo": { key: "Fn+T", label: "Route to todo", category: "routing" },

  // Navigation
  "open-history": { key: "CommandOrControl+H", label: "Open history", category: "navigation" },
  "open-settings": { key: "CommandOrControl+,", label: "Open settings", category: "navigation" },
  "open-projects": { key: "CommandOrControl+P", label: "Open projects", category: "navigation" },

  // Focus mode
  "start-focus": { key: "CommandOrControl+Shift+F", label: "Start focus sprint", category: "focus" },
  "end-focus": { key: "CommandOrControl+Shift+E", label: "End focus sprint", category: "focus" },

  // Privacy
  "toggle-privacy": { key: "CommandOrControl+Shift+L", label: "Toggle privacy lock", category: "privacy" },
};

// --- State ---

let userOverrides = null;

function loadOverrides() {
  if (userOverrides !== null) return userOverrides;

  try {
    if (fs.existsSync(KEYBINDINGS_FILE)) {
      userOverrides = JSON.parse(fs.readFileSync(KEYBINDINGS_FILE, "utf-8"));
      return userOverrides;
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load keybindings", { error: err.message });
  }

  userOverrides = {};
  return userOverrides;
}

function saveOverrides() {
  try {
    const dir = path.dirname(KEYBINDINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEYBINDINGS_FILE, JSON.stringify(userOverrides, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save keybindings", { error: err.message });
  }
}

// --- Merged keybindings ---

/**
 * Get all keybindings (defaults merged with user overrides).
 */
function getKeybindings() {
  const overrides = loadOverrides();
  const result = {};

  for (const [actionId, defaultBinding] of Object.entries(DEFAULT_KEYBINDINGS)) {
    const override = overrides[actionId];
    result[actionId] = {
      actionId,
      ...defaultBinding,
      key: override?.key || defaultBinding.key,
      isCustom: !!override?.key,
      defaultKey: defaultBinding.key,
    };
  }

  return result;
}

/**
 * Get keybindings as a flat array (for UI).
 */
function getKeybindingsList() {
  const bindings = getKeybindings();
  return Object.values(bindings);
}

// --- Rebind ---

/**
 * Valid key combo format: modifier+key or single key.
 * Examples: "CommandOrControl+K", "Fn+N", "Shift+Enter", "F5"
 */
const KEY_COMBO_PATTERN = /^(Fn|F[1-9]|F1[0-2]|[A-Z]|[0-9]|Space|Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|,|\.|\[|\]|\\|\/|;|'|`|-|=)$|^(CommandOrControl|Cmd|Ctrl|Alt|Shift|Fn)\+/i;

function isValidKeyCombo(key) {
  if (!key || typeof key !== "string") return false;
  return KEY_COMBO_PATTERN.test(key.trim());
}

/**
 * Rebind an action to a new key combo.
 *
 * @param {string} actionId - The action to rebind
 * @param {string} newKey - The new key combo
 * @returns {{ success: boolean, error?: string, conflict?: string }}
 */
function rebindAction(actionId, newKey) {
  if (!DEFAULT_KEYBINDINGS[actionId]) {
    return { success: false, error: `Unknown action: "${actionId}"` };
  }

  const trimmedKey = (newKey || "").trim();
  if (!trimmedKey) {
    return { success: false, error: "Key combo is required" };
  }

  if (!isValidKeyCombo(trimmedKey)) {
    return { success: false, error: `Invalid key combo: "${trimmedKey}"` };
  }

  // Check for conflicts
  const currentBindings = getKeybindings();
  for (const [id, binding] of Object.entries(currentBindings)) {
    if (id !== actionId && binding.key.toLowerCase() === trimmedKey.toLowerCase()) {
      return {
        success: false,
        error: `Key "${trimmedKey}" is already bound to "${binding.label}"`,
        conflict: id,
      };
    }
  }

  const overrides = loadOverrides();
  userOverrides = { ...overrides, [actionId]: { key: trimmedKey } };
  saveOverrides();

  debugLogger.info("[WhisperWoof] Keybinding changed", { actionId, newKey: trimmedKey });
  return { success: true };
}

/**
 * Reset a single action to its default keybinding.
 */
function resetAction(actionId) {
  if (!DEFAULT_KEYBINDINGS[actionId]) {
    return { success: false, error: `Unknown action: "${actionId}"` };
  }

  const overrides = loadOverrides();
  const { [actionId]: _, ...rest } = overrides;
  userOverrides = rest;
  saveOverrides();

  return { success: true, key: DEFAULT_KEYBINDINGS[actionId].key };
}

/**
 * Reset ALL keybindings to defaults.
 */
function resetAll() {
  userOverrides = {};
  saveOverrides();
  return { success: true };
}

// --- Export/Import ---

function exportKeybindings() {
  return {
    version: 1,
    appName: "WhisperWoof",
    type: "keybindings",
    exportedAt: new Date().toISOString(),
    bindings: loadOverrides(),
  };
}

function importKeybindings(data) {
  if (!data || data.appName !== "WhisperWoof" || data.type !== "keybindings") {
    return { success: false, error: "Invalid keybinding export file" };
  }

  if (!data.bindings || typeof data.bindings !== "object") {
    return { success: false, error: "No bindings found in export" };
  }

  // Validate all keys before applying
  let imported = 0;
  const errors = [];

  for (const [actionId, binding] of Object.entries(data.bindings)) {
    if (!DEFAULT_KEYBINDINGS[actionId]) {
      errors.push(`Unknown action: ${actionId}`);
      continue;
    }
    if (binding.key && !isValidKeyCombo(binding.key)) {
      errors.push(`Invalid key for ${actionId}: ${binding.key}`);
      continue;
    }
    imported++;
  }

  if (imported === 0 && errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }

  // Apply valid bindings
  userOverrides = { ...data.bindings };
  saveOverrides();

  return { success: true, imported, errors };
}

/**
 * Get keybinding categories (for grouped settings UI).
 */
function getCategories() {
  return [
    { id: "core", name: "Core", description: "Recording and command bar" },
    { id: "routing", name: "Routing", description: "Where voice text goes" },
    { id: "navigation", name: "Navigation", description: "Open panels and views" },
    { id: "focus", name: "Focus", description: "Focus sprint controls" },
    { id: "privacy", name: "Privacy", description: "Privacy lock" },
  ];
}

module.exports = {
  getKeybindings,
  getKeybindingsList,
  rebindAction,
  resetAction,
  resetAll,
  exportKeybindings,
  importKeybindings,
  getCategories,
  isValidKeyCombo,
  DEFAULT_KEYBINDINGS,
};
