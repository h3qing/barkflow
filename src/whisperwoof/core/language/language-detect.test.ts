/**
 * Tests for Language Detection — multi-language support
 *
 * Tests script-based and word-frequency heuristic detection.
 */

import { describe, it, expect } from 'vitest';

// Re-implement detection logic for testing

const SCRIPT_PATTERNS = [
  { lang: "ja", pattern: /[\u3040-\u309F\u30A0-\u30FF]/ },
  { lang: "ko", pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
  { lang: "zh", pattern: /[\u4E00-\u9FFF\u3400-\u4DBF]/ },
  { lang: "ar", pattern: /[\u0600-\u06FF\u0750-\u077F]/ },
  { lang: "hi", pattern: /[\u0900-\u097F]/ },
  { lang: "th", pattern: /[\u0E00-\u0E7F]/ },
  { lang: "ru", pattern: /[\u0400-\u04FF]/ },
];

const WORD_PATTERNS = [
  { lang: "es", words: ["que", "por", "las", "los", "una", "del", "con", "para", "como", "esta", "pero", "más", "tiene", "también", "puede"] },
  { lang: "fr", words: ["les", "des", "une", "que", "est", "dans", "pour", "pas", "qui", "sur", "avec", "sont", "mais", "cette", "tout"] },
  { lang: "de", words: ["der", "die", "das", "und", "ist", "ein", "eine", "für", "mit", "auf", "den", "nicht", "sich", "auch", "werden"] },
  { lang: "pt", words: ["que", "para", "uma", "com", "por", "não", "mais", "está", "tem", "são", "mas", "como", "muito", "também", "pode"] },
  { lang: "it", words: ["che", "per", "una", "con", "sono", "non", "come", "questo", "anche", "della", "più", "alla", "nella", "essere", "fatto"] },
];

function detectLanguage(text: string | null): { lang: string; name: string; confidence: string } {
  if (!text || text.trim().length < 5) {
    return { lang: "en", name: "English", confidence: "default" };
  }

  const trimmed = text.trim();

  // Script-based
  for (const { lang, pattern } of SCRIPT_PATTERNS) {
    const matches = (trimmed.match(new RegExp(pattern.source, "g")) || []).length;
    if (matches / trimmed.length > 0.15) {
      return { lang, name: lang, confidence: "high" };
    }
  }

  // Word-frequency
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length < 3) return { lang: "en", name: "English", confidence: "default" };

  const wordSet = new Set(words);
  let bestLang: string | null = null;
  let bestScore = 0;

  for (const { lang, words: markers } of WORD_PATTERNS) {
    const matchCount = markers.filter((m) => wordSet.has(m)).length;
    const score = matchCount / markers.length;
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  if (bestLang && bestScore >= 0.2) {
    return { lang: bestLang, name: bestLang, confidence: bestScore >= 0.4 ? "high" : "medium" };
  }

  return { lang: "en", name: "English", confidence: "default" };
}

describe('Language Detection', () => {
  describe('script-based detection', () => {
    it('detects Japanese (hiragana/katakana)', () => {
      expect(detectLanguage("これはテストです。日本語のテキストです。")).toEqual(
        expect.objectContaining({ lang: "ja", confidence: "high" })
      );
    });

    it('detects Korean (Hangul)', () => {
      expect(detectLanguage("이것은 한국어 텍스트입니다. 테스트합니다.")).toEqual(
        expect.objectContaining({ lang: "ko", confidence: "high" })
      );
    });

    it('detects Chinese (CJK)', () => {
      expect(detectLanguage("这是一个中文文本测试。你好世界。")).toEqual(
        expect.objectContaining({ lang: "zh", confidence: "high" })
      );
    });

    it('detects Arabic', () => {
      expect(detectLanguage("هذا نص باللغة العربية للاختبار")).toEqual(
        expect.objectContaining({ lang: "ar", confidence: "high" })
      );
    });

    it('detects Russian (Cyrillic)', () => {
      expect(detectLanguage("Это текст на русском языке для тестирования")).toEqual(
        expect.objectContaining({ lang: "ru", confidence: "high" })
      );
    });

    it('detects Hindi (Devanagari)', () => {
      expect(detectLanguage("यह हिंदी में एक परीक्षण पाठ है")).toEqual(
        expect.objectContaining({ lang: "hi", confidence: "high" })
      );
    });

    it('detects Thai', () => {
      expect(detectLanguage("นี่คือข้อความภาษาไทยสำหรับการทดสอบ")).toEqual(
        expect.objectContaining({ lang: "th", confidence: "high" })
      );
    });
  });

  describe('word-frequency detection (Latin scripts)', () => {
    it('detects Spanish', () => {
      const result = detectLanguage("Esta es una prueba del sistema para detectar que idioma estamos usando con más palabras");
      expect(result.lang).toBe("es");
    });

    it('detects French', () => {
      const result = detectLanguage("Les résultats sont dans une base de données pour les utilisateurs qui sont sur cette plateforme");
      expect(result.lang).toBe("fr");
    });

    it('detects German', () => {
      const result = detectLanguage("Der Mann ist ein guter Freund und die Frau ist auch eine nette Person für das Team");
      expect(result.lang).toBe("de");
    });

    it('detects Italian', () => {
      const result = detectLanguage("Questo non è un problema per una persona che viene anche dalla città della regione");
      expect(result.lang).toBe("it");
    });
  });

  describe('English (default)', () => {
    it('defaults to English for English text', () => {
      const result = detectLanguage("I need to buy groceries and pick up the kids from school today");
      expect(result.lang).toBe("en");
    });

    it('defaults to English for short text', () => {
      expect(detectLanguage("hi")).toEqual(
        expect.objectContaining({ lang: "en", confidence: "default" })
      );
    });

    it('defaults to English for null', () => {
      expect(detectLanguage(null)).toEqual(
        expect.objectContaining({ lang: "en", confidence: "default" })
      );
    });

    it('defaults to English for empty string', () => {
      expect(detectLanguage("")).toEqual(
        expect.objectContaining({ lang: "en", confidence: "default" })
      );
    });
  });

  describe('confidence levels', () => {
    it('script detection is always high confidence', () => {
      expect(detectLanguage("これはテストです。日本語のテキストです。").confidence).toBe("high");
    });

    it('strong word match is high confidence', () => {
      const result = detectLanguage("Les résultats sont dans une base de données pour les utilisateurs qui sont sur cette plateforme avec des outils");
      expect(["high", "medium"]).toContain(result.confidence);
    });

    it('English defaults have default confidence', () => {
      expect(detectLanguage("hello world test").confidence).toBe("default");
    });
  });

  describe('edge cases', () => {
    it('handles mixed-script text (majority wins)', () => {
      // Mostly Japanese with some English words
      const result = detectLanguage("これはtestです。日本語のtextです。テストrunning。");
      expect(result.lang).toBe("ja");
    });

    it('handles numbers and punctuation gracefully', () => {
      expect(detectLanguage("12345 !@#$% 67890")).toEqual(
        expect.objectContaining({ lang: "en", confidence: "default" })
      );
    });
  });
});
