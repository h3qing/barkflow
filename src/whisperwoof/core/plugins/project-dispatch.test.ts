/**
 * Tests for Project → MCP Plugin Dispatch Integration
 *
 * Verifies the permission-filtered data flow from projects to plugins.
 */

import { describe, it, expect } from 'vitest';
import {
  createGrant,
  filterDataForPlugin,
  getDefaultPermissions,
  canReceiveData,
  MINIMAL_PERMISSIONS,
} from './permissions';
import type { PluginPermissions, PermissionGrant } from './permissions';

describe('Project → Plugin Dispatch', () => {
  describe('filterDataForPlugin', () => {
    it('should filter entry data based on plugin permissions', () => {
      const grant = createGrant('todoist', getDefaultPermissions('todoist')!);
      const entryData = {
        text: 'full text',
        rawTranscript: 'raw transcript',
        polishedText: 'polished version',
        metadata: { source: 'voice', projectId: 'p1' },
        audio: new ArrayBuffer(8),
      };

      const filtered = filterDataForPlugin(grant, entryData);

      // Todoist only gets polishedText + metadata
      expect(filtered).toHaveProperty('polishedText', 'polished version');
      expect(filtered).toHaveProperty('metadata');
      expect(filtered).not.toHaveProperty('text');
      expect(filtered).not.toHaveProperty('rawTranscript');
      expect(filtered).not.toHaveProperty('audio');
    });

    it('should allow only polishedText for minimal permissions', () => {
      const grant = createGrant('unknown-plugin', MINIMAL_PERMISSIONS);
      const entryData = {
        text: 'full text',
        rawTranscript: 'raw transcript',
        polishedText: 'polished version',
        metadata: { source: 'voice' },
      };

      const filtered = filterDataForPlugin(grant, entryData);

      expect(filtered).toHaveProperty('polishedText', 'polished version');
      expect(filtered).not.toHaveProperty('text');
      expect(filtered).not.toHaveProperty('rawTranscript');
      expect(filtered).not.toHaveProperty('metadata');
    });

    it('should return empty object when no data types match', () => {
      const noDataPerms: PluginPermissions = {
        network: [],
        dataTypes: [],
        filesystem: 'none',
      };
      const grant = createGrant('locked-plugin', noDataPerms);
      const entryData = {
        text: 'full text',
        polishedText: 'polished',
      };

      const filtered = filterDataForPlugin(grant, entryData);
      expect(Object.keys(filtered)).toHaveLength(0);
    });
  });

  describe('first-party plugin defaults', () => {
    it('Todoist gets polishedText and metadata', () => {
      const perms = getDefaultPermissions('todoist');
      expect(perms).not.toBeNull();
      expect(perms!.dataTypes).toContain('polishedText');
      expect(perms!.dataTypes).toContain('metadata');
      expect(perms!.network).toContain('api.todoist.com');
    });

    it('Notion gets polishedText and metadata', () => {
      const perms = getDefaultPermissions('notion');
      expect(perms).not.toBeNull();
      expect(perms!.dataTypes).toContain('polishedText');
      expect(perms!.dataTypes).toContain('metadata');
    });

    it('Slack gets polishedText and metadata', () => {
      const perms = getDefaultPermissions('slack');
      expect(perms).not.toBeNull();
      expect(perms!.dataTypes).toContain('polishedText');
      expect(perms!.network).toContain('slack.com');
    });

    it('unknown plugins get null (must use MINIMAL_PERMISSIONS)', () => {
      expect(getDefaultPermissions('unknown')).toBeNull();
    });
  });

  describe('dispatch data preparation', () => {
    it('should produce correct MCP callTool arguments for Todoist', () => {
      const grant = createGrant('todoist', getDefaultPermissions('todoist')!, 'default');
      const entryData = {
        polishedText: 'Buy groceries for dinner',
        metadata: { source: 'voice', projectId: 'p123' },
      };

      const filtered = filterDataForPlugin(grant, entryData);

      // This is what would go into callTool arguments
      expect(filtered.polishedText).toBe('Buy groceries for dinner');
      expect(filtered.metadata).toEqual({ source: 'voice', projectId: 'p123' });
      expect(grant.grantedBy).toBe('default');
    });

    it('should produce correct MCP callTool arguments for Notion', () => {
      const grant = createGrant('notion', getDefaultPermissions('notion')!, 'default');
      const entryData = {
        polishedText: 'Meeting notes from standup',
        rawTranscript: 'uh meeting notes from the standup',
        metadata: { source: 'meeting', duration: 1800 },
      };

      const filtered = filterDataForPlugin(grant, entryData);

      expect(filtered.polishedText).toBe('Meeting notes from standup');
      expect(filtered.metadata).toBeDefined();
      // rawTranscript is NOT in Notion's allowed dataTypes
      expect(filtered).not.toHaveProperty('rawTranscript');
    });
  });

  describe('grant immutability', () => {
    it('grant objects should be frozen', () => {
      const grant = createGrant('todoist', getDefaultPermissions('todoist')!);
      expect(Object.isFrozen(grant)).toBe(true);
      expect(Object.isFrozen(grant.granted)).toBe(true);
    });

    it('MINIMAL_PERMISSIONS should be frozen', () => {
      expect(Object.isFrozen(MINIMAL_PERMISSIONS)).toBe(true);
    });
  });
});
