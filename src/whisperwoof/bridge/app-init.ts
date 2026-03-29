/**
 * WhisperWoof App Initialization
 *
 * This is the ONLY module that imports OpenWhispr code.
 * All other WhisperWoof modules interact through this bridge.
 *
 * Called from main.js at startup to initialize WhisperWoof subsystems.
 */

// TODO: Phase 1a — Wire up after StorageProvider + OllamaService + HotkeyRouter are built
//
// Initialization sequence:
// 1. Initialize StorageProvider (creates tables if needed)
// 2. Start OllamaService (detect, auto-start if needed)
// 3. Register WhisperWoof hotkey routes (extend OpenWhispr's HotkeyManager)
// 4. Start ClipboardMonitor (Phase 1b)
// 5. Hook into OpenWhispr's STT output → WhisperWoof pipeline

export async function initializeWhisperWoof(): Promise<void> {
  console.log('[WhisperWoof] Initializing...');
  // Phase 0: placeholder — will be wired up in Phase 1a
  console.log('[WhisperWoof] Initialized (Phase 0 — no subsystems active yet)');
}

export async function shutdownWhisperWoof(): Promise<void> {
  console.log('[WhisperWoof] Shutting down...');
  // Phase 0: placeholder
  console.log('[WhisperWoof] Shutdown complete');
}
