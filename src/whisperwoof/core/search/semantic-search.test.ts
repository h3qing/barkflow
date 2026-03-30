/**
 * Tests for Semantic Search — TF-IDF vectorization and cosine similarity
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure math for testing

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "i", "me", "my", "we", "you", "he", "she", "it", "they", "this", "that",
  "not", "no", "so", "if", "as", "just", "about", "all", "also", "over",
  "up", "out", "into", "after", "before", "between", "under",
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const len = tokens.length || 1;
  for (const t in tf) tf[t] /= len;
  return tf;
}

function inverseDocumentFrequency(corpus: string[][]): Record<string, number> {
  const df: Record<string, number> = {};
  const N = corpus.length;
  for (const doc of corpus) {
    for (const term of new Set(doc)) df[term] = (df[term] || 0) + 1;
  }
  const idf: Record<string, number> = {};
  for (const term in df) idf[term] = Math.log((N + 1) / (df[term] + 1)) + 1;
  return idf;
}

function tfidfVector(tf: Record<string, number>, idf: Record<string, number>): Record<string, number> {
  const vec: Record<string, number> = {};
  for (const term in tf) if (idf[term]) vec[term] = tf[term] * idf[term];
  return vec;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const t in a) { normA += a[t] * a[t]; if (b[t]) dot += a[t] * b[t]; }
  for (const t in b) normB += b[t] * b[t];
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

describe('Semantic Search', () => {
  describe('tokenize', () => {
    it('lowercases and splits on whitespace', () => {
      expect(tokenize("Hello World")).toEqual(["hello", "world"]);
    });

    it('removes stop words', () => {
      const tokens = tokenize("The quick brown fox jumps over the lazy dog");
      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("over");
      expect(tokens).toContain("quick");
      expect(tokens).toContain("brown");
    });

    it('removes punctuation', () => {
      expect(tokenize("hello, world! how's it?")).toEqual(["hello", "world", "how"]);
    });

    it('filters short words (< 2 chars)', () => {
      expect(tokenize("I a am ok go")).toEqual(["am", "ok", "go"]);
    });

    it('returns empty for null/empty', () => {
      expect(tokenize("")).toEqual([]);
      expect(tokenize(null as any)).toEqual([]);
    });
  });

  describe('termFrequency', () => {
    it('computes normalized frequency', () => {
      const tf = termFrequency(["hello", "world", "hello"]);
      expect(tf.hello).toBeCloseTo(2 / 3);
      expect(tf.world).toBeCloseTo(1 / 3);
    });

    it('handles single token', () => {
      const tf = termFrequency(["test"]);
      expect(tf.test).toBe(1);
    });

    it('handles empty', () => {
      expect(termFrequency([])).toEqual({});
    });
  });

  describe('inverseDocumentFrequency', () => {
    it('rare terms get higher IDF', () => {
      const corpus = [
        ["hello", "world"],
        ["hello", "earth"],
        ["hello", "mars"],
      ];
      const idf = inverseDocumentFrequency(corpus);
      // "hello" appears in all 3 docs, "mars" in 1
      expect(idf.mars).toBeGreaterThan(idf.hello);
    });

    it('common terms get lower IDF', () => {
      const corpus = [["common"], ["common"], ["common"], ["rare"]];
      const idf = inverseDocumentFrequency(corpus);
      expect(idf.common).toBeLessThan(idf.rare);
    });
  });

  describe('cosineSimilarity', () => {
    it('identical vectors = 1.0', () => {
      const v = { hello: 1, world: 1 };
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('orthogonal vectors = 0.0', () => {
      const a = { hello: 1 };
      const b = { world: 1 };
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('partially overlapping vectors > 0', () => {
      const a = { hello: 1, world: 1 };
      const b = { hello: 1, mars: 1 };
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('empty vectors = 0', () => {
      expect(cosineSimilarity({}, {})).toBe(0);
      expect(cosineSimilarity({ a: 1 }, {})).toBe(0);
    });
  });

  describe('end-to-end similarity', () => {
    const docs = [
      "We need to fix the bug in the login page authentication",
      "Schedule a meeting with the design team for next week",
      "The login authentication system has a critical error that needs fixing",
      "Buy groceries and pick up the kids from school",
    ];

    function searchDocs(query: string): number[] {
      const corpus = docs.map(tokenize);
      const queryTokens = tokenize(query);
      const allDocs = [...corpus, queryTokens];
      const idf = inverseDocumentFrequency(allDocs);
      const queryVec = tfidfVector(termFrequency(queryTokens), idf);

      return corpus.map((docTokens) => {
        const docVec = tfidfVector(termFrequency(docTokens), idf);
        return Math.round(cosineSimilarity(queryVec, docVec) * 1000) / 1000;
      });
    }

    it('bug-related query matches bug-related docs highest', () => {
      const scores = searchDocs("authentication bug fix");
      // Docs 0 and 2 are about bugs/auth, should score highest
      expect(scores[0]).toBeGreaterThan(scores[1]); // bug doc > meeting doc
      expect(scores[2]).toBeGreaterThan(scores[1]); // auth error doc > meeting doc
      expect(scores[0]).toBeGreaterThan(scores[3]); // bug doc > groceries doc
    });

    it('meeting query matches meeting doc highest', () => {
      const scores = searchDocs("meeting schedule team");
      expect(scores[1]).toBeGreaterThan(scores[0]); // meeting doc > bug doc
      expect(scores[1]).toBeGreaterThan(scores[3]); // meeting doc > groceries doc
    });

    it('unrelated query scores low across all docs', () => {
      const scores = searchDocs("quantum physics lecture notes");
      expect(scores.every((s) => s < 0.3)).toBe(true);
    });
  });

  describe('stop words', () => {
    it('has common English stop words', () => {
      expect(STOP_WORDS.has("the")).toBe(true);
      expect(STOP_WORDS.has("and")).toBe(true);
      expect(STOP_WORDS.has("is")).toBe(true);
    });

    it('does not include content words', () => {
      expect(STOP_WORDS.has("meeting")).toBe(false);
      expect(STOP_WORDS.has("bug")).toBe(false);
      expect(STOP_WORDS.has("design")).toBe(false);
    });
  });
});
