/**
 * Focus Mode — Voice-powered productivity sprints
 *
 * Timed focus sessions where the user captures thoughts via voice.
 * After the session ends, WhisperWoof summarizes everything captured.
 *
 * Unique to WhisperWoof — no competitor (Wispr Flow, SuperWhisper,
 * Aqua Voice, DictaFlow) has a built-in focus mode.
 *
 * Features:
 * - Configurable sprint duration (5/15/25/45/60 min)
 * - Auto-tags all entries during the session
 * - Session summary via LLM at the end
 * - Do Not Disturb integration (suppress notifications)
 * - Entry count + word count tracking
 * - Session history for streak tracking
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-focus-sessions.json
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const SESSIONS_FILE = path.join(app.getPath("userData"), "whisperwoof-focus-sessions.json");
const MAX_SESSIONS = 500;

// --- Preset durations ---

const SPRINT_PRESETS = [
  { id: "quick", name: "Quick Capture", durationMin: 5, description: "5 min — rapid brain dump" },
  { id: "short", name: "Short Sprint", durationMin: 15, description: "15 min — focused note-taking" },
  { id: "pomodoro", name: "Pomodoro", durationMin: 25, description: "25 min — classic focus session" },
  { id: "deep", name: "Deep Work", durationMin: 45, description: "45 min — extended thinking" },
  { id: "marathon", name: "Marathon", durationMin: 60, description: "60 min — long creative session" },
];

// --- Active session (in-memory, one at a time) ---

let activeSession = null;

/**
 * Start a new focus session.
 *
 * @param {object} options
 * @param {number} options.durationMin - Sprint length in minutes
 * @param {string} options.goal - What the user wants to accomplish (optional)
 * @param {string} options.presetId - One of the SPRINT_PRESETS ids (optional)
 * @returns {{ success: boolean, session?: object, error?: string }}
 */
function startSession(options = {}) {
  if (activeSession) {
    return { success: false, error: "A focus session is already active" };
  }

  const durationMin = options.durationMin || 25;
  if (durationMin < 1 || durationMin > 180) {
    return { success: false, error: "Duration must be 1-180 minutes" };
  }

  activeSession = {
    id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    durationMin,
    goal: (options.goal || "").trim() || null,
    presetId: options.presetId || null,
    entryIds: [],
    wordCount: 0,
    isActive: true,
    endedAt: null,
    summary: null,
  };

  debugLogger.info("[WhisperWoof] Focus session started", {
    id: activeSession.id,
    durationMin,
    goal: activeSession.goal,
  });

  return { success: true, session: { ...activeSession } };
}

/**
 * Record an entry captured during the active focus session.
 */
function recordEntry(entryId, wordCount = 0) {
  if (!activeSession || !activeSession.isActive) return false;

  activeSession = {
    ...activeSession,
    entryIds: [...activeSession.entryIds, entryId],
    wordCount: activeSession.wordCount + wordCount,
  };

  return true;
}

/**
 * End the active focus session.
 *
 * @param {string|null} summary - LLM-generated summary of the session (optional)
 * @returns {{ success: boolean, session?: object }}
 */
function endSession(summary = null) {
  if (!activeSession) {
    return { success: false, error: "No active focus session" };
  }

  const completed = {
    ...activeSession,
    isActive: false,
    endedAt: new Date().toISOString(),
    summary: summary || null,
    actualDurationMin: Math.round(
      (Date.now() - new Date(activeSession.startedAt).getTime()) / 60000
    ),
  };

  // Save to history
  const sessions = loadSessions();
  sessions.push(completed);
  const pruned = sessions.length > MAX_SESSIONS
    ? sessions.slice(sessions.length - MAX_SESSIONS)
    : sessions;
  saveSessions(pruned);

  activeSession = null;

  debugLogger.info("[WhisperWoof] Focus session ended", {
    id: completed.id,
    entries: completed.entryIds.length,
    wordCount: completed.wordCount,
    actualMin: completed.actualDurationMin,
  });

  return { success: true, session: completed };
}

/**
 * Get the current active session (or null).
 */
function getActiveSession() {
  if (!activeSession) return null;

  // Check if session has expired (over duration)
  const elapsedMin = (Date.now() - new Date(activeSession.startedAt).getTime()) / 60000;
  const remaining = Math.max(0, activeSession.durationMin - elapsedMin);

  return {
    ...activeSession,
    elapsedMin: Math.round(elapsedMin * 10) / 10,
    remainingMin: Math.round(remaining * 10) / 10,
    isExpired: remaining <= 0,
  };
}

/**
 * Check if a focus session is currently active.
 */
function isSessionActive() {
  return activeSession !== null && activeSession.isActive;
}

// --- Session history ---

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load focus sessions", { error: err.message });
  }
  return [];
}

function saveSessions(sessions) {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save focus sessions", { error: err.message });
  }
}

/**
 * Get session history with optional filters.
 */
function getSessionHistory(options = {}) {
  let sessions = loadSessions();

  if (options.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - options.days);
    sessions = sessions.filter((s) => new Date(s.startedAt) >= cutoff);
  }

  if (options.limit) {
    sessions = sessions.slice(-options.limit);
  }

  return sessions;
}

/**
 * Get focus stats (for analytics dashboard).
 */
function getFocusStats() {
  const sessions = loadSessions();
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalMinutes: 0,
      totalWords: 0,
      totalEntries: 0,
      avgDuration: 0,
      completionRate: 0,
      currentStreak: 0,
    };
  }

  const totalMin = sessions.reduce((sum, s) => sum + (s.actualDurationMin || 0), 0);
  const totalWords = sessions.reduce((sum, s) => sum + (s.wordCount || 0), 0);
  const totalEntries = sessions.reduce((sum, s) => sum + (s.entryIds?.length || 0), 0);
  const completed = sessions.filter((s) =>
    s.actualDurationMin >= s.durationMin * 0.8 // 80% of target = "completed"
  ).length;

  // Current streak (days with at least one session)
  const sessionDays = new Set(sessions.map((s) => s.startedAt.split("T")[0]));
  const sortedDays = Array.from(sessionDays).sort().reverse();
  const today = new Date().toISOString().split("T")[0];

  let streak = 0;
  let checkDate = today;
  for (const day of sortedDays) {
    if (day === checkDate) {
      streak++;
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split("T")[0];
    } else if (day < checkDate) {
      break;
    }
  }

  return {
    totalSessions: sessions.length,
    totalMinutes: totalMin,
    totalWords: totalWords,
    totalEntries: totalEntries,
    avgDuration: Math.round(totalMin / sessions.length),
    completionRate: Math.round((completed / sessions.length) * 100),
    currentStreak: streak,
  };
}

/**
 * Get available sprint presets.
 */
function getSprintPresets() {
  return [...SPRINT_PRESETS];
}

module.exports = {
  startSession,
  endSession,
  recordEntry,
  getActiveSession,
  isSessionActive,
  getSessionHistory,
  getFocusStats,
  getSprintPresets,
  SPRINT_PRESETS,
};
