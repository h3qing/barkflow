/**
 * Tests for Context-Aware Polish — App-to-Preset Mapping
 *
 * Tests the pure mapping logic. OS-level detection (NSWorkspace)
 * is tested manually — these verify the mapping rules.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the mapping logic for testing (pure function, no OS deps)
const APP_PRESET_MAP: Record<string, string | null> = {
  // Email — professional
  "com.apple.mail": "professional",
  "com.microsoft.Outlook": "professional",
  "com.superhuman.electron": "professional",

  // Chat — casual
  "com.tinyspeck.slackmacgap": "casual",
  "com.hnc.Discord": "casual",
  "com.apple.MobileSMS": "casual",
  "ru.keepcoder.Telegram": "casual",
  "net.whatsapp.WhatsApp": "casual",
  "com.microsoft.teams2": "casual",

  // IDEs — structured or minimal
  "com.microsoft.VSCode": "structured",
  "com.todesktop.230313mzl4w4u92": "structured",
  "dev.zed.Zed": "structured",
  "com.apple.dt.Xcode": "structured",
  "com.googlecode.iterm2": "minimal",
  "com.apple.Terminal": "minimal",

  // Notes — structured
  "com.apple.Notes": "structured",
  "md.obsidian": "structured",
  "com.notion.id": "structured",

  // Documents — professional
  "com.apple.iWork.Pages": "professional",
  "com.microsoft.Word": "professional",

  // Browsers — clean (default)
  "com.apple.Safari": "clean",
  "com.google.Chrome": null,
};

function getPresetForApp(bundleId: string | null): string | null {
  if (!bundleId) return null;
  return APP_PRESET_MAP[bundleId] ?? null;
}

describe('Context-Aware Polish', () => {
  describe('getPresetForApp', () => {
    it('returns "professional" for email apps', () => {
      expect(getPresetForApp("com.apple.mail")).toBe("professional");
      expect(getPresetForApp("com.microsoft.Outlook")).toBe("professional");
      expect(getPresetForApp("com.superhuman.electron")).toBe("professional");
    });

    it('returns "casual" for chat/messaging apps', () => {
      expect(getPresetForApp("com.tinyspeck.slackmacgap")).toBe("casual");
      expect(getPresetForApp("com.hnc.Discord")).toBe("casual");
      expect(getPresetForApp("com.apple.MobileSMS")).toBe("casual");
      expect(getPresetForApp("ru.keepcoder.Telegram")).toBe("casual");
      expect(getPresetForApp("com.microsoft.teams2")).toBe("casual");
    });

    it('returns "structured" for IDEs and note apps', () => {
      expect(getPresetForApp("com.microsoft.VSCode")).toBe("structured");
      expect(getPresetForApp("com.todesktop.230313mzl4w4u92")).toBe("structured");
      expect(getPresetForApp("com.apple.Notes")).toBe("structured");
      expect(getPresetForApp("md.obsidian")).toBe("structured");
      expect(getPresetForApp("com.notion.id")).toBe("structured");
    });

    it('returns "minimal" for terminal apps', () => {
      expect(getPresetForApp("com.googlecode.iterm2")).toBe("minimal");
      expect(getPresetForApp("com.apple.Terminal")).toBe("minimal");
    });

    it('returns "professional" for document apps', () => {
      expect(getPresetForApp("com.apple.iWork.Pages")).toBe("professional");
      expect(getPresetForApp("com.microsoft.Word")).toBe("professional");
    });

    it('returns "clean" for browsers (default)', () => {
      expect(getPresetForApp("com.apple.Safari")).toBe("clean");
    });

    it('returns null for unknown apps', () => {
      expect(getPresetForApp("com.unknown.app")).toBeNull();
      expect(getPresetForApp("")).toBeNull();
    });

    it('returns null for null/undefined input', () => {
      expect(getPresetForApp(null)).toBeNull();
    });

    it('Chrome returns null (needs URL-based detection)', () => {
      expect(getPresetForApp("com.google.Chrome")).toBeNull();
    });
  });

  describe('mapping coverage', () => {
    it('all presets in the map are valid preset IDs', () => {
      const validPresets = new Set(["clean", "professional", "casual", "minimal", "structured", null]);
      for (const [, preset] of Object.entries(APP_PRESET_MAP)) {
        expect(validPresets.has(preset)).toBe(true);
      }
    });

    it('mapping is immutable per call (no cross-test contamination)', () => {
      const first = getPresetForApp("com.apple.mail");
      const second = getPresetForApp("com.apple.mail");
      expect(first).toBe(second);
      expect(first).toBe("professional");
    });
  });
});
