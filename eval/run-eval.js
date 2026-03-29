#!/usr/bin/env node

/**
 * WhisperWoof Eval Runner
 *
 * Runs test cases against the Ollama polish pipeline and scores results.
 * Can use either real audio files (via Whisper) or text-only (polish only).
 *
 * Usage:
 *   node eval/run-eval.js                    # Polish-only eval (no audio needed)
 *   node eval/run-eval.js --with-audio       # Full pipeline eval (needs audio files)
 *   node eval/run-eval.js --preset clean     # Test specific preset
 *   node eval/run-eval.js --preset all       # Test all presets
 */

const fs = require("fs");
const path = require("path");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const CONFIG_PATH = path.join(__dirname, "eval-config.json");
const RESULTS_DIR = path.join(__dirname, "results");

// --- Helpers ---

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function wordErrorRate(expected, actual) {
  const expWords = expected.toLowerCase().split(/\s+/).filter(Boolean);
  const actWords = actual.toLowerCase().split(/\s+/).filter(Boolean);
  const dist = levenshteinDistance(expWords, actWords);
  return expWords.length === 0 ? 0 : dist / expWords.length;
}

function fillerWordCount(text) {
  const fillers = ["um", "uh", "like", "you know", "so", "basically", "actually", "right"];
  const lower = text.toLowerCase();
  let count = 0;
  for (const filler of fillers) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

function hasNumberedList(text) {
  return /\d+\.\s/.test(text);
}

function hasBulletList(text) {
  return /^[-•]\s/m.test(text);
}

// --- Ollama Polish ---

async function polishText(text, preset) {
  const { getPresetPrompt } = require(path.join(__dirname, "..", "src", "whisperwoof", "bridge", "polish-presets.js"));
  const systemPrompt = getPresetPrompt(preset);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 512 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text, error: `HTTP ${response.status}`, latencyMs: 0 };
    }

    const data = await response.json();
    const polished = data?.message?.content?.trim() || text;
    return { text: polished, error: null };
  } catch (err) {
    clearTimeout(timer);
    return { text, error: err.message };
  }
}

// --- Eval Runner ---

async function runEval(options = {}) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const presets = options.preset === "all"
    ? ["clean", "professional", "casual", "minimal", "structured"]
    : [options.preset || "clean"];

  console.log(`\nWhisperWoof Eval — ${config.cases.length} cases × ${presets.length} preset(s)`);
  console.log(`Model: ${OLLAMA_MODEL} | URL: ${OLLAMA_URL}\n`);

  // Check Ollama is running
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!check.ok) throw new Error("not ok");
    console.log("✓ Ollama is running\n");
  } catch {
    console.error("✗ Ollama is not running. Start it with: ollama serve\n");
    process.exit(1);
  }

  const results = [];

  for (const preset of presets) {
    console.log(`--- Preset: ${preset} ---`);

    for (const testCase of config.cases) {
      const start = Date.now();
      const polishResult = await polishText(testCase.spoken, preset);
      const latencyMs = Date.now() - start;

      const expected = testCase.expectedPolish[preset] || "";
      const actual = polishResult.text;
      const wer = wordErrorRate(expected, actual);
      const fillersRemaining = fillerWordCount(actual);
      const fillersInInput = fillerWordCount(testCase.spoken);
      const fillerRemovalRate = fillersInInput > 0
        ? 1 - (fillersRemaining / fillersInInput)
        : 1;

      const result = {
        id: testCase.id,
        preset,
        input: testCase.spoken,
        expected,
        actual,
        wer: Math.round(wer * 100) / 100,
        fillerRemovalRate: Math.round(fillerRemovalRate * 100) / 100,
        fillersRemaining,
        latencyMs,
        hasNumberedList: hasNumberedList(actual),
        hasBulletList: hasBulletList(actual),
        error: polishResult.error,
        pass: wer < 0.5 && fillerRemovalRate >= 0.8,
      };

      results.push(result);

      const status = result.pass ? "✓" : "✗";
      const werPct = Math.round(wer * 100);
      const fillerPct = Math.round(fillerRemovalRate * 100);
      console.log(
        `  ${status} ${testCase.id.padEnd(25)} WER: ${String(werPct).padStart(3)}% | Fillers: ${fillerPct}% removed | ${latencyMs}ms`
      );
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const avgWer = results.reduce((s, r) => s + r.wer, 0) / total;
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);
  const avgFillerRemoval = results.reduce((s, r) => s + r.fillerRemovalRate, 0) / total;

  console.log("=== SUMMARY ===");
  console.log(`Pass rate:        ${passed}/${total} (${Math.round(passed / total * 100)}%)`);
  console.log(`Avg WER:          ${Math.round(avgWer * 100)}%`);
  console.log(`Avg filler removal: ${Math.round(avgFillerRemoval * 100)}%`);
  console.log(`Avg latency:      ${avgLatency}ms`);

  // Save results
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsPath = path.join(RESULTS_DIR, `eval-${timestamp}.json`);
  const latestPath = path.join(RESULTS_DIR, "latest.json");

  const output = {
    timestamp: new Date().toISOString(),
    model: OLLAMA_MODEL,
    presets,
    summary: { passed, total, avgWer, avgLatency, avgFillerRemoval },
    results,
  };

  fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  return output;
}

// --- CLI ---
const args = process.argv.slice(2);
const preset = args.includes("--preset") ? args[args.indexOf("--preset") + 1] : "clean";

runEval({ preset }).catch(console.error);
