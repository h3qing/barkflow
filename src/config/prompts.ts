import promptData from "./promptData.json";
import i18n, { normalizeUiLanguage } from "../i18n";
import { en as enPrompts, type PromptBundle } from "../locales/prompts";
import { getLanguageInstruction } from "../utils/languageSupport";

export const CLEANUP_PROMPT = promptData.CLEANUP_PROMPT;
export const ACTION_PROMPT = promptData.ACTION_PROMPT;
/** @deprecated Use ACTION_PROMPT — kept for PromptStudio compat */
export const UNIFIED_SYSTEM_PROMPT = promptData.ACTION_PROMPT;

function getPromptBundle(uiLanguage?: string): PromptBundle {
  const locale = normalizeUiLanguage(uiLanguage || "en");
  const t = i18n.getFixedT(locale, "prompts");

  return {
    cleanupPrompt: t("cleanupPrompt", { defaultValue: enPrompts.cleanupPrompt }),
    actionPrompt: t("actionPrompt", { defaultValue: enPrompts.actionPrompt }),
    dictionarySuffix: t("dictionarySuffix", { defaultValue: enPrompts.dictionarySuffix }),
  };
}

function detectAgentName(transcript: string, agentName: string): boolean {
  const lower = transcript.toLowerCase();
  const name = agentName.toLowerCase();

  return lower.includes(name);
}

export function getSystemPrompt(
  agentName: string | null,
  customDictionary?: string[],
  language?: string,
  transcript?: string,
  uiLanguage?: string
): string {
  const name = agentName?.trim() || "Assistant";
  const prompts = getPromptBundle(uiLanguage);

  let promptTemplate: string | null = null;
  if (typeof window !== "undefined" && window.localStorage) {
    const customPrompt = window.localStorage.getItem("customUnifiedPrompt");
    if (customPrompt) {
      try {
        promptTemplate = JSON.parse(customPrompt);
      } catch {}
    }
  }

  let prompt: string;
  if (promptTemplate) {
    prompt = promptTemplate.replace(/\{\{agentName\}\}/g, name);
  } else {
    const useActionPrompt = !transcript || detectAgentName(transcript, name);
    prompt = (useActionPrompt ? prompts.actionPrompt : prompts.cleanupPrompt).replace(
      /\{\{agentName\}\}/g,
      name
    );
  }

  const langInstruction = getLanguageInstruction(language);
  if (langInstruction) {
    prompt += "\n\n" + langInstruction;
  }

  if (customDictionary && customDictionary.length > 0) {
    prompt += prompts.dictionarySuffix + customDictionary.join(", ");
  }

  return prompt;
}

export function getWordBoost(customDictionary?: string[]): string[] {
  if (!customDictionary || customDictionary.length === 0) return [];
  return customDictionary.filter((w) => w.trim());
}

const DEFAULT_AGENT_SYSTEM_PROMPT =
  "You are a helpful voice assistant. Respond concisely and conversationally. " +
  "Keep answers brief unless the user asks for detail. " +
  "You may be given a transcription of spoken input, so handle informal phrasing gracefully.";

export function getAgentSystemPrompt(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    const custom = window.localStorage.getItem("agentSystemPrompt");
    if (custom) return custom;
  }
  return DEFAULT_AGENT_SYSTEM_PROMPT;
}
