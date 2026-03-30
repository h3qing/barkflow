/**
 * Recurring Capture — Scheduled voice prompts
 *
 * Reminds the user to capture a voice note at a set time.
 * Shows a native notification with the prompt text. User speaks,
 * entry is tagged with the schedule name.
 *
 * Examples:
 * - "What did you accomplish today?" at 5pm weekdays
 * - "Morning brain dump" at 8am daily
 * - "Weekly reflection" at 4pm Fridays
 *
 * Uses cron-style scheduling evaluated against local time.
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-schedules.json
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const SCHEDULES_FILE = path.join(app.getPath("userData"), "whisperwoof-schedules.json");
const MAX_SCHEDULES = 20;
const CHECK_INTERVAL_MS = 60000; // Check every minute

let checkInterval = null;
let notifyCallback = null; // Set by app-init to show notifications

// --- Storage ---

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf-8"));
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load schedules", { error: err.message });
  }
  return [];
}

function saveSchedules(schedules) {
  try {
    const dir = path.dirname(SCHEDULES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save schedules", { error: err.message });
  }
}

// --- CRUD ---

function getSchedules() {
  return loadSchedules();
}

function addSchedule(config) {
  if (!config.prompt || !config.prompt.trim()) {
    return { success: false, error: "Prompt text is required" };
  }
  if (!config.time || !isValidTime(config.time)) {
    return { success: false, error: "Valid time is required (HH:MM format)" };
  }

  const schedules = loadSchedules();
  if (schedules.length >= MAX_SCHEDULES) {
    return { success: false, error: `Maximum ${MAX_SCHEDULES} schedules` };
  }

  const schedule = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: config.prompt.trim(),
    time: config.time, // "HH:MM" in 24h format
    days: config.days || [1, 2, 3, 4, 5], // Default: weekdays (1=Mon, 7=Sun)
    enabled: config.enabled !== false,
    templateId: config.templateId || null,
    tagId: config.tagId || null,
    createdAt: new Date().toISOString(),
    lastFiredAt: null,
    fireCount: 0,
  };

  schedules.push(schedule);
  saveSchedules(schedules);

  debugLogger.info("[WhisperWoof] Schedule added", { id: schedule.id, time: schedule.time, prompt: schedule.prompt.slice(0, 40) });
  return { success: true, schedule };
}

function updateSchedule(id, updates) {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return { success: false, error: "Schedule not found" };

  const allowed = {};
  if (updates.prompt !== undefined) allowed.prompt = updates.prompt.trim();
  if (updates.time !== undefined) {
    if (!isValidTime(updates.time)) return { success: false, error: "Invalid time format" };
    allowed.time = updates.time;
  }
  if (updates.days !== undefined) allowed.days = updates.days;
  if (updates.enabled !== undefined) allowed.enabled = !!updates.enabled;
  if (updates.templateId !== undefined) allowed.templateId = updates.templateId;
  if (updates.tagId !== undefined) allowed.tagId = updates.tagId;

  schedules[idx] = { ...schedules[idx], ...allowed };
  saveSchedules(schedules);
  return { success: true };
}

function removeSchedule(id) {
  const schedules = loadSchedules();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) return { success: false, error: "Schedule not found" };
  saveSchedules(filtered);
  return { success: true };
}

// --- Time validation ---

function isValidTime(time) {
  if (!time || typeof time !== "string") return false;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Parse "HH:MM" into { hours, minutes }.
 */
function parseTime(time) {
  const [h, m] = time.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Get the JS day-of-week (1=Mon..7=Sun) from a Date.
 * JS getDay() returns 0=Sun, 1=Mon..6=Sat — convert to ISO.
 */
function getIsoDay(date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// --- Schedule checking ---

/**
 * Check if a schedule should fire right now.
 */
function shouldFire(schedule, now) {
  if (!schedule.enabled) return false;

  const { hours, minutes } = parseTime(schedule.time);
  const isoDay = getIsoDay(now);

  // Check day of week
  if (!schedule.days.includes(isoDay)) return false;

  // Check time (within the same minute)
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;

  // Don't fire if already fired this minute
  if (schedule.lastFiredAt) {
    const lastFired = new Date(schedule.lastFiredAt);
    if (
      lastFired.getFullYear() === now.getFullYear() &&
      lastFired.getMonth() === now.getMonth() &&
      lastFired.getDate() === now.getDate() &&
      lastFired.getHours() === now.getHours() &&
      lastFired.getMinutes() === now.getMinutes()
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check all schedules and fire any that match the current time.
 */
function checkSchedules() {
  const now = new Date();
  const schedules = loadSchedules();
  let fired = 0;

  for (const schedule of schedules) {
    if (shouldFire(schedule, now)) {
      fireSchedule(schedule, schedules);
      fired++;
    }
  }

  if (fired > 0) {
    saveSchedules(schedules);
  }
}

function fireSchedule(schedule, allSchedules) {
  const idx = allSchedules.findIndex((s) => s.id === schedule.id);
  if (idx === -1) return;

  allSchedules[idx] = {
    ...allSchedules[idx],
    lastFiredAt: new Date().toISOString(),
    fireCount: (allSchedules[idx].fireCount || 0) + 1,
  };

  debugLogger.info("[WhisperWoof] Schedule fired", {
    id: schedule.id,
    prompt: schedule.prompt.slice(0, 40),
  });

  // Notify via callback (shows notification + optional auto-record)
  if (notifyCallback) {
    notifyCallback({
      scheduleId: schedule.id,
      prompt: schedule.prompt,
      templateId: schedule.templateId,
      tagId: schedule.tagId,
    });
  }
}

// --- Lifecycle ---

function startScheduler(callback) {
  if (checkInterval) return;
  notifyCallback = callback || null;
  checkSchedules(); // Initial check
  checkInterval = setInterval(checkSchedules, CHECK_INTERVAL_MS);
  debugLogger.log("[WhisperWoof] Recurring capture scheduler started");
}

function stopScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  notifyCallback = null;
  debugLogger.log("[WhisperWoof] Recurring capture scheduler stopped");
}

/**
 * Get preset schedule configurations (for quick setup UI).
 */
function getPresets() {
  return [
    { name: "Morning Brain Dump", prompt: "What's on your mind this morning?", time: "08:00", days: [1, 2, 3, 4, 5] },
    { name: "End of Day Review", prompt: "What did you accomplish today?", time: "17:00", days: [1, 2, 3, 4, 5] },
    { name: "Weekly Reflection", prompt: "How did this week go? What would you improve?", time: "16:00", days: [5] },
    { name: "Daily Standup Prep", prompt: "What did you do yesterday, what's today's plan, any blockers?", time: "09:00", days: [1, 2, 3, 4, 5] },
  ];
}

module.exports = {
  getSchedules,
  addSchedule,
  updateSchedule,
  removeSchedule,
  startScheduler,
  stopScheduler,
  shouldFire,
  isValidTime,
  parseTime,
  getIsoDay,
  getPresets,
  checkSchedules,
};
