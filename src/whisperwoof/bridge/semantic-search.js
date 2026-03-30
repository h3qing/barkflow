/**
 * Semantic Search — Find entries by meaning, not just keywords
 *
 * Uses TF-IDF (Term Frequency - Inverse Document Frequency) vectors
 * and cosine similarity to find entries related to a query.
 *
 * Why TF-IDF instead of neural embeddings:
 * - Zero dependencies (no model downloads, no API calls)
 * - Fast (< 50ms for 10K entries)
 * - Privacy-preserving (fully local computation)
 * - Good enough for short voice notes (< 500 words each)
 *
 * For users who want neural embeddings, they can use the
 * Ollama embedding API via the BYOM provider system.
 */

const debugLogger = require("../../helpers/debugLogger");

let db = null;

function setDatabase(database) {
  db = database;
}

// --- Text preprocessing ---

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "this", "that",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "he",
  "she", "it", "they", "them", "their", "what", "which", "who", "whom",
  "how", "when", "where", "why", "not", "no", "so", "if", "then", "than",
  "too", "very", "just", "about", "up", "out", "into", "over", "after",
  "before", "between", "under", "again", "further", "also", "here", "there",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "only", "own", "same", "as", "while", "because", "until",
]);

/**
 * Tokenize and normalize text into terms.
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Compute term frequency for a document.
 */
function termFrequency(tokens) {
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  // Normalize by document length
  const len = tokens.length || 1;
  for (const token in tf) {
    tf[token] /= len;
  }
  return tf;
}

/**
 * Compute inverse document frequency from a corpus.
 */
function inverseDocumentFrequency(corpus) {
  const df = {};
  const N = corpus.length;

  for (const doc of corpus) {
    const seen = new Set(doc);
    for (const term of seen) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf = {};
  for (const term in df) {
    idf[term] = Math.log((N + 1) / (df[term] + 1)) + 1; // Smoothed IDF
  }

  return idf;
}

/**
 * Compute TF-IDF vector for a document.
 */
function tfidfVector(tf, idf) {
  const vector = {};
  for (const term in tf) {
    if (idf[term]) {
      vector[term] = tf[term] * idf[term];
    }
  }
  return vector;
}

/**
 * Cosine similarity between two sparse vectors.
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term in vecA) {
    normA += vecA[term] * vecA[term];
    if (vecB[term]) {
      dotProduct += vecA[term] * vecB[term];
    }
  }

  for (const term in vecB) {
    normB += vecB[term] * vecB[term];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// --- Search ---

/**
 * Search entries by semantic similarity to a query.
 *
 * @param {string} query - Natural language query ("find entries about project deadlines")
 * @param {object} options - { limit, minScore, days }
 * @returns {Array<{ id, text, score, source, createdAt }>}
 */
function semanticSearch(query, options = {}) {
  if (!db) return [];
  if (!query || query.trim().length < 2) return [];

  const limit = options.limit || 20;
  const minScore = options.minScore || 0.05;
  const startTime = Date.now();

  // Fetch entries
  let sql = "SELECT id, created_at, source, raw_text, polished FROM bf_entries";
  const params = [];

  if (options.days) {
    sql += " WHERE created_at >= datetime('now', ? || ' days')";
    params.push(`-${options.days}`);
  }

  sql += " ORDER BY created_at DESC LIMIT 5000"; // Cap for performance
  const entries = db.prepare(sql).all(...params);

  if (entries.length === 0) return [];

  // Tokenize all documents
  const corpus = entries.map((e) => tokenize(e.polished || e.raw_text || ""));
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  // Compute IDF from corpus + query
  const allDocs = [...corpus, queryTokens];
  const idf = inverseDocumentFrequency(allDocs);

  // Compute query vector
  const queryTf = termFrequency(queryTokens);
  const queryVec = tfidfVector(queryTf, idf);

  // Score each entry
  const scored = entries.map((entry, idx) => {
    const docTf = termFrequency(corpus[idx]);
    const docVec = tfidfVector(docTf, idf);
    const score = cosineSimilarity(queryVec, docVec);

    return {
      id: entry.id,
      text: (entry.polished || entry.raw_text || "").slice(0, 300),
      score: Math.round(score * 1000) / 1000,
      source: entry.source,
      createdAt: entry.created_at,
    };
  });

  // Filter and sort
  const results = scored
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const elapsed = Date.now() - startTime;
  debugLogger.info("[WhisperWoof] Semantic search completed", {
    query: query.slice(0, 50),
    corpus: entries.length,
    results: results.length,
    elapsed,
  });

  return results;
}

/**
 * Find entries similar to a given entry.
 */
function findSimilar(entryId, options = {}) {
  if (!db) return [];

  const entry = db.prepare("SELECT polished, raw_text FROM bf_entries WHERE id = ?").get(entryId);
  if (!entry) return [];

  const text = entry.polished || entry.raw_text || "";
  return semanticSearch(text, { ...options, limit: options.limit || 5 })
    .filter((r) => r.id !== entryId); // Exclude self
}

module.exports = {
  setDatabase,
  semanticSearch,
  findSimilar,
  tokenize,
  termFrequency,
  inverseDocumentFrequency,
  tfidfVector,
  cosineSimilarity,
  STOP_WORDS,
};
