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

function updatePlugin(id, updates) {
  const plugins = loadPlugins();
  const idx = plugins.findIndex(p => p.id === id);
  if (idx === -1) return null;
  plugins[idx] = { ...plugins[idx], ...updates };
  savePlugins(plugins);
  return plugins[idx];
}

function addPlugin(config) {
  const plugins = loadPlugins();
  if (plugins.some(p => p.id === config.id)) return null; // duplicate
  plugins.push(config);
  savePlugins(plugins);
  return config;
}

function removePlugin(id) {
  const plugins = loadPlugins().filter(p => p.id !== id);
  savePlugins(plugins);
}

module.exports = { getPlugins, updatePlugin, addPlugin, removePlugin };
