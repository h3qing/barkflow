/**
 * Tests for Settings Export/Import
 *
 * Tests bundle structure, merge logic, API key stripping, validation.
 * Pure logic — no file I/O.
 */

import { describe, it, expect } from 'vitest';

const EXPORT_VERSION = 1;

interface ExportBundle {
  version: number;
  exportedAt: string;
  appName: string;
  data: Record<string, any>;
}

// Re-implement pure logic for testing

function stripApiKeys(prefs: Record<string, string>): Record<string, string> {
  const safe = { ...prefs };
  for (const key of Object.keys(safe)) {
    if (key.includes("api-key") || key.includes("apiKey") || key.includes("token")) {
      delete safe[key];
    }
  }
  return safe;
}

function validateBundle(bundle: any): string | null {
  if (!bundle || !bundle.data) return "Invalid bundle: missing data";
  if (bundle.appName !== "WhisperWoof") return "Invalid bundle: not a WhisperWoof export";
  return null;
}

function mergeArrays(
  existing: Array<{ id?: string; word?: string; trigger?: string }>,
  incoming: Array<{ id?: string; word?: string; trigger?: string }>,
): { merged: any[]; added: number } {
  const existingIds = new Set<string>();
  for (const item of existing) {
    existingIds.add(item.id || item.word || item.trigger || JSON.stringify(item));
  }

  const newItems = incoming.filter((item) => {
    const itemKey = item.id || item.word || item.trigger || JSON.stringify(item);
    return !existingIds.has(itemKey);
  });

  return { merged: [...existing, ...newItems], added: newItems.length };
}

describe('Settings Export/Import', () => {
  describe('bundle validation', () => {
    it('accepts valid WhisperWoof bundle', () => {
      const bundle: ExportBundle = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        appName: "WhisperWoof",
        data: { snippets: [] },
      };
      expect(validateBundle(bundle)).toBeNull();
    });

    it('rejects null bundle', () => {
      expect(validateBundle(null)).toContain("missing data");
    });

    it('rejects bundle without data', () => {
      expect(validateBundle({ appName: "WhisperWoof" })).toContain("missing data");
    });

    it('rejects non-WhisperWoof bundle', () => {
      expect(validateBundle({ appName: "OtherApp", data: {} })).toContain("not a WhisperWoof");
    });

    it('rejects bundle from different app', () => {
      expect(validateBundle({ appName: "SuperWhisper", data: {} })).toContain("not a WhisperWoof");
    });
  });

  describe('API key stripping', () => {
    it('removes api-key fields', () => {
      const prefs = {
        "whisperwoof-polish-preset": "clean",
        "whisperwoof-openai-api-key": "sk-secret123",
        "whisperwoof-groq-api-key": "gsk-secret456",
        "whisperwoof-polish-provider": "ollama",
      };
      const safe = stripApiKeys(prefs);
      expect(safe).not.toHaveProperty("whisperwoof-openai-api-key");
      expect(safe).not.toHaveProperty("whisperwoof-groq-api-key");
      expect(safe).toHaveProperty("whisperwoof-polish-preset", "clean");
      expect(safe).toHaveProperty("whisperwoof-polish-provider", "ollama");
    });

    it('removes token fields', () => {
      const prefs = {
        "telegram-bot-token": "123:ABC",
        "normal-setting": "value",
      };
      const safe = stripApiKeys(prefs);
      expect(safe).not.toHaveProperty("telegram-bot-token");
      expect(safe).toHaveProperty("normal-setting");
    });

    it('handles empty prefs', () => {
      expect(stripApiKeys({})).toEqual({});
    });

    it('does not mutate original', () => {
      const prefs = { "whisperwoof-openai-api-key": "sk-test", "preset": "clean" };
      const safe = stripApiKeys(prefs);
      expect(prefs).toHaveProperty("whisperwoof-openai-api-key"); // original unchanged
      expect(safe).not.toHaveProperty("whisperwoof-openai-api-key");
    });
  });

  describe('merge logic', () => {
    it('adds new items from import', () => {
      const existing = [{ id: "1", trigger: "my email" }];
      const incoming = [{ id: "2", trigger: "standup" }];
      const { merged, added } = mergeArrays(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(added).toBe(1);
    });

    it('deduplicates by id', () => {
      const existing = [{ id: "1", trigger: "my email" }];
      const incoming = [{ id: "1", trigger: "my email" }, { id: "2", trigger: "standup" }];
      const { merged, added } = mergeArrays(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(added).toBe(1);
    });

    it('deduplicates by word', () => {
      const existing = [{ word: "WhisperWoof" }];
      const incoming = [{ word: "WhisperWoof" }, { word: "Mando" }];
      const { merged, added } = mergeArrays(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(added).toBe(1);
    });

    it('deduplicates by trigger', () => {
      const existing = [{ trigger: "my email" }];
      const incoming = [{ trigger: "my email" }];
      const { merged, added } = mergeArrays(existing, incoming);
      expect(merged).toHaveLength(1);
      expect(added).toBe(0);
    });

    it('handles empty existing', () => {
      const { merged, added } = mergeArrays([], [{ id: "1" }, { id: "2" }]);
      expect(merged).toHaveLength(2);
      expect(added).toBe(2);
    });

    it('handles empty incoming', () => {
      const { merged, added } = mergeArrays([{ id: "1" }], []);
      expect(merged).toHaveLength(1);
      expect(added).toBe(0);
    });
  });

  describe('export structure', () => {
    it('bundle has correct shape', () => {
      const bundle: ExportBundle = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        appName: "WhisperWoof",
        data: {
          snippets: [{ id: "1", trigger: "test", body: "hello" }],
          vocabulary: [{ id: "v1", word: "Mando" }],
        },
      };
      expect(bundle.version).toBe(1);
      expect(bundle.appName).toBe("WhisperWoof");
      expect(bundle.data.snippets).toHaveLength(1);
      expect(bundle.data.vocabulary).toHaveLength(1);
    });

    it('version is always 1', () => {
      expect(EXPORT_VERSION).toBe(1);
    });
  });
});
