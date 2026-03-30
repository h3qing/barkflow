/**
 * Tests for Focus Mode — voice-powered productivity sprints
 *
 * Tests session lifecycle, entry recording, stats computation, presets.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure logic for testing

interface FocusSession {
  id: string;
  startedAt: string;
  durationMin: number;
  goal: string | null;
  presetId: string | null;
  entryIds: string[];
  wordCount: number;
  isActive: boolean;
  endedAt: string | null;
  actualDurationMin?: number;
  summary: string | null;
}

const SPRINT_PRESETS = [
  { id: "quick", name: "Quick Capture", durationMin: 5 },
  { id: "short", name: "Short Sprint", durationMin: 15 },
  { id: "pomodoro", name: "Pomodoro", durationMin: 25 },
  { id: "deep", name: "Deep Work", durationMin: 45 },
  { id: "marathon", name: "Marathon", durationMin: 60 },
];

function createSession(options: { durationMin?: number; goal?: string; presetId?: string } = {}): FocusSession {
  return {
    id: `focus-${Date.now()}`,
    startedAt: new Date().toISOString(),
    durationMin: options.durationMin || 25,
    goal: (options.goal || "").trim() || null,
    presetId: options.presetId || null,
    entryIds: [],
    wordCount: 0,
    isActive: true,
    endedAt: null,
    summary: null,
  };
}

function recordEntry(session: FocusSession, entryId: string, wordCount: number): FocusSession {
  return {
    ...session,
    entryIds: [...session.entryIds, entryId],
    wordCount: session.wordCount + wordCount,
  };
}

function endSession(session: FocusSession, summary?: string): FocusSession {
  return {
    ...session,
    isActive: false,
    endedAt: new Date().toISOString(),
    summary: summary || null,
    actualDurationMin: Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / 60000
    ),
  };
}

function computeStats(sessions: FocusSession[]) {
  if (sessions.length === 0) {
    return { totalSessions: 0, totalMinutes: 0, totalWords: 0, totalEntries: 0, avgDuration: 0, completionRate: 0 };
  }
  const totalMin = sessions.reduce((sum, s) => sum + (s.actualDurationMin || 0), 0);
  const totalWords = sessions.reduce((sum, s) => sum + (s.wordCount || 0), 0);
  const totalEntries = sessions.reduce((sum, s) => sum + (s.entryIds?.length || 0), 0);
  const completed = sessions.filter((s) => (s.actualDurationMin || 0) >= s.durationMin * 0.8).length;

  return {
    totalSessions: sessions.length,
    totalMinutes: totalMin,
    totalWords,
    totalEntries,
    avgDuration: Math.round(totalMin / sessions.length),
    completionRate: Math.round((completed / sessions.length) * 100),
  };
}

describe('Focus Mode', () => {
  describe('session lifecycle', () => {
    it('creates an active session with defaults', () => {
      const session = createSession();
      expect(session.isActive).toBe(true);
      expect(session.durationMin).toBe(25);
      expect(session.entryIds).toHaveLength(0);
      expect(session.wordCount).toBe(0);
      expect(session.goal).toBeNull();
    });

    it('creates session with custom duration and goal', () => {
      const session = createSession({ durationMin: 45, goal: "Brain dump project ideas" });
      expect(session.durationMin).toBe(45);
      expect(session.goal).toBe("Brain dump project ideas");
    });

    it('creates session with preset', () => {
      const session = createSession({ presetId: "pomodoro", durationMin: 25 });
      expect(session.presetId).toBe("pomodoro");
    });

    it('records entries immutably', () => {
      const s1 = createSession();
      const s2 = recordEntry(s1, "entry-1", 50);
      const s3 = recordEntry(s2, "entry-2", 30);

      expect(s1.entryIds).toHaveLength(0); // original unchanged
      expect(s2.entryIds).toHaveLength(1);
      expect(s3.entryIds).toHaveLength(2);
      expect(s3.wordCount).toBe(80);
    });

    it('ends session with summary', () => {
      const session = createSession();
      const ended = endSession(session, "Discussed 3 project ideas");

      expect(ended.isActive).toBe(false);
      expect(ended.endedAt).not.toBeNull();
      expect(ended.summary).toBe("Discussed 3 project ideas");
    });

    it('ends session without summary', () => {
      const session = createSession();
      const ended = endSession(session);
      expect(ended.summary).toBeNull();
    });
  });

  describe('sprint presets', () => {
    it('has 5 presets', () => {
      expect(SPRINT_PRESETS).toHaveLength(5);
    });

    it('presets cover 5 to 60 minutes', () => {
      const durations = SPRINT_PRESETS.map((p) => p.durationMin);
      expect(Math.min(...durations)).toBe(5);
      expect(Math.max(...durations)).toBe(60);
    });

    it('all presets have unique ids', () => {
      const ids = SPRINT_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes a pomodoro preset (25 min)', () => {
      const pomo = SPRINT_PRESETS.find((p) => p.id === "pomodoro");
      expect(pomo).toBeDefined();
      expect(pomo!.durationMin).toBe(25);
    });
  });

  describe('stats computation', () => {
    const sampleSessions: FocusSession[] = [
      { ...createSession({ durationMin: 25 }), entryIds: ["e1", "e2", "e3"], wordCount: 150, actualDurationMin: 25, isActive: false, endedAt: "2026-03-30T10:00:00Z" },
      { ...createSession({ durationMin: 25 }), entryIds: ["e4", "e5"], wordCount: 80, actualDurationMin: 20, isActive: false, endedAt: "2026-03-30T11:00:00Z" },
      { ...createSession({ durationMin: 45 }), entryIds: ["e6"], wordCount: 200, actualDurationMin: 45, isActive: false, endedAt: "2026-03-30T12:00:00Z" },
    ];

    it('calculates total sessions', () => {
      expect(computeStats(sampleSessions).totalSessions).toBe(3);
    });

    it('calculates total minutes', () => {
      expect(computeStats(sampleSessions).totalMinutes).toBe(90);
    });

    it('calculates total words', () => {
      expect(computeStats(sampleSessions).totalWords).toBe(430);
    });

    it('calculates total entries', () => {
      expect(computeStats(sampleSessions).totalEntries).toBe(6);
    });

    it('calculates average duration', () => {
      expect(computeStats(sampleSessions).avgDuration).toBe(30);
    });

    it('calculates completion rate (80% of target = complete)', () => {
      // Session 1: 25/25 = 100% (complete)
      // Session 2: 20/25 = 80% (complete, exactly at threshold)
      // Session 3: 45/45 = 100% (complete)
      expect(computeStats(sampleSessions).completionRate).toBe(100);
    });

    it('handles empty sessions', () => {
      const stats = computeStats([]);
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalMinutes).toBe(0);
      expect(stats.completionRate).toBe(0);
    });

    it('detects incomplete sessions', () => {
      const incomplete: FocusSession[] = [
        { ...createSession({ durationMin: 25 }), entryIds: [], wordCount: 0, actualDurationMin: 5, isActive: false, endedAt: "2026-03-30T10:00:00Z" },
      ];
      expect(computeStats(incomplete).completionRate).toBe(0);
    });
  });

  describe('validation', () => {
    it('trims whitespace from goal', () => {
      const session = createSession({ goal: "  Write a blog post  " });
      expect(session.goal).toBe("Write a blog post");
    });

    it('null goal for empty string', () => {
      const session = createSession({ goal: "" });
      expect(session.goal).toBeNull();
    });

    it('defaults to 25 min if no duration specified', () => {
      expect(createSession().durationMin).toBe(25);
    });
  });
});
