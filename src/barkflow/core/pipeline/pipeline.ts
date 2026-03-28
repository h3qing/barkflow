/**
 * Pipeline — Orchestrates the BarkFlow voice pipeline
 *
 * Flow: Raw STT text → LLM Polish (optional) → Route to destination → Store in history
 *
 * Design:
 * - Each stage can fail independently; failures don't block the pipeline
 * - Polish failure → use raw text
 * - Route failure → fallback to paste-at-cursor
 * - Store failure → log error but don't block user
 */

import type { StorageProvider } from '../storage/storage-provider';
import type { Entry } from '../storage/types';
import type {
  PipelineInput,
  PipelineResult,
  PipelineConfig,
} from './types';
import { DEFAULT_PIPELINE_CONFIG } from './types';

export interface PolishService {
  polish(rawText: string): Promise<{ polishedText: string; applied: boolean }>;
}

export interface RouteService {
  dispatch(hotkey: string | null, text: string): Promise<{ destination: string; success: boolean; error?: string }>;
}

export class Pipeline {
  constructor(
    private readonly storage: StorageProvider,
    private readonly polisher: PolishService | null,
    private readonly router: RouteService,
    private readonly config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
  ) {}

  async process(input: PipelineInput): Promise<PipelineResult> {
    // Step 1: Polish (if enabled and raw text is non-empty)
    const { polishedText, polished } = await this.tryPolish(input.rawText);

    // Step 2: Route to destination
    const { destination, routed, routeError } = await this.tryRoute(
      input.hotkeyUsed,
      polishedText,
    );

    // Step 3: Store in history
    const entry = await this.tryStore(input, polishedText, destination);

    return Object.freeze({
      entry,
      polished,
      routed,
      routedTo: destination,
      error: routeError,
    });
  }

  private async tryPolish(
    rawText: string,
  ): Promise<{ polishedText: string; polished: boolean }> {
    if (!this.config.polishEnabled || !this.polisher) {
      return { polishedText: rawText, polished: false };
    }

    if (!rawText.trim()) {
      return { polishedText: rawText, polished: false };
    }

    try {
      const result = await this.polisher.polish(rawText);
      return { polishedText: result.polishedText, polished: result.applied };
    } catch {
      // Polish failure → use raw text. Never block the pipeline.
      return { polishedText: rawText, polished: false };
    }
  }

  private async tryRoute(
    hotkey: string | null,
    text: string,
  ): Promise<{ destination: string; routed: boolean; routeError: string | null }> {
    try {
      const result = await this.router.dispatch(hotkey, text);
      return {
        destination: result.destination,
        routed: result.success,
        routeError: result.success ? null : (result.error ?? 'Route failed'),
      };
    } catch {
      return {
        destination: this.config.defaultDestination,
        routed: false,
        routeError: 'Router error — falling back to paste',
      };
    }
  }

  private async tryStore(
    input: PipelineInput,
    polishedText: string,
    destination: string,
  ): Promise<Entry> {
    try {
      return await this.storage.saveEntry({
        source: input.source,
        rawText: input.rawText,
        polished: polishedText !== input.rawText ? polishedText : null,
        routedTo: destination,
        hotkeyUsed: input.hotkeyUsed,
        durationMs: input.durationMs,
        projectId: input.projectId,
        audioPath: input.audioPath,
        metadata: {},
        favorite: 0,
      });
    } catch (err) {
      // Storage failure should not crash the pipeline.
      // Return a synthetic entry so the caller still gets a result.
      console.error('[BarkFlow] Failed to store entry:', err);
      return Object.freeze({
        id: 'unsaved',
        createdAt: new Date().toISOString(),
        source: input.source,
        rawText: input.rawText,
        polished: polishedText !== input.rawText ? polishedText : null,
        routedTo: destination,
        hotkeyUsed: input.hotkeyUsed,
        durationMs: input.durationMs,
        projectId: input.projectId,
        audioPath: input.audioPath,
        metadata: {},
        favorite: 0,
      });
    }
  }
}
