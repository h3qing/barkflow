/**
 * WhisperWoof Storage Types
 *
 * All data access goes through the StorageProvider interface.
 * Phase 1: SqliteProvider (wraps OpenWhispr's Kysely + better-sqlite3)
 * Future: SupabaseProvider, WhisperWoofCloudProvider
 */

export type EntrySource = 'voice' | 'clipboard' | 'meeting' | 'import';

export interface Entry {
  readonly id: string;
  readonly createdAt: string; // ISO 8601
  readonly source: EntrySource;
  readonly rawText: string | null;
  readonly polished: string | null;
  readonly routedTo: string | null;
  readonly hotkeyUsed: string | null;
  readonly durationMs: number | null;
  readonly projectId: string | null;
  readonly audioPath: string | null;
  readonly metadata: Record<string, unknown>;
  readonly favorite: number; // 0 = not favorite, 1 = favorite
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string; // ISO 8601
  readonly integrationTarget: string | null; // Phase 2: MCP plugin ID
  readonly metadata: Record<string, unknown>;
}

export interface SearchFilters {
  readonly source?: EntrySource;
  readonly projectId?: string;
  readonly dateFrom?: string; // ISO 8601
  readonly dateTo?: string; // ISO 8601
  readonly limit?: number;
  readonly offset?: number;
}

export interface ImportResult {
  readonly imported: number;
  readonly failed: number;
  readonly errors: readonly string[];
}
