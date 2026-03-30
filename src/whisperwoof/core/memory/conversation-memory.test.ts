/**
 * Tests for Conversation Memory — query detection and topic extraction
 */

import { describe, it, expect } from 'vitest';

const MEMORY_PATTERNS = [
  /\b(what did I|what was I)\s+(say|saying|mention|talk|talking|write|note|capture|record)\s*(about|regarding)?\b/i,
  /\b(when did I)\s+(say|mention|talk about|discuss|note)\b/i,
  /\b(did I)\s+(say|mention|talk about|note|capture)\s+(anything|something)\s+(about|regarding)\b/i,
  /\b(find|search|look for)\s+(my|what I)\s+(said|mentioned|noted|notes|captured|entries)\s+(about|regarding|on)\b/i,
  /\b(what was)\s+(my|that)\s+(idea|thought|note|comment|decision)\s+(about|regarding|on)\b/i,
  /\b(remind me)\s+(what|of what)\s+(I said|I mentioned|we discussed|I noted)\b/i,
  /\b(show me|pull up|get)\s+(my\s+)?(previous\s+|earlier\s+)?(notes?|entries?|thoughts?)\s+(about|on|regarding)\b/i,
];

function isMemoryQuery(text: string | null): boolean {
  if (!text || text.length < 10) return false;
  return MEMORY_PATTERNS.some((p) => p.test(text.trim()));
}

function extractQueryTopic(text: string | null): string | null {
  if (!text) return null;
  const aboutMatch = text.trim().match(/\b(?:about|regarding|on)\s+(.+?)[\?\.!]?\s*$/i);
  if (aboutMatch) return aboutMatch[1].trim();
  return null;
}

describe('Conversation Memory', () => {
  describe('isMemoryQuery', () => {
    it('detects "what did I say about" queries', () => {
      expect(isMemoryQuery("What did I say about the budget?")).toBe(true);
      expect(isMemoryQuery("What did I mention about the deadline?")).toBe(true);
      expect(isMemoryQuery("What was I saying about the project?")).toBe(true);
    });

    it('detects "when did I" queries', () => {
      expect(isMemoryQuery("When did I mention Sarah?")).toBe(true);
      expect(isMemoryQuery("When did I talk about the deployment?")).toBe(true);
    });

    it('detects "did I say anything about" queries', () => {
      expect(isMemoryQuery("Did I say anything about the marketing plan?")).toBe(true);
      expect(isMemoryQuery("Did I mention something about Friday?")).toBe(true);
    });

    it('detects "find/search" queries', () => {
      expect(isMemoryQuery("Find what I said about the redesign")).toBe(true);
      expect(isMemoryQuery("Search my notes about the API redesign")).toBe(true);
    });

    it('detects "what was my idea" queries', () => {
      expect(isMemoryQuery("What was my idea about the landing page?")).toBe(true);
      expect(isMemoryQuery("What was that decision regarding pricing?")).toBe(true);
    });

    it('detects "remind me" queries', () => {
      expect(isMemoryQuery("Remind me what I said about the timeline")).toBe(true);
      expect(isMemoryQuery("Remind me of what we discussed")).toBe(true);
    });

    it('detects "show me" queries', () => {
      expect(isMemoryQuery("Show me my notes about the meeting")).toBe(true);
      expect(isMemoryQuery("Pull up my earlier thoughts on the design")).toBe(true);
    });

    it('returns false for non-memory queries', () => {
      expect(isMemoryQuery("Schedule a meeting for Friday")).toBe(false);
      expect(isMemoryQuery("I need to buy groceries")).toBe(false);
      expect(isMemoryQuery("Create a function for the API")).toBe(false);
      expect(isMemoryQuery("Summarize this")).toBe(false);
    });

    it('returns false for short/null input', () => {
      expect(isMemoryQuery("")).toBe(false);
      expect(isMemoryQuery(null)).toBe(false);
      expect(isMemoryQuery("hello")).toBe(false);
    });
  });

  describe('extractQueryTopic', () => {
    it('extracts topic after "about"', () => {
      expect(extractQueryTopic("What did I say about the budget?")).toBe("the budget");
      expect(extractQueryTopic("When did I mention about Sarah?")).toBe("Sarah");
    });

    it('extracts topic after "regarding"', () => {
      expect(extractQueryTopic("What was the decision regarding pricing?")).toBe("pricing");
    });

    it('extracts topic after "on"', () => {
      expect(extractQueryTopic("Show me my notes on the deployment")).toBe("the deployment");
    });

    it('strips trailing punctuation', () => {
      expect(extractQueryTopic("What did I say about the project?")).toBe("the project");
      expect(extractQueryTopic("What about the timeline!")).toBe("the timeline");
    });

    it('returns null for no topic', () => {
      expect(extractQueryTopic("What did I say")).toBeNull();
      expect(extractQueryTopic("")).toBeNull();
      expect(extractQueryTopic(null)).toBeNull();
    });
  });

  describe('memory query examples', () => {
    const examples = [
      "What did I say about the budget?",
      "When did I mention Sarah?",
      "What was my idea about the landing page?",
      "Did I say anything about the deadline?",
      "Find what I noted about the deployment",
      "Remind me what I said about the new feature",
      "Show me my earlier notes on the project",
    ];

    it('all examples are detected as memory queries', () => {
      for (const ex of examples) {
        expect(isMemoryQuery(ex)).toBe(true);
      }
    });

    it('has 7 examples', () => {
      expect(examples).toHaveLength(7);
    });
  });
});
