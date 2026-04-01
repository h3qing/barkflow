/**
 * MCP Plugin Permission Model
 *
 * Each plugin declares what it needs. Users approve at install time.
 * Enforced at runtime — plugins only receive data they're authorized for.
 *
 * Permissions:
 *   - network: list of domains the plugin can contact
 *   - dataTypes: what data the plugin receives (text, audio, metadata)
 *   - filesystem: directories the plugin can read/write (or "none")
 */

export interface PluginPermissions {
  readonly network: readonly string[];      // allowed domains (e.g., ["api.todoist.com"])
  readonly dataTypes: readonly DataType[];  // what data it receives
  readonly filesystem: 'none' | 'plugin-dir-only' | readonly string[];
}

export type DataType = 'text' | 'rawTranscript' | 'polishedText' | 'metadata' | 'audio';

export interface PermissionRequest {
  readonly pluginId: string;
  readonly pluginName: string;
  readonly requested: PluginPermissions;
}

export interface PermissionGrant {
  readonly pluginId: string;
  readonly granted: PluginPermissions;
  readonly grantedAt: string; // ISO 8601
  readonly grantedBy: 'user' | 'default';
}

// Default permissions for first-party plugins
const FIRST_PARTY_PERMISSIONS: Record<string, PluginPermissions> = {
  todoist: {
    network: ['api.todoist.com'],
    dataTypes: ['polishedText', 'metadata'],
    filesystem: 'none',
  },
  notion: {
    network: ['api.notion.com'],
    dataTypes: ['polishedText', 'metadata'],
    filesystem: 'none',
  },
  slack: {
    network: ['slack.com'],
    dataTypes: ['polishedText', 'metadata'],
    filesystem: 'none',
  },
  ticktick: {
    network: ['api.ticktick.com'],
    dataTypes: ['polishedText', 'metadata'],
    filesystem: 'none',
  },
};

/**
 * Check if a plugin has permission to contact a specific domain.
 */
export function canAccessNetwork(
  grant: PermissionGrant,
  domain: string,
): boolean {
  return grant.granted.network.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );
}

/**
 * Check if a plugin has permission to receive a specific data type.
 */
export function canReceiveData(
  grant: PermissionGrant,
  dataType: DataType,
): boolean {
  return grant.granted.dataTypes.includes(dataType);
}

/**
 * Filter data before sending to a plugin — only include authorized types.
 */
export function filterDataForPlugin(
  grant: PermissionGrant,
  data: { text?: string; rawTranscript?: string; polishedText?: string; metadata?: Record<string, unknown>; audio?: unknown },
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  if (data.text && canReceiveData(grant, 'text')) {
    filtered.text = data.text;
  }
  if (data.rawTranscript && canReceiveData(grant, 'rawTranscript')) {
    filtered.rawTranscript = data.rawTranscript;
  }
  if (data.polishedText && canReceiveData(grant, 'polishedText')) {
    filtered.polishedText = data.polishedText;
  }
  if (data.metadata && canReceiveData(grant, 'metadata')) {
    filtered.metadata = data.metadata;
  }
  // Audio is never sent unless explicitly granted
  if (data.audio && canReceiveData(grant, 'audio')) {
    filtered.audio = data.audio;
  }

  return filtered;
}

/**
 * Get default permissions for a first-party plugin.
 */
export function getDefaultPermissions(pluginId: string): PluginPermissions | null {
  return FIRST_PARTY_PERMISSIONS[pluginId] ?? null;
}

/**
 * Create a permission grant for a plugin.
 */
export function createGrant(
  pluginId: string,
  permissions: PluginPermissions,
  grantedBy: 'user' | 'default' = 'user',
): PermissionGrant {
  return Object.freeze({
    pluginId,
    granted: Object.freeze({ ...permissions }),
    grantedAt: new Date().toISOString(),
    grantedBy,
  });
}

/**
 * Minimal permission set — the safest default for unknown plugins.
 */
export const MINIMAL_PERMISSIONS: PluginPermissions = Object.freeze({
  network: [],
  dataTypes: ['polishedText'] as readonly DataType[],
  filesystem: 'none' as const,
});
