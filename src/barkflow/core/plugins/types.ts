/**
 * Plugin System Types
 *
 * Defines configuration, results, and status types for MCP-based plugins.
 * BarkFlow acts as an MCP client; each plugin is an MCP server process.
 *
 * Phase 2 will wire these to the real @modelcontextprotocol/sdk.
 * Import paths for reference:
 *   Client            — @modelcontextprotocol/sdk/client/index.js
 *   StdioClientTransport — @modelcontextprotocol/sdk/client/stdio.js
 */

/** Configuration for a single MCP plugin server. */
export interface PluginConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** CLI command to start the MCP server (e.g., "npx todoist-mcp"). */
  readonly command: string;
  readonly args?: readonly string[];
  /** Environment variables forwarded to the server process (API keys, etc.). */
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  /** Hotkey that routes voice text to this plugin (e.g., "Fn+T"). */
  readonly hotkeyBinding?: string;
}

/** Outcome of executing a plugin action. */
export interface PluginResult {
  readonly success: boolean;
  readonly message?: string;
  /** Link to the created item (e.g., Todoist task URL). */
  readonly url?: string;
  readonly error?: string;
}

/** Runtime connection status for a plugin. */
export interface PluginStatus {
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
  readonly error?: string;
}
