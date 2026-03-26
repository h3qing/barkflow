/**
 * BarkFlow Polish Service Types
 *
 * Types for the LLM polish pipeline that transforms raw transcripts
 * into cleaned, formatted text via Ollama.
 */

/** Configuration for a polish request. */
export interface PolishConfig {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly systemPrompt?: string;
}

/** Result of a polish operation. */
export interface PolishResult {
  readonly text: string;
  readonly wasPolished: boolean;
  readonly model: string | null;
  readonly elapsedMs: number;
  readonly error: string | null;
}

/** Status of the Ollama installation and runtime. */
export interface OllamaStatus {
  readonly installed: boolean;
  readonly running: boolean;
  readonly modelsAvailable: readonly string[];
}
