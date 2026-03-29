import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from './plugin-manager';
import type { PluginConfig } from './types';

const TODOIST_PLUGIN: PluginConfig = {
  id: 'todoist',
  name: 'Todoist',
  description: 'Create tasks in Todoist',
  command: 'npx',
  args: ['todoist-mcp'],
  env: { TODOIST_API_KEY: 'test-key-123' },
  enabled: true,
  hotkeyBinding: 'Fn+T',
};

const SLACK_PLUGIN: PluginConfig = {
  id: 'slack',
  name: 'Slack',
  description: 'Post messages to Slack',
  command: 'npx',
  args: ['slack-mcp'],
  enabled: true,
};

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('registerPlugin', () => {
    it('registers a plugin config', () => {
      manager.registerPlugin(TODOIST_PLUGIN);

      const statuses = manager.getStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]?.id).toBe('todoist');
      expect(statuses[0]?.name).toBe('Todoist');
    });

    it('registers multiple plugins', () => {
      manager.registerPlugin(TODOIST_PLUGIN);
      manager.registerPlugin(SLACK_PLUGIN);

      const statuses = manager.getStatuses();
      expect(statuses).toHaveLength(2);
    });

    it('throws on duplicate id', () => {
      manager.registerPlugin(TODOIST_PLUGIN);

      expect(() => manager.registerPlugin(TODOIST_PLUGIN)).toThrow(
        'Plugin already registered: "todoist"',
      );
    });

    it('throws on missing id', () => {
      const bad = { ...TODOIST_PLUGIN, id: '' };

      expect(() => manager.registerPlugin(bad)).toThrow(
        'Plugin config must have an id',
      );
    });

    it('throws on missing name', () => {
      const bad = { ...TODOIST_PLUGIN, name: '' };

      expect(() => manager.registerPlugin(bad)).toThrow(
        'Plugin config must have a name',
      );
    });

    it('throws on missing command', () => {
      const bad = { ...TODOIST_PLUGIN, command: '' };

      expect(() => manager.registerPlugin(bad)).toThrow(
        'Plugin config must have a command',
      );
    });

    it('does not expose internal state through the config reference', () => {
      const mutableConfig = { ...TODOIST_PLUGIN };
      manager.registerPlugin(mutableConfig);

      // Mutating the original object should not affect registered plugin
      (mutableConfig as Record<string, unknown>).name = 'Hacked';

      const statuses = manager.getStatuses();
      expect(statuses[0]?.name).toBe('Todoist');
    });
  });

  describe('getStatuses', () => {
    it('returns empty array when no plugins registered', () => {
      expect(manager.getStatuses()).toEqual([]);
    });

    it('shows all plugins as not connected after registration', () => {
      manager.registerPlugin(TODOIST_PLUGIN);
      manager.registerPlugin(SLACK_PLUGIN);

      const statuses = manager.getStatuses();
      expect(statuses.every((s) => s.connected === false)).toBe(true);
    });

    it('returns a new array each call (no mutation leaks)', () => {
      manager.registerPlugin(TODOIST_PLUGIN);

      const a = manager.getStatuses();
      const b = manager.getStatuses();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('executePlugin', () => {
    it('returns error for unregistered plugin', async () => {
      const result = await manager.executePlugin('nonexistent', 'hello');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin not registered: "nonexistent"');
    });

    it('returns error for disconnected plugin', async () => {
      manager.registerPlugin(TODOIST_PLUGIN);

      const result = await manager.executePlugin('todoist', 'Buy milk');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin "todoist" is not connected');
    });
  });

  describe('connectPlugin', () => {
    it('throws for unregistered plugin', async () => {
      await expect(manager.connectPlugin('nonexistent')).rejects.toThrow(
        'Plugin not registered: "nonexistent"',
      );
    });
  });

  describe('disconnectPlugin', () => {
    it('is a no-op for unregistered plugin', async () => {
      await expect(manager.disconnectPlugin('nonexistent')).resolves.toBeUndefined();
    });

    it('is a no-op for registered but not connected plugin', async () => {
      manager.registerPlugin(TODOIST_PLUGIN);

      await expect(manager.disconnectPlugin('todoist')).resolves.toBeUndefined();

      const statuses = manager.getStatuses();
      expect(statuses[0]?.connected).toBe(false);
    });
  });

  describe('disconnectAll', () => {
    it('is idempotent with no plugins', async () => {
      await expect(manager.disconnectAll()).resolves.toBeUndefined();
      await expect(manager.disconnectAll()).resolves.toBeUndefined();
    });

    it('is idempotent with registered but not connected plugins', async () => {
      manager.registerPlugin(TODOIST_PLUGIN);
      manager.registerPlugin(SLACK_PLUGIN);

      await expect(manager.disconnectAll()).resolves.toBeUndefined();
      await expect(manager.disconnectAll()).resolves.toBeUndefined();

      const statuses = manager.getStatuses();
      expect(statuses.every((s) => s.connected === false)).toBe(true);
    });
  });
});
