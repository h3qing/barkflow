/**
 * Tests for App Automation — command detection and app name extraction
 */

import { describe, it, expect } from 'vitest';

interface AutomationResult {
  id: string;
  label: string;
  appName: string | null;
}

// Order matters: specific patterns (newTab, newWindow) before generic (open)
const COMMANDS: Record<string, { id: string; patterns: RegExp[]; label: string }> = {
  newTab: { id: "newTab", patterns: [/^new\s+tab$/i, /^open\s+(a\s+)?new\s+tab$/i], label: "New tab" },
  newWindow: { id: "newWindow", patterns: [/^new\s+window$/i, /^open\s+(a\s+)?new\s+window$/i], label: "New window" },
  open: { id: "open", patterns: [/^open\s+(.+)$/i, /^launch\s+(.+)$/i, /^start\s+(.+)$/i], label: "Open app" },
  switch: { id: "switch", patterns: [/^switch\s+to\s+(.+)$/i, /^go\s+to\s+(.+)$/i], label: "Switch to app" },
  close: { id: "close", patterns: [/^close\s+(this\s+)?(window|tab|app)$/i], label: "Close window" },
  minimize: { id: "minimize", patterns: [/^minimize\s*(this)?$/i, /^hide\s+(this\s+)?window$/i], label: "Minimize" },
  fullscreen: { id: "fullscreen", patterns: [/^(full\s*screen|toggle\s+full\s*screen|maximize)$/i], label: "Fullscreen" },
  mute: { id: "mute", patterns: [/^(mute|unmute|toggle\s+mute)$/i], label: "Mute" },
  volumeUp: { id: "volumeUp", patterns: [/^(volume\s+up|louder|increase\s+volume)$/i], label: "Volume up" },
  volumeDown: { id: "volumeDown", patterns: [/^(volume\s+down|quieter|decrease\s+volume|lower\s+volume)$/i], label: "Volume down" },
  darkMode: { id: "darkMode", patterns: [/^(dark\s+mode|toggle\s+dark\s+mode|turn\s+on\s+dark\s+mode)$/i], label: "Dark mode" },
};

function detect(text: string | null): AutomationResult | null {
  if (!text || text.length < 3) return null;
  const trimmed = text.trim();
  for (const [, cmd] of Object.entries(COMMANDS)) {
    for (const pattern of cmd.patterns) {
      const match = trimmed.match(pattern);
      if (match) return { id: cmd.id, label: cmd.label, appName: match[1]?.trim() || null };
    }
  }
  return null;
}

describe('App Automation', () => {
  describe('open/launch', () => {
    it('detects "open Safari"', () => {
      const r = detect("open Safari");
      expect(r?.id).toBe("open");
      expect(r?.appName).toBe("Safari");
    });

    it('detects "launch Terminal"', () => {
      const r = detect("launch Terminal");
      expect(r?.id).toBe("open");
      expect(r?.appName).toBe("Terminal");
    });

    it('detects "start Slack"', () => {
      const r = detect("start Slack");
      expect(r?.id).toBe("open");
      expect(r?.appName).toBe("Slack");
    });

    it('handles multi-word app names', () => {
      const r = detect("open Visual Studio Code");
      expect(r?.appName).toBe("Visual Studio Code");
    });
  });

  describe('switch to', () => {
    it('detects "switch to VS Code"', () => {
      const r = detect("switch to VS Code");
      expect(r?.id).toBe("switch");
      expect(r?.appName).toBe("VS Code");
    });

    it('detects "go to Chrome"', () => {
      const r = detect("go to Chrome");
      expect(r?.id).toBe("switch");
      expect(r?.appName).toBe("Chrome");
    });
  });

  describe('window management', () => {
    it('detects "close this window"', () => {
      expect(detect("close this window")?.id).toBe("close");
      expect(detect("close window")?.id).toBe("close");
      expect(detect("close tab")?.id).toBe("close");
    });

    it('detects "minimize"', () => {
      expect(detect("minimize")?.id).toBe("minimize");
      expect(detect("minimize this")?.id).toBe("minimize");
      expect(detect("hide this window")?.id).toBe("minimize");
    });

    it('detects fullscreen', () => {
      expect(detect("fullscreen")?.id).toBe("fullscreen");
      expect(detect("full screen")?.id).toBe("fullscreen");
      expect(detect("maximize")?.id).toBe("fullscreen");
    });

    it('detects new tab/window', () => {
      expect(detect("new tab")?.id).toBe("newTab");
      expect(detect("open a new tab")?.id).toBe("newTab");
      expect(detect("new window")?.id).toBe("newWindow");
    });
  });

  describe('system controls', () => {
    it('detects mute', () => {
      expect(detect("mute")?.id).toBe("mute");
      expect(detect("unmute")?.id).toBe("mute");
    });

    it('detects volume controls', () => {
      expect(detect("volume up")?.id).toBe("volumeUp");
      expect(detect("louder")?.id).toBe("volumeUp");
      expect(detect("volume down")?.id).toBe("volumeDown");
      expect(detect("quieter")?.id).toBe("volumeDown");
    });

    it('detects dark mode', () => {
      expect(detect("dark mode")?.id).toBe("darkMode");
      expect(detect("toggle dark mode")?.id).toBe("darkMode");
      expect(detect("turn on dark mode")?.id).toBe("darkMode");
    });
  });

  describe('non-automation', () => {
    it('returns null for normal speech', () => {
      expect(detect("I need to buy groceries")).toBeNull();
      expect(detect("The meeting is at 3pm")).toBeNull();
      expect(detect("Create a function")).toBeNull();
    });

    it('returns null for short/null', () => {
      expect(detect("")).toBeNull();
      expect(detect(null)).toBeNull();
      expect(detect("hi")).toBeNull();
    });
  });

  describe('command registry', () => {
    it('has 11 commands', () => {
      expect(Object.keys(COMMANDS)).toHaveLength(11);
    });

    it('all have unique IDs', () => {
      const ids = Object.values(COMMANDS).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
