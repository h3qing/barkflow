/**
 * ClipboardMonitor Types
 *
 * Types for clipboard polling, dedup, and concealed-type detection.
 */

export interface ClipboardEntry {
  readonly text: string;
  readonly timestamp: string; // ISO 8601
  readonly concealed: boolean;
}

export interface ClipboardMonitorConfig {
  readonly pollIntervalMs: number;
  readonly onCapture: (entry: ClipboardEntry) => void;
}
