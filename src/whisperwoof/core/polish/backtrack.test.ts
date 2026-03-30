/**
 * Tests for Backtrack Correction — mid-sentence self-correction detection
 *
 * Tests the regex-based detection of correction signals.
 * LLM-based correction is tested manually.
 */

import { describe, it, expect } from 'vitest';

// Correction signal patterns (matching the source)
const CORRECTION_SIGNALS = [
  /\b(no wait|no,?\s*wait|actually,?\s*(no|wait|change|make))/i,
  /\b(I mean|I meant|sorry,?\s*I meant?)/i,
  /\b(correction|let me correct that|let me rephrase)/i,
  /\b(scratch that|strike that|delete that|forget that|never mind)/i,
  /\b(not .{1,30},?\s*(but|rather|instead))/i,
  /\b(change that to|replace .{1,30} with|instead of .{1,30},?\s*(say|use|make it))/i,
  /\b(or rather|or actually|well actually)/i,
  /\b(wait,?\s*(no|let me)|hold on,?\s*(let me|actually))/i,
];

interface BacktrackMatch {
  signal: string;
  index: number;
}

function detectBacktrack(text: string | null): BacktrackMatch[] {
  if (!text || text.length < 10) return [];

  const matches: BacktrackMatch[] = [];
  for (const pattern of CORRECTION_SIGNALS) {
    const match = text.match(pattern);
    if (match) {
      matches.push({ signal: match[0], index: match.index! });
    }
  }
  return matches;
}

function hasBacktrack(text: string | null): boolean {
  return detectBacktrack(text).length > 0;
}

describe('Backtrack Correction', () => {
  describe('detectBacktrack', () => {
    it('detects "no wait" corrections', () => {
      expect(hasBacktrack("Let's meet tomorrow, no wait, Friday instead")).toBe(true);
      expect(hasBacktrack("Send it to John, no, wait, send it to Sarah")).toBe(true);
    });

    it('detects "actually" corrections', () => {
      expect(hasBacktrack("Send it to John, actually change it to Sarah")).toBe(true);
      expect(hasBacktrack("The budget is ten thousand actually no twelve thousand")).toBe(true);
    });

    it('detects "I mean" corrections', () => {
      expect(hasBacktrack("It costs fifty dollars, I mean sixty dollars")).toBe(true);
      expect(hasBacktrack("We need five, sorry I meant six")).toBe(true);
    });

    it('detects "scratch that" corrections', () => {
      expect(hasBacktrack("Buy milk and eggs, scratch that, just milk")).toBe(true);
      expect(hasBacktrack("Add a paragraph about pricing, delete that, skip it")).toBe(true);
      expect(hasBacktrack("Send the email, never mind, save as draft")).toBe(true);
    });

    it('detects "not X but Y" pattern', () => {
      expect(hasBacktrack("not Monday but Tuesday")).toBe(true);
      expect(hasBacktrack("not the blue one, rather the red one")).toBe(true);
    });

    it('detects "change that to" pattern', () => {
      expect(hasBacktrack("change that to Friday")).toBe(true);
      expect(hasBacktrack("replace tomorrow with next week")).toBe(true);
    });

    it('detects "or rather/actually" pattern', () => {
      expect(hasBacktrack("Send it today, or rather tomorrow morning")).toBe(true);
      expect(hasBacktrack("The meeting is at 3, well actually 4pm")).toBe(true);
    });

    it('detects "wait/hold on" pattern', () => {
      expect(hasBacktrack("wait, let me rethink that")).toBe(true);
      expect(hasBacktrack("hold on, actually make it 5pm")).toBe(true);
    });

    it('returns empty for normal speech', () => {
      expect(hasBacktrack("I need to buy groceries for dinner")).toBe(false);
      expect(hasBacktrack("The meeting is at 3pm in the conference room")).toBe(false);
      expect(hasBacktrack("Please send the report to Sarah by Friday")).toBe(false);
    });

    it('returns empty for short/null input', () => {
      expect(hasBacktrack(null)).toBe(false);
      expect(hasBacktrack("")).toBe(false);
      expect(hasBacktrack("hello")).toBe(false);
    });

    it('returns multiple signals when present', () => {
      const matches = detectBacktrack("no wait, I mean, scratch that, just forget it");
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('signal coverage', () => {
    it('has 8 correction signal patterns', () => {
      expect(CORRECTION_SIGNALS).toHaveLength(8);
    });

    it('all patterns are case-insensitive', () => {
      expect(hasBacktrack("NO WAIT, CHANGE THAT")).toBe(true);
      expect(hasBacktrack("I MEAN something else")).toBe(true);
      expect(hasBacktrack("SCRATCH THAT")).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles "actually" in non-correction context', () => {
      // "actually" alone isn't a correction — needs "actually no/wait/change/make"
      expect(hasBacktrack("I actually went to the store yesterday")).toBe(false);
    });

    it('handles "wait" in non-correction context', () => {
      // "wait" alone isn't caught — needs "no wait" or "wait, let me/no"
      expect(hasBacktrack("Please wait for the results")).toBe(false);
    });

    it('detects correction at end of sentence', () => {
      expect(hasBacktrack("The total is five hundred, I mean six hundred")).toBe(true);
    });

    it('detects correction at start of sentence', () => {
      expect(hasBacktrack("Scratch that, let's start over")).toBe(true);
    });
  });
});
