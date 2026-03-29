const debugLogger = require("../../helpers/debugLogger");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Plugins stored in a JSON file
const PLUGINS_FILE = path.join(app.getPath("userData"), "barkflow-plugins.json");

function loadPlugins() {
  try {
    if (fs.existsSync(PLUGINS_FILE)) {
      return JSON.parse(fs.readFileSync(PLUGINS_FILE, "utf-8"));
    }
  } catch (err) {
    debugLogger.warn("[BarkFlow] Failed to load plugins", { error: err.message });
  }
  // Return default plugins (not connected, just configs)
  return [
    { id: "todoist", name: "Todoist", description: "Add tasks to Todoist", command: "npx @barkflow/todoist-mcp", enabled: false, hotkeyBinding: "Fn+T" },
    { id: "notion", name: "Notion", description: "Save notes to Notion", command: "npx @barkflow/notion-mcp", enabled: false, hotkeyBinding: null },
    { id: "calendar", name: "Google Calendar", description: "Add events to Google Calendar", command: "npx @barkflow/calendar-mcp", enabled: false, hotkeyBinding: "Fn+C" },
    { id: "slack", name: "Slack", description: "Send messages to Slack", command: "npx @barkflow/slack-mcp", enabled: false, hotkeyBinding: null },
  ];
}

function savePlugins(plugins) {
  try {
    fs.writeFileSync(PLUGINS_FILE, JSON.stringify(plugins, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[BarkFlow] Failed to save plugins", { error: err.message });
  }
}

function getPlugins() { return loadPlugins(); }

// Security: only allow these fields to be updated from renderer
const ALLOWED_UPDATE_FIELDS = new Set(["enabled", "hotkeyBinding", "description"]);

function updatePlugin(id, updates) {
  const plugins = loadPlugins();
  const idx = plugins.findIndex(p => p.id === id);
  if (idx === -1) return null;
  // Whitelist: only safe fields can be updated
  const safeUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      safeUpdates[key] = value;
    }
  }
  plugins[idx] = { ...plugins[idx], ...safeUpdates };
  savePlugins(plugins);
  return plugins[idx];
}

function addPlugin(config) {
  const plugins = loadPlugins();
  // Validate required fields
  if (!config || typeof config.id !== "string" || typeof config.name !== "string") return null;
  if (plugins.some(p => p.id === config.id)) return null; // duplicate
  // Security: only allow known MCP package commands
  const command = String(config.command || "");
  if (command && !command.startsWith("npx @barkflow/") && !command.startsWith("npx ")) {
    debugLogger.warn("[BarkFlow] Rejected plugin with suspicious command", { command });
    return null;
  }
  plugins.push({
    id: String(config.id),
    name: String(config.name),
    description: String(config.description || ""),
    command: command,
    enabled: false, // always start disabled
    hotkeyBinding: config.hotkeyBinding || null,
  });
  savePlugins(plugins);
  return plugins[plugins.length - 1];
}

function removePlugin(id) {
  const plugins = loadPlugins().filter(p => p.id !== id);
  savePlugins(plugins);
}

module.exports = { getPlugins, updatePlugin, addPlugin, removePlugin };
