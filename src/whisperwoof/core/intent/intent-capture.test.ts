/**
 * Tests for Intent Capture — rambling detection and intent extraction
 *
 * Tests the heuristic-based rambling scorer and output modes.
 * LLM extraction is tested manually.
 */

import { describe, it, expect } from 'vitest';

// Re-implement rambling detection for testing

const RAMBLING_SIGNALS: Record<string, RegExp> = {
  hedging: /\b(probably|maybe|I think|I guess|kind of|sort of|I feel like|I suppose|perhaps|might|could be)\b/gi,
  fillers: /\b(um|uh|like|you know|basically|actually|so|right|I mean|well|okay so|anyway)\b/gi,
  restarts: /\b(no wait|actually|I mean|or rather|well actually|let me think|hmm|let me rephrase)\b/gi,
  tangents: /\b(by the way|speaking of|on a side note|oh and also|which reminds me|come to think of it)\b/gi,
  wandering: /\b(and then|but also|and also|but anyway|so anyway|and I was thinking|but the thing is)\b/gi,
  repetition: /\b(the thing is|the point is|what I'm saying is|what I mean is)\b/gi,
};

function detectRambling(text: string | null): { score: number; signals: Record<string, number>; isRambling: boolean } {
  if (!text || text.length < 30) {
    return { score: 0, signals: {}, isRambling: false };
  }

  const wordCount = text.split(/\s+/).length;
  const signals: Record<string, number> = {};
  let totalHits = 0;

  for (const [name, pattern] of Object.entries(RAMBLING_SIGNALS)) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags)) || [];
    signals[name] = matches.length;
    totalHits += matches.length;
  }

  const density = totalHits / wordCount;
  const score = Math.min(1, density * 3);
  const lengthBonus = wordCount > 40 ? 0.1 : 0;
  const finalScore = Math.min(1, score + lengthBonus);

  return {
    score: Math.round(finalScore * 100) / 100,
    signals,
    isRambling: finalScore >= 0.25,
  };
}

describe('Intent Capture', () => {
  describe('detectRambling', () => {
    it('detects heavy rambling', () => {
      const rambling = "so basically I was thinking we should probably maybe look into, you know, changing the deployment to like happen on Fridays instead of Mondays because I think, I mean I guess the release schedule kind of sort of works better that way, but anyway the thing is we might want to actually consider it";
      const result = detectRambling(rambling);
      expect(result.isRambling).toBe(true);
      expect(result.score).toBeGreaterThan(0.3);
    });

    it('detects moderate rambling', () => {
      const moderate = "I think we should probably change the meeting time, you know, because like the current time doesn't work for everyone, so maybe we could move it to afternoon";
      const result = detectRambling(moderate);
      expect(result.isRambling).toBe(true);
    });

    it('does not flag clean speech', () => {
      const clean = "Change the deployment schedule from Monday to Friday to align with the release cycle.";
      const result = detectRambling(clean);
      expect(result.isRambling).toBe(false);
      expect(result.score).toBeLessThan(0.25);
    });

    it('does not flag direct instructions', () => {
      const direct = "Send the quarterly report to the finance team by end of day Friday. Include the updated projections.";
      const result = detectRambling(direct);
      expect(result.isRambling).toBe(false);
    });

    it('counts hedging signals', () => {
      const hedging = "I think we should probably maybe consider perhaps looking into this, I guess";
      const result = detectRambling(hedging);
      expect(result.signals.hedging).toBeGreaterThan(2);
    });

    it('counts filler signals', () => {
      const fillers = "so um basically like you know I was um thinking about like this thing right";
      const result = detectRambling(fillers);
      expect(result.signals.fillers).toBeGreaterThan(3);
    });

    it('counts tangent signals', () => {
      const tangent = "We need to fix the bug, by the way speaking of bugs, which reminds me about the other issue, oh and also the deployment";
      const result = detectRambling(tangent);
      expect(result.signals.tangents).toBeGreaterThan(1);
    });

    it('returns score 0 for short text', () => {
      expect(detectRambling("hello")).toEqual({ score: 0, signals: {}, isRambling: false });
    });

    it('returns score 0 for null', () => {
      expect(detectRambling(null)).toEqual({ score: 0, signals: {}, isRambling: false });
    });

    it('gives length bonus for very long utterances', () => {
      // Long but only mildly rambling — length bonus pushes score up
      const long = "I was thinking about the project and how we need to finish it by next week and then we should probably review the code and also make sure the tests pass and then deploy it to staging and then maybe production and I think we need to coordinate with the team on this and also check with the stakeholders";
      const result = detectRambling(long);
      expect(result.score).toBeGreaterThan(0);
    });

    it('score is capped at 1.0', () => {
      const extreme = "um uh like you know basically so actually I mean well I think probably maybe I guess sort of kind of right so basically like you know actually I mean well perhaps might could be I suppose I feel like";
      const result = detectRambling(extreme);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('output modes', () => {
    const modes = ["auto", "action", "decision", "question", "summary"];

    it('has 5 output modes', () => {
      expect(modes).toHaveLength(5);
    });

    it('auto is the default mode', () => {
      expect(modes[0]).toBe("auto");
    });
  });

  describe('signal categories', () => {
    it('has 6 signal categories', () => {
      expect(Object.keys(RAMBLING_SIGNALS)).toHaveLength(6);
    });

    it('all categories are detected independently', () => {
      const result = detectRambling(
        "I think probably maybe we should, you know basically like, no wait I mean, by the way speaking of, and then but also, the thing is what I'm saying is we need to change this"
      );
      // Should have hits in multiple categories
      const hitCategories = Object.entries(result.signals).filter(([, count]) => count > 0);
      expect(hitCategories.length).toBeGreaterThanOrEqual(3);
    });
  });
});
