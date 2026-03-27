/**
 * BarkFlow App Initialization
 *
 * This is the ONLY module that imports OpenWhispr code.
 * All other BarkFlow modules interact through this bridge.
 *
 * Called from main.js at startup to initialize BarkFlow subsystems.
 */

// TODO: Phase 1a — Wire up after StorageProvider + OllamaService + HotkeyRouter are built
//
// Initialization sequence:
// 1. Initialize StorageProvider (creates tables if needed)
// 2. Start OllamaService (detect, auto-start if needed)
// 3. Register BarkFlow hotkey routes (extend OpenWhispr's HotkeyManager)
// 4. Start ClipboardMonitor (Phase 1b)
// 5. Hook into OpenWhispr's STT output → BarkFlow pipeline

export async function initializeBarkFlow(): Promise<void> {
  console.log('[BarkFlow] Initializing...');
  // Phase 0: placeholder — will be wired up in Phase 1a
  console.log('[BarkFlow] Initialized (Phase 0 — no subsystems active yet)');
}

export async function shutdownBarkFlow(): Promise<void> {
  console.log('[BarkFlow] Shutting down...');
  // Phase 0: placeholder
  console.log('[BarkFlow] Shutdown complete');
}
