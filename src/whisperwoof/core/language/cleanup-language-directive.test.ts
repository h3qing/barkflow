import { describe, it, expect, afterEach } from "vitest";
import {
  getSystemPrompt,
  CLEANUP_LANGUAGE_DIRECTIVE,
  AGENT_LANGUAGE_DIRECTIVE,
} from "../../../config/prompts";
import { SCRIPT_MIX_HINTS } from "./script-mix";

// Regression for: dictating in Chinese came back polished into English. The
// bundled local model (Qwen 2B) translates non-English speech because the cleanup
// prompt body + examples are all English. The fix hoists a strong same-language
// rule to the TOP of the cleanup prompt. Agent mode must still translate on
// command, so the directive is cleanup-only.
describe("cleanup language preservation", () => {
  it("prepends the same-language directive at the very top of the cleanup prompt", () => {
    // No transcript / no agent-name match => cleanup mode.
    const prompt = getSystemPrompt("Assistant", undefined, "auto", "随便说点什么", "en");
    expect(prompt.startsWith(CLEANUP_LANGUAGE_DIRECTIVE)).toBe(true);
    expect(prompt).toContain("Never translate");
  });

  it("keeps the same-language directive regardless of preferred language setting", () => {
    for (const lang of ["auto", "en", "zh-CN", undefined]) {
      const prompt = getSystemPrompt("Assistant", undefined, lang, "hello there", "en");
      expect(prompt.startsWith(CLEANUP_LANGUAGE_DIRECTIVE)).toBe(true);
    }
  });

  it("does NOT inject the cleanup directive in agent mode (so translate-on-command still works)", () => {
    // Transcript addresses the agent by name => full/agent prompt, not cleanup.
    const prompt = getSystemPrompt(
      "Jarvis",
      undefined,
      "auto",
      "Jarvis, translate this to Spanish",
      "en"
    );
    expect(prompt.startsWith(CLEANUP_LANGUAGE_DIRECTIVE)).toBe(false);
    expect(prompt).not.toContain(CLEANUP_LANGUAGE_DIRECTIVE);
  });

  it("agent mode still forbids translating what was not asked for", () => {
    const prompt = getSystemPrompt("Jarvis", undefined, "auto", "Jarvis, summarize this", "en");
    expect(prompt.endsWith(AGENT_LANGUAGE_DIRECTIVE)).toBe(true);
  });
});

describe("input-specific script hint (appended LAST so the cached prefix survives)", () => {
  it("names both languages for code-switched dictation", () => {
    const prompt = getSystemPrompt("Assistant", undefined, "auto", "帮我 review 一下这个 PR", "en");
    expect(prompt.endsWith(SCRIPT_MIX_HINTS.mixed)).toBe(true);
  });

  it("pins Chinese output for Chinese-only dictation, under the zh-CN prompt too", () => {
    const prompt = getSystemPrompt("Assistant", undefined, "auto", "明天下午三点开会", "zh-CN");
    expect(prompt.endsWith(SCRIPT_MIX_HINTS.zh)).toBe(true);
    expect(prompt.startsWith(CLEANUP_LANGUAGE_DIRECTIVE)).toBe(true);
  });

  it("comes after the custom dictionary, never before the fixed prompt", () => {
    const prompt = getSystemPrompt("Assistant", ["WhisperWoof"], "auto", "let's ship it", "en");
    expect(prompt.indexOf("WhisperWoof")).toBeLessThan(prompt.indexOf(SCRIPT_MIX_HINTS.en));
    expect(prompt.endsWith(SCRIPT_MIX_HINTS.en)).toBe(true);
  });

  it("adds nothing without a transcript", () => {
    const prompt = getSystemPrompt("Assistant", undefined, "auto", undefined, "en");
    expect(prompt).not.toContain(SCRIPT_MIX_HINTS.en);
    expect(prompt).not.toContain(SCRIPT_MIX_HINTS.zh);
  });

  it("does not append the hint in agent mode", () => {
    const prompt = getSystemPrompt("Jarvis", undefined, "auto", "Jarvis, 帮我 summarize this", "en");
    expect(prompt).not.toContain(SCRIPT_MIX_HINTS.mixed);
  });
});

describe("a saved Prompt Studio prompt gets the same language rules", () => {
  const g = globalThis as unknown as { window?: unknown };
  const original = g.window;

  afterEach(() => {
    g.window = original;
  });

  it("prepends the directive and appends the hint to a custom prompt in cleanup mode", () => {
    const store: Record<string, string> = {
      customUnifiedPrompt: JSON.stringify("You are {{agentName}}. Clean up the text."),
    };
    g.window = { localStorage: { getItem: (k: string) => store[k] ?? null } };
    const prompt = getSystemPrompt("Assistant", undefined, "auto", "帮我 review 一下", "en");
    expect(prompt.startsWith(CLEANUP_LANGUAGE_DIRECTIVE)).toBe(true);
    expect(prompt).toContain("You are Assistant. Clean up the text.");
    expect(prompt.endsWith(SCRIPT_MIX_HINTS.mixed)).toBe(true);
  });

  it("switches a custom prompt to the agent rules when the agent is addressed", () => {
    const store: Record<string, string> = {
      customUnifiedPrompt: JSON.stringify("You are {{agentName}}."),
    };
    g.window = { localStorage: { getItem: (k: string) => store[k] ?? null } };
    const prompt = getSystemPrompt("Jarvis", undefined, "auto", "Jarvis translate this", "en");
    expect(prompt).not.toContain(CLEANUP_LANGUAGE_DIRECTIVE);
    expect(prompt.endsWith(AGENT_LANGUAGE_DIRECTIVE)).toBe(true);
  });
});
