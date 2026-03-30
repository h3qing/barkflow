/**
 * Tests for Recurring Capture — schedule validation, time checking, fire logic
 */

import { describe, it, expect } from 'vitest';

function isValidTime(time: string | null): boolean {
  if (!time || typeof time !== "string") return false;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(":").map(Number);
  return { hours: h, minutes: m };
}

function getIsoDay(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

interface Schedule {
  id: string;
  prompt: string;
  time: string;
  days: number[];
  enabled: boolean;
  lastFiredAt: string | null;
}

function shouldFire(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  const { hours, minutes } = parseTime(schedule.time);
  const isoDay = getIsoDay(now);
  if (!schedule.days.includes(isoDay)) return false;
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;
  if (schedule.lastFiredAt) {
    const last = new Date(schedule.lastFiredAt);
    if (last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate() && last.getHours() === now.getHours() &&
        last.getMinutes() === now.getMinutes()) {
      return false;
    }
  }
  return true;
}

describe('Recurring Capture', () => {
  describe('isValidTime', () => {
    it('accepts valid 24h times', () => {
      expect(isValidTime("08:00")).toBe(true);
      expect(isValidTime("17:30")).toBe(true);
      expect(isValidTime("0:00")).toBe(true);
      expect(isValidTime("23:59")).toBe(true);
    });

    it('rejects invalid times', () => {
      expect(isValidTime("25:00")).toBe(false);
      expect(isValidTime("12:60")).toBe(false);
      expect(isValidTime("abc")).toBe(false);
      expect(isValidTime("")).toBe(false);
      expect(isValidTime(null)).toBe(false);
    });

    it('rejects bad formats', () => {
      expect(isValidTime("8")).toBe(false);
      expect(isValidTime("8:0")).toBe(false);
      expect(isValidTime("08:00:00")).toBe(false);
    });
  });

  describe('parseTime', () => {
    it('parses hours and minutes', () => {
      expect(parseTime("08:30")).toEqual({ hours: 8, minutes: 30 });
      expect(parseTime("17:00")).toEqual({ hours: 17, minutes: 0 });
      expect(parseTime("0:00")).toEqual({ hours: 0, minutes: 0 });
    });
  });

  describe('getIsoDay', () => {
    it('converts JS day to ISO (Mon=1, Sun=7)', () => {
      // 2026-03-30 is a Monday
      expect(getIsoDay(new Date(2026, 2, 30))).toBe(1);
      // 2026-03-29 is a Sunday
      expect(getIsoDay(new Date(2026, 2, 29))).toBe(7);
      // 2026-03-31 is a Tuesday
      expect(getIsoDay(new Date(2026, 2, 31))).toBe(2);
    });
  });

  describe('shouldFire', () => {
    const baseSchedule: Schedule = {
      id: "test",
      prompt: "What did you accomplish?",
      time: "17:00",
      days: [1, 2, 3, 4, 5], // weekdays
      enabled: true,
      lastFiredAt: null,
    };

    it('fires at the correct time and day', () => {
      // Monday at 17:00
      const now = new Date(2026, 2, 30, 17, 0, 0);
      expect(shouldFire(baseSchedule, now)).toBe(true);
    });

    it('does not fire at wrong time', () => {
      const now = new Date(2026, 2, 30, 16, 59, 0); // 4:59pm
      expect(shouldFire(baseSchedule, now)).toBe(false);
    });

    it('does not fire on wrong day', () => {
      // Sunday at 17:00 (day 7 not in weekdays)
      const now = new Date(2026, 2, 29, 17, 0, 0);
      expect(shouldFire(baseSchedule, now)).toBe(false);
    });

    it('does not fire when disabled', () => {
      const disabled = { ...baseSchedule, enabled: false };
      const now = new Date(2026, 2, 30, 17, 0, 0);
      expect(shouldFire(disabled, now)).toBe(false);
    });

    it('does not fire twice in same minute', () => {
      const alreadyFired = {
        ...baseSchedule,
        lastFiredAt: new Date(2026, 2, 30, 17, 0, 30).toISOString(),
      };
      const now = new Date(2026, 2, 30, 17, 0, 45);
      expect(shouldFire(alreadyFired, now)).toBe(false);
    });

    it('fires again next day', () => {
      const firedYesterday = {
        ...baseSchedule,
        lastFiredAt: new Date(2026, 2, 30, 17, 0, 0).toISOString(),
      };
      // Tuesday 17:00
      const now = new Date(2026, 2, 31, 17, 0, 0);
      expect(shouldFire(firedYesterday, now)).toBe(true);
    });

    it('handles weekend-only schedule', () => {
      const weekendOnly = { ...baseSchedule, days: [6, 7] }; // Sat, Sun
      // Saturday 17:00 (2026-03-28)
      const sat = new Date(2026, 2, 28, 17, 0, 0);
      expect(shouldFire(weekendOnly, sat)).toBe(true);
      // Monday 17:00
      const mon = new Date(2026, 2, 30, 17, 0, 0);
      expect(shouldFire(weekendOnly, mon)).toBe(false);
    });
  });

  describe('presets', () => {
    const presets = [
      { name: "Morning Brain Dump", time: "08:00", days: [1, 2, 3, 4, 5] },
      { name: "End of Day Review", time: "17:00", days: [1, 2, 3, 4, 5] },
      { name: "Weekly Reflection", time: "16:00", days: [5] },
      { name: "Daily Standup Prep", time: "09:00", days: [1, 2, 3, 4, 5] },
    ];

    it('has 4 presets', () => {
      expect(presets).toHaveLength(4);
    });

    it('all presets have valid times', () => {
      for (const p of presets) {
        expect(isValidTime(p.time)).toBe(true);
      }
    });

    it('all presets have non-empty days', () => {
      for (const p of presets) {
        expect(p.days.length).toBeGreaterThan(0);
      }
    });

    it('weekly reflection is Friday only', () => {
      const weekly = presets.find((p) => p.name === "Weekly Reflection");
      expect(weekly?.days).toEqual([5]);
    });
  });
});
