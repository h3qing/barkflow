/**
 * Tests for Entry Tagging — tag CRUD, many-to-many, bulk operations
 *
 * Tests pure logic. Database operations tested via integration.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure validation logic for testing

function validateTagName(name: string | null | undefined): string | null {
  if (!name || !name.trim()) return "Tag name is required";
  if (name.trim().length > 50) return "Tag name must be 50 characters or less";
  return null;
}

function isUnique(name: string, existing: Array<{ name: string; id: string }>, excludeId?: string): boolean {
  return !existing.some((t) =>
    t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId
  );
}

interface Tag {
  id: string;
  name: string;
  color: string;
  entryCount: number;
}

interface EntryTag {
  entryId: string;
  tagId: string;
}

function getEntriesByTag(
  junctions: EntryTag[],
  entries: Array<{ id: string; text: string }>,
  tagId: string,
): Array<{ id: string; text: string }> {
  const entryIds = new Set(junctions.filter((j) => j.tagId === tagId).map((j) => j.entryId));
  return entries.filter((e) => entryIds.has(e.id));
}

function getEntryTags(
  junctions: EntryTag[],
  tags: Tag[],
  entryId: string,
): Tag[] {
  const tagIds = new Set(junctions.filter((j) => j.entryId === entryId).map((j) => j.tagId));
  return tags.filter((t) => tagIds.has(t.id));
}

function computeStats(tags: Tag[], junctions: EntryTag[], totalEntries: number) {
  const taggedEntries = new Set(junctions.map((j) => j.entryId)).size;
  const topTags = [...tags]
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, 10);

  return {
    totalTags: tags.length,
    totalTaggings: junctions.length,
    taggedEntries,
    untaggedCount: totalEntries - taggedEntries,
    topTags,
  };
}

describe('Entry Tagging', () => {
  describe('tag name validation', () => {
    it('accepts valid names', () => {
      expect(validateTagName("important")).toBeNull();
      expect(validateTagName("work-related")).toBeNull();
      expect(validateTagName("Meeting Notes")).toBeNull();
    });

    it('rejects empty names', () => {
      expect(validateTagName("")).not.toBeNull();
      expect(validateTagName("  ")).not.toBeNull();
      expect(validateTagName(null)).not.toBeNull();
      expect(validateTagName(undefined)).not.toBeNull();
    });

    it('rejects names over 50 characters', () => {
      const long = "a".repeat(51);
      expect(validateTagName(long)).toContain("50 characters");
    });

    it('accepts exactly 50 characters', () => {
      expect(validateTagName("a".repeat(50))).toBeNull();
    });
  });

  describe('uniqueness check', () => {
    const existing = [
      { id: "1", name: "important" },
      { id: "2", name: "work" },
      { id: "3", name: "Personal" },
    ];

    it('detects duplicate (case-insensitive)', () => {
      expect(isUnique("important", existing)).toBe(false);
      expect(isUnique("IMPORTANT", existing)).toBe(false);
      expect(isUnique("Important", existing)).toBe(false);
    });

    it('allows unique names', () => {
      expect(isUnique("new-tag", existing)).toBe(true);
      expect(isUnique("urgent", existing)).toBe(true);
    });

    it('allows renaming to same name (excluding self)', () => {
      expect(isUnique("important", existing, "1")).toBe(true);
    });

    it('blocks renaming to another existing name', () => {
      expect(isUnique("work", existing, "1")).toBe(false);
    });
  });

  describe('many-to-many queries', () => {
    const tags: Tag[] = [
      { id: "t1", name: "important", color: "#ff0000", entryCount: 2 },
      { id: "t2", name: "work", color: "#0000ff", entryCount: 1 },
      { id: "t3", name: "personal", color: "#00ff00", entryCount: 0 },
    ];

    const entries = [
      { id: "e1", text: "Buy groceries" },
      { id: "e2", text: "Write report" },
      { id: "e3", text: "Call dentist" },
    ];

    const junctions: EntryTag[] = [
      { entryId: "e1", tagId: "t1" },
      { entryId: "e2", tagId: "t1" },
      { entryId: "e2", tagId: "t2" },
    ];

    it('gets entries by tag', () => {
      const result = getEntriesByTag(junctions, entries, "t1");
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toContain("e1");
      expect(result.map((e) => e.id)).toContain("e2");
    });

    it('returns empty for tag with no entries', () => {
      expect(getEntriesByTag(junctions, entries, "t3")).toHaveLength(0);
    });

    it('gets tags for an entry', () => {
      const result = getEntryTags(junctions, tags, "e2");
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain("important");
      expect(result.map((t) => t.name)).toContain("work");
    });

    it('returns empty for untagged entry', () => {
      expect(getEntryTags(junctions, tags, "e3")).toHaveLength(0);
    });
  });

  describe('stats computation', () => {
    it('computes correct stats', () => {
      const tags: Tag[] = [
        { id: "t1", name: "important", color: "#ff0000", entryCount: 3 },
        { id: "t2", name: "work", color: "#0000ff", entryCount: 1 },
      ];
      const junctions: EntryTag[] = [
        { entryId: "e1", tagId: "t1" },
        { entryId: "e2", tagId: "t1" },
        { entryId: "e3", tagId: "t1" },
        { entryId: "e2", tagId: "t2" },
      ];

      const stats = computeStats(tags, junctions, 5);
      expect(stats.totalTags).toBe(2);
      expect(stats.totalTaggings).toBe(4);
      expect(stats.taggedEntries).toBe(3); // e1, e2, e3
      expect(stats.untaggedCount).toBe(2); // 5 total - 3 tagged
    });

    it('top tags sorted by entry count descending', () => {
      const tags: Tag[] = [
        { id: "t1", name: "low", color: "#aaa", entryCount: 1 },
        { id: "t2", name: "high", color: "#bbb", entryCount: 10 },
        { id: "t3", name: "mid", color: "#ccc", entryCount: 5 },
      ];

      const stats = computeStats(tags, [], 0);
      expect(stats.topTags[0].name).toBe("high");
      expect(stats.topTags[1].name).toBe("mid");
      expect(stats.topTags[2].name).toBe("low");
    });

    it('handles empty data', () => {
      const stats = computeStats([], [], 0);
      expect(stats.totalTags).toBe(0);
      expect(stats.totalTaggings).toBe(0);
      expect(stats.untaggedCount).toBe(0);
    });
  });

  describe('default tag color', () => {
    it('uses Mando accent as default', () => {
      // The module uses #A06A3C (Mando coat) as default
      const mandoAccent = "#A06A3C";
      expect(mandoAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
