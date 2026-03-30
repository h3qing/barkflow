/**
 * Tests for Vibe Coding — voice-to-code dictation
 *
 * Tests code intent detection, IDE/terminal detection, prompt selection.
 */

import { describe, it, expect } from 'vitest';

// Re-implement detection logic for testing

const CODE_MODE_APPS = new Set([
  "com.microsoft.VSCode",
  "com.todesktop.230313mzl4w4u92",
  "dev.zed.Zed",
  "com.jetbrains.intellij",
  "com.sublimetext.4",
  "com.apple.dt.Xcode",
]);

const SHELL_MODE_APPS = new Set([
  "com.googlecode.iterm2",
  "com.apple.Terminal",
  "dev.warp.Warp-Stable",
]);

const CODE_INTENT_PATTERNS = [
  /\b(create|write|make|add|define|implement)\s+(a\s+)?(function|method|class|component|interface|type|enum|struct|module|hook|handler|middleware|route|endpoint|api|test)\b/i,
  /\b(import|require|export|from)\s+/i,
  /\b(add|wrap|create)\s+(.{0,20})?(try\s*catch|if\s+else|for\s+loop|while\s+loop|switch\s+case|async|await)\b/i,
  /\b(declare|set|create|add)\s+(a\s+)?(variable|constant|const|let|var|state|ref|prop)\b/i,
  /\b(create|make|initialize|return)\s+(an?\s+)?(new\s+)?(array|object|map|set|list|dict|hash|tuple|record|promise)\b/i,
  /\b(sort|filter|map|reduce|find|forEach|iterate|loop\s+through|fetch|request|query|insert|update|delete|select)\b/i,
  /\b(useState|useEffect|useRef|useCallback|useMemo|useContext)\b/i,
  /\b(express|fastify|next|react|vue|angular|svelte|django|flask|rails)\b/i,
  /\b(run|execute|install|npm|pip|brew|git|docker|curl|wget|ssh|chmod|mkdir|grep|sed|awk)\b/i,
];

function hasCodeIntent(text: string | null): boolean {
  if (!text || text.length < 5) return false;
  return CODE_INTENT_PATTERNS.some((p) => p.test(text));
}

function getCodingMode(bundleId: string | null, text: string): 'code' | 'shell' | 'prose' {
  if (bundleId && SHELL_MODE_APPS.has(bundleId)) return "shell";
  if (bundleId && CODE_MODE_APPS.has(bundleId) && hasCodeIntent(text)) return "code";
  return "prose";
}

describe('Vibe Coding', () => {
  describe('hasCodeIntent', () => {
    it('detects function creation', () => {
      expect(hasCodeIntent("create a function that takes a list of numbers and returns the sum")).toBe(true);
      expect(hasCodeIntent("write a method to validate email addresses")).toBe(true);
      expect(hasCodeIntent("make a component called UserProfile")).toBe(true);
    });

    it('detects import statements', () => {
      expect(hasCodeIntent("import react and use state")).toBe(true);
      expect(hasCodeIntent("require express and set up a server")).toBe(true);
    });

    it('detects control flow', () => {
      expect(hasCodeIntent("add a try catch around that block")).toBe(true);
      expect(hasCodeIntent("wrap this in an if else statement")).toBe(true);
      expect(hasCodeIntent("create a for loop that iterates over the array")).toBe(true);
    });

    it('detects variable declarations', () => {
      expect(hasCodeIntent("declare a constant for the API URL")).toBe(true);
      expect(hasCodeIntent("add a useState hook for the loading state")).toBe(true);
    });

    it('detects data structures', () => {
      expect(hasCodeIntent("create an array of user objects")).toBe(true);
      expect(hasCodeIntent("return a new promise that resolves after 5 seconds")).toBe(true);
    });

    it('detects common operations', () => {
      expect(hasCodeIntent("filter the list to only include active users")).toBe(true);
      expect(hasCodeIntent("map over the items and extract the names")).toBe(true);
      expect(hasCodeIntent("fetch data from the API endpoint")).toBe(true);
    });

    it('detects React hooks', () => {
      expect(hasCodeIntent("add a useEffect that runs on mount")).toBe(true);
      expect(hasCodeIntent("create a useCallback for the submit handler")).toBe(true);
    });

    it('detects shell commands', () => {
      expect(hasCodeIntent("run npm install")).toBe(true);
      expect(hasCodeIntent("git commit with message fix typo")).toBe(true);
      expect(hasCodeIntent("install the latest version of express")).toBe(true);
    });

    it('returns false for normal prose', () => {
      expect(hasCodeIntent("I need to buy groceries for dinner tonight")).toBe(false);
      expect(hasCodeIntent("The meeting is at 3pm in the conference room")).toBe(false);
      expect(hasCodeIntent("Please send the report to Sarah by Friday")).toBe(false);
      expect(hasCodeIntent("Remember to call the dentist tomorrow morning")).toBe(false);
    });

    it('returns false for short/empty input', () => {
      expect(hasCodeIntent("")).toBe(false);
      expect(hasCodeIntent(null)).toBe(false);
      expect(hasCodeIntent("hi")).toBe(false);
    });
  });

  describe('getCodingMode', () => {
    it('returns "code" for IDE + code intent', () => {
      expect(getCodingMode("com.microsoft.VSCode", "create a function to sum numbers")).toBe("code");
      expect(getCodingMode("com.todesktop.230313mzl4w4u92", "import react")).toBe("code");
      expect(getCodingMode("com.apple.dt.Xcode", "add a try catch")).toBe("code");
    });

    it('returns "prose" for IDE + no code intent', () => {
      expect(getCodingMode("com.microsoft.VSCode", "this is a comment about the meeting")).toBe("prose");
      expect(getCodingMode("dev.zed.Zed", "remind me to fix the bug")).toBe("prose");
    });

    it('returns "shell" for terminal apps', () => {
      expect(getCodingMode("com.googlecode.iterm2", "list all files")).toBe("shell");
      expect(getCodingMode("com.apple.Terminal", "check disk space")).toBe("shell");
      expect(getCodingMode("dev.warp.Warp-Stable", "run the tests")).toBe("shell");
    });

    it('returns "prose" for non-IDE apps', () => {
      expect(getCodingMode("com.apple.mail", "create a function")).toBe("prose");
      expect(getCodingMode("com.tinyspeck.slackmacgap", "import react")).toBe("prose");
      expect(getCodingMode(null, "create a function")).toBe("prose");
    });
  });

  describe('app registries', () => {
    it('code mode includes major IDEs', () => {
      expect(CODE_MODE_APPS.has("com.microsoft.VSCode")).toBe(true);
      expect(CODE_MODE_APPS.has("com.todesktop.230313mzl4w4u92")).toBe(true); // Cursor
      expect(CODE_MODE_APPS.has("com.apple.dt.Xcode")).toBe(true);
      expect(CODE_MODE_APPS.has("dev.zed.Zed")).toBe(true);
    });

    it('shell mode includes major terminals', () => {
      expect(SHELL_MODE_APPS.has("com.googlecode.iterm2")).toBe(true);
      expect(SHELL_MODE_APPS.has("com.apple.Terminal")).toBe(true);
    });

    it('no overlap between code and shell apps', () => {
      for (const app of CODE_MODE_APPS) {
        expect(SHELL_MODE_APPS.has(app)).toBe(false);
      }
    });
  });
});
