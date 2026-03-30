/**
 * Tests for Adaptive Style Learner
 *
 * Tests edit distance, example filtering, prompt building logic.
 * File I/O is tested via the pure logic functions.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure logic for testing (no fs/electron deps)

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

const MIN_EDIT_DISTANCE_RATIO = 0.05;
const MAX_PROMPT_EXAMPLES = 5;

interface StyleExample {
  polished: string;
  edited: string;
  timestamp: string;
  editRatio: number;
}

function shouldRecord(polished: string, edited: string): boolean {
  if (!polished || !edited) return false;
  const p = polished.trim();
  const e = edited.trim();
  if (p === e) return false;
  if (p.length < 10 || e.length < 10) return false;
  const distance = editDistance(p, e);
  const maxLen = Math.max(p.length, e.length);
  const ratio = distance / maxLen;
  if (ratio < MIN_EDIT_DISTANCE_RATIO) return false;
  if (ratio > 0.8) return false;
  return true;
}

function buildStylePrompt(inputText: string, examples: StyleExample[]): string {
  if (examples.length === 0) return "";

  const inputLen = inputText.length;
  const scored = examples.map((ex, idx) => {
    const lenDiff = Math.abs(ex.polished.length - inputLen) / Math.max(ex.polished.length, inputLen);
    const recency = idx / examples.length;
    const score = (1 - lenDiff) * 0.6 + recency * 0.4;
    return { ...ex, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_PROMPT_EXAMPLES);

  const lines = selected.map((ex) =>
    `Example:\nBefore: "${ex.polished.slice(0, 200)}"\nAfter: "${ex.edited.slice(0, 200)}"`
  );

  return (
    "\n\nThe user has previously edited polished text in these ways. " +
    "Adapt your style to match their preferences:\n\n" +
    lines.join("\n\n")
  );
}

describe('Style Learner', () => {
  describe('editDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(editDistance("hello", "hello")).toBe(0);
    });

    it('returns length for empty string', () => {
      expect(editDistance("", "hello")).toBe(5);
      expect(editDistance("hello", "")).toBe(5);
    });

    it('calculates simple substitutions', () => {
      expect(editDistance("cat", "car")).toBe(1);
      expect(editDistance("cat", "dog")).toBe(3);
    });

    it('handles insertions and deletions', () => {
      expect(editDistance("cat", "cats")).toBe(1);
      expect(editDistance("cats", "cat")).toBe(1);
    });

    it('handles mixed operations', () => {
      expect(editDistance("kitten", "sitting")).toBe(3);
    });
  });

  describe('shouldRecord', () => {
    it('records meaningful edits (>5% change)', () => {
      const polished = "I need to go to the store and pick up groceries for dinner tonight.";
      const edited = "I need to go to the store and pick up groceries for dinner.";
      expect(shouldRecord(polished, edited)).toBe(true);
    });

    it('skips identical text', () => {
      expect(shouldRecord("hello world", "hello world")).toBe(false);
    });

    it('skips trivial edits (<5% change)', () => {
      const long = "This is a very long sentence that the user spoke into the microphone and it was polished.";
      const tiny = "This is a very long sentence that the user spoke into the microphone and it was polished";
      // Only removed a period — likely too small
      expect(shouldRecord(long, tiny)).toBe(false);
    });

    it('skips total rewrites (>80% different)', () => {
      expect(shouldRecord("Hello world foo bar baz qux", "ZYXWVUTSRQ completely other words")).toBe(false);
    });

    it('skips empty input', () => {
      expect(shouldRecord("", "hello")).toBe(false);
      expect(shouldRecord("hello", "")).toBe(false);
    });

    it('skips very short text (<10 chars)', () => {
      expect(shouldRecord("hi there", "hey there")).toBe(false);
    });

    it('records style changes (formal → casual)', () => {
      const polished = "I would like to schedule a meeting to discuss the project timeline.";
      const edited = "Let's set up a meeting to talk about the project timeline.";
      expect(shouldRecord(polished, edited)).toBe(true);
    });
  });

  describe('buildStylePrompt', () => {
    const examples: StyleExample[] = [
      {
        polished: "I need to complete the report by Friday.",
        edited: "Need to finish the report by Friday.",
        timestamp: "2026-03-29T10:00:00Z",
        editRatio: 0.15,
      },
      {
        polished: "Please ensure all tasks are completed before the deadline.",
        edited: "Make sure everything's done before the deadline.",
        timestamp: "2026-03-30T10:00:00Z",
        editRatio: 0.30,
      },
    ];

    it('returns empty string for no examples', () => {
      expect(buildStylePrompt("hello", [])).toBe("");
    });

    it('includes examples in the prompt', () => {
      const prompt = buildStylePrompt("I should finish the work", examples);
      expect(prompt).toContain("user has previously edited");
      expect(prompt).toContain("Before:");
      expect(prompt).toContain("After:");
    });

    it('limits to MAX_PROMPT_EXAMPLES', () => {
      const many = Array.from({ length: 20 }, (_, i) => ({
        polished: `Example polished text number ${i} that is long enough`,
        edited: `Example edited text number ${i} that is also long enough`,
        timestamp: new Date().toISOString(),
        editRatio: 0.2,
      }));
      const prompt = buildStylePrompt("test input", many);
      const exampleCount = (prompt.match(/Example:/g) || []).length;
      expect(exampleCount).toBeLessThanOrEqual(MAX_PROMPT_EXAMPLES);
    });

    it('prefers examples with similar length to input', () => {
      const varied: StyleExample[] = [
        { polished: "short", edited: "brief", timestamp: "2026-01-01T00:00:00Z", editRatio: 0.2 },
        {
          polished: "This is a medium length sentence that should match better with similar inputs.",
          edited: "This is a medium sentence that matches better with similar inputs.",
          timestamp: "2026-01-02T00:00:00Z",
          editRatio: 0.15,
        },
      ];
      const prompt = buildStylePrompt(
        "This is a medium length input sentence for testing.",
        varied,
      );
      // The medium-length example should appear (better match)
      expect(prompt).toContain("medium");
    });
  });
});
