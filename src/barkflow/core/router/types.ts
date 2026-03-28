/**
 * HotkeyRouter Types
 *
 * Defines route definitions and results for hotkey-based text routing.
 * Hotkey = intent: the key combo determines the destination, no LLM needed.
 */

/**
 * Known built-in destinations.
 * Phase 2 will add plugin IDs as string values.
 */
export type RouteDestination =
  | 'paste-at-cursor'
  | 'copy-to-clipboard'
  | 'save-as-markdown'
  | 'todo'
  | 'project';

export interface RouteDefinition {
  readonly hotkey: string;
  readonly destination: RouteDestination | string;
  readonly label: string;
  readonly enabled: boolean;
}

export interface RouteResult {
  readonly success: boolean;
  readonly destination: string;
  readonly error?: string;
}
