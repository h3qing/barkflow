/**
 * Custom Vocabulary Manager — User-managed word/phrase dictionary
 *
 * Extends OpenWhispr's AutoLearn dictionary with:
 * - Categories (names, technical, abbreviations, general)
 * - Pronunciation hints (how the STT might hear it)
 * - Usage tracking (how often each word appears in transcripts)
 * - Bulk import/export
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-vocabulary.json
 * Also syncs to OpenWhispr's custom_dictionary table for STT hints.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const VOCAB_FILE = path.join(app.getPath("userData"), "whisperwoof-vocabulary.json");
const MAX_ENTRIES = 1000;

/**
 * @typedef {Object} VocabEntry
 * @property {string} id
 * @property {string} word - The correct spelling/form
 * @property {string} category - names | technical | abbreviation | general
 * @property {string[]} alternatives - How STT might transcribe it (phonetic variants)
 * @property {string} createdAt
 * @property {string} source - manual | auto-learn | import
 * @property {number} usageCount
 */

function loadVocabulary() {
  try {
    if (fs.existsSync(VOCAB_FILE)) {
      const data = JSON.parse(fs.readFileSync(VOCAB_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load vocabulary", { error: err.message });
  }
  return [];
}

function saveVocabulary(entries) {
  try {
    fs.writeFileSync(VOCAB_FILE, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save vocabulary", { error: err.message });
  }
}

// --- CRUD ---

function getVocabulary(options = {}) {
  let entries = loadVocabulary();

  if (options.category) {
    entries = entries.filter((e) => e.category === options.category);
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    entries = entries.filter((e) =>
      e.word.toLowerCase().includes(q) ||
      (e.alternatives || []).some((a) => a.toLowerCase().includes(q))
    );
  }
  if (options.sortBy === "usage") {
    entries = [...entries].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  } else {
    entries = [...entries].sort((a, b) => a.word.localeCompare(b.word));
  }

  return entries;
}

function addWord(word, options = {}) {
  if (!word || !word.trim()) return { success: false, error: "Word is required" };

  const trimmed = word.trim();
  const entries = loadVocabulary();

  // Dedup
  if (entries.some((e) => e.word.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: `"${trimmed}" already exists` };
  }

  if (entries.length >= MAX_ENTRIES) {
    return { success: false, error: `Maximum ${MAX_ENTRIES} vocabulary entries reached` };
  }

  const entry = {
    id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    word: trimmed,
    category: options.category || "general",
    alternatives: (options.alternatives || []).map((a) => a.trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
    source: options.source || "manual",
    usageCount: 0,
  };

  const updated = [...entries, entry];
  saveVocabulary(updated);

  debugLogger.info("[WhisperWoof] Vocabulary word added", { word: trimmed, category: entry.category });
  return { success: true, entry };
}

function updateWord(id, updates) {
  const entries = loadVocabulary();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return { success: false, error: "Word not found" };

  const allowed = {};
  if (updates.word !== undefined) allowed.word = updates.word.trim();
  if (updates.category !== undefined) allowed.category = updates.category;
  if (updates.alternatives !== undefined) {
    allowed.alternatives = updates.alternatives.map((a) => a.trim()).filter(Boolean);
  }

  // Check uniqueness if word changed
  if (allowed.word && allowed.word.toLowerCase() !== entries[idx].word.toLowerCase()) {
    if (entries.some((e, i) => i !== idx && e.word.toLowerCase() === allowed.word.toLowerCase())) {
      return { success: false, error: `"${allowed.word}" already exists` };
    }
  }

  const updated = [...entries];
  updated[idx] = { ...updated[idx], ...allowed };
  saveVocabulary(updated);

  return { success: true, entry: updated[idx] };
}

function removeWord(id) {
  const entries = loadVocabulary();
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) {
    return { success: false, error: "Word not found" };
  }
  saveVocabulary(filtered);
  return { success: true };
}

function removeAllWords() {
  saveVocabulary([]);
  return { success: true };
}

// --- Bulk operations ---

function importWords(words, category = "general") {
  if (!Array.isArray(words)) return { success: false, error: "Words must be an array" };

  const entries = loadVocabulary();
  const existing = new Set(entries.map((e) => e.word.toLowerCase()));
  let added = 0;

  const newEntries = [];
  for (const word of words) {
    const trimmed = (typeof word === "string" ? word : word?.word || "").trim();
    if (!trimmed || existing.has(trimmed.toLowerCase())) continue;
    if (entries.length + newEntries.length >= MAX_ENTRIES) break;

    existing.add(trimmed.toLowerCase());
    newEntries.push({
      id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      word: trimmed,
      category: typeof word === "object" ? (word.category || category) : category,
      alternatives: typeof word === "object" ? (word.alternatives || []) : [],
      createdAt: new Date().toISOString(),
      source: "import",
      usageCount: 0,
    });
    added++;
  }

  if (newEntries.length > 0) {
    saveVocabulary([...entries, ...newEntries]);
  }

  return { success: true, added, total: entries.length + newEntries.length };
}

function exportWords() {
  return loadVocabulary();
}

// --- Usage tracking ---

function incrementUsage(word) {
  const entries = loadVocabulary();
  const normalizedWord = word.trim().toLowerCase();

  const idx = entries.findIndex((e) => e.word.toLowerCase() === normalizedWord);
  if (idx === -1) return;

  const updated = [...entries];
  updated[idx] = { ...updated[idx], usageCount: (updated[idx].usageCount || 0) + 1 };
  saveVocabulary(updated);
}

// --- STT hint list ---

/**
 * Get a flat list of all words + alternatives for STT hint injection.
 * This gets passed to the Whisper prompt to improve recognition accuracy.
 */
function getSttHints() {
  const entries = loadVocabulary();
  const hints = new Set();

  for (const entry of entries) {
    hints.add(entry.word);
    for (const alt of entry.alternatives || []) {
      hints.add(alt);
    }
  }

  return Array.from(hints);
}

/**
 * Get vocabulary stats.
 */
function getVocabularyStats() {
  const entries = loadVocabulary();
  const categories = {};
  for (const entry of entries) {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
  }

  return {
    total: entries.length,
    max: MAX_ENTRIES,
    categories,
    topUsed: [...entries].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 5).map((e) => ({
      word: e.word,
      usageCount: e.usageCount || 0,
    })),
  };
}

module.exports = {
  getVocabulary,
  addWord,
  updateWord,
  removeWord,
  removeAllWords,
  importWords,
  exportWords,
  incrementUsage,
  getSttHints,
  getVocabularyStats,
};
