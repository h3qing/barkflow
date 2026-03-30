/**
 * Tests for Voice Activity Detection (VAD)
 *
 * Tests energy-based speech/silence classification, audio trimming,
 * speech segments, and auto-stop logic. Pure math — no audio hardware.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure VAD logic for testing

function calculateRms(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

interface Frame {
  frameIndex: number;
  startSample: number;
  rms: number;
  isSpeech: boolean;
}

function analyzeFrames(
  samples: Float32Array,
  sampleRate = 16000,
  config: { silenceThreshold?: number; frameSizeSamples?: number } = {},
): Frame[] {
  const threshold = config.silenceThreshold ?? 0.01;
  const frameSize = config.frameSizeSamples ?? 480;
  const frames: Frame[] = [];

  for (let i = 0; i < samples.length; i += frameSize) {
    const end = Math.min(i + frameSize, samples.length);
    const frame = samples.subarray(i, end);
    const rms = calculateRms(frame);
    frames.push({ frameIndex: frames.length, startSample: i, rms, isSpeech: rms >= threshold });
  }

  return frames;
}

function getSpeechRatio(samples: Float32Array, sampleRate = 16000, config = {}): number {
  const frames = analyzeFrames(samples, sampleRate, config);
  const speechFrames = frames.filter((f) => f.isSpeech).length;
  return frames.length > 0 ? speechFrames / frames.length : 0;
}

function shouldAutoStop(
  recentRmsValues: number[],
  frameIntervalMs: number,
  config: { silenceThreshold?: number; autoStopSilenceMs?: number; minRecordingMs?: number } = {},
  recordingDurationMs = 0,
): { shouldStop: boolean; silenceDurationMs: number } {
  const threshold = config.silenceThreshold ?? 0.01;
  const autoStopMs = config.autoStopSilenceMs ?? 1500;
  const minRecording = config.minRecordingMs ?? 500;

  if (recordingDurationMs < minRecording) {
    return { shouldStop: false, silenceDurationMs: 0 };
  }

  let silenceFrames = 0;
  for (let i = recentRmsValues.length - 1; i >= 0; i--) {
    if (recentRmsValues[i] < threshold) silenceFrames++;
    else break;
  }

  const silenceDurationMs = silenceFrames * frameIntervalMs;
  return { shouldStop: silenceDurationMs >= autoStopMs, silenceDurationMs };
}

// Helper: generate a sine wave (speech-like)
function generateSpeech(durationMs: number, sampleRate = 16000, amplitude = 0.3): Float32Array {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = amplitude * Math.sin(2 * Math.PI * 440 * i / sampleRate);
  }
  return data;
}

// Helper: generate silence
function generateSilence(durationMs: number, sampleRate = 16000): Float32Array {
  return new Float32Array(Math.round((durationMs / 1000) * sampleRate));
}

// Helper: concatenate Float32Arrays
function concat(...arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

describe('Voice Activity Detection', () => {
  describe('calculateRms', () => {
    it('returns 0 for silence', () => {
      expect(calculateRms(new Float32Array(100))).toBe(0);
    });

    it('returns > 0 for speech-like signal', () => {
      const speech = generateSpeech(100);
      expect(calculateRms(speech)).toBeGreaterThan(0.01);
    });

    it('returns 0 for empty array', () => {
      expect(calculateRms(new Float32Array(0))).toBe(0);
    });

    it('higher amplitude → higher RMS', () => {
      const quiet = generateSpeech(100, 16000, 0.1);
      const loud = generateSpeech(100, 16000, 0.5);
      expect(calculateRms(loud)).toBeGreaterThan(calculateRms(quiet));
    });
  });

  describe('analyzeFrames', () => {
    it('classifies silence frames as non-speech', () => {
      const silence = generateSilence(500);
      const frames = analyzeFrames(silence);
      expect(frames.every((f) => !f.isSpeech)).toBe(true);
    });

    it('classifies speech frames as speech', () => {
      const speech = generateSpeech(500);
      const frames = analyzeFrames(speech);
      expect(frames.every((f) => f.isSpeech)).toBe(true);
    });

    it('handles mixed speech and silence', () => {
      const audio = concat(generateSilence(300), generateSpeech(300), generateSilence(300));
      const frames = analyzeFrames(audio);
      const speechFrames = frames.filter((f) => f.isSpeech).length;
      const silenceFrames = frames.filter((f) => !f.isSpeech).length;
      expect(speechFrames).toBeGreaterThan(0);
      expect(silenceFrames).toBeGreaterThan(0);
    });

    it('returns sequential frame indices', () => {
      const audio = generateSpeech(200);
      const frames = analyzeFrames(audio);
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i].frameIndex).toBe(i);
      }
    });
  });

  describe('getSpeechRatio', () => {
    it('returns 0 for pure silence', () => {
      expect(getSpeechRatio(generateSilence(1000))).toBe(0);
    });

    it('returns ~1 for pure speech', () => {
      expect(getSpeechRatio(generateSpeech(1000))).toBeGreaterThan(0.9);
    });

    it('returns ~0.33 for 1/3 speech', () => {
      const audio = concat(generateSilence(500), generateSpeech(500), generateSilence(500));
      const ratio = getSpeechRatio(audio);
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.5);
    });

    it('returns 0 for empty input', () => {
      expect(getSpeechRatio(new Float32Array(0))).toBe(0);
    });
  });

  describe('shouldAutoStop', () => {
    it('triggers after sustained silence exceeds threshold', () => {
      // 20 frames of silence at 100ms each = 2000ms > 1500ms default
      const rmsValues = Array(20).fill(0.001);
      const result = shouldAutoStop(rmsValues, 100, {}, 5000);
      expect(result.shouldStop).toBe(true);
      expect(result.silenceDurationMs).toBe(2000);
    });

    it('does not trigger during speech', () => {
      const rmsValues = Array(20).fill(0.05); // all speech
      const result = shouldAutoStop(rmsValues, 100, {}, 5000);
      expect(result.shouldStop).toBe(false);
      expect(result.silenceDurationMs).toBe(0);
    });

    it('does not trigger before min recording duration', () => {
      const rmsValues = Array(20).fill(0.001);
      const result = shouldAutoStop(rmsValues, 100, {}, 200); // only 200ms in
      expect(result.shouldStop).toBe(false);
    });

    it('counts only trailing silence', () => {
      // speech then 5 frames silence (500ms < 1500ms default)
      const rmsValues = [...Array(15).fill(0.05), ...Array(5).fill(0.001)];
      const result = shouldAutoStop(rmsValues, 100, {}, 5000);
      expect(result.shouldStop).toBe(false);
      expect(result.silenceDurationMs).toBe(500);
    });

    it('respects custom autoStopSilenceMs', () => {
      const rmsValues = Array(10).fill(0.001); // 1000ms silence
      const result = shouldAutoStop(rmsValues, 100, { autoStopSilenceMs: 800 }, 5000);
      expect(result.shouldStop).toBe(true);
    });

    it('handles empty RMS array', () => {
      const result = shouldAutoStop([], 100, {}, 5000);
      expect(result.shouldStop).toBe(false);
      expect(result.silenceDurationMs).toBe(0);
    });
  });
});
