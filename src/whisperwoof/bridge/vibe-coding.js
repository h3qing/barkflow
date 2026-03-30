/**
 * Vibe Coding — Voice-to-code dictation for developer contexts
 *
 * When the active app is an IDE (VS Code, Cursor, Xcode, etc.),
 * WhisperWoof switches to code mode: natural language input is
 * converted to syntactically correct code.
 *
 * Examples:
 *   "create a function that takes a list of numbers and returns the sum"
 *   → function sum(numbers) { return numbers.reduce((a, b) => a + b, 0); }
 *
 *   "add a try catch around that with a console error"
 *   → try { ... } catch (err) { console.error(err); }
 *
 *   "import react and use state"
 *   → import React, { useState } from 'react';
 *
 * Competitors: Wispr Flow IDE extensions, Aqua Voice vibe coding.
 */

const debugLogger = require("../../helpers/debugLogger");

/**
 * IDE bundle IDs that should use code mode.
 */
const CODE_MODE_APPS = new Set([
  "com.microsoft.VSCode",
  "com.todesktop.230313mzl4w4u92", // Cursor
  "dev.zed.Zed",
  "com.jetbrains.intellij",
  "com.jetbrains.WebStorm",
  "com.jetbrains.pycharm",
  "com.jetbrains.goland",
  "com.sublimetext.4",
  "com.apple.dt.Xcode",
  "com.panic.Nova",
  "com.vim.MacVim",
  "org.vim.MacVim",
]);

/**
 * Terminal apps that should use shell mode.
 */
const SHELL_MODE_APPS = new Set([
  "com.googlecode.iterm2",
  "com.apple.Terminal",
  "dev.warp.Warp-Stable",
  "io.alacritty",
  "com.github.wez.wezterm",
]);

/**
 * Check if a bundle ID should trigger code mode.
 */
function isCodeModeApp(bundleId) {
  return CODE_MODE_APPS.has(bundleId);
}

/**
 * Check if a bundle ID should trigger shell mode.
 */
function isShellModeApp(bundleId) {
  return SHELL_MODE_APPS.has(bundleId);
}

/**
 * Detect if spoken text is a code intent (not just prose to paste in an IDE).
 *
 * Heuristic: if the text contains coding-related keywords, treat it as code.
 * Otherwise, treat it as prose that happens to be dictated in an IDE.
 */
const CODE_INTENT_PATTERNS = [
  // Function/class creation
  /\b(create|write|make|add|define|implement)\s+(a\s+)?(function|method|class|component|interface|type|enum|struct|module|hook|handler|middleware|route|endpoint|api|test)\b/i,

  // Import/export
  /\b(import|require|export|from)\s+/i,

  // Control flow
  /\b(add|wrap|create)\s+(.{0,20})?(try\s*catch|if\s+else|for\s+loop|while\s+loop|switch\s+case|async|await)\b/i,

  // Variable/constant
  /\b(declare|set|create|add)\s+(a\s+)?(variable|constant|const|let|var|state|ref|prop)\b/i,

  // Data structures
  /\b(create|make|initialize|return)\s+(an?\s+)?(new\s+)?(array|object|map|set|list|dict|hash|tuple|record|promise)\b/i,

  // Common operations
  /\b(sort|filter|map|reduce|find|forEach|iterate|loop\s+through|fetch|request|query|insert|update|delete|select)\b/i,

  // Framework-specific
  /\b(useState|useEffect|useRef|useCallback|useMemo|useContext)\b/i,
  /\b(express|fastify|next|react|vue|angular|svelte|django|flask|rails)\b/i,

  // Shell commands
  /\b(run|execute|install|npm|pip|brew|git|docker|curl|wget|ssh|chmod|mkdir|grep|sed|awk)\b/i,
];

/**
 * Check if spoken text has code intent.
 */
function hasCodeIntent(text) {
  if (!text || text.length < 5) return false;
  return CODE_INTENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Build the system prompt for code mode.
 * Adapts based on whether it's a code editor or terminal.
 */
const CODE_PROMPT =
  "You are a voice-to-code assistant. The user is speaking in natural language and expects code output.\n\n" +
  "Rules:\n" +
  "- Convert the spoken instruction to clean, idiomatic code\n" +
  "- Use the language/framework most appropriate for the context\n" +
  "- Default to JavaScript/TypeScript if the language isn't clear\n" +
  "- Return ONLY the code, no explanations or markdown fences\n" +
  "- Use proper indentation (2-space indent)\n" +
  "- Include necessary imports if the instruction implies them\n" +
  "- For partial instructions ('add a try catch around that'), output just the wrapping code\n" +
  "- Variable names should be camelCase (JS/TS), snake_case (Python), etc.\n" +
  "- Keep it concise — don't over-engineer a simple request";

const SHELL_PROMPT =
  "You are a voice-to-shell assistant. The user is speaking in natural language and expects a shell command.\n\n" +
  "Rules:\n" +
  "- Convert the spoken instruction to a working shell command\n" +
  "- Default to bash/zsh syntax\n" +
  "- Return ONLY the command, no explanations\n" +
  "- Use common Unix tools (grep, sed, awk, find, etc.) where appropriate\n" +
  "- Pipe commands together when it makes sense\n" +
  "- For dangerous operations (rm -rf, DROP TABLE), add a comment warning\n" +
  "- Keep it to one command or a short pipeline";

/**
 * Get the appropriate prompt for the coding context.
 *
 * @param {string|null} bundleId - Active app bundle ID
 * @param {string} spokenText - What the user said
 * @returns {{ prompt: string, mode: 'code'|'shell'|'prose' }}
 */
function getCodingPrompt(bundleId, spokenText) {
  // Shell mode for terminals
  if (bundleId && isShellModeApp(bundleId)) {
    return { prompt: SHELL_PROMPT, mode: "shell" };
  }

  // Code mode for IDEs — but only if the text has code intent
  if (bundleId && isCodeModeApp(bundleId)) {
    if (hasCodeIntent(spokenText)) {
      return { prompt: CODE_PROMPT, mode: "code" };
    }
    // Prose in IDE — use normal polish (comments, docs, commit messages)
    return { prompt: null, mode: "prose" };
  }

  // Not in an IDE — normal mode
  return { prompt: null, mode: "prose" };
}

/**
 * Get all code-mode app bundle IDs (for settings UI).
 */
function getCodeModeApps() {
  return Array.from(CODE_MODE_APPS);
}

/**
 * Get all shell-mode app bundle IDs (for settings UI).
 */
function getShellModeApps() {
  return Array.from(SHELL_MODE_APPS);
}

module.exports = {
  isCodeModeApp,
  isShellModeApp,
  hasCodeIntent,
  getCodingPrompt,
  getCodeModeApps,
  getShellModeApps,
  CODE_PROMPT,
  SHELL_PROMPT,
  CODE_MODE_APPS,
  SHELL_MODE_APPS,
};
