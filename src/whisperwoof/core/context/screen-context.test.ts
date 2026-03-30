/**
 * Tests for Screen Context — command detection and selection handling
 */

import { describe, it, expect } from 'vitest';

const SCREEN_COMMANDS: Record<string, { id: string; trigger: RegExp; label: string }> = {
  summarize: { id: "summarize", trigger: /^(summarize|sum up|give me a summary of)\s+(this|that|the selection|what's selected)\s*$/i, label: "Summarize selection" },
  explain: { id: "explain", trigger: /^(explain|what does this mean|break this down|help me understand)\s*(this|that|the selection)?\s*$/i, label: "Explain selection" },
  reply: { id: "reply", trigger: /^(reply to|respond to|answer)\s+(this|that|the selection)\s*$/i, label: "Reply to selection" },
  translate: { id: "translate", trigger: /^translate\s+(this|that|the selection)\s*$/i, label: "Translate selection" },
  simplify: { id: "simplify", trigger: /^(simplify|make this simpler|dumb this down)\s*$/i, label: "Simplify selection" },
  bullets: { id: "bullets", trigger: /^(turn this into|convert to|make)\s*(bullet points|a list|bullets)\s*$/i, label: "Convert to bullets" },
};

function detectScreenCommand(text: string | null): { id: string; label: string } | null {
  if (!text || text.length < 5) return null;
  const trimmed = text.trim();
  for (const [, cmd] of Object.entries(SCREEN_COMMANDS)) {
    if (cmd.trigger.test(trimmed)) return { id: cmd.id, label: cmd.label };
  }
  return null;
}

describe('Screen Context', () => {
  describe('detectScreenCommand', () => {
    it('detects "summarize this"', () => {
      expect(detectScreenCommand("summarize this")?.id).toBe("summarize");
      expect(detectScreenCommand("sum up that")?.id).toBe("summarize");
      expect(detectScreenCommand("give me a summary of the selection")?.id).toBe("summarize");
    });

    it('detects "explain this"', () => {
      expect(detectScreenCommand("explain this")?.id).toBe("explain");
      expect(detectScreenCommand("what does this mean")?.id).toBe("explain");
      expect(detectScreenCommand("break this down")?.id).toBe("explain");
      expect(detectScreenCommand("help me understand")?.id).toBe("explain");
    });

    it('detects "reply to this"', () => {
      expect(detectScreenCommand("reply to this")?.id).toBe("reply");
      expect(detectScreenCommand("respond to that")?.id).toBe("reply");
      expect(detectScreenCommand("answer this")?.id).toBe("reply");
    });

    it('detects "translate this"', () => {
      expect(detectScreenCommand("translate this")?.id).toBe("translate");
      expect(detectScreenCommand("translate the selection")?.id).toBe("translate");
    });

    it('detects "simplify"', () => {
      expect(detectScreenCommand("simplify")?.id).toBe("simplify");
      expect(detectScreenCommand("make this simpler")?.id).toBe("simplify");
      expect(detectScreenCommand("dumb this down")?.id).toBe("simplify");
    });

    it('detects "turn this into bullets"', () => {
      expect(detectScreenCommand("turn this into bullet points")?.id).toBe("bullets");
      expect(detectScreenCommand("convert to a list")?.id).toBe("bullets");
      expect(detectScreenCommand("make bullets")?.id).toBe("bullets");
    });

    it('returns null for non-screen commands', () => {
      expect(detectScreenCommand("I need to buy groceries")).toBeNull();
      expect(detectScreenCommand("create a function")).toBeNull();
      expect(detectScreenCommand("rewrite this more formally")).toBeNull(); // voice command, not screen
    });

    it('returns null for short/null input', () => {
      expect(detectScreenCommand("")).toBeNull();
      expect(detectScreenCommand(null)).toBeNull();
      expect(detectScreenCommand("hi")).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(detectScreenCommand("SUMMARIZE THIS")?.id).toBe("summarize");
      expect(detectScreenCommand("Explain This")?.id).toBe("explain");
    });
  });

  describe('screen commands registry', () => {
    it('has 6 commands', () => {
      expect(Object.keys(SCREEN_COMMANDS)).toHaveLength(6);
    });

    it('all commands have unique IDs', () => {
      const ids = Object.values(SCREEN_COMMANDS).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all commands have labels', () => {
      for (const cmd of Object.values(SCREEN_COMMANDS)) {
        expect(cmd.label).toBeTruthy();
      }
    });
  });

  describe('command differentiation from voice commands', () => {
    // Screen commands operate on SELECTED TEXT
    // Voice commands operate on CLIPBOARD TEXT
    // They should not overlap

    it('"summarize this" is screen, not voice command', () => {
      expect(detectScreenCommand("summarize this")).not.toBeNull();
    });

    it('"rewrite this" is NOT a screen command (it is a voice command)', () => {
      expect(detectScreenCommand("rewrite this")).toBeNull();
    });

    it('"translate this to Spanish" is NOT a screen command (voice command)', () => {
      // Screen translate is just "translate this/that"
      // Voice translate is "translate this to [language]"
      expect(detectScreenCommand("translate this to Spanish")).toBeNull();
    });
  });
});
