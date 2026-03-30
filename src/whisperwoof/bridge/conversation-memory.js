/**
 * Conversation Memory — Reference previous entries by voice
 *
 * "What did I say about the budget?" → searches entries → LLM answers
 * "When did I mention Sarah?" → finds entries mentioning Sarah
 * "What was my idea about the landing page?" → retrieves and summarizes
 *
 * Combines semantic search with LLM-powered conversational answers.
 * The user speaks a question, WhisperWoof finds relevant entries,
 * and answers based on the user's own captured history.
 *
 * Competitor: None — this is unique to WhisperWoof. No other voice
 * dictation tool lets you query your own voice history conversationally.
 */

const debugLogger = require("../../helpers/debugLogger");

// --- Memory query detection ---

const MEMORY_PATTERNS = [
  /\b(what did I|what was I)\s+(say|saying|mention|talk|talking|write|note|capture|record)\s*(about|regarding)?\b/i,
  /\b(when did I)\s+(say|mention|talk about|discuss|note)\b/i,
  /\b(did I)\s+(say|mention|talk about|note|capture)\s+(anything|something)\s+(about|regarding)\b/i,
  /\b(find|search|look for)\s+(my|what I)\s+(said|mentioned|noted|notes|captured|entries)\s+(about|regarding|on)\b/i,
  /\b(what was)\s+(my|that)\s+(idea|thought|note|comment|decision)\s+(about|regarding|on)\b/i,
  /\b(remind me)\s+(what|of what)\s+(I said|I mentioned|we discussed|I noted)\b/i,
  /\b(show me|pull up|get)\s+(my\s+)?(previous\s+|earlier\s+)?(notes?|entries?|thoughts?)\s+(about|on|regarding)\b/i,
];

/**
 * Check if spoken text is a memory query.
 */
function isMemoryQuery(text) {
  if (!text || text.length < 10) return false;
  return MEMORY_PATTERNS.some((p) => p.test(text.trim()));
}

/**
 * Extract the topic/subject from a memory query.
 * "What did I say about the budget?" → "the budget"
 */
function extractQueryTopic(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // Try to extract text after "about/regarding/on"
  const aboutMatch = trimmed.match(/\b(?:about|regarding|on)\s+(.+?)[\?\.!]?\s*$/i);
  if (aboutMatch) return aboutMatch[1].trim();

  // Fallback: extract key nouns (remove memory query boilerplate)
  const cleaned = trimmed
    .replace(/\b(what did I|what was I|when did I|did I|find|search|look for|show me|remind me)\b/gi, "")
    .replace(/\b(say|mention|talk|write|note|capture|record|said|mentioned|noted|captured)\b/gi, "")
    .replace(/\b(anything|something|about|regarding|my|that|previous|earlier)\b/gi, "")
    .replace(/[?!.]/g, "")
    .trim();

  return cleaned || null;
}

// --- Memory answer generation ---

const MEMORY_ANSWER_PROMPT =
  "You are a personal memory assistant. The user is asking about something they previously said or captured.\n\n" +
  "You have access to their relevant entries below. Answer their question based ONLY on these entries.\n\n" +
  "Rules:\n" +
  "- Answer conversationally, as if helping them remember\n" +
  "- Quote or paraphrase their actual words when possible\n" +
  "- Include dates if helpful ('On March 28th, you said...')\n" +
  "- If the entries don't contain an answer, say so honestly\n" +
  "- Keep it concise — 2-4 sentences\n" +
  "- Return ONLY the answer, no preamble";

/**
 * Answer a memory query using semantic search + LLM.
 *
 * @param {string} query - The user's spoken question
 * @param {Array} relevantEntries - Results from semantic search
 * @param {object} options - { baseUrl, model, timeoutMs }
 */
async function answerMemoryQuery(query, relevantEntries, options = {}) {
  if (!relevantEntries || relevantEntries.length === 0) {
    return {
      success: true,
      answer: "I don't have any entries matching that topic. Try being more specific, or check your history panel.",
      entriesUsed: 0,
    };
  }

  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 10000;

  // Build context from entries
  const entryContext = relevantEntries
    .slice(0, 10) // Cap at 10 entries
    .map((e, i) => `[${e.createdAt}] (${e.source}): ${e.text}`)
    .join("\n\n");

  debugLogger.info("[WhisperWoof] Memory query", {
    query: query.slice(0, 50),
    entriesFound: relevantEntries.length,
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: MEMORY_ANSWER_PROMPT },
          { role: "user", content: `Question: ${query}\n\nRelevant entries:\n${entryContext}` },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 512, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const answer = data?.message?.content?.trim() || "";

    return {
      success: true,
      answer: answer || "I found some entries but couldn't form a clear answer. Check the entries below.",
      entriesUsed: Math.min(relevantEntries.length, 10),
      entries: relevantEntries.slice(0, 5).map((e) => ({
        id: e.id,
        text: e.text.slice(0, 200),
        source: e.source,
        createdAt: e.createdAt,
        score: e.score,
      })),
    };
  } catch (err) {
    return { success: false, error: err.name === "AbortError" ? "Timeout" : err.message };
  }
}

/**
 * Get available memory query patterns (for help).
 */
function getMemoryQueryExamples() {
  return [
    "What did I say about the budget?",
    "When did I mention Sarah?",
    "What was my idea about the landing page?",
    "Did I say anything about the deadline?",
    "Find what I noted about the deployment",
    "Remind me what I said about the new feature",
    "Show me my earlier notes on the project",
  ];
}

module.exports = {
  isMemoryQuery,
  extractQueryTopic,
  answerMemoryQuery,
  getMemoryQueryExamples,
  MEMORY_PATTERNS,
};
