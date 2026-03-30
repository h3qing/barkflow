/**
 * Tests for Voice Snippets — trigger phrase expansion
 *
 * Tests the matching logic (exact, prefix, fuzzy).
 * File I/O is not tested — these verify pure matching functions.
 */

import { describe, it, expect } from 'vitest';

interface Snippet {
  id: string;
  trigger: string;
  body: string;
  usageCount: number;
}

// Re-implement matching logic for testing (no fs/electron deps)

function simpleEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 2) return Math.abs(a.length - b.length);

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function expandSnippet(
  transcribedText: string | null,
  snippets: Snippet[],
): { matched: boolean; trigger: string; body: string; matchType: string } | null {
  if (!transcribedText || transcribedText.trim().length < 2) return null;

  const input = transcribedText.trim().toLowerCase();

  // 1. Exact match
  const exact = snippets.find((s) => input === s.trigger.toLowerCase());
  if (exact) {
    return { matched: true, trigger: exact.trigger, body: exact.body, matchType: "exact" };
  }

  // 2. Prefix match
  const prefixMatch = snippets
    .filter((s) => input.startsWith(s.trigger.toLowerCase()))
    .sort((a, b) => b.trigger.length - a.trigger.length)[0];

  if (prefixMatch) {
    return { matched: true, trigger: prefixMatch.trigger, body: prefixMatch.body, matchType: "prefix" };
  }

  // 3. Fuzzy match (1 char off, triggers >= 5 chars)
  for (const snippet of snippets) {
    if (snippet.trigger.length < 5) continue;
    const distance = simpleEditDistance(input, snippet.trigger.toLowerCase());
    if (distance <= 1) {
      return { matched: true, trigger: snippet.trigger, body: snippet.body, matchType: "fuzzy" };
    }
  }

  return null;
}

const TEST_SNIPPETS: Snippet[] = [
  { id: "1", trigger: "my email", body: "heqing@example.com", usageCount: 5 },
  { id: "2", trigger: "standup update", body: "Yesterday: ...\nToday: ...\nBlockers: None", usageCount: 3 },
  { id: "3", trigger: "email sign off", body: "Best regards,\nHeqing", usageCount: 2 },
  { id: "4", trigger: "my address", body: "123 Main St, SF, CA 94102", usageCount: 0 },
  { id: "5", trigger: "hi", body: "Hello!", usageCount: 0 },
];

describe('Voice Snippets', () => {
  describe('exact matching', () => {
    it('matches exact trigger (case-insensitive)', () => {
      const result = expandSnippet("my email", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.body).toBe("heqing@example.com");
      expect(result?.matchType).toBe("exact");
    });

    it('matches with different case', () => {
      const result = expandSnippet("My Email", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.body).toBe("heqing@example.com");
    });

    it('matches "standup update"', () => {
      const result = expandSnippet("standup update", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.trigger).toBe("standup update");
    });

    it('matches short triggers', () => {
      const result = expandSnippet("hi", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.body).toBe("Hello!");
    });
  });

  describe('prefix matching', () => {
    it('matches when input starts with trigger', () => {
      const result = expandSnippet("my email please", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.body).toBe("heqing@example.com");
      expect(result?.matchType).toBe("prefix");
    });

    it('picks longest trigger on overlap', () => {
      const snippets: Snippet[] = [
        { id: "a", trigger: "my", body: "short", usageCount: 0 },
        { id: "b", trigger: "my email", body: "full email", usageCount: 0 },
      ];
      const result = expandSnippet("my email now", snippets);
      expect(result?.body).toBe("full email");
    });
  });

  describe('fuzzy matching', () => {
    it('matches 1 char off for long triggers', () => {
      // "standup updatx" → 1 substitution from "standup update"
      const result = expandSnippet("standup updatx", TEST_SNIPPETS);
      expect(result?.matched).toBe(true);
      expect(result?.trigger).toBe("standup update");
      expect(result?.matchType).toBe("fuzzy");
    });

    it('does NOT fuzzy match short triggers (< 5 chars)', () => {
      // "hj" is 1 char off from "hi" but hi is too short for fuzzy
      const result = expandSnippet("hj", TEST_SNIPPETS);
      expect(result).toBeNull();
    });

    it('does NOT match 2+ chars off', () => {
      const result = expandSnippet("standup updxyz", TEST_SNIPPETS);
      expect(result).toBeNull();
    });
  });

  describe('no match', () => {
    it('returns null for unknown text', () => {
      expect(expandSnippet("buy groceries", TEST_SNIPPETS)).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(expandSnippet("", TEST_SNIPPETS)).toBeNull();
      expect(expandSnippet(null, TEST_SNIPPETS)).toBeNull();
    });

    it('returns null for single char', () => {
      expect(expandSnippet("x", TEST_SNIPPETS)).toBeNull();
    });

    it('returns null for empty snippet list', () => {
      expect(expandSnippet("my email", [])).toBeNull();
    });
  });

  describe('simpleEditDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(simpleEditDistance("hello", "hello")).toBe(0);
    });

    it('handles single substitution', () => {
      expect(simpleEditDistance("cat", "car")).toBe(1);
    });

    it('handles insertion', () => {
      expect(simpleEditDistance("cat", "cats")).toBe(1);
    });

    it('handles deletion', () => {
      expect(simpleEditDistance("cats", "cat")).toBe(1);
    });

    it('handles empty strings', () => {
      expect(simpleEditDistance("", "hello")).toBe(5);
      expect(simpleEditDistance("hello", "")).toBe(5);
    });

    it('short-circuits on large length difference', () => {
      expect(simpleEditDistance("hi", "hello world")).toBe(9);
    });
  });
});
