/**
 * Tests for Usage Analytics — dashboard computation logic
 *
 * Tests data transformation and streak calculation.
 * Database queries are not tested — pure logic only.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure logic for testing

interface DayCount {
  day: string;
  count: number;
}

interface SourceCount {
  source: string;
  count: number;
}

interface CommandCount {
  command: string;
  count: number;
}

function computePolishStats(
  entries: Array<{ raw_text: string; polished: string }>,
  totalEntries: number,
) {
  if (entries.length === 0) {
    return { totalPolished: 0, totalRaw: totalEntries, avgCharsSaved: 0, polishRate: 0 };
  }

  let totalRawLen = 0;
  let totalPolishedLen = 0;

  for (const row of entries) {
    totalRawLen += (row.raw_text || "").length;
    totalPolishedLen += (row.polished || "").length;
  }

  const avgCharsDiff = Math.round((totalPolishedLen - totalRawLen) / entries.length);
  const polishRate = totalEntries > 0 ? Math.round((entries.length / totalEntries) * 100) : 0;

  return { totalPolished: entries.length, totalRaw: totalEntries, avgCharsSaved: avgCharsDiff, polishRate };
}

function computeStreaks(sortedDaysDesc: string[]): { current: number; longest: number } {
  if (sortedDaysDesc.length === 0) return { current: 0, longest: 0 };

  const today = new Date().toISOString().split("T")[0];

  // Current streak
  let current = 0;
  let checkDate = today;
  for (const day of sortedDaysDesc) {
    if (day === checkDate) {
      current++;
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split("T")[0];
    } else if (day < checkDate) {
      break;
    }
  }

  // Longest streak
  let longest = 0;
  let streak = 1;
  for (let i = 0; i < sortedDaysDesc.length - 1; i++) {
    const d1 = new Date(sortedDaysDesc[i]);
    const d2 = new Date(sortedDaysDesc[i + 1]);
    const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak);

  return { current, longest };
}

function extractCommandName(routedTo: string): string {
  return routedTo.replace("voice-command:", "");
}

function extractSnippetTrigger(routedTo: string): string {
  return routedTo.replace("snippet:", "");
}

function fillHourGaps(hourCounts: Array<{ hour: number; count: number }>): Array<{ hour: number; count: number }> {
  const hourMap = Object.fromEntries(hourCounts.map((r) => [r.hour, r.count]));
  const result = [];
  for (let h = 0; h < 24; h++) {
    result.push({ hour: h, count: hourMap[h] || 0 });
  }
  return result;
}

describe('Usage Analytics', () => {
  describe('polishStats', () => {
    it('computes average chars saved (concisified)', () => {
      const entries = [
        { raw_text: "um so like I need to buy groceries", polished: "I need to buy groceries" },
        { raw_text: "uh basically we should you know go there", polished: "We should go there" },
      ];
      const stats = computePolishStats(entries, 10);
      expect(stats.totalPolished).toBe(2);
      expect(stats.avgCharsSaved).toBeLessThan(0); // polished is shorter
      expect(stats.polishRate).toBe(20); // 2/10 = 20%
    });

    it('handles expanded text (positive chars saved)', () => {
      const entries = [
        { raw_text: "buy milk", polished: "I need to buy milk from the grocery store." },
      ];
      const stats = computePolishStats(entries, 1);
      expect(stats.avgCharsSaved).toBeGreaterThan(0);
    });

    it('returns zeros for no polished entries', () => {
      const stats = computePolishStats([], 5);
      expect(stats.totalPolished).toBe(0);
      expect(stats.avgCharsSaved).toBe(0);
      expect(stats.polishRate).toBe(0);
    });

    it('calculates polish rate correctly', () => {
      const entries = [
        { raw_text: "a", polished: "A." },
        { raw_text: "b", polished: "B." },
        { raw_text: "c", polished: "C." },
      ];
      const stats = computePolishStats(entries, 4);
      expect(stats.polishRate).toBe(75); // 3/4 = 75%
    });
  });

  describe('streaks', () => {
    it('calculates current streak from today', () => {
      const today = new Date();
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      const { current } = computeStreaks(days);
      expect(current).toBe(5);
    });

    it('current streak is 0 if no entry today', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);
      const { current } = computeStreaks([yesterday.toISOString().split("T")[0]]);
      expect(current).toBe(0);
    });

    it('longest streak across gaps', () => {
      // 3-day streak, gap, 5-day streak
      const days = [
        "2026-03-30", "2026-03-29", "2026-03-28", // 3 days
        // gap at 2026-03-27
        "2026-03-25", "2026-03-24", "2026-03-23", "2026-03-22", "2026-03-21", // 5 days
      ];
      const { longest } = computeStreaks(days);
      expect(longest).toBe(5);
    });

    it('handles single day', () => {
      const today = new Date().toISOString().split("T")[0];
      const { current, longest } = computeStreaks([today]);
      expect(current).toBe(1);
      expect(longest).toBe(1);
    });

    it('handles empty', () => {
      const { current, longest } = computeStreaks([]);
      expect(current).toBe(0);
      expect(longest).toBe(0);
    });
  });

  describe('command extraction', () => {
    it('extracts command name from routed_to', () => {
      expect(extractCommandName("voice-command:rewrite")).toBe("rewrite");
      expect(extractCommandName("voice-command:translate")).toBe("translate");
      expect(extractCommandName("voice-command:summarize")).toBe("summarize");
    });
  });

  describe('snippet extraction', () => {
    it('extracts trigger from routed_to', () => {
      expect(extractSnippetTrigger("snippet:my email")).toBe("my email");
      expect(extractSnippetTrigger("snippet:standup update")).toBe("standup update");
    });
  });

  describe('hour gaps', () => {
    it('fills missing hours with 0', () => {
      const sparse = [{ hour: 9, count: 5 }, { hour: 14, count: 3 }];
      const filled = fillHourGaps(sparse);
      expect(filled).toHaveLength(24);
      expect(filled[0].count).toBe(0);
      expect(filled[9].count).toBe(5);
      expect(filled[14].count).toBe(3);
      expect(filled[23].count).toBe(0);
    });

    it('handles empty input', () => {
      const filled = fillHourGaps([]);
      expect(filled).toHaveLength(24);
      expect(filled.every((h) => h.count === 0)).toBe(true);
    });

    it('preserves all 24 hours in order', () => {
      const filled = fillHourGaps([]);
      for (let i = 0; i < 24; i++) {
        expect(filled[i].hour).toBe(i);
      }
    });
  });
});
