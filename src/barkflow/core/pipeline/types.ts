/**
 * Pipeline Types
 *
 * The pipeline orchestrates: STT output → Polish → Route → Store
 */

import type { Entry, EntrySource } from '../storage/types';

export interface PipelineInput {
  readonly rawText: string;
  readonly source: EntrySource;
  readonly hotkeyUsed: string | null;
  readonly durationMs: number | null;
  readonly audioPath: string | null;
  readonly projectId: string | null;
}

export interface PipelineResult {
  readonly entry: Entry;
  readonly polished: boolean;  // true if LLM polish was applied
  readonly routed: boolean;    // true if routed to a destination (not just stored)
  readonly routedTo: string | null;
  readonly error: string | null;
}

export interface PipelineConfig {
  readonly polishEnabled: boolean;
  readonly polishTimeoutMs: number;
  readonly defaultDestination: string; // 'paste-at-cursor'
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = Object.freeze({
  polishEnabled: true,
  polishTimeoutMs: 2000,
  defaultDestination: 'paste-at-cursor',
});
