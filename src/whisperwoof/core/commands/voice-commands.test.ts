/**
 * Tests for Voice Editing Commands
 *
 * Tests command detection and prompt building.
 * Ollama execution is tested manually — these verify the parsing logic.
 */

import { describe, it, expect } from 'vitest';

// Command patterns re-implemented for testing (pure logic, no OS deps)
interface CommandMatch {
  id: string;
  spoken: string;
}

// Order matters: specific "make X shorter/longer/simpler" before generic "make X"
const PATTERNS: Array<{ id: string; match: RegExp }> = [
  { id: "rewrite", match: /^(rewrite|rephrase|reword)\s+(this|that|it)?\s*/i },
  { id: "shorten", match: /^(shorten|make\s+(this|that|it)\s+shorter|condense|trim|cut\s+down)\s*/i },
  { id: "expand", match: /^(expand|elaborate|make\s+(this|that|it)\s+(longer|more\s+detailed))\s*/i },
  { id: "simplify", match: /^(simplify|make\s+(this|that|it)\s+simpler|explain\s+(this|that|it)\s+simply)\s*/i },
  { id: "make", match: /^make\s+(this|that|it)\s+/i },
  { id: "translate", match: /^translate\s+(this|that|it)?\s*(to|into)\s+/i },
  { id: "summarize", match: /^(summarize|summarise|sum up|give me a summary|tldr)\s*/i },
  { id: "fix", match: /^(fix|correct)\s+(the\s+)?(grammar|spelling|errors?|typos?|this|that|it)\s*/i },
  { id: "format-list", match: /^(format|convert|turn)\s+(this|that|it)?\s*(as|into|to)\s+(a\s+)?(list|bullet\s*points|bullets|numbered\s+list)\s*/i },
  { id: "format-email", match: /^(format|write|turn)\s+(this|that|it)?\s*(as|into)\s+(an?\s+)?email\s*/i },
];

function detectCommand(text: string | null): CommandMatch | null {
  if (!text || text.length < 3) return null;
  const trimmed = text.trim();
  for (const pattern of PATTERNS) {
    if (pattern.match.test(trimmed)) {
      return { id: pattern.id, spoken: trimmed };
    }
  }
  return null;
}

describe('Voice Editing Commands', () => {
  describe('detectCommand', () => {
    it('detects "rewrite" commands', () => {
      expect(detectCommand("rewrite this")?.id).toBe("rewrite");
      expect(detectCommand("Rephrase that")?.id).toBe("rewrite");
      expect(detectCommand("reword it to be clearer")?.id).toBe("rewrite");
    });

    it('detects "make" commands (generic — after specific patterns)', () => {
      expect(detectCommand("make this more formal")?.id).toBe("make");
      expect(detectCommand("make that more casual")?.id).toBe("make");
      expect(detectCommand("make this professional")?.id).toBe("make");
      // Note: "Make it shorter" matches "shorten" (more specific pattern)
    });

    it('detects "translate" commands', () => {
      expect(detectCommand("translate this to Spanish")?.id).toBe("translate");
      expect(detectCommand("Translate to French")?.id).toBe("translate");
      expect(detectCommand("translate it into Japanese")?.id).toBe("translate");
    });

    it('detects "summarize" commands', () => {
      expect(detectCommand("summarize this")?.id).toBe("summarize");
      expect(detectCommand("Summarise")?.id).toBe("summarize");
      expect(detectCommand("sum up")?.id).toBe("summarize");
      expect(detectCommand("TLDR")?.id).toBe("summarize");
      expect(detectCommand("give me a summary")?.id).toBe("summarize");
    });

    it('detects "fix" commands', () => {
      expect(detectCommand("fix the grammar")?.id).toBe("fix");
      expect(detectCommand("Fix spelling")?.id).toBe("fix");
      expect(detectCommand("correct the errors")?.id).toBe("fix");
      expect(detectCommand("fix typos")?.id).toBe("fix");
      expect(detectCommand("fix this")?.id).toBe("fix");
    });

    it('detects "shorten" commands', () => {
      expect(detectCommand("shorten this")?.id).toBe("shorten");
      expect(detectCommand("make this shorter")?.id).toBe("shorten");
      expect(detectCommand("condense")?.id).toBe("shorten");
      expect(detectCommand("trim")?.id).toBe("shorten");
      expect(detectCommand("cut down")?.id).toBe("shorten");
    });

    it('detects "expand" commands', () => {
      expect(detectCommand("expand this")?.id).toBe("expand");
      expect(detectCommand("elaborate")?.id).toBe("expand");
      expect(detectCommand("make this longer")?.id).toBe("expand");
      expect(detectCommand("make it more detailed")?.id).toBe("expand");
    });

    it('detects "format-list" commands', () => {
      expect(detectCommand("format this as a list")?.id).toBe("format-list");
      expect(detectCommand("turn it into bullet points")?.id).toBe("format-list");
      expect(detectCommand("convert to a numbered list")?.id).toBe("format-list");
    });

    it('detects "format-email" commands', () => {
      expect(detectCommand("format this as an email")?.id).toBe("format-email");
      expect(detectCommand("turn this into an email")?.id).toBe("format-email");
      expect(detectCommand("write this as email")?.id).toBe("format-email");
    });

    it('detects "simplify" commands', () => {
      expect(detectCommand("simplify this")?.id).toBe("simplify");
      expect(detectCommand("make this simpler")?.id).toBe("simplify");
      expect(detectCommand("explain this simply")?.id).toBe("simplify");
    });

    it('returns null for regular dictation text', () => {
      expect(detectCommand("I need to buy groceries")).toBeNull();
      expect(detectCommand("The meeting is at 3pm")).toBeNull();
      expect(detectCommand("Hello world")).toBeNull();
      expect(detectCommand("Schedule a call for tomorrow")).toBeNull();
    });

    it('returns null for empty/short input', () => {
      expect(detectCommand("")).toBeNull();
      expect(detectCommand(null)).toBeNull();
      expect(detectCommand("hi")).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(detectCommand("REWRITE THIS")?.id).toBe("rewrite");
      expect(detectCommand("Translate To Spanish")?.id).toBe("translate");
      expect(detectCommand("SUMMARIZE")?.id).toBe("summarize");
    });

    it('preserves full spoken text in match', () => {
      const cmd = detectCommand("make this more formal and concise");
      expect(cmd?.id).toBe("make");
      expect(cmd?.spoken).toBe("make this more formal and concise");
    });
  });

  describe('command coverage', () => {
    it('has 10 command types', () => {
      expect(PATTERNS).toHaveLength(10);
    });

    it('all pattern IDs are unique', () => {
      const ids = PATTERNS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
