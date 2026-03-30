/**
 * Tests for Entry Templates — structured capture formats
 */

import { describe, it, expect } from 'vitest';

// Re-implement rendering logic for testing

interface Section {
  id: string;
  label: string;
  prompt: string;
  required: boolean;
}

interface Template {
  id: string;
  name: string;
  sections: Section[];
  outputFormat: string;
  builtIn: boolean;
}

const STANDUP: Template = {
  id: "builtin-standup",
  name: "Daily Standup",
  sections: [
    { id: "yesterday", label: "Yesterday", prompt: "What did you work on yesterday?", required: true },
    { id: "today", label: "Today", prompt: "What are you working on today?", required: true },
    { id: "blockers", label: "Blockers", prompt: "Any blockers?", required: false },
  ],
  outputFormat: "## Daily Standup\n\n**Yesterday:**\n{{yesterday}}\n\n**Today:**\n{{today}}\n\n**Blockers:**\n{{blockers}}",
  builtIn: true,
};

const BUG_REPORT: Template = {
  id: "builtin-bug",
  name: "Bug Report",
  sections: [
    { id: "summary", label: "Summary", prompt: "What's the bug?", required: true },
    { id: "steps", label: "Steps", prompt: "How to reproduce?", required: true },
    { id: "expected", label: "Expected", prompt: "What should happen?", required: true },
    { id: "actual", label: "Actual", prompt: "What actually happens?", required: true },
  ],
  outputFormat: "## Bug Report\n\n**Summary:** {{summary}}\n\n**Steps:**\n{{steps}}\n\n**Expected:** {{expected}}\n\n**Actual:** {{actual}}",
  builtIn: true,
};

function renderTemplate(template: Template, values: Record<string, string>): { success: boolean; output?: string; error?: string } {
  for (const section of template.sections) {
    if (section.required && (!values[section.id] || !values[section.id].trim())) {
      return { success: false, error: `Required section "${section.label}" is empty` };
    }
  }

  let output = template.outputFormat;
  for (const section of template.sections) {
    const value = (values[section.id] || "").trim() || "(none)";
    output = output.replace(new RegExp(`\\{\\{${section.id}\\}\\}`, "g"), value);
  }

  return { success: true, output };
}

function getNextSection(template: Template, filled: Record<string, string>): Section | null {
  const filledIds = new Set(Object.keys(filled));
  return template.sections.find((s) => !filledIds.has(s.id)) || null;
}

describe('Entry Templates', () => {
  describe('renderTemplate', () => {
    it('renders standup template', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "Fixed the login bug",
        today: "Working on the dashboard",
        blockers: "None",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Fixed the login bug");
      expect(result.output).toContain("Working on the dashboard");
      expect(result.output).toContain("## Daily Standup");
    });

    it('renders bug report template', () => {
      const result = renderTemplate(BUG_REPORT, {
        summary: "Login page crashes",
        steps: "1. Open login\n2. Click submit",
        expected: "Login succeeds",
        actual: "Page crashes",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Login page crashes");
      expect(result.output).toContain("## Bug Report");
    });

    it('fails when required section is empty', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "Fixed bugs",
        // today is missing (required)
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Today");
    });

    it('allows empty optional sections', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "Fixed bugs",
        today: "Dashboard work",
        // blockers is optional
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("(none)");
    });

    it('replaces all placeholders', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "A",
        today: "B",
        blockers: "C",
      });
      expect(result.output).not.toContain("{{");
      expect(result.output).not.toContain("}}");
    });
  });

  describe('getNextSection', () => {
    it('returns first section when nothing filled', () => {
      const next = getNextSection(STANDUP, {});
      expect(next?.id).toBe("yesterday");
    });

    it('returns second section when first is filled', () => {
      const next = getNextSection(STANDUP, { yesterday: "Done" });
      expect(next?.id).toBe("today");
    });

    it('returns null when all sections filled', () => {
      const next = getNextSection(STANDUP, {
        yesterday: "A",
        today: "B",
        blockers: "C",
      });
      expect(next).toBeNull();
    });

    it('skips to unfilled sections', () => {
      const next = getNextSection(BUG_REPORT, {
        summary: "Bug",
        steps: "1. Click",
      });
      expect(next?.id).toBe("expected");
    });
  });

  describe('built-in templates', () => {
    const builtIns = [STANDUP, BUG_REPORT];

    it('all have unique IDs', () => {
      const ids = builtIns.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all are marked builtIn', () => {
      for (const t of builtIns) {
        expect(t.builtIn).toBe(true);
      }
    });

    it('all have at least one section', () => {
      for (const t of builtIns) {
        expect(t.sections.length).toBeGreaterThan(0);
      }
    });

    it('all sections have id, label, prompt', () => {
      for (const t of builtIns) {
        for (const s of t.sections) {
          expect(s.id).toBeTruthy();
          expect(s.label).toBeTruthy();
          expect(s.prompt).toBeTruthy();
        }
      }
    });

    it('output format references all section IDs', () => {
      for (const t of builtIns) {
        for (const s of t.sections) {
          expect(t.outputFormat).toContain(`{{${s.id}}}`);
        }
      }
    });
  });

  describe('validation', () => {
    it('whitespace-only values count as empty', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "   ",
        today: "Work",
      });
      expect(result.success).toBe(false);
    });

    it('trims values before rendering', () => {
      const result = renderTemplate(STANDUP, {
        yesterday: "  Fixed bugs  ",
        today: "  Dashboard  ",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Fixed bugs");
      expect(result.output).not.toContain("  Fixed bugs  ");
    });
  });
});
