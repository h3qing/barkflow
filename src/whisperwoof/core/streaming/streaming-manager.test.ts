/**
 * Tests for Streaming Transcription Manager
 *
 * Tests session lifecycle, partial buffering, word diffing, display formatting.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure logic for testing

const MAX_PARTIAL_LENGTH = 200;
const STALE_THRESHOLD_MS = 3000;

interface StreamingSession {
  id: string;
  startedAt: number;
  partialText: string;
  finalText: string;
  wordCount: number;
  updateCount: number;
  lastUpdateAt: number;
  isActive: boolean;
  finalizedAt?: number;
  durationMs?: number;
}

function createSession(): StreamingSession {
  return Object.freeze({
    id: `stream-${Date.now()}`,
    startedAt: Date.now(),
    partialText: "",
    finalText: "",
    wordCount: 0,
    updateCount: 0,
    lastUpdateAt: Date.now(),
    isActive: true,
  }) as StreamingSession;
}

function updatePartial(session: StreamingSession, partialText: string): StreamingSession {
  if (!session || !session.isActive) return session;
  const trimmed = (partialText || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  return Object.freeze({
    ...session,
    partialText: trimmed.length > MAX_PARTIAL_LENGTH
      ? trimmed.slice(0, MAX_PARTIAL_LENGTH) + "\u2026"
      : trimmed,
    wordCount: words.length,
    updateCount: session.updateCount + 1,
    lastUpdateAt: Date.now(),
  }) as StreamingSession;
}

function finalizeSession(session: StreamingSession, finalText: string): StreamingSession {
  if (!session) return session;
  return Object.freeze({
    ...session,
    finalText: (finalText || "").trim(),
    partialText: "",
    isActive: false,
    finalizedAt: Date.now(),
    durationMs: Date.now() - session.startedAt,
  }) as StreamingSession;
}

function diffPartials(oldText: string, newText: string) {
  const oldWords = (oldText || "").split(/\s+/).filter(Boolean);
  const newWords = (newText || "").split(/\s+/).filter(Boolean);
  let commonPrefix = 0;
  while (
    commonPrefix < oldWords.length &&
    commonPrefix < newWords.length &&
    oldWords[commonPrefix] === newWords[commonPrefix]
  ) {
    commonPrefix++;
  }
  return {
    unchanged: commonPrefix,
    changed: Math.max(0, oldWords.length - commonPrefix),
    added: Math.max(0, newWords.length - commonPrefix),
    newWords: newWords.slice(commonPrefix),
  };
}

function formatForDisplay(partialText: string, maxChars = 60): string {
  if (!partialText) return "";
  if (partialText.length <= maxChars) return partialText;
  const truncated = partialText.slice(-maxChars);
  const firstSpace = truncated.indexOf(" ");
  if (firstSpace > 0 && firstSpace < 10) {
    return "\u2026" + truncated.slice(firstSpace);
  }
  return "\u2026" + truncated;
}

function getWpm(session: StreamingSession): number {
  if (!session || session.wordCount === 0) return 0;
  const elapsedMinutes = (Date.now() - session.startedAt) / 60000;
  if (elapsedMinutes < 0.05) return 0;
  return Math.round(session.wordCount / elapsedMinutes);
}

describe('Streaming Manager', () => {
  describe('session lifecycle', () => {
    it('creates an active session', () => {
      const session = createSession();
      expect(session.isActive).toBe(true);
      expect(session.partialText).toBe("");
      expect(session.finalText).toBe("");
      expect(session.wordCount).toBe(0);
      expect(session.updateCount).toBe(0);
    });

    it('updates partial text immutably', () => {
      const s1 = createSession();
      const s2 = updatePartial(s1, "hello world");
      expect(s2.partialText).toBe("hello world");
      expect(s2.wordCount).toBe(2);
      expect(s2.updateCount).toBe(1);
      expect(s1.partialText).toBe(""); // original unchanged
    });

    it('increments update count on each partial', () => {
      let session = createSession();
      session = updatePartial(session, "hello");
      session = updatePartial(session, "hello world");
      session = updatePartial(session, "hello world test");
      expect(session.updateCount).toBe(3);
    });

    it('finalizes session with final text', () => {
      let session = createSession();
      session = updatePartial(session, "hello world");
      session = finalizeSession(session, "Hello world.");
      expect(session.isActive).toBe(false);
      expect(session.finalText).toBe("Hello world.");
      expect(session.partialText).toBe("");
    });

    it('does not update after finalization', () => {
      let session = createSession();
      session = finalizeSession(session, "done");
      const updated = updatePartial(session, "new text");
      expect(updated.partialText).toBe(""); // no change
    });

    it('truncates very long partials', () => {
      const session = createSession();
      const longText = "word ".repeat(100);
      const updated = updatePartial(session, longText);
      expect(updated.partialText.length).toBeLessThanOrEqual(MAX_PARTIAL_LENGTH + 1); // +1 for ellipsis char
    });
  });

  describe('diffPartials', () => {
    it('detects no change', () => {
      const diff = diffPartials("hello world", "hello world");
      expect(diff.unchanged).toBe(2);
      expect(diff.changed).toBe(0);
      expect(diff.added).toBe(0);
    });

    it('detects added words', () => {
      const diff = diffPartials("hello", "hello world test");
      expect(diff.unchanged).toBe(1);
      expect(diff.added).toBe(2);
      expect(diff.newWords).toEqual(["world", "test"]);
    });

    it('detects changed words', () => {
      const diff = diffPartials("hello world", "hello there");
      expect(diff.unchanged).toBe(1);
      expect(diff.changed).toBe(1);
      expect(diff.added).toBe(1);
      expect(diff.newWords).toEqual(["there"]);
    });

    it('handles empty old text', () => {
      const diff = diffPartials("", "hello world");
      expect(diff.unchanged).toBe(0);
      expect(diff.added).toBe(2);
    });

    it('handles empty new text', () => {
      const diff = diffPartials("hello world", "");
      expect(diff.unchanged).toBe(0);
      expect(diff.changed).toBe(2);
      expect(diff.added).toBe(0);
    });

    it('handles null inputs', () => {
      const diff = diffPartials(null as any, null as any);
      expect(diff.unchanged).toBe(0);
    });
  });

  describe('formatForDisplay', () => {
    it('returns short text as-is', () => {
      expect(formatForDisplay("hello world")).toBe("hello world");
    });

    it('truncates long text from the left', () => {
      const long = "this is a very long transcription that should be truncated from the left side to show recent words";
      const formatted = formatForDisplay(long, 40);
      expect(formatted.startsWith("\u2026")).toBe(true);
      expect(formatted.length).toBeLessThanOrEqual(42); // 40 + ellipsis + space
    });

    it('returns empty for empty input', () => {
      expect(formatForDisplay("")).toBe("");
      expect(formatForDisplay(null as any)).toBe("");
    });

    it('respects maxChars parameter', () => {
      const text = "a ".repeat(100);
      const formatted = formatForDisplay(text, 20);
      expect(formatted.length).toBeLessThanOrEqual(22);
    });
  });

  describe('getWpm', () => {
    it('returns 0 for new session', () => {
      const session = createSession();
      expect(getWpm(session)).toBe(0);
    });

    it('returns 0 for empty session', () => {
      expect(getWpm(null as any)).toBe(0);
    });

    it('calculates WPM correctly for sessions with elapsed time', () => {
      const session = {
        ...createSession(),
        startedAt: Date.now() - 60000, // 1 minute ago
        wordCount: 150,
      } as StreamingSession;
      const wpm = getWpm(session);
      expect(wpm).toBeGreaterThan(140);
      expect(wpm).toBeLessThan(160);
    });
  });

  describe('session immutability', () => {
    it('createSession returns frozen object', () => {
      const session = createSession();
      expect(Object.isFrozen(session)).toBe(true);
    });

    it('updatePartial returns frozen object', () => {
      const updated = updatePartial(createSession(), "test");
      expect(Object.isFrozen(updated)).toBe(true);
    });

    it('finalizeSession returns frozen object', () => {
      const final = finalizeSession(createSession(), "done");
      expect(Object.isFrozen(final)).toBe(true);
    });
  });
});
