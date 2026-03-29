/**
 * HotkeyRouter
 *
 * Maps hotkeys to destinations and dispatches text accordingly.
 * Immutable: routes stored as readonly array, dispatch returns new RouteResult.
 *
 * Default routes:
 *   Fn          -> paste-at-cursor
 *   Fn+T        -> todo (Phase 2: Todoist plugin)
 *   Fn+N        -> save-as-markdown
 *   Fn+P        -> project
 *
 * Unknown hotkey fallback: paste-at-cursor
 */

import type { RouteDefinition, RouteResult } from './types';

const DEFAULT_ROUTES: readonly RouteDefinition[] = [
  { hotkey: 'Fn', destination: 'paste-at-cursor', label: 'Paste at cursor', enabled: true },
  { hotkey: 'Fn+T', destination: 'todo', label: 'Todo', enabled: true },
  { hotkey: 'Fn+N', destination: 'save-as-markdown', label: 'Markdown note', enabled: true },
  { hotkey: 'Fn+P', destination: 'project', label: 'Project', enabled: true },
];

const FALLBACK_DESTINATION = 'paste-at-cursor';

/** Handler for a specific destination. Returns true on success. */
export type DestinationHandler = (text: string) => Promise<boolean>;

export class HotkeyRouter {
  private routes: readonly RouteDefinition[];
  private readonly handlers: Map<string, DestinationHandler>;

  constructor(initialRoutes?: readonly RouteDefinition[]) {
    this.routes = initialRoutes ?? [...DEFAULT_ROUTES];
    this.handlers = new Map();
  }

  /**
   * Register a route definition.
   * Throws if a route with the same hotkey already exists.
   */
  registerRoute(definition: RouteDefinition): void {
    this.validateRouteDefinition(definition);

    const existing = this.routes.find((r) => r.hotkey === definition.hotkey);
    if (existing) {
      throw new Error(
        `Route already registered for hotkey "${definition.hotkey}"`
      );
    }

    this.routes = [...this.routes, { ...definition }];
  }

  /** Remove a route by hotkey. No-op if the hotkey is not registered. */
  removeRoute(hotkey: string): void {
    this.routes = this.routes.filter((r) => r.hotkey !== hotkey);
  }

  /** Get all registered routes (immutable snapshot). */
  getRoutes(): readonly RouteDefinition[] {
    return this.routes;
  }

  /** Look up which destination a hotkey maps to. Returns null if not found. */
  resolve(hotkey: string): RouteDefinition | null {
    return this.routes.find((r) => r.hotkey === hotkey) ?? null;
  }

  /** Register a handler function for a destination. */
  registerHandler(destination: string, handler: DestinationHandler): void {
    this.handlers.set(destination, handler);
  }

  /**
   * Route text to the destination mapped to the given hotkey.
   * Falls back to paste-at-cursor for unknown hotkeys.
   */
  async dispatch(hotkey: string, text: string): Promise<RouteResult> {
    if (!text) {
      return this.createResult(false, FALLBACK_DESTINATION, 'Empty text');
    }

    const route = this.resolve(hotkey);
    const destination = route?.enabled
      ? route.destination
      : FALLBACK_DESTINATION;

    const handler = this.handlers.get(destination);
    if (!handler) {
      return this.createResult(
        false,
        destination,
        `No handler registered for destination "${destination}"`
      );
    }

    try {
      const success = await handler(text);
      return this.createResult(success, destination);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown dispatch error';
      return this.createResult(false, destination, message);
    }
  }

  private validateRouteDefinition(definition: RouteDefinition): void {
    if (!definition.hotkey) {
      throw new Error('Route definition must have a hotkey');
    }
    if (!definition.destination) {
      throw new Error('Route definition must have a destination');
    }
    if (!definition.label) {
      throw new Error('Route definition must have a label');
    }
  }

  private createResult(
    success: boolean,
    destination: string,
    error?: string
  ): RouteResult {
    if (error) {
      return { success, destination, error };
    }
    return { success, destination };
  }
}
