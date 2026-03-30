/**
 * Tests for Privacy Lock Mode — URL/provider validation, overrides
 */

import { describe, it, expect } from 'vitest';

// Re-implement pure validation logic for testing

const ALLOWED_LOCAL = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

function isUrlAllowed(url: string, locked: boolean): boolean {
  if (!locked) return true;
  try {
    const parsed = new URL(url);
    return ALLOWED_LOCAL.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isProviderAllowed(providerId: string, locked: boolean): boolean {
  if (!locked) return true;
  return providerId === "ollama";
}

function getPrivacyOverrides(locked: boolean) {
  if (!locked) return null;
  return {
    provider: "ollama",
    useLocalWhisper: true,
    cloudSttDisabled: true,
    telegramSyncPaused: true,
    analyticsDisabled: true,
    pluginNetworkBlocked: true,
  };
}

describe('Privacy Lock Mode', () => {
  describe('URL validation (locked)', () => {
    it('allows localhost URLs', () => {
      expect(isUrlAllowed("http://localhost:11434/api/chat", true)).toBe(true);
      expect(isUrlAllowed("http://127.0.0.1:11434/api/tags", true)).toBe(true);
      expect(isUrlAllowed("http://0.0.0.0:8080/test", true)).toBe(true);
    });

    it('blocks cloud URLs', () => {
      expect(isUrlAllowed("https://api.openai.com/v1/chat/completions", true)).toBe(false);
      expect(isUrlAllowed("https://api.anthropic.com/v1/messages", true)).toBe(false);
      expect(isUrlAllowed("https://api.groq.com/openai/v1/chat/completions", true)).toBe(false);
      expect(isUrlAllowed("https://api.todoist.com/rest/v2/tasks", true)).toBe(false);
    });

    it('blocks Telegram API', () => {
      expect(isUrlAllowed("https://api.telegram.org/bot123/getUpdates", true)).toBe(false);
    });

    it('blocks invalid URLs', () => {
      expect(isUrlAllowed("not-a-url", true)).toBe(false);
      expect(isUrlAllowed("", true)).toBe(false);
    });
  });

  describe('URL validation (unlocked)', () => {
    it('allows all URLs when unlocked', () => {
      expect(isUrlAllowed("https://api.openai.com/v1/chat", false)).toBe(true);
      expect(isUrlAllowed("https://api.anthropic.com/v1/messages", false)).toBe(true);
      expect(isUrlAllowed("http://localhost:11434/api/chat", false)).toBe(true);
    });
  });

  describe('provider validation', () => {
    it('only allows ollama when locked', () => {
      expect(isProviderAllowed("ollama", true)).toBe(true);
      expect(isProviderAllowed("openai", true)).toBe(false);
      expect(isProviderAllowed("anthropic", true)).toBe(false);
      expect(isProviderAllowed("groq", true)).toBe(false);
    });

    it('allows all providers when unlocked', () => {
      expect(isProviderAllowed("ollama", false)).toBe(true);
      expect(isProviderAllowed("openai", false)).toBe(true);
      expect(isProviderAllowed("anthropic", false)).toBe(true);
      expect(isProviderAllowed("groq", false)).toBe(true);
    });
  });

  describe('privacy overrides', () => {
    it('returns overrides when locked', () => {
      const overrides = getPrivacyOverrides(true);
      expect(overrides).not.toBeNull();
      expect(overrides!.provider).toBe("ollama");
      expect(overrides!.useLocalWhisper).toBe(true);
      expect(overrides!.cloudSttDisabled).toBe(true);
      expect(overrides!.telegramSyncPaused).toBe(true);
      expect(overrides!.analyticsDisabled).toBe(true);
      expect(overrides!.pluginNetworkBlocked).toBe(true);
    });

    it('returns null when unlocked', () => {
      expect(getPrivacyOverrides(false)).toBeNull();
    });

    it('overrides force ollama provider', () => {
      const overrides = getPrivacyOverrides(true)!;
      expect(overrides.provider).toBe("ollama");
    });

    it('overrides disable all cloud services', () => {
      const overrides = getPrivacyOverrides(true)!;
      expect(overrides.cloudSttDisabled).toBe(true);
      expect(overrides.telegramSyncPaused).toBe(true);
      expect(overrides.analyticsDisabled).toBe(true);
    });
  });

  describe('localhost variants', () => {
    it('recognizes all standard local addresses', () => {
      expect(ALLOWED_LOCAL).toContain("localhost");
      expect(ALLOWED_LOCAL).toContain("127.0.0.1");
      expect(ALLOWED_LOCAL).toContain("0.0.0.0");
      expect(ALLOWED_LOCAL).toContain("::1");
    });

    it('has exactly 4 allowed addresses', () => {
      expect(ALLOWED_LOCAL).toHaveLength(4);
    });
  });

  describe('edge cases', () => {
    it('handles localhost with port', () => {
      expect(isUrlAllowed("http://localhost:3000", true)).toBe(true);
      expect(isUrlAllowed("http://localhost:11434/api/chat", true)).toBe(true);
    });

    it('handles localhost with path', () => {
      expect(isUrlAllowed("http://localhost/deep/path/here", true)).toBe(true);
    });

    it('blocks local-looking but not actually local domains', () => {
      expect(isUrlAllowed("http://localhost.evil.com/steal", true)).toBe(false);
    });

    it('blocks private IP ranges (not just loopback)', () => {
      // Privacy lock is strict — only explicit localhost, not 192.168.x.x
      expect(isUrlAllowed("http://192.168.1.1:11434", true)).toBe(false);
      expect(isUrlAllowed("http://10.0.0.1:11434", true)).toBe(false);
    });
  });
});
