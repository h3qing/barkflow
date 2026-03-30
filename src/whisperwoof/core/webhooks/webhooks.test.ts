/**
 * Tests for Webhook Integration — payload, signing, filtering, validation
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

// Re-implement pure logic for testing

interface WebhookFilters {
  sources: string[] | null;
  tags: string[] | null;
  projects: string[] | null;
}

interface Entry {
  id: string;
  source: string;
  tags: string[];
  projectId: string | null;
  rawText: string;
  polished: string | null;
  createdAt: string;
  routedTo: string | null;
  metadata: Record<string, unknown>;
}

function buildPayload(entry: Entry) {
  return {
    event: "entry.created",
    timestamp: new Date().toISOString(),
    data: {
      id: entry.id,
      createdAt: entry.createdAt,
      source: entry.source,
      text: entry.polished || entry.rawText || "",
      rawText: entry.rawText || null,
      routedTo: entry.routedTo || null,
      projectId: entry.projectId || null,
      tags: entry.tags || [],
      metadata: entry.metadata || {},
    },
  };
}

function signPayload(payload: any, secret: string | null): string | null {
  if (!secret) return null;
  const body = JSON.stringify(payload);
  return createHmac("sha256", secret).update(body).digest("hex");
}

function matchesFilters(entry: Entry, filters: WebhookFilters | null): boolean {
  if (!filters) return true;
  if (filters.sources && filters.sources.length > 0) {
    if (!filters.sources.includes(entry.source)) return false;
  }
  if (filters.tags && filters.tags.length > 0) {
    if (!filters.tags.some((t) => entry.tags.includes(t))) return false;
  }
  if (filters.projects && filters.projects.length > 0) {
    if (!filters.projects.includes(entry.projectId!)) return false;
  }
  return true;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const SAMPLE_ENTRY: Entry = {
  id: "e1",
  source: "voice",
  tags: ["tag-1", "tag-2"],
  projectId: "proj-1",
  rawText: "um so I need to call Sarah",
  polished: "I need to call Sarah.",
  createdAt: "2026-03-30T10:00:00Z",
  routedTo: "paste-at-cursor",
  metadata: {},
};

describe('Webhook Integration', () => {
  describe('buildPayload', () => {
    it('builds correct Zapier-compatible payload', () => {
      const payload = buildPayload(SAMPLE_ENTRY);
      expect(payload.event).toBe("entry.created");
      expect(payload.data.id).toBe("e1");
      expect(payload.data.source).toBe("voice");
      expect(payload.data.text).toBe("I need to call Sarah."); // polished preferred
      expect(payload.data.rawText).toBe("um so I need to call Sarah");
      expect(payload.data.tags).toEqual(["tag-1", "tag-2"]);
    });

    it('uses rawText when no polished', () => {
      const entry = { ...SAMPLE_ENTRY, polished: null };
      const payload = buildPayload(entry);
      expect(payload.data.text).toBe("um so I need to call Sarah");
    });

    it('includes timestamp', () => {
      const payload = buildPayload(SAMPLE_ENTRY);
      expect(payload.timestamp).toBeTruthy();
      expect(() => new Date(payload.timestamp)).not.toThrow();
    });
  });

  describe('signPayload', () => {
    it('returns null when no secret', () => {
      expect(signPayload({ test: true }, null)).toBeNull();
    });

    it('returns HMAC-SHA256 hex string when secret provided', () => {
      const sig = signPayload({ test: true }, "my-secret");
      expect(sig).toBeTruthy();
      expect(sig!.length).toBe(64); // SHA256 hex = 64 chars
    });

    it('produces consistent signatures', () => {
      const payload = { data: "hello" };
      const sig1 = signPayload(payload, "secret");
      const sig2 = signPayload(payload, "secret");
      expect(sig1).toBe(sig2);
    });

    it('different secrets produce different signatures', () => {
      const payload = { data: "hello" };
      const sig1 = signPayload(payload, "secret1");
      const sig2 = signPayload(payload, "secret2");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('matchesFilters', () => {
    it('matches when no filters (null)', () => {
      expect(matchesFilters(SAMPLE_ENTRY, null)).toBe(true);
    });

    it('matches when all filters are null', () => {
      expect(matchesFilters(SAMPLE_ENTRY, { sources: null, tags: null, projects: null })).toBe(true);
    });

    it('filters by source', () => {
      expect(matchesFilters(SAMPLE_ENTRY, { sources: ["voice"], tags: null, projects: null })).toBe(true);
      expect(matchesFilters(SAMPLE_ENTRY, { sources: ["clipboard"], tags: null, projects: null })).toBe(false);
    });

    it('filters by tag', () => {
      expect(matchesFilters(SAMPLE_ENTRY, { sources: null, tags: ["tag-1"], projects: null })).toBe(true);
      expect(matchesFilters(SAMPLE_ENTRY, { sources: null, tags: ["tag-999"], projects: null })).toBe(false);
    });

    it('filters by project', () => {
      expect(matchesFilters(SAMPLE_ENTRY, { sources: null, tags: null, projects: ["proj-1"] })).toBe(true);
      expect(matchesFilters(SAMPLE_ENTRY, { sources: null, tags: null, projects: ["proj-999"] })).toBe(false);
    });

    it('combines filters (AND logic)', () => {
      expect(matchesFilters(SAMPLE_ENTRY, { sources: ["voice"], tags: ["tag-1"], projects: ["proj-1"] })).toBe(true);
      expect(matchesFilters(SAMPLE_ENTRY, { sources: ["clipboard"], tags: ["tag-1"], projects: ["proj-1"] })).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('accepts https URLs', () => {
      expect(isValidUrl("https://hooks.zapier.com/1234")).toBe(true);
      expect(isValidUrl("https://n8n.example.com/webhook/abc")).toBe(true);
    });

    it('accepts http URLs', () => {
      expect(isValidUrl("http://localhost:5678/webhook")).toBe(true);
    });

    it('rejects non-http protocols', () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("file:///etc/passwd")).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });
});
