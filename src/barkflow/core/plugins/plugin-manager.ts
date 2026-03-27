/**
 * PluginManager
 *
 * Manages MCP server plugin lifecycles: register, connect (spawn process),
 * execute (JSON-RPC over stdio), and disconnect (graceful shutdown).
 *
 * Current implementation uses a simplified JSON-RPC 2.0 protocol over stdio.
 * Phase 2 will swap in the real @modelcontextprotocol/sdk:
 *   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 *   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { PluginConfig, PluginResult, PluginStatus } from './types';

const PROCESS_KILL_TIMEOUT_MS = 5_000;

interface PluginEntry {
  readonly config: PluginConfig;
  process: ChildProcess | null;
  connected: boolean;
  error?: string;
}

/** JSON-RPC 2.0 request envelope. */
interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/** JSON-RPC 2.0 response envelope (success or error). */
interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number; readonly message: string };
}

let nextRequestId = 1;

function buildRequest(
  method: string,
  params: Record<string, unknown>,
): JsonRpcRequest {
  const id = nextRequestId;
  nextRequestId += 1;
  return { jsonrpc: '2.0', id, method, params };
}

/**
 * Send a JSON-RPC request to a child process and wait for the matching response.
 * Rejects if the process exits, errors, or a timeout is exceeded.
 */
function sendRequest(
  child: ChildProcess,
  request: JsonRpcRequest,
  timeoutMs = 30_000,
): Promise<JsonRpcResponse> {
  return new Promise<JsonRpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Plugin request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      child.stdout?.removeListener('data', onData);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
    }

    let buffer = '';

    function onData(chunk: Buffer) {
      buffer += chunk.toString('utf-8');

      // Attempt to parse each complete line as a JSON-RPC response
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed: JsonRpcResponse = JSON.parse(trimmed);
          if (parsed.id === request.id) {
            cleanup();
            resolve(parsed);
            return;
          }
        } catch {
          // Not valid JSON — ignore (server logs, etc.)
        }
      }
    }

    function onError(err: Error) {
      cleanup();
      reject(new Error(`Plugin process error: ${err.message}`));
    }

    function onClose(code: number | null) {
      cleanup();
      reject(new Error(`Plugin process exited with code ${code ?? 'unknown'}`));
    }

    child.stdout?.on('data', onData);
    child.on('error', onError);
    child.on('close', onClose);

    const payload = JSON.stringify(request) + '\n';
    child.stdin?.write(payload);
  });
}

/**
 * Gracefully terminate a child process: close stdin, SIGTERM, then SIGKILL.
 * Mirrors the @modelcontextprotocol/sdk shutdown sequence.
 */
function terminateProcess(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!child.pid || child.killed) {
      resolve();
      return;
    }

    const forceKill = setTimeout(() => {
      child.kill('SIGKILL');
    }, PROCESS_KILL_TIMEOUT_MS);

    child.once('close', () => {
      clearTimeout(forceKill);
      resolve();
    });

    child.stdin?.end();
    child.kill('SIGTERM');
  });
}

export class PluginManager {
  private readonly plugins: Map<string, PluginEntry> = new Map();

  /**
   * Register a plugin config. Does not connect yet.
   * Throws if the id is already registered or required fields are missing.
   */
  registerPlugin(config: PluginConfig): void {
    this.validateConfig(config);

    if (this.plugins.has(config.id)) {
      throw new Error(`Plugin already registered: "${config.id}"`);
    }

    this.plugins.set(config.id, {
      config: { ...config },
      process: null,
      connected: false,
    });
  }

  /**
   * Connect to a plugin's MCP server by spawning its command as a child process.
   * Throws if the plugin is not registered or already connected.
   */
  async connectPlugin(pluginId: string): Promise<void> {
    const entry = this.getEntryOrThrow(pluginId);

    if (entry.connected && entry.process) {
      throw new Error(`Plugin "${pluginId}" is already connected`);
    }

    const { config } = entry;

    const child = spawn(config.command, [...(config.args ?? [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(config.env ?? {}) },
    });

    // Wait for the process to either start or fail immediately
    await new Promise<void>((resolve, reject) => {
      const onSpawnError = (err: Error) => {
        cleanup();
        reject(new Error(`Failed to start plugin "${pluginId}": ${err.message}`));
      };
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      function cleanup() {
        child.removeListener('error', onSpawnError);
        child.removeListener('spawn', onSpawn);
      }
      child.once('error', onSpawnError);
      child.once('spawn', onSpawn);
    });

    // Update entry — new object keeps config immutable
    this.plugins.set(pluginId, {
      config: entry.config,
      process: child,
      connected: true,
    });
  }

  /** Disconnect a plugin by terminating its child process. No-op if not connected. */
  async disconnectPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) return;

    if (entry.process) {
      await terminateProcess(entry.process);
    }

    this.plugins.set(pluginId, {
      config: entry.config,
      process: null,
      connected: false,
    });
  }

  /**
   * Send text to a plugin for execution via JSON-RPC over stdio.
   * Returns a PluginResult with success/failure and optional message or URL.
   */
  async executePlugin(
    pluginId: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<PluginResult> {
    const entry = this.plugins.get(pluginId);

    if (!entry) {
      return { success: false, error: `Plugin not registered: "${pluginId}"` };
    }

    if (!entry.connected || !entry.process) {
      return { success: false, error: `Plugin "${pluginId}" is not connected` };
    }

    try {
      const request = buildRequest('execute', { text, ...(metadata ?? {}) });
      const response = await sendRequest(entry.process, request);

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return {
        success: true,
        message: (response.result?.message as string) ?? undefined,
        url: (response.result?.url as string) ?? undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown execution error';
      return { success: false, error: message };
    }
  }

  /** Get the connection status of every registered plugin. */
  getStatuses(): readonly PluginStatus[] {
    return Array.from(this.plugins.values()).map((entry) => ({
      id: entry.config.id,
      name: entry.config.name,
      connected: entry.connected,
      ...(entry.error ? { error: entry.error } : {}),
    }));
  }

  /** Disconnect all plugins. Safe to call multiple times. */
  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.plugins.keys());
    await Promise.all(ids.map((id) => this.disconnectPlugin(id)));
  }

  // --- Private helpers ---

  private getEntryOrThrow(pluginId: string): PluginEntry {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin not registered: "${pluginId}"`);
    }
    return entry;
  }

  private validateConfig(config: PluginConfig): void {
    if (!config.id) {
      throw new Error('Plugin config must have an id');
    }
    if (!config.name) {
      throw new Error('Plugin config must have a name');
    }
    if (!config.command) {
      throw new Error('Plugin config must have a command');
    }
  }
}
