const crypto = require("crypto");
const debugLogger = require("../../helpers/debugLogger");

let activeMeeting = null;

function startMeeting(options = {}) {
  if (activeMeeting) {
    debugLogger.log("[BarkFlow] Cannot start meeting — one is already active", { id: activeMeeting.id });
    return null;
  }

  const meeting = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    transcriptOnly: options.transcriptOnly ?? false,
    segments: [],
  };

  activeMeeting = meeting;

  debugLogger.log("[BarkFlow] Meeting started", {
    id: meeting.id,
    transcriptOnly: meeting.transcriptOnly,
  });

  return meeting.id;
}

function addMeetingSegment(text) {
  if (!activeMeeting) return;
  if (typeof text !== "string" || text.trim().length === 0) return;

  activeMeeting = {
    ...activeMeeting,
    segments: [
      ...activeMeeting.segments,
      { text: text.trim(), timestamp: Date.now() },
    ],
  };
}

function endMeeting() {
  if (!activeMeeting) return null;

  const meeting = activeMeeting;
  const fullTranscript = meeting.segments.map((s) => s.text).join("\n");
  const durationMs = Date.now() - meeting.startedAt;

  activeMeeting = null;

  debugLogger.log("[BarkFlow] Meeting ended", {
    id: meeting.id,
    duration: durationMs,
    segments: meeting.segments.length,
  });

  return {
    id: meeting.id,
    transcript: fullTranscript,
    durationMs,
    segmentCount: meeting.segments.length,
    transcriptOnly: meeting.transcriptOnly,
  };
}

function getActiveMeeting() {
  if (!activeMeeting) return null;
  return {
    id: activeMeeting.id,
    startedAt: activeMeeting.startedAt,
    segmentCount: activeMeeting.segments.length,
    transcriptOnly: activeMeeting.transcriptOnly,
  };
}

module.exports = { startMeeting, addMeetingSegment, endMeeting, getActiveMeeting };
