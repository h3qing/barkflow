/**
 * BarkFlow App Initialization (CommonJS — loaded by main.js)
 *
 * This is the main-process entry point for BarkFlow.
 * TypeScript modules in src/barkflow/core/ are used for the renderer
 * and test builds (via Vite/Vitest). This JS file bridges the main process.
 *
 * Phase 0: Logs initialization only.
 * Phase 1a: Will wire up StorageProvider, OllamaService, HotkeyRouter.
 */

const debugLogger = require("../../helpers/debugLogger");

let initialized = false;

async function initializeBarkFlow() {
  if (initialized) return;

  debugLogger.log("[BarkFlow] Initializing...");

  // Phase 0: placeholder — subsystems will be wired in Phase 1a
  // TODO: Initialize StorageProvider (create bf_entries, bf_projects tables)
  // TODO: Start OllamaService (detect, auto-start)
  // TODO: Register BarkFlow hotkey routes
  // TODO: Start ClipboardMonitor

  initialized = true;
  debugLogger.log("[BarkFlow] Initialized (Phase 0 — core modules ready, subsystems pending)");
}

async function shutdownBarkFlow() {
  if (!initialized) return;

  debugLogger.log("[BarkFlow] Shutting down...");

  // Phase 0: placeholder
  // TODO: Stop ClipboardMonitor
  // TODO: Close StorageProvider

  initialized = false;
  debugLogger.log("[BarkFlow] Shutdown complete");
}

module.exports = { initializeBarkFlow, shutdownBarkFlow };
