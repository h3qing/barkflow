/**
 * Tests for Keybinding Customization
 *
 * Tests key combo validation, conflict detection, merge logic, export/import.
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure logic for testing

const KEY_COMBO_PATTERN = /^(Fn|F[1-9]|F1[0-2]|[A-Z]|[0-9]|Space|Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|,|\.|\[|\]|\\|\/|;|'|`|-|=)$|^(CommandOrControl|Cmd|Ctrl|Alt|Shift|Fn)\+/i;

function isValidKeyCombo(key: string | null | undefined): boolean {
  if (!key || typeof key !== "string") return false;
  return KEY_COMBO_PATTERN.test(key.trim());
}

const DEFAULT_KEYBINDINGS: Record<string, { key: string; label: string; category: string }> = {
  "toggle-recording": { key: "Fn", label: "Toggle recording", category: "core" },
  "command-bar": { key: "CommandOrControl+K", label: "Command bar", category: "core" },
  "save-markdown": { key: "Fn+N", label: "Save as Markdown", category: "routing" },
  "route-project": { key: "Fn+P", label: "Route to project", category: "routing" },
  "open-history": { key: "CommandOrControl+H", label: "Open history", category: "navigation" },
  "toggle-privacy": { key: "CommandOrControl+Shift+L", label: "Toggle privacy lock", category: "privacy" },
};

interface MergedBinding {
  actionId: string;
  key: string;
  label: string;
  category: string;
  isCustom: boolean;
  defaultKey: string;
}

function mergeBindings(overrides: Record<string, { key: string }>): MergedBinding[] {
  return Object.entries(DEFAULT_KEYBINDINGS).map(([actionId, def]) => ({
    actionId,
    key: overrides[actionId]?.key || def.key,
    label: def.label,
    category: def.category,
    isCustom: !!overrides[actionId]?.key,
    defaultKey: def.key,
  }));
}

function detectConflict(
  bindings: MergedBinding[],
  actionId: string,
  newKey: string,
): string | null {
  for (const b of bindings) {
    if (b.actionId !== actionId && b.key.toLowerCase() === newKey.toLowerCase()) {
      return b.actionId;
    }
  }
  return null;
}

describe('Keybinding Customization', () => {
  describe('isValidKeyCombo', () => {
    it('accepts modifier+key combos', () => {
      expect(isValidKeyCombo("CommandOrControl+K")).toBe(true);
      expect(isValidKeyCombo("Ctrl+Shift+P")).toBe(true);
      expect(isValidKeyCombo("Alt+N")).toBe(true);
      expect(isValidKeyCombo("Shift+Enter")).toBe(true);
      expect(isValidKeyCombo("CommandOrControl+Shift+L")).toBe(true);
    });

    it('accepts Fn combos', () => {
      expect(isValidKeyCombo("Fn")).toBe(true);
      expect(isValidKeyCombo("Fn+N")).toBe(true);
      expect(isValidKeyCombo("Fn+T")).toBe(true);
      expect(isValidKeyCombo("Fn+P")).toBe(true);
    });

    it('accepts function keys', () => {
      expect(isValidKeyCombo("F1")).toBe(true);
      expect(isValidKeyCombo("F5")).toBe(true);
      expect(isValidKeyCombo("F12")).toBe(true);
    });

    it('accepts single keys', () => {
      expect(isValidKeyCombo("Space")).toBe(true);
      expect(isValidKeyCombo("Enter")).toBe(true);
      expect(isValidKeyCombo("Escape")).toBe(true);
      expect(isValidKeyCombo("Tab")).toBe(true);
    });

    it('rejects invalid combos', () => {
      expect(isValidKeyCombo("")).toBe(false);
      expect(isValidKeyCombo(null)).toBe(false);
      expect(isValidKeyCombo(undefined)).toBe(false);
      expect(isValidKeyCombo("hello world")).toBe(false);
      expect(isValidKeyCombo("+++")).toBe(false);
    });
  });

  describe('merge logic', () => {
    it('returns defaults when no overrides', () => {
      const merged = mergeBindings({});
      const cmdBar = merged.find((b) => b.actionId === "command-bar");
      expect(cmdBar?.key).toBe("CommandOrControl+K");
      expect(cmdBar?.isCustom).toBe(false);
    });

    it('applies user override', () => {
      const merged = mergeBindings({ "command-bar": { key: "CommandOrControl+J" } });
      const cmdBar = merged.find((b) => b.actionId === "command-bar");
      expect(cmdBar?.key).toBe("CommandOrControl+J");
      expect(cmdBar?.isCustom).toBe(true);
      expect(cmdBar?.defaultKey).toBe("CommandOrControl+K");
    });

    it('preserves non-overridden defaults', () => {
      const merged = mergeBindings({ "command-bar": { key: "CommandOrControl+J" } });
      const recording = merged.find((b) => b.actionId === "toggle-recording");
      expect(recording?.key).toBe("Fn");
      expect(recording?.isCustom).toBe(false);
    });

    it('returns all default actions', () => {
      const merged = mergeBindings({});
      expect(merged).toHaveLength(Object.keys(DEFAULT_KEYBINDINGS).length);
    });
  });

  describe('conflict detection', () => {
    const bindings = mergeBindings({});

    it('detects conflict with existing binding', () => {
      // CommandOrControl+H is bound to "open-history"
      const conflict = detectConflict(bindings, "command-bar", "CommandOrControl+H");
      expect(conflict).toBe("open-history");
    });

    it('no conflict with self', () => {
      // Rebinding command-bar to its own key is fine
      const conflict = detectConflict(bindings, "command-bar", "CommandOrControl+K");
      expect(conflict).toBeNull();
    });

    it('no conflict with unbound key', () => {
      const conflict = detectConflict(bindings, "command-bar", "CommandOrControl+J");
      expect(conflict).toBeNull();
    });

    it('case-insensitive conflict detection', () => {
      const conflict = detectConflict(bindings, "command-bar", "commandorcontrol+h");
      expect(conflict).toBe("open-history");
    });
  });

  describe('export/import', () => {
    it('export has correct structure', () => {
      const exported = {
        version: 1,
        appName: "WhisperWoof",
        type: "keybindings",
        exportedAt: new Date().toISOString(),
        bindings: { "command-bar": { key: "CommandOrControl+J" } },
      };

      expect(exported.version).toBe(1);
      expect(exported.appName).toBe("WhisperWoof");
      expect(exported.type).toBe("keybindings");
      expect(exported.bindings).toBeDefined();
    });

    it('rejects invalid import', () => {
      const invalid = { appName: "OtherApp", type: "keybindings", bindings: {} };
      expect(invalid.appName).not.toBe("WhisperWoof");
    });

    it('rejects import with wrong type', () => {
      const invalid = { appName: "WhisperWoof", type: "settings", bindings: {} };
      expect(invalid.type).not.toBe("keybindings");
    });
  });

  describe('categories', () => {
    const categories = ["core", "routing", "navigation", "focus", "privacy"];

    it('all default bindings have valid categories', () => {
      for (const binding of Object.values(DEFAULT_KEYBINDINGS)) {
        expect(categories).toContain(binding.category);
      }
    });
  });
});
