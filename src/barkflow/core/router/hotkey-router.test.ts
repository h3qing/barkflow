import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotkeyRouter } from './hotkey-router';
import type { RouteDefinition } from './types';

describe('HotkeyRouter', () => {
  let router: HotkeyRouter;

  beforeEach(() => {
    router = new HotkeyRouter();
  });

  describe('default routes', () => {
    it('has Fn mapped to paste-at-cursor', () => {
      const route = router.resolve('Fn');
      expect(route).not.toBeNull();
      expect(route!.destination).toBe('paste-at-cursor');
    });

    it('has Fn+T mapped to todo', () => {
      const route = router.resolve('Fn+T');
      expect(route).not.toBeNull();
      expect(route!.destination).toBe('todo');
    });

    it('has Fn+N mapped to save-as-markdown', () => {
      const route = router.resolve('Fn+N');
      expect(route).not.toBeNull();
      expect(route!.destination).toBe('save-as-markdown');
    });

    it('has Fn+P mapped to project', () => {
      const route = router.resolve('Fn+P');
      expect(route).not.toBeNull();
      expect(route!.destination).toBe('project');
    });
  });

  describe('registerRoute', () => {
    it('adds a new route', () => {
      const definition: RouteDefinition = {
        hotkey: 'Fn+S',
        destination: 'custom-plugin',
        label: 'Slack',
        enabled: true,
      };

      router.registerRoute(definition);

      const route = router.resolve('Fn+S');
      expect(route).not.toBeNull();
      expect(route!.destination).toBe('custom-plugin');
      expect(route!.label).toBe('Slack');
    });

    it('throws on duplicate hotkey', () => {
      expect(() => {
        router.registerRoute({
          hotkey: 'Fn',
          destination: 'copy-to-clipboard',
          label: 'Duplicate',
          enabled: true,
        });
      }).toThrow('Route already registered for hotkey "Fn"');
    });

    it('throws on missing hotkey', () => {
      expect(() => {
        router.registerRoute({
          hotkey: '',
          destination: 'paste-at-cursor',
          label: 'Bad',
          enabled: true,
        });
      }).toThrow('Route definition must have a hotkey');
    });

    it('throws on missing destination', () => {
      expect(() => {
        router.registerRoute({
          hotkey: 'Fn+X',
          destination: '',
          label: 'Bad',
          enabled: true,
        });
      }).toThrow('Route definition must have a destination');
    });

    it('throws on missing label', () => {
      expect(() => {
        router.registerRoute({
          hotkey: 'Fn+X',
          destination: 'paste-at-cursor',
          label: '',
          enabled: true,
        });
      }).toThrow('Route definition must have a label');
    });

    it('does not mutate the original routes array', () => {
      const routesBefore = router.getRoutes();
      const countBefore = routesBefore.length;

      router.registerRoute({
        hotkey: 'Fn+S',
        destination: 'custom-plugin',
        label: 'Slack',
        enabled: true,
      });

      // Original reference should be unchanged
      expect(routesBefore.length).toBe(countBefore);
      // New call returns updated list
      expect(router.getRoutes().length).toBe(countBefore + 1);
    });
  });

  describe('removeRoute', () => {
    it('removes an existing route', () => {
      expect(router.resolve('Fn+T')).not.toBeNull();

      router.removeRoute('Fn+T');

      expect(router.resolve('Fn+T')).toBeNull();
    });

    it('is a no-op for non-existent hotkey', () => {
      const countBefore = router.getRoutes().length;

      router.removeRoute('Fn+Z');

      expect(router.getRoutes().length).toBe(countBefore);
    });
  });

  describe('getRoutes', () => {
    it('returns all registered routes', () => {
      const routes = router.getRoutes();
      expect(routes.length).toBe(4);
    });

    it('returns a readonly snapshot', () => {
      const routes = router.getRoutes();
      // TypeScript enforces readonly, but verify identity changes after mutation
      router.registerRoute({
        hotkey: 'Fn+X',
        destination: 'paste-at-cursor',
        label: 'Extra',
        enabled: true,
      });
      expect(routes.length).toBe(4); // Original snapshot unchanged
    });
  });

  describe('resolve', () => {
    it('returns null for unknown hotkey', () => {
      expect(router.resolve('Fn+Z')).toBeNull();
    });

    it('returns the matching route definition', () => {
      const route = router.resolve('Fn');
      expect(route).toEqual({
        hotkey: 'Fn',
        destination: 'paste-at-cursor',
        label: 'Paste at cursor',
        enabled: true,
      });
    });
  });

  describe('dispatch', () => {
    it('dispatches to paste-at-cursor handler', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      router.registerHandler('paste-at-cursor', handler);

      const result = await router.dispatch('Fn', 'Hello world');

      expect(result.success).toBe(true);
      expect(result.destination).toBe('paste-at-cursor');
      expect(result.error).toBeUndefined();
      expect(handler).toHaveBeenCalledWith('Hello world');
    });

    it('dispatches to save-as-markdown handler', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      router.registerHandler('save-as-markdown', handler);

      const result = await router.dispatch('Fn+N', 'Note content');

      expect(result.success).toBe(true);
      expect(result.destination).toBe('save-as-markdown');
      expect(handler).toHaveBeenCalledWith('Note content');
    });

    it('falls back to paste-at-cursor for unknown hotkey', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      router.registerHandler('paste-at-cursor', handler);

      const result = await router.dispatch('Fn+Z', 'Fallback text');

      expect(result.success).toBe(true);
      expect(result.destination).toBe('paste-at-cursor');
      expect(handler).toHaveBeenCalledWith('Fallback text');
    });

    it('returns error for empty text', async () => {
      const result = await router.dispatch('Fn', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty text');
    });

    it('returns error when no handler is registered', async () => {
      const result = await router.dispatch('Fn', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler registered');
    });

    it('returns error when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Write failed'));
      router.registerHandler('paste-at-cursor', handler);

      const result = await router.dispatch('Fn', 'Hello');

      expect(result.success).toBe(false);
      expect(result.destination).toBe('paste-at-cursor');
      expect(result.error).toBe('Write failed');
    });

    it('falls back to paste-at-cursor for disabled route', async () => {
      router.removeRoute('Fn+T');
      router.registerRoute({
        hotkey: 'Fn+T',
        destination: 'copy-to-clipboard',
        label: 'Todo',
        enabled: false,
      });

      const pasteHandler = vi.fn().mockResolvedValue(true);
      router.registerHandler('paste-at-cursor', pasteHandler);

      const result = await router.dispatch('Fn+T', 'Disabled route text');

      expect(result.success).toBe(true);
      expect(result.destination).toBe('paste-at-cursor');
      expect(pasteHandler).toHaveBeenCalledWith('Disabled route text');
    });

    it('returns a new RouteResult object each time', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      router.registerHandler('paste-at-cursor', handler);

      const result1 = await router.dispatch('Fn', 'First');
      const result2 = await router.dispatch('Fn', 'Second');

      expect(result1).not.toBe(result2);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('custom initial routes', () => {
    it('accepts custom routes via constructor', () => {
      const custom: RouteDefinition[] = [
        { hotkey: 'Ctrl+1', destination: 'paste-at-cursor', label: 'Quick paste', enabled: true },
      ];
      const customRouter = new HotkeyRouter(custom);

      expect(customRouter.getRoutes().length).toBe(1);
      expect(customRouter.resolve('Fn')).toBeNull();
      expect(customRouter.resolve('Ctrl+1')).not.toBeNull();
    });
  });
});
