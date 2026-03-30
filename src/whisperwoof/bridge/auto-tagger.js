/**
 * Smart Auto-Tagger — LLM-powered automatic entry tagging
 *
 * Analyzes entry text and suggests or applies tags based on content.
 * Two modes:
 * 1. Rule-based (fast, no LLM) — keyword matching against existing tags
 * 2. LLM-based (smart, async) — asks the LLM to categorize content
 *
 * Can run automatically on new entries or on-demand for existing ones.
 */

const debugLogger = require("../../helpers/debugLogger");

// --- Rule-based tagging (fast, no LLM) ---

/**
 * Keyword categories for rule-based tagging.
 * Maps category names to keyword arrays.
 */
const KEYWORD_RULES = {
  "meeting": ["meeting", "standup", "sync", "call", "discussion", "agenda", "minutes", "attendees"],
  "task": ["todo", "task", "action item", "need to", "should", "must", "deadline", "due", "assigned"],
  "idea": ["idea", "what if", "maybe we could", "brainstorm", "concept", "proposal", "suggestion"],
  "decision": ["decided", "decision", "agreed", "we're going with", "approved", "confirmed", "chose"],
  "question": ["question", "wondering", "how do", "what is", "why does", "can we", "should we", "is it possible"],
  "bug": ["bug", "error", "broken", "fix", "crash", "issue", "not working", "regression", "fails"],
  "personal": ["remind me", "don't forget", "pick up", "call", "appointment", "doctor", "dentist", "grocery"],
  "code": ["function", "class", "component", "api", "endpoint", "database", "deploy", "git", "commit", "merge"],
  "finance": ["budget", "invoice", "payment", "cost", "price", "revenue", "expense", "profit", "salary"],
  "design": ["design", "mockup", "wireframe", "ui", "ux", "layout", "prototype", "figma", "color", "font"],
};

/**
 * Suggest tags based on keyword matching.
 * Returns scored suggestions sorted by relevance.
 *
 * @param {string} text - Entry text to analyze
 * @param {string[]} existingTagNames - Names of tags that already exist (to match against)
 * @returns {Array<{tag: string, score: number, matchedKeywords: string[]}>}
 */
function suggestTagsByKeywords(text, existingTagNames = []) {
  if (!text || text.length < 5) return [];

  const lower = text.toLowerCase();
  const suggestions = [];

  // Match against built-in keyword rules
  for (const [category, keywords] of Object.entries(KEYWORD_RULES)) {
    const matched = keywords.filter((kw) => lower.includes(kw));
    if (matched.length > 0) {
      const score = matched.length / keywords.length;
      suggestions.push({ tag: category, score, matchedKeywords: matched, source: "rule" });
    }
  }

  // Match against existing user tags (by name substring)
  for (const tagName of existingTagNames) {
    if (lower.includes(tagName.toLowerCase()) && tagName.length >= 3) {
      suggestions.push({ tag: tagName, score: 0.8, matchedKeywords: [tagName], source: "existing" });
    }
  }

  // Sort by score descending, cap at 5
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// --- LLM-based tagging (smart, async) ---

const AUTO_TAG_PROMPT =
  "You are a content classifier. Given a voice note or text entry, suggest 1-3 relevant tags.\n\n" +
  "Rules:\n" +
  "- Tags should be short (1-2 words), lowercase\n" +
  "- Pick from common categories: meeting, task, idea, decision, question, personal, code, design, finance, bug\n" +
  "- Only suggest tags that clearly match the content\n" +
  "- If the text is too short or unclear, suggest 'note' as a fallback\n" +
  "- Return ONLY a comma-separated list of tags, nothing else\n" +
  "- Example: 'task, code' or 'meeting, decision' or 'personal'";

/**
 * Suggest tags using LLM analysis.
 *
 * @param {string} text - Entry text
 * @param {object} options - { baseUrl, model, timeoutMs }
 * @returns {{ tags: string[], generated: boolean, error?: string }}
 */
async function suggestTagsByLlm(text, options = {}) {
  if (!text || text.length < 10) {
    return { tags: ["note"], generated: false };
  }

  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AUTO_TAG_PROMPT },
          { role: "user", content: text.slice(0, 500) },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 64, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { tags: [], generated: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const raw = data?.message?.content?.trim() || "";

    // Parse comma-separated tags
    const tags = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && t.length <= 30);

    if (tags.length === 0) {
      return { tags: ["note"], generated: true };
    }

    debugLogger.info("[WhisperWoof] Auto-tag suggestions", { tags, inputLen: text.length });
    return { tags, generated: true };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    return { tags: [], generated: false, error: message };
  }
}

/**
 * Combined auto-tag: try rules first, fall back to LLM if needed.
 *
 * @param {string} text
 * @param {string[]} existingTagNames
 * @param {object} options - { useLlm, baseUrl, model, timeoutMs }
 */
async function autoTag(text, existingTagNames = [], options = {}) {
  // Fast path: keyword rules
  const ruleSuggestions = suggestTagsByKeywords(text, existingTagNames);

  // If rules found good matches (score > 0.3), use them
  const goodRuleTags = ruleSuggestions.filter((s) => s.score >= 0.3);
  if (goodRuleTags.length > 0 || options.useLlm === false) {
    return {
      tags: goodRuleTags.map((s) => s.tag),
      source: "rules",
      suggestions: ruleSuggestions,
    };
  }

  // Slow path: LLM
  const llmResult = await suggestTagsByLlm(text, options);
  return {
    tags: llmResult.tags,
    source: llmResult.generated ? "llm" : "fallback",
    suggestions: ruleSuggestions,
    llmResult,
  };
}

module.exports = {
  suggestTagsByKeywords,
  suggestTagsByLlm,
  autoTag,
  KEYWORD_RULES,
  AUTO_TAG_PROMPT,
};
