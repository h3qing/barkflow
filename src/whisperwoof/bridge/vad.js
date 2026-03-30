/**
 * Voice Activity Detection (VAD) — Filter silence, auto-stop, audio trimming
 *
 * Provides three VAD capabilities:
 * 1. Auto-stop: End recording after sustained silence (configurable threshold)
 * 2. Audio trimming: Strip leading/trailing silence from audio buffers
 * 3. Speech ratio: Report what % of the recording contained speech
 *
 * Uses energy-based detection (RMS amplitude) rather than ML-based VAD.
 * Simple, fast, zero dependencies. Works on raw PCM Float32 samples.
 *
 * Competitors: Handy STT has VAD, Wispr Flow auto-stops on silence.
 */

const debugLogger = require("../../helpers/debugLogger");

// Default config
const DEFAULTS = {
  // RMS energy threshold — below this is "silence"
  silenceThreshold: 0.01,
  // How long silence must last to trigger auto-stop (ms)
  autoStopSilenceMs: 1500,
  // Minimum recording duration before auto-stop kicks in (ms)
  minRecordingMs: 500,
  // Frame size for analysis (samples per frame at 16kHz)
  frameSizeSamples: 480, // 30ms at 16kHz
  // Padding: keep this many ms of silence before/after speech when trimming
  trimPaddingMs: 200,
};

/**
 * Calculate RMS energy of a Float32Array audio frame.
 */
function calculateRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Analyze an audio buffer and return per-frame speech/silence classification.
 *
 * @param {Float32Array} samples - Raw PCM audio samples
 * @param {number} sampleRate - Sample rate (e.g., 16000)
 * @param {object} config - { silenceThreshold, frameSizeSamples }
 * @returns {Array<{frameIndex: number, startSample: number, rms: number, isSpeech: boolean}>}
 */
function analyzeFrames(samples, sampleRate = 16000, config = {}) {
  const threshold = config.silenceThreshold || DEFAULTS.silenceThreshold;
  const frameSize = config.frameSizeSamples || DEFAULTS.frameSizeSamples;

  const frames = [];
  for (let i = 0; i < samples.length; i += frameSize) {
    const end = Math.min(i + frameSize, samples.length);
    const frame = samples.subarray(i, end);
    const rms = calculateRms(frame);

    frames.push({
      frameIndex: frames.length,
      startSample: i,
      rms,
      isSpeech: rms >= threshold,
    });
  }

  return frames;
}

/**
 * Get speech segments from analyzed frames.
 * Merges adjacent speech frames and adds padding.
 *
 * @param {Array} frames - Output of analyzeFrames
 * @param {number} sampleRate
 * @param {object} config - { frameSizeSamples, trimPaddingMs }
 * @returns {Array<{startSample: number, endSample: number, durationMs: number}>}
 */
function getSpeechSegments(frames, sampleRate = 16000, config = {}) {
  const frameSize = config.frameSizeSamples || DEFAULTS.frameSizeSamples;
  const paddingSamples = Math.round(((config.trimPaddingMs || DEFAULTS.trimPaddingMs) / 1000) * sampleRate);

  const segments = [];
  let segStart = null;

  for (const frame of frames) {
    if (frame.isSpeech) {
      if (segStart === null) segStart = frame.startSample;
    } else {
      if (segStart !== null) {
        segments.push({
          startSample: Math.max(0, segStart - paddingSamples),
          endSample: frame.startSample + frameSize + paddingSamples,
        });
        segStart = null;
      }
    }
  }

  // Close final segment
  if (segStart !== null) {
    const lastFrame = frames[frames.length - 1];
    segments.push({
      startSample: Math.max(0, segStart - paddingSamples),
      endSample: lastFrame.startSample + frameSize + paddingSamples,
    });
  }

  // Merge overlapping segments
  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && seg.startSample <= merged[merged.length - 1].endSample) {
      merged[merged.length - 1].endSample = Math.max(merged[merged.length - 1].endSample, seg.endSample);
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.map((seg) => ({
    startSample: seg.startSample,
    endSample: seg.endSample,
    durationMs: Math.round(((seg.endSample - seg.startSample) / sampleRate) * 1000),
  }));
}

/**
 * Trim silence from audio. Returns a new Float32Array with only speech + padding.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {object} config
 * @returns {{ trimmed: Float32Array, originalDurationMs: number, trimmedDurationMs: number, speechRatio: number }}
 */
function trimSilence(samples, sampleRate = 16000, config = {}) {
  const totalSamples = samples.length;
  const originalDurationMs = Math.round((totalSamples / sampleRate) * 1000);

  const frames = analyzeFrames(samples, sampleRate, config);
  const segments = getSpeechSegments(frames, sampleRate, config);

  if (segments.length === 0) {
    // All silence — return empty
    return {
      trimmed: new Float32Array(0),
      originalDurationMs,
      trimmedDurationMs: 0,
      speechRatio: 0,
    };
  }

  // Concatenate speech segments
  const totalTrimmedSamples = segments.reduce((sum, seg) =>
    sum + Math.min(seg.endSample, totalSamples) - seg.startSample, 0);
  const trimmed = new Float32Array(totalTrimmedSamples);
  let offset = 0;

  for (const seg of segments) {
    const start = seg.startSample;
    const end = Math.min(seg.endSample, totalSamples);
    trimmed.set(samples.subarray(start, end), offset);
    offset += end - start;
  }

  const trimmedDurationMs = Math.round((trimmed.length / sampleRate) * 1000);
  const speechRatio = totalSamples > 0 ? trimmed.length / totalSamples : 0;

  debugLogger.info("[WhisperWoof] VAD trim result", {
    originalMs: originalDurationMs,
    trimmedMs: trimmedDurationMs,
    speechRatio: Math.round(speechRatio * 100) + "%",
    segments: segments.length,
  });

  return { trimmed, originalDurationMs, trimmedDurationMs, speechRatio: Math.round(speechRatio * 100) / 100 };
}

/**
 * Calculate speech ratio for a recording (0-1).
 * Used to decide if audio is worth sending to STT.
 */
function getSpeechRatio(samples, sampleRate = 16000, config = {}) {
  const frames = analyzeFrames(samples, sampleRate, config);
  const speechFrames = frames.filter((f) => f.isSpeech).length;
  return frames.length > 0 ? speechFrames / frames.length : 0;
}

/**
 * Check if auto-stop should trigger based on trailing silence.
 *
 * @param {Array} recentRmsValues - Array of recent RMS values (from real-time analysis)
 * @param {number} frameIntervalMs - Time between RMS samples
 * @param {object} config - { silenceThreshold, autoStopSilenceMs, minRecordingMs }
 * @param {number} recordingDurationMs - How long the recording has been active
 * @returns {{ shouldStop: boolean, silenceDurationMs: number }}
 */
function shouldAutoStop(recentRmsValues, frameIntervalMs, config = {}, recordingDurationMs = 0) {
  const threshold = config.silenceThreshold || DEFAULTS.silenceThreshold;
  const autoStopMs = config.autoStopSilenceMs || DEFAULTS.autoStopSilenceMs;
  const minRecording = config.minRecordingMs || DEFAULTS.minRecordingMs;

  // Don't auto-stop before minimum recording duration
  if (recordingDurationMs < minRecording) {
    return { shouldStop: false, silenceDurationMs: 0 };
  }

  // Count trailing silence frames
  let silenceFrames = 0;
  for (let i = recentRmsValues.length - 1; i >= 0; i--) {
    if (recentRmsValues[i] < threshold) {
      silenceFrames++;
    } else {
      break;
    }
  }

  const silenceDurationMs = silenceFrames * frameIntervalMs;
  return {
    shouldStop: silenceDurationMs >= autoStopMs,
    silenceDurationMs,
  };
}

/**
 * Get VAD configuration (for settings UI).
 */
function getVadConfig() {
  return { ...DEFAULTS };
}

module.exports = {
  calculateRms,
  analyzeFrames,
  getSpeechSegments,
  trimSilence,
  getSpeechRatio,
  shouldAutoStop,
  getVadConfig,
  DEFAULTS,
};
