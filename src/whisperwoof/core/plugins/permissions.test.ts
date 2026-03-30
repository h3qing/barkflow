import { describe, it, expect } from 'vitest';
import {
  canAccessNetwork,
  canReceiveData,
  filterDataForPlugin,
  getDefaultPermissions,
  createGrant,
  MINIMAL_PERMISSIONS,
} from './permissions';

describe('Plugin Permissions', () => {
  const todoistGrant = createGrant('todoist', {
    network: ['api.todoist.com'],
    dataTypes: ['polishedText', 'metadata'],
    filesystem: 'none',
  });

  describe('canAccessNetwork', () => {
    it('allows exact domain match', () => {
      expect(canAccessNetwork(todoistGrant, 'api.todoist.com')).toBe(true);
    });

    it('allows subdomain match', () => {
      expect(canAccessNetwork(todoistGrant, 'v2.api.todoist.com')).toBe(true);
    });

    it('rejects different domain', () => {
      expect(canAccessNetwork(todoistGrant, 'evil.com')).toBe(false);
    });

    it('rejects partial match', () => {
      expect(canAccessNetwork(todoistGrant, 'notapi.todoist.com.evil.com')).toBe(false);
    });
  });

  describe('canReceiveData', () => {
    it('allows granted data type', () => {
      expect(canReceiveData(todoistGrant, 'polishedText')).toBe(true);
      expect(canReceiveData(todoistGrant, 'metadata')).toBe(true);
    });

    it('rejects non-granted data type', () => {
      expect(canReceiveData(todoistGrant, 'audio')).toBe(false);
      expect(canReceiveData(todoistGrant, 'rawTranscript')).toBe(false);
    });
  });

  describe('filterDataForPlugin', () => {
    it('only passes authorized data', () => {
      const data = {
        text: 'hello',
        rawTranscript: 'um hello like',
        polishedText: 'Hello.',
        metadata: { source: 'voice' },
        audio: new Uint8Array([1, 2, 3]),
      };

      const filtered = filterDataForPlugin(todoistGrant, data);

      expect(filtered.polishedText).toBe('Hello.');
      expect(filtered.metadata).toEqual({ source: 'voice' });
      expect(filtered.text).toBeUndefined();
      expect(filtered.rawTranscript).toBeUndefined();
      expect(filtered.audio).toBeUndefined();
    });

    it('returns empty object for minimal permissions', () => {
      const minGrant = createGrant('unknown', MINIMAL_PERMISSIONS);
      const data = { rawTranscript: 'test', metadata: { x: 1 } };
      const filtered = filterDataForPlugin(minGrant, data);
      expect(Object.keys(filtered)).toEqual([]);
    });
  });

  describe('getDefaultPermissions', () => {
    it('returns permissions for known plugins', () => {
      const perms = getDefaultPermissions('todoist');
      expect(perms).not.toBeNull();
      expect(perms?.network).toContain('api.todoist.com');
    });

    it('returns null for unknown plugins', () => {
      expect(getDefaultPermissions('unknown-plugin')).toBeNull();
    });
  });

  describe('createGrant', () => {
    it('creates frozen grant object', () => {
      const grant = createGrant('test', MINIMAL_PERMISSIONS);
      expect(grant.pluginId).toBe('test');
      expect(grant.grantedBy).toBe('user');
      expect(grant.grantedAt).toBeTruthy();
      expect(Object.isFrozen(grant)).toBe(true);
    });
  });
});
