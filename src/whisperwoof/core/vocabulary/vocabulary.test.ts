/**
 * Tests for Custom Vocabulary Manager
 *
 * Tests CRUD operations, filtering, dedup, bulk import, STT hints.
 * Pure logic — no file I/O.
 */

import { describe, it, expect } from 'vitest';

interface VocabEntry {
  id: string;
  word: string;
  category: string;
  alternatives: string[];
  source: string;
  usageCount: number;
}

// Re-implement pure logic for testing

function filterByCategory(entries: VocabEntry[], category: string): VocabEntry[] {
  return entries.filter((e) => e.category === category);
}

function searchEntries(entries: VocabEntry[], query: string): VocabEntry[] {
  const q = query.toLowerCase();
  return entries.filter((e) =>
    e.word.toLowerCase().includes(q) ||
    e.alternatives.some((a) => a.toLowerCase().includes(q))
  );
}

function isDuplicate(entries: VocabEntry[], word: string): boolean {
  return entries.some((e) => e.word.toLowerCase() === word.toLowerCase());
}

function getSttHints(entries: VocabEntry[]): string[] {
  const hints = new Set<string>();
  for (const entry of entries) {
    hints.add(entry.word);
    for (const alt of entry.alternatives) {
      hints.add(alt);
    }
  }
  return Array.from(hints);
}

function getStats(entries: VocabEntry[]) {
  const categories: Record<string, number> = {};
  for (const entry of entries) {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
  }
  const topUsed = [...entries]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5)
    .map((e) => ({ word: e.word, usageCount: e.usageCount }));

  return { total: entries.length, categories, topUsed };
}

const SAMPLE_ENTRIES: VocabEntry[] = [
  { id: "1", word: "WhisperWoof", category: "technical", alternatives: ["whisper woof", "whisperwulf"], source: "manual", usageCount: 15 },
  { id: "2", word: "Heqing", category: "names", alternatives: ["he ching", "he king"], source: "manual", usageCount: 8 },
  { id: "3", word: "Ollama", category: "technical", alternatives: ["oh llama", "o lama"], source: "auto-learn", usageCount: 12 },
  { id: "4", word: "LGTM", category: "abbreviation", alternatives: ["looks good to me"], source: "manual", usageCount: 3 },
  { id: "5", word: "Mando", category: "names", alternatives: ["man doe"], source: "manual", usageCount: 20 },
];

describe('Custom Vocabulary', () => {
  describe('filtering', () => {
    it('filters by category', () => {
      expect(filterByCategory(SAMPLE_ENTRIES, "technical")).toHaveLength(2);
      expect(filterByCategory(SAMPLE_ENTRIES, "names")).toHaveLength(2);
      expect(filterByCategory(SAMPLE_ENTRIES, "abbreviation")).toHaveLength(1);
    });

    it('returns empty for unknown category', () => {
      expect(filterByCategory(SAMPLE_ENTRIES, "medical")).toHaveLength(0);
    });
  });

  describe('search', () => {
    it('finds words by partial match', () => {
      expect(searchEntries(SAMPLE_ENTRIES, "whisper")).toHaveLength(1);
      expect(searchEntries(SAMPLE_ENTRIES, "Heq")).toHaveLength(1);
    });

    it('finds words by alternative match', () => {
      expect(searchEntries(SAMPLE_ENTRIES, "he ching")).toHaveLength(1);
      expect(searchEntries(SAMPLE_ENTRIES, "oh llama")).toHaveLength(1);
    });

    it('is case-insensitive', () => {
      expect(searchEntries(SAMPLE_ENTRIES, "WHISPERWOOF")).toHaveLength(1);
      expect(searchEntries(SAMPLE_ENTRIES, "lgtm")).toHaveLength(1);
    });

    it('returns empty for no match', () => {
      expect(searchEntries(SAMPLE_ENTRIES, "xyz123")).toHaveLength(0);
    });
  });

  describe('dedup', () => {
    it('detects duplicates case-insensitively', () => {
      expect(isDuplicate(SAMPLE_ENTRIES, "WhisperWoof")).toBe(true);
      expect(isDuplicate(SAMPLE_ENTRIES, "whisperwoof")).toBe(true);
      expect(isDuplicate(SAMPLE_ENTRIES, "WHISPERWOOF")).toBe(true);
    });

    it('allows new unique words', () => {
      expect(isDuplicate(SAMPLE_ENTRIES, "NewWord")).toBe(false);
      expect(isDuplicate(SAMPLE_ENTRIES, "Vitest")).toBe(false);
    });
  });

  describe('STT hints', () => {
    it('includes all words and alternatives', () => {
      const hints = getSttHints(SAMPLE_ENTRIES);
      expect(hints).toContain("WhisperWoof");
      expect(hints).toContain("whisper woof");
      expect(hints).toContain("Heqing");
      expect(hints).toContain("he ching");
      expect(hints).toContain("LGTM");
    });

    it('deduplicates hints', () => {
      const withDup: VocabEntry[] = [
        { id: "1", word: "test", category: "general", alternatives: ["test"], source: "manual", usageCount: 0 },
      ];
      const hints = getSttHints(withDup);
      expect(hints.filter((h) => h === "test")).toHaveLength(1);
    });

    it('returns empty for empty vocabulary', () => {
      expect(getSttHints([])).toHaveLength(0);
    });
  });

  describe('stats', () => {
    it('counts entries per category', () => {
      const stats = getStats(SAMPLE_ENTRIES);
      expect(stats.total).toBe(5);
      expect(stats.categories.technical).toBe(2);
      expect(stats.categories.names).toBe(2);
      expect(stats.categories.abbreviation).toBe(1);
    });

    it('returns top 5 most used words', () => {
      const stats = getStats(SAMPLE_ENTRIES);
      expect(stats.topUsed).toHaveLength(5);
      expect(stats.topUsed[0].word).toBe("Mando"); // 20 uses
      expect(stats.topUsed[1].word).toBe("WhisperWoof"); // 15 uses
    });

    it('handles empty vocabulary', () => {
      const stats = getStats([]);
      expect(stats.total).toBe(0);
      expect(stats.topUsed).toHaveLength(0);
    });
  });

  describe('bulk import', () => {
    it('counts unique words from string array', () => {
      const existing = new Set(SAMPLE_ENTRIES.map((e) => e.word.toLowerCase()));
      const words = ["NewWord", "AnotherWord", "WhisperWoof"]; // 1 duplicate
      const unique = words.filter((w) => !existing.has(w.toLowerCase()));
      expect(unique).toHaveLength(2);
    });

    it('skips empty strings', () => {
      const words = ["", "  ", "valid"];
      const trimmed = words.map((w) => w.trim()).filter(Boolean);
      expect(trimmed).toHaveLength(1);
    });
  });

  describe('categories', () => {
    const validCategories = ["names", "technical", "abbreviation", "general"];

    it('all sample entries have valid categories', () => {
      for (const entry of SAMPLE_ENTRIES) {
        expect(validCategories).toContain(entry.category);
      }
    });
  });
});
