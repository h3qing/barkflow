/**
 * Usage Analytics — Dashboard data from bf_entries
 *
 * Queries the SQLite database for usage patterns, trends, and insights.
 * All computation is done in SQL for performance (handles 10K+ entries).
 *
 * Returns pre-computed dashboard data — no raw entries exposed.
 */

const debugLogger = require("../../helpers/debugLogger");

let db = null;

/**
 * Set the database reference (called from app-init).
 */
function setDatabase(database) {
  db = database;
}

/**
 * Get the full analytics dashboard payload.
 * Single call returns all metrics — avoids multiple IPC round-trips.
 */
function getDashboard(options = {}) {
  if (!db) return getEmptyDashboard();

  const days = options.days || 30;

  try {
    return {
      summary: getSummary(),
      entriesPerDay: getEntriesPerDay(days),
      sourceBreakdown: getSourceBreakdown(),
      polishStats: getPolishStats(),
      topCommands: getTopCommands(10),
      topSnippets: getTopSnippets(10),
      busiestHours: getBusiestHours(),
      averageDuration: getAverageDuration(),
      streaks: getStreaks(),
    };
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Analytics query failed", { error: err.message });
    return getEmptyDashboard();
  }
}

function getEmptyDashboard() {
  return {
    summary: { totalEntries: 0, todayEntries: 0, thisWeekEntries: 0, thisMonthEntries: 0 },
    entriesPerDay: [],
    sourceBreakdown: [],
    polishStats: { totalPolished: 0, totalRaw: 0, avgCharsSaved: 0, polishRate: 0 },
    topCommands: [],
    topSnippets: [],
    busiestHours: [],
    averageDuration: { avgMs: 0, totalMs: 0, count: 0 },
    streaks: { current: 0, longest: 0 },
  };
}

// --- Individual metrics ---

function getSummary() {
  const total = db.prepare("SELECT COUNT(*) as count FROM bf_entries").get();
  const today = db.prepare(
    "SELECT COUNT(*) as count FROM bf_entries WHERE date(created_at) = date('now')"
  ).get();
  const week = db.prepare(
    "SELECT COUNT(*) as count FROM bf_entries WHERE created_at >= datetime('now', '-7 days')"
  ).get();
  const month = db.prepare(
    "SELECT COUNT(*) as count FROM bf_entries WHERE created_at >= datetime('now', '-30 days')"
  ).get();

  return {
    totalEntries: total.count,
    todayEntries: today.count,
    thisWeekEntries: week.count,
    thisMonthEntries: month.count,
  };
}

function getEntriesPerDay(days) {
  const rows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM bf_entries
    WHERE created_at >= datetime('now', '-${days} days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  return rows.map((r) => ({ day: r.day, count: r.count }));
}

function getSourceBreakdown() {
  const rows = db.prepare(`
    SELECT source, COUNT(*) as count
    FROM bf_entries
    GROUP BY source
    ORDER BY count DESC
  `).all();

  return rows.map((r) => ({ source: r.source, count: r.count }));
}

function getPolishStats() {
  const rows = db.prepare(`
    SELECT raw_text, polished
    FROM bf_entries
    WHERE polished IS NOT NULL AND raw_text IS NOT NULL
  `).all();

  if (rows.length === 0) {
    return { totalPolished: 0, totalRaw: 0, avgCharsSaved: 0, polishRate: 0 };
  }

  let totalRawLen = 0;
  let totalPolishedLen = 0;

  for (const row of rows) {
    totalRawLen += (row.raw_text || "").length;
    totalPolishedLen += (row.polished || "").length;
  }

  const totalEntries = db.prepare("SELECT COUNT(*) as count FROM bf_entries").get().count;
  const avgCharsDiff = rows.length > 0
    ? Math.round((totalPolishedLen - totalRawLen) / rows.length)
    : 0;

  return {
    totalPolished: rows.length,
    totalRaw: totalEntries,
    avgCharsSaved: avgCharsDiff, // negative = shorter (concisified), positive = expanded
    polishRate: totalEntries > 0 ? Math.round((rows.length / totalEntries) * 100) : 0,
  };
}

function getTopCommands(limit) {
  // Voice commands are stored in routed_to as "voice-command:rewrite" etc.
  const rows = db.prepare(`
    SELECT routed_to, COUNT(*) as count
    FROM bf_entries
    WHERE routed_to LIKE 'voice-command:%'
    GROUP BY routed_to
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);

  return rows.map((r) => ({
    command: r.routed_to.replace("voice-command:", ""),
    count: r.count,
  }));
}

function getTopSnippets(limit) {
  // Snippets are stored in routed_to as "snippet:my email" etc.
  const rows = db.prepare(`
    SELECT routed_to, COUNT(*) as count
    FROM bf_entries
    WHERE routed_to LIKE 'snippet:%'
    GROUP BY routed_to
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);

  return rows.map((r) => ({
    trigger: r.routed_to.replace("snippet:", ""),
    count: r.count,
  }));
}

function getBusiestHours() {
  // Returns 24 entries (0-23) with counts
  const rows = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
    FROM bf_entries
    GROUP BY hour
    ORDER BY hour ASC
  `).all();

  // Fill missing hours with 0
  const hourMap = Object.fromEntries(rows.map((r) => [r.hour, r.count]));
  const result = [];
  for (let h = 0; h < 24; h++) {
    result.push({ hour: h, count: hourMap[h] || 0 });
  }
  return result;
}

function getAverageDuration() {
  const row = db.prepare(`
    SELECT AVG(duration_ms) as avg_ms, SUM(duration_ms) as total_ms, COUNT(*) as count
    FROM bf_entries
    WHERE duration_ms IS NOT NULL AND duration_ms > 0
  `).get();

  return {
    avgMs: Math.round(row.avg_ms || 0),
    totalMs: row.total_ms || 0,
    count: row.count || 0,
  };
}

function getStreaks() {
  // Calculate current and longest daily usage streaks
  const rows = db.prepare(`
    SELECT DISTINCT date(created_at) as day
    FROM bf_entries
    ORDER BY day DESC
  `).all();

  if (rows.length === 0) return { current: 0, longest: 0 };

  const days = rows.map((r) => r.day);
  const today = new Date().toISOString().split("T")[0];

  // Current streak (from today backwards)
  let current = 0;
  let checkDate = today;
  for (const day of days) {
    if (day === checkDate) {
      current++;
      // Move to previous day
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split("T")[0];
    } else if (day < checkDate) {
      break;
    }
  }

  // Longest streak ever
  let longest = 0;
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    const d1 = new Date(days[i]);
    const d2 = new Date(days[i + 1]);
    const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak);

  return { current, longest };
}

module.exports = {
  setDatabase,
  getDashboard,
  getSummary,
  getEntriesPerDay,
  getSourceBreakdown,
  getPolishStats,
  getTopCommands,
  getTopSnippets,
  getBusiestHours,
  getAverageDuration,
  getStreaks,
};
