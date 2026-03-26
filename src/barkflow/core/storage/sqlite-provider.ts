/**
 * SqliteProvider — Phase 1 StorageProvider implementation
 *
 * Wraps OpenWhispr's existing better-sqlite3 database.
 * Adds BarkFlow-specific tables (entries, projects, audit_log)
 * alongside OpenWhispr's existing tables (transcriptions, notes, etc.).
 *
 * Uses better-sqlite3 directly (not Kysely) for BarkFlow tables
 * to keep the dependency surface small and avoid ORM overhead on
 * simple CRUD operations.
 */

import type {
  StorageProvider,
} from './storage-provider';
import type {
  Entry,
  EntrySource,
  Project,
  SearchFilters,
  ImportResult,
} from './types';

// Type for better-sqlite3 Database instance (avoid importing at module level
// since this runs in Electron main process where require('better-sqlite3') works)
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
};

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function rowToEntry(row: Record<string, unknown>): Entry {
  return Object.freeze({
    id: String(row['id']),
    createdAt: String(row['created_at']),
    source: String(row['source']) as EntrySource,
    rawText: row['raw_text'] as string | null,
    polished: row['polished'] as string | null,
    routedTo: row['routed_to'] as string | null,
    hotkeyUsed: row['hotkey_used'] as string | null,
    durationMs: row['duration_ms'] as number | null,
    projectId: row['project_id'] as string | null,
    audioPath: row['audio_path'] as string | null,
    metadata: row['metadata'] ? JSON.parse(String(row['metadata'])) as Record<string, unknown> : {},
  });
}

function rowToProject(row: Record<string, unknown>): Project {
  return Object.freeze({
    id: String(row['id']),
    name: String(row['name']),
    createdAt: String(row['created_at']),
    integrationTarget: row['integration_target'] as string | null,
    metadata: row['metadata'] ? JSON.parse(String(row['metadata'])) as Record<string, unknown> : {},
  });
}

export class SqliteProvider implements StorageProvider {
  private db: SqliteDatabase | null = null;

  constructor(private readonly getDatabase: () => SqliteDatabase) {}

  async initialize(): Promise<void> {
    this.db = this.getDatabase();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bf_entries (
        id          TEXT PRIMARY KEY,
        created_at  TEXT NOT NULL,
        source      TEXT NOT NULL CHECK (source IN ('voice', 'clipboard', 'meeting', 'import')),
        raw_text    TEXT,
        polished    TEXT,
        routed_to   TEXT,
        hotkey_used TEXT,
        duration_ms INTEGER,
        project_id  TEXT REFERENCES bf_projects(id) ON DELETE SET NULL,
        audio_path  TEXT,
        metadata    TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bf_projects (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        integration_target  TEXT,
        metadata            TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bf_audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
        action     TEXT NOT NULL,
        entity_id  TEXT,
        detail     TEXT
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bf_entries_created ON bf_entries(created_at)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bf_entries_source ON bf_entries(source)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bf_entries_project ON bf_entries(project_id)`);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bf_entries_fts USING fts5(
        raw_text, polished, content=bf_entries, content_rowid=rowid
      )
    `);

    // FTS triggers for automatic index updates
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bf_entries_fts_insert AFTER INSERT ON bf_entries BEGIN
        INSERT INTO bf_entries_fts(rowid, raw_text, polished)
        VALUES (new.rowid, new.raw_text, new.polished);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bf_entries_fts_update AFTER UPDATE ON bf_entries BEGIN
        INSERT INTO bf_entries_fts(bf_entries_fts, rowid, raw_text, polished)
        VALUES ('delete', old.rowid, old.raw_text, old.polished);
        INSERT INTO bf_entries_fts(rowid, raw_text, polished)
        VALUES (new.rowid, new.raw_text, new.polished);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bf_entries_fts_delete AFTER DELETE ON bf_entries BEGIN
        INSERT INTO bf_entries_fts(bf_entries_fts, rowid, raw_text, polished)
        VALUES ('delete', old.rowid, old.raw_text, old.polished);
      END
    `);
  }

  private requireDb(): SqliteDatabase {
    if (!this.db) {
      throw new Error('SqliteProvider not initialized. Call initialize() first.');
    }
    return this.db;
  }

  private audit(action: string, entityId: string | null, detail?: Record<string, unknown>): void {
    const db = this.requireDb();
    db.prepare(
      'INSERT INTO bf_audit_log (action, entity_id, detail) VALUES (?, ?, ?)'
    ).run(action, entityId, detail ? JSON.stringify(detail) : null);
  }

  // --- Entry CRUD ---

  async saveEntry(entry: Omit<Entry, 'id' | 'createdAt'>): Promise<Entry> {
    const db = this.requireDb();
    const id = generateId();
    const createdAt = nowISO();

    db.prepare(`
      INSERT INTO bf_entries (id, created_at, source, raw_text, polished, routed_to, hotkey_used, duration_ms, project_id, audio_path, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, createdAt, entry.source, entry.rawText, entry.polished,
      entry.routedTo, entry.hotkeyUsed, entry.durationMs,
      entry.projectId, entry.audioPath,
      Object.keys(entry.metadata).length > 0 ? JSON.stringify(entry.metadata) : null
    );

    this.audit('entry_created', id, { source: entry.source });

    return Object.freeze({
      id,
      createdAt,
      ...entry,
    });
  }

  async getEntry(id: string): Promise<Entry | null> {
    const db = this.requireDb();
    const row = db.prepare('SELECT * FROM bf_entries WHERE id = ?').get(id);
    return row ? rowToEntry(row) : null;
  }

  async updateEntry(
    id: string,
    updates: Partial<Omit<Entry, 'id' | 'createdAt'>>
  ): Promise<Entry> {
    const db = this.requireDb();

    const existing = db.prepare('SELECT * FROM bf_entries WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`Entry not found: ${id}`);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      source: 'source',
      rawText: 'raw_text',
      polished: 'polished',
      routedTo: 'routed_to',
      hotkeyUsed: 'hotkey_used',
      durationMs: 'duration_ms',
      projectId: 'project_id',
      audioPath: 'audio_path',
      metadata: 'metadata',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${column} = ?`);
        const value = (updates as Record<string, unknown>)[key];
        values.push(key === 'metadata' && value ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length === 0) {
      return rowToEntry(existing);
    }

    values.push(id);
    db.prepare(`UPDATE bf_entries SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    this.audit('entry_updated', id, { fields: Object.keys(updates) });

    const updated = db.prepare('SELECT * FROM bf_entries WHERE id = ?').get(id);
    return rowToEntry(updated!);
  }

  async deleteEntry(id: string): Promise<void> {
    const db = this.requireDb();
    db.prepare('DELETE FROM bf_entries WHERE id = ?').run(id);
    this.audit('entry_deleted', id);
  }

  // --- Entry queries ---

  async search(query: string, filters?: SearchFilters): Promise<readonly Entry[]> {
    const db = this.requireDb();

    if (!query.trim()) {
      return this.getRecent(filters?.limit ?? 50, filters?.offset ?? 0);
    }

    let sql = `
      SELECT e.* FROM bf_entries e
      INNER JOIN bf_entries_fts fts ON e.rowid = fts.rowid
      WHERE bf_entries_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (filters?.source) {
      sql += ' AND e.source = ?';
      params.push(filters.source);
    }
    if (filters?.projectId) {
      sql += ' AND e.project_id = ?';
      params.push(filters.projectId);
    }
    if (filters?.dateFrom) {
      sql += ' AND e.created_at >= ?';
      params.push(filters.dateFrom);
    }
    if (filters?.dateTo) {
      sql += ' AND e.created_at <= ?';
      params.push(filters.dateTo);
    }

    sql += ' ORDER BY e.created_at DESC';
    sql += ` LIMIT ? OFFSET ?`;
    params.push(filters?.limit ?? 50, filters?.offset ?? 0);

    const rows = db.prepare(sql).all(...params);
    return Object.freeze(rows.map(rowToEntry));
  }

  async getRecent(limit: number, offset?: number): Promise<readonly Entry[]> {
    const db = this.requireDb();
    const rows = db.prepare(
      'SELECT * FROM bf_entries ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset ?? 0);
    return Object.freeze(rows.map(rowToEntry));
  }

  // --- Project CRUD ---

  async saveProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    const db = this.requireDb();
    const id = generateId();
    const createdAt = nowISO();

    db.prepare(`
      INSERT INTO bf_projects (id, name, created_at, integration_target, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id, project.name, createdAt, project.integrationTarget,
      Object.keys(project.metadata).length > 0 ? JSON.stringify(project.metadata) : null
    );

    this.audit('project_created', id, { name: project.name });

    return Object.freeze({ id, createdAt, ...project });
  }

  async getProject(id: string): Promise<Project | null> {
    const db = this.requireDb();
    const row = db.prepare('SELECT * FROM bf_projects WHERE id = ?').get(id);
    return row ? rowToProject(row) : null;
  }

  async getProjects(): Promise<readonly Project[]> {
    const db = this.requireDb();
    const rows = db.prepare('SELECT * FROM bf_projects ORDER BY created_at DESC').all();
    return Object.freeze(rows.map(rowToProject));
  }

  async updateProject(
    id: string,
    updates: Partial<Omit<Project, 'id' | 'createdAt'>>
  ): Promise<Project> {
    const db = this.requireDb();

    const existing = db.prepare('SELECT * FROM bf_projects WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`Project not found: ${id}`);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if ('name' in updates) { setClauses.push('name = ?'); values.push(updates.name); }
    if ('integrationTarget' in updates) { setClauses.push('integration_target = ?'); values.push(updates.integrationTarget); }
    if ('metadata' in updates) { setClauses.push('metadata = ?'); values.push(updates.metadata ? JSON.stringify(updates.metadata) : null); }

    if (setClauses.length === 0) {
      return rowToProject(existing);
    }

    values.push(id);
    db.prepare(`UPDATE bf_projects SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM bf_projects WHERE id = ?').get(id);
    return rowToProject(updated!);
  }

  async deleteProject(id: string): Promise<void> {
    const db = this.requireDb();
    db.prepare('DELETE FROM bf_projects WHERE id = ?').run(id);
    this.audit('project_deleted', id);
  }

  // --- Migration ---

  async *exportAll(): AsyncIterable<Entry> {
    const db = this.requireDb();
    const rows = db.prepare('SELECT * FROM bf_entries ORDER BY created_at ASC').all();
    for (const row of rows) {
      yield rowToEntry(row);
    }
  }

  async importAll(entries: AsyncIterable<Entry>): Promise<ImportResult> {
    const db = this.requireDb();
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO bf_entries (id, created_at, source, raw_text, polished, routed_to, hotkey_used, duration_ms, project_id, audio_path, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for await (const entry of entries) {
      try {
        insertStmt.run(
          entry.id, entry.createdAt, entry.source, entry.rawText, entry.polished,
          entry.routedTo, entry.hotkeyUsed, entry.durationMs, entry.projectId,
          entry.audioPath,
          Object.keys(entry.metadata).length > 0 ? JSON.stringify(entry.metadata) : null
        );
        imported++;
      } catch (err) {
        failed++;
        errors.push(`Entry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.audit('import_completed', null, { imported, failed });

    return Object.freeze({ imported, failed, errors: Object.freeze(errors) });
  }

  // --- Lifecycle ---

  async close(): Promise<void> {
    // Don't close the shared database — OpenWhispr manages its lifecycle.
    // Just clear our reference.
    this.db = null;
  }
}
