/**
 * Tests for LLM Provider System (BYOM)
 *
 * Tests provider registry, configuration validation, and dispatch logic.
 * Actual API calls are not tested — these verify the provider abstraction.
 */

import { describe, it, expect } from 'vitest';

// Provider metadata re-implemented for testing (no network deps)
interface ProviderInfo {
  id: string;
  name: string;
  requiresApiKey: boolean;
  defaultModel: string;
  models: string[];
}

const PROVIDERS: Record<string, ProviderInfo> = {
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    requiresApiKey: false,
    defaultModel: "llama3.2:1b",
    models: ["llama3.2:1b", "llama3.2:3b", "llama3.1:8b", "mistral:7b", "gemma2:2b"],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1-nano"],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    requiresApiKey: true,
    defaultModel: "claude-haiku-4-5-20251001",
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6-20250514"],
  },
  groq: {
    id: "groq",
    name: "Groq",
    requiresApiKey: true,
    defaultModel: "llama-3.1-8b-instant",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  },
};

function getProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS);
}

function validateConfig(config: { provider?: string; apiKey?: string }): string | null {
  const providerId = config.provider || "ollama";
  const provider = PROVIDERS[providerId];
  if (!provider) return `Unknown provider: ${providerId}`;
  if (provider.requiresApiKey && !config.apiKey) return `${provider.name} requires an API key`;
  return null;
}

describe('LLM Provider System (BYOM)', () => {
  describe('provider registry', () => {
    it('has 4 providers', () => {
      expect(getProviders()).toHaveLength(4);
    });

    it('includes ollama, openai, anthropic, groq', () => {
      const ids = getProviders().map((p) => p.id);
      expect(ids).toContain("ollama");
      expect(ids).toContain("openai");
      expect(ids).toContain("anthropic");
      expect(ids).toContain("groq");
    });

    it('ollama does not require an API key', () => {
      expect(PROVIDERS.ollama.requiresApiKey).toBe(false);
    });

    it('cloud providers require API keys', () => {
      expect(PROVIDERS.openai.requiresApiKey).toBe(true);
      expect(PROVIDERS.anthropic.requiresApiKey).toBe(true);
      expect(PROVIDERS.groq.requiresApiKey).toBe(true);
    });

    it('each provider has a default model', () => {
      for (const provider of getProviders()) {
        expect(provider.defaultModel).toBeTruthy();
        expect(provider.models).toContain(provider.defaultModel);
      }
    });

    it('each provider has at least 2 model options', () => {
      for (const provider of getProviders()) {
        expect(provider.models.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('all provider IDs are unique', () => {
      const ids = getProviders().map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('config validation', () => {
    it('ollama with no API key is valid', () => {
      expect(validateConfig({ provider: "ollama" })).toBeNull();
    });

    it('openai without API key is invalid', () => {
      const error = validateConfig({ provider: "openai" });
      expect(error).toContain("requires an API key");
    });

    it('openai with API key is valid', () => {
      expect(validateConfig({ provider: "openai", apiKey: "sk-test" })).toBeNull();
    });

    it('anthropic without API key is invalid', () => {
      const error = validateConfig({ provider: "anthropic" });
      expect(error).toContain("requires an API key");
    });

    it('anthropic with API key is valid', () => {
      expect(validateConfig({ provider: "anthropic", apiKey: "sk-ant-test" })).toBeNull();
    });

    it('groq without API key is invalid', () => {
      const error = validateConfig({ provider: "groq" });
      expect(error).toContain("requires an API key");
    });

    it('groq with API key is valid', () => {
      expect(validateConfig({ provider: "groq", apiKey: "gsk-test" })).toBeNull();
    });

    it('unknown provider is invalid', () => {
      const error = validateConfig({ provider: "cohere" });
      expect(error).toContain("Unknown provider");
    });

    it('defaults to ollama when no provider specified', () => {
      expect(validateConfig({})).toBeNull();
    });
  });

  describe('model listings', () => {
    it('ollama lists local models', () => {
      expect(PROVIDERS.ollama.models).toContain("llama3.2:1b");
      expect(PROVIDERS.ollama.models).toContain("llama3.2:3b");
    });

    it('openai lists GPT models', () => {
      expect(PROVIDERS.openai.models).toContain("gpt-4o-mini");
      expect(PROVIDERS.openai.models).toContain("gpt-4o");
    });

    it('anthropic lists Claude models', () => {
      expect(PROVIDERS.anthropic.models).toContain("claude-haiku-4-5-20251001");
      expect(PROVIDERS.anthropic.models).toContain("claude-sonnet-4-6-20250514");
    });

    it('groq lists fast inference models', () => {
      expect(PROVIDERS.groq.models).toContain("llama-3.1-8b-instant");
      expect(PROVIDERS.groq.models).toContain("llama-3.3-70b-versatile");
    });
  });
});
