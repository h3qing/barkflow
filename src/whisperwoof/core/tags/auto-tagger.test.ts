/**
 * Tests for Smart Auto-Tagger — keyword matching and tag suggestion
 */

import { describe, it, expect } from 'vitest';

// Re-implement keyword matching for testing

const KEYWORD_RULES: Record<string, string[]> = {
  meeting: ["meeting", "standup", "sync", "call", "discussion", "agenda", "minutes", "attendees"],
  task: ["todo", "task", "action item", "need to", "should", "must", "deadline", "due", "assigned"],
  idea: ["idea", "what if", "maybe we could", "brainstorm", "concept", "proposal", "suggestion"],
  decision: ["decided", "decision", "agreed", "we're going with", "approved", "confirmed", "chose"],
  question: ["question", "wondering", "how do", "what is", "why does", "can we", "should we", "is it possible"],
  bug: ["bug", "error", "broken", "fix", "crash", "issue", "not working", "regression", "fails"],
  personal: ["remind me", "don't forget", "pick up", "call", "appointment", "doctor", "dentist", "grocery"],
  code: ["function", "class", "component", "api", "endpoint", "database", "deploy", "git", "commit", "merge"],
  finance: ["budget", "invoice", "payment", "cost", "price", "revenue", "expense", "profit", "salary"],
  design: ["design", "mockup", "wireframe", "ui", "ux", "layout", "prototype", "figma", "color", "font"],
};

interface TagSuggestion {
  tag: string;
  score: number;
  matchedKeywords: string[];
  source: string;
}

function suggestTagsByKeywords(text: string, existingTagNames: string[] = []): TagSuggestion[] {
  if (!text || text.length < 5) return [];
  const lower = text.toLowerCase();
  const suggestions: TagSuggestion[] = [];

  for (const [category, keywords] of Object.entries(KEYWORD_RULES)) {
    const matched = keywords.filter((kw) => lower.includes(kw));
    if (matched.length > 0) {
      suggestions.push({ tag: category, score: matched.length / keywords.length, matchedKeywords: matched, source: "rule" });
    }
  }

  for (const tagName of existingTagNames) {
    if (lower.includes(tagName.toLowerCase()) && tagName.length >= 3) {
      suggestions.push({ tag: tagName, score: 0.8, matchedKeywords: [tagName], source: "existing" });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}

describe('Smart Auto-Tagger', () => {
  describe('keyword rule matching', () => {
    it('detects meeting-related entries', () => {
      const tags = suggestTagsByKeywords("Notes from the standup meeting this morning with the team");
      const meetingTag = tags.find((t) => t.tag === "meeting");
      expect(meetingTag).toBeDefined();
      expect(meetingTag!.matchedKeywords).toContain("meeting");
      expect(meetingTag!.matchedKeywords).toContain("standup");
    });

    it('detects task-related entries', () => {
      const tags = suggestTagsByKeywords("I need to finish the report by the deadline tomorrow");
      const taskTag = tags.find((t) => t.tag === "task");
      expect(taskTag).toBeDefined();
      expect(taskTag!.matchedKeywords).toContain("need to");
      expect(taskTag!.matchedKeywords).toContain("deadline");
    });

    it('detects bug-related entries', () => {
      const tags = suggestTagsByKeywords("There's a bug in the login page, it's not working and crashes");
      const bugTag = tags.find((t) => t.tag === "bug");
      expect(bugTag).toBeDefined();
      expect(bugTag!.matchedKeywords.length).toBeGreaterThanOrEqual(2);
    });

    it('detects code-related entries', () => {
      const tags = suggestTagsByKeywords("Create a new component and deploy it to the api endpoint");
      const codeTag = tags.find((t) => t.tag === "code");
      expect(codeTag).toBeDefined();
    });

    it('detects decision entries', () => {
      const tags = suggestTagsByKeywords("We decided to go with the new vendor, it's confirmed and approved");
      const decisionTag = tags.find((t) => t.tag === "decision");
      expect(decisionTag).toBeDefined();
    });

    it('detects personal entries', () => {
      const tags = suggestTagsByKeywords("Remind me to pick up groceries and call the dentist");
      const personalTag = tags.find((t) => t.tag === "personal");
      expect(personalTag).toBeDefined();
    });

    it('returns multiple matching categories', () => {
      const tags = suggestTagsByKeywords("In the meeting we decided to fix the bug in the api endpoint");
      expect(tags.length).toBeGreaterThanOrEqual(2);
      const tagNames = tags.map((t) => t.tag);
      expect(tagNames).toContain("meeting");
    });

    it('returns empty for short text', () => {
      expect(suggestTagsByKeywords("hi")).toHaveLength(0);
      expect(suggestTagsByKeywords("")).toHaveLength(0);
    });

    it('caps at 5 suggestions', () => {
      // Text matching many categories
      const tags = suggestTagsByKeywords(
        "meeting task idea decision question bug personal code finance design budget api fix standup"
      );
      expect(tags.length).toBeLessThanOrEqual(5);
    });
  });

  describe('existing tag matching', () => {
    it('matches existing tag names in text', () => {
      const tags = suggestTagsByKeywords(
        "This is about the WhisperWoof project launch",
        ["WhisperWoof", "launch", "marketing"]
      );
      const existing = tags.filter((t) => t.source === "existing");
      expect(existing.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores short tag names (< 3 chars)', () => {
      const tags = suggestTagsByKeywords("This is a UI test", ["UI", "test-long-enough"]);
      const existing = tags.filter((t) => t.source === "existing");
      // "UI" is too short (2 chars), "test-long-enough" doesn't appear
      expect(existing.every((t) => t.tag.length >= 3)).toBe(true);
    });

    it('case-insensitive matching', () => {
      const tags = suggestTagsByKeywords(
        "working on the FRONTEND redesign",
        ["frontend"]
      );
      const match = tags.find((t) => t.tag === "frontend");
      expect(match).toBeDefined();
    });
  });

  describe('scoring', () => {
    it('higher keyword match ratio = higher score', () => {
      // Text with many meeting keywords
      const tags = suggestTagsByKeywords("meeting standup sync with call discussion about agenda");
      const meetingTag = tags.find((t) => t.tag === "meeting");
      expect(meetingTag!.score).toBeGreaterThan(0.5);
    });

    it('results sorted by score descending', () => {
      const tags = suggestTagsByKeywords("meeting task bug code design");
      for (let i = 1; i < tags.length; i++) {
        expect(tags[i].score).toBeLessThanOrEqual(tags[i - 1].score);
      }
    });

    it('existing tags get score 0.8', () => {
      const tags = suggestTagsByKeywords("working on frontend", ["frontend"]);
      const match = tags.find((t) => t.source === "existing");
      expect(match?.score).toBe(0.8);
    });
  });

  describe('keyword categories', () => {
    it('has 10 categories', () => {
      expect(Object.keys(KEYWORD_RULES)).toHaveLength(10);
    });

    it('each category has at least 5 keywords', () => {
      for (const [, keywords] of Object.entries(KEYWORD_RULES)) {
        expect(keywords.length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});
