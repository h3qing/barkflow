/**
 * Tuning Bench — Test different pipeline configurations against voice samples
 *
 * Lets users create test cases (voice samples or text), run them through
 * multiple pipeline variants (STT model × polish preset × LLM), and
 * compare outputs to find their preferred configuration.
 *
 * Storage: ~/.config/WhisperWoof/tuning-bench.json
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const BENCH_FILE = path.join(app.getPath("userData"), "tuning-bench.json");

function loadBench() {
  try {
    if (fs.existsSync(BENCH_FILE)) {
      return JSON.parse(fs.readFileSync(BENCH_FILE, "utf-8"));
    }
  } catch (err) {
    debugLogger.warn("[TuningBench] Failed to load", { error: err.message });
  }
  return { testCases: [], variants: [] };
}

function saveBench(data) {
  try {
    fs.writeFileSync(BENCH_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[TuningBench] Failed to save", { error: err.message });
  }
}

// --- Test Cases ---

function saveTestCase({ name, inputText, audioPath }) {
  const bench = loadBench();
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testCase = {
    id,
    name: name || inputText.slice(0, 50),
    inputText,
    audioPath: audioPath || null,
    createdAt: new Date().toISOString(),
  };
  bench.testCases = [...bench.testCases, testCase];
  saveBench(bench);
  return testCase;
}

function getTestCases() {
  return loadBench().testCases;
}

function deleteTestCase(id) {
  const bench = loadBench();
  bench.testCases = bench.testCases.filter((t) => t.id !== id);
  bench.variants = bench.variants.filter((v) => v.testCaseId !== id);
  saveBench(bench);
}

// --- Variants ---

function saveVariantResult(variant) {
  const bench = loadBench();
  const existing = bench.variants.findIndex((v) => v.id === variant.id);
  if (existing >= 0) {
    bench.variants[existing] = variant;
  } else {
    bench.variants = [...bench.variants, variant];
  }
  saveBench(bench);
}

function getVariantsForTest(testCaseId) {
  return loadBench().variants.filter((v) => v.testCaseId === testCaseId);
}

function deleteVariant(id) {
  const bench = loadBench();
  bench.variants = bench.variants.filter((v) => v.id !== id);
  saveBench(bench);
}

// --- Run a variant through the polish pipeline ---

async function runVariant({ testCaseId, inputText, polishPreset, llmProvider, llmModel }) {
  const id = `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const variant = {
    id,
    testCaseId,
    sttModel: "n/a (text input)",
    polishPreset,
    llmProvider,
    llmModel,
    output: null,
    durationMs: null,
    error: null,
    status: "running",
  };

  saveVariantResult(variant);

  const startTime = Date.now();

  try {
    const { polishWithOllama } = require("./ollama-bridge");
    const result = await polishWithOllama(inputText, {
      preset: polishPreset,
      provider: llmProvider,
      model: llmModel,
    });

    variant.output = result.polished || result.text || inputText;
    variant.durationMs = Date.now() - startTime;
    variant.status = "done";
  } catch (err) {
    variant.error = err.message;
    variant.durationMs = Date.now() - startTime;
    variant.status = "error";
  }

  saveVariantResult(variant);
  return variant;
}

// --- Apply a variant's config as default ---

function applyVariantConfig(variant) {
  // This returns the config that should be saved to settings
  // The renderer will update the settings store
  return {
    polishPreset: variant.polishPreset,
    llmProvider: variant.llmProvider,
    llmModel: variant.llmModel,
  };
}

// --- Available options ---

function getAvailableConfigs() {
  const presets = ["clean", "professional", "casual", "minimal", "structured"];

  const providers = [
    { provider: "ollama", models: ["llama3.2:1b", "llama3.2:3b", "llama3.1:8b", "mistral:7b", "gemma2:2b"] },
    { provider: "openai", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1-nano"] },
    { provider: "anthropic", models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6-20250514"] },
    { provider: "groq", models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"] },
  ];

  return { presets, providers };
}

module.exports = {
  saveTestCase,
  getTestCases,
  deleteTestCase,
  saveVariantResult,
  getVariantsForTest,
  deleteVariant,
  runVariant,
  applyVariantConfig,
  getAvailableConfigs,
};
