/**
 * TuningBench — Pipeline configuration testing with multi-variant comparison
 *
 * Create test cases from voice transcripts, run multiple pipeline configs
 * in parallel, compare outputs side-by-side, pick the best one.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Beaker,
  Plus,
  Play,
  Trash2,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
  Star,
  Copy,
} from "lucide-react";
import { cn } from "../../../components/lib/utils";

// --- Types ---

interface TestCase {
  id: string;
  name: string;
  inputText: string;
  createdAt: string;
}

interface Variant {
  id: string;
  testCaseId: string;
  sttModel: string;
  polishPreset: string;
  llmProvider: string;
  llmModel: string;
  output: string | null;
  durationMs: number | null;
  error: string | null;
  status: "pending" | "running" | "done" | "error";
}

interface ProviderConfig {
  provider: string;
  models: string[];
}

interface AvailableConfigs {
  presets: string[];
  providers: ProviderConfig[];
}

interface TuningAPI {
  whisperwoofTuningGetConfigs?: () => Promise<AvailableConfigs>;
  whisperwoofTuningSaveTest?: (tc: { name: string; inputText: string }) => Promise<TestCase>;
  whisperwoofTuningGetTests?: () => Promise<TestCase[]>;
  whisperwoofTuningDeleteTest?: (id: string) => Promise<{ success: boolean }>;
  whisperwoofTuningGetVariants?: (tcId: string) => Promise<Variant[]>;
  whisperwoofTuningRunVariant?: (config: Record<string, string>) => Promise<Variant>;
  whisperwoofTuningDeleteVariant?: (id: string) => Promise<{ success: boolean }>;
}

function getAPI(): TuningAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

const PRESET_LABELS: Record<string, string> = {
  clean: "Clean",
  professional: "Professional",
  casual: "Casual",
  minimal: "Minimal",
  structured: "Structured",
};

// --- Variant Card ---

function VariantCard({
  variant,
  isFastest,
  onDelete,
  onApply,
}: {
  variant: Variant;
  isFastest: boolean;
  onDelete: (id: string) => void;
  onApply: (v: Variant) => void;
}) {
  const handleCopy = () => {
    if (variant.output) navigator.clipboard.writeText(variant.output);
  };

  return (
    <div className={cn(
      "rounded-lg border p-3 min-w-[220px] max-w-[300px] flex flex-col gap-2",
      variant.status === "done"
        ? "border-border/20 dark:border-white/8 bg-foreground/[0.015] dark:bg-white/[0.02]"
        : variant.status === "error"
          ? "border-red-500/20 bg-red-500/[0.03]"
          : "border-border/10 dark:border-white/4 bg-foreground/[0.01]"
    )}>
      {/* Config header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary/80">
            {PRESET_LABELS[variant.polishPreset] || variant.polishPreset}
          </span>
          <span className="text-[10px] text-muted-foreground/40">
            {variant.llmProvider}:{variant.llmModel.split(":").pop()}
          </span>
        </div>
        <button onClick={() => onDelete(variant.id)} className="text-muted-foreground/20 hover:text-red-400 transition-colors">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Output */}
      <div className="flex-1 min-h-[80px]">
        {variant.status === "running" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50 py-4">
            <Loader2 size={12} className="animate-spin" /> Processing...
          </div>
        )}
        {variant.status === "error" && (
          <div className="flex items-start gap-1.5 text-xs text-red-400/70">
            <AlertCircle size={11} className="shrink-0 mt-0.5" />
            <span>{variant.error}</span>
          </div>
        )}
        {variant.status === "done" && (
          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {variant.output}
          </p>
        )}
        {variant.status === "pending" && (
          <p className="text-xs text-muted-foreground/30 italic py-4">Ready to run</p>
        )}
      </div>

      {/* Footer */}
      {variant.status === "done" && (
        <div className="flex items-center justify-between pt-1 border-t border-border/10 dark:border-white/4">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
            <span className="flex items-center gap-0.5">
              <Clock size={9} /> {variant.durationMs ? `${(variant.durationMs / 1000).toFixed(1)}s` : "—"}
            </span>
            {isFastest && (
              <span className="text-emerald-500/60 flex items-center gap-0.5">
                <Star size={9} /> fastest
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleCopy} className="p-1 rounded hover:bg-foreground/5 text-muted-foreground/30 hover:text-foreground transition-colors" title="Copy output">
              <Copy size={11} />
            </button>
            <button
              onClick={() => onApply(variant)}
              className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary px-2 py-0.5 rounded bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <Check size={10} /> Use this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main ---

export default function TuningBench() {
  const [configs, setConfigs] = useState<AvailableConfigs | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestCase | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [newTestText, setNewTestText] = useState("");
  const [newPreset, setNewPreset] = useState("clean");
  const [newProvider, setNewProvider] = useState("ollama");
  const [newModel, setNewModel] = useState("llama3.2:1b");
  const [applied, setApplied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    if (api.whisperwoofTuningGetConfigs) setConfigs(await api.whisperwoofTuningGetConfigs());
    if (api.whisperwoofTuningGetTests) setTestCases(await api.whisperwoofTuningGetTests());
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!selectedTest) return;
    const api = getAPI();
    if (api.whisperwoofTuningGetVariants) {
      api.whisperwoofTuningGetVariants(selectedTest.id).then(setVariants);
    }
  }, [selectedTest]);

  const handleAddTest = async () => {
    if (!newTestText.trim()) return;
    const api = getAPI();
    if (api.whisperwoofTuningSaveTest) {
      const tc = await api.whisperwoofTuningSaveTest({
        name: newTestText.slice(0, 50),
        inputText: newTestText,
      });
      if (tc) {
        setTestCases((prev) => [...prev, tc]);
        setSelectedTest(tc);
        setNewTestText("");
        setIsAddingTest(false);
      }
    }
  };

  const handleDeleteTest = async (id: string) => {
    const api = getAPI();
    if (api.whisperwoofTuningDeleteTest) await api.whisperwoofTuningDeleteTest(id);
    setTestCases((prev) => prev.filter((t) => t.id !== id));
    if (selectedTest?.id === id) { setSelectedTest(null); setVariants([]); }
  };

  const handleAddVariant = async () => {
    if (!selectedTest) return;
    const api = getAPI();
    if (!api.whisperwoofTuningRunVariant) return;

    // Create a pending variant in the UI immediately
    const tempId = `temp-${Date.now()}`;
    const pending: Variant = {
      id: tempId,
      testCaseId: selectedTest.id,
      sttModel: "n/a",
      polishPreset: newPreset,
      llmProvider: newProvider,
      llmModel: newModel,
      output: null,
      durationMs: null,
      error: null,
      status: "running",
    };
    setVariants((prev) => [...prev, pending]);

    // Run it
    const result = await api.whisperwoofTuningRunVariant({
      testCaseId: selectedTest.id,
      inputText: selectedTest.inputText,
      polishPreset: newPreset,
      llmProvider: newProvider,
      llmModel: newModel,
    });

    // Replace temp with real result
    setVariants((prev) => prev.map((v) => v.id === tempId ? result : v));
  };

  const handleDeleteVariant = async (id: string) => {
    const api = getAPI();
    if (api.whisperwoofTuningDeleteVariant) await api.whisperwoofTuningDeleteVariant(id);
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleApply = (variant: Variant) => {
    setApplied(`Applied: ${PRESET_LABELS[variant.polishPreset]} + ${variant.llmProvider}:${variant.llmModel}`);
    setTimeout(() => setApplied(null), 3000);
    // TODO: actually update settings store with this config
  };

  const handleRunAll = async () => {
    if (!selectedTest || !configs) return;
    const api = getAPI();
    if (!api.whisperwoofTuningRunVariant) return;

    // Run all presets with current LLM
    const presets = configs.presets;
    const newVariants: Variant[] = presets.map((preset) => ({
      id: `temp-${Date.now()}-${preset}`,
      testCaseId: selectedTest.id,
      sttModel: "n/a",
      polishPreset: preset,
      llmProvider: newProvider,
      llmModel: newModel,
      output: null,
      durationMs: null,
      error: null,
      status: "running" as const,
    }));
    setVariants(newVariants);

    // Run in parallel
    const results = await Promise.all(
      presets.map((preset) =>
        api.whisperwoofTuningRunVariant!({
          testCaseId: selectedTest.id,
          inputText: selectedTest.inputText,
          polishPreset: preset,
          llmProvider: newProvider,
          llmModel: newModel,
        })
      )
    );
    setVariants(results);
  };

  const doneVariants = variants.filter((v) => v.status === "done" && v.durationMs);
  const fastestId = doneVariants.length > 0
    ? doneVariants.reduce((a, b) => (a.durationMs! < b.durationMs! ? a : b)).id
    : null;

  const providerModels = configs?.providers.find((p) => p.provider === newProvider)?.models || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/15 dark:border-white/6 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Beaker size={14} className="text-primary/70" />
              Pipeline Tuning Bench
            </h2>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              Test different polish configs against your voice samples
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Applied notification */}
        {applied && (
          <div className="flex items-center gap-2 text-xs text-emerald-500/80 bg-emerald-500/5 px-3 py-2 rounded-md">
            <Check size={12} /> {applied}
          </div>
        )}

        {/* Test Case Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground/70">Test Cases</span>
            <button
              onClick={() => setIsAddingTest(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <Plus size={11} /> Add test
            </button>
          </div>

          {isAddingTest && (
            <div className="space-y-2">
              <textarea
                value={newTestText}
                onChange={(e) => setNewTestText(e.target.value)}
                placeholder="Paste a voice transcript or type text to test polish quality..."
                className="w-full text-xs bg-transparent border border-border/20 dark:border-white/8 rounded-md px-3 py-2 outline-none focus:border-primary/40 min-h-[60px] resize-none placeholder:text-muted-foreground/30"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleAddTest} className="text-[11px] text-primary px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/15">Save</button>
                <button onClick={() => setIsAddingTest(false)} className="text-[11px] text-muted-foreground px-2.5 py-1">Cancel</button>
              </div>
            </div>
          )}

          {/* Test case list */}
          <div className="flex flex-wrap gap-2">
            {testCases.map((tc) => (
              <button
                key={tc.id}
                onClick={() => setSelectedTest(tc)}
                className={cn(
                  "text-[11px] px-3 py-1.5 rounded-md border transition-all max-w-[200px] truncate",
                  selectedTest?.id === tc.id
                    ? "border-primary/30 bg-primary/[0.06] text-foreground"
                    : "border-border/15 dark:border-white/5 text-muted-foreground/60 hover:text-foreground hover:border-border/30"
                )}
              >
                {tc.name}
              </button>
            ))}
            {testCases.length === 0 && !isAddingTest && (
              <p className="text-[11px] text-muted-foreground/40 italic">
                No test cases yet. Add one to start tuning.
              </p>
            )}
          </div>
        </div>

        {/* Selected test input preview */}
        {selectedTest && (
          <div className="rounded-md bg-foreground/[0.02] dark:bg-white/[0.02] border border-border/10 dark:border-white/4 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Input</span>
              <button onClick={() => handleDeleteTest(selectedTest.id)} className="text-muted-foreground/20 hover:text-red-400">
                <Trash2 size={10} />
              </button>
            </div>
            <p className="text-xs text-foreground/60 leading-relaxed">{selectedTest.inputText}</p>
          </div>
        )}

        {/* Variant Config + Actions */}
        {selectedTest && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset selector */}
            <select
              value={newPreset}
              onChange={(e) => setNewPreset(e.target.value)}
              className="text-[11px] bg-transparent border border-border/20 dark:border-white/8 rounded px-2 py-1 outline-none text-foreground/70"
            >
              {(configs?.presets || []).map((p) => (
                <option key={p} value={p}>{PRESET_LABELS[p] || p}</option>
              ))}
            </select>

            {/* Provider selector */}
            <select
              value={newProvider}
              onChange={(e) => { setNewProvider(e.target.value); setNewModel(configs?.providers.find((p) => p.provider === e.target.value)?.models[0] || ""); }}
              className="text-[11px] bg-transparent border border-border/20 dark:border-white/8 rounded px-2 py-1 outline-none text-foreground/70"
            >
              {(configs?.providers || []).map((p) => (
                <option key={p.provider} value={p.provider}>{p.provider}</option>
              ))}
            </select>

            {/* Model selector */}
            <select
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="text-[11px] bg-transparent border border-border/20 dark:border-white/8 rounded px-2 py-1 outline-none text-foreground/70"
            >
              {providerModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <button
              onClick={handleAddVariant}
              className="flex items-center gap-1 text-[11px] text-primary px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <Plus size={10} /> Add variant
            </button>

            <button
              onClick={handleRunAll}
              className="flex items-center gap-1 text-[11px] text-foreground/60 px-2.5 py-1 rounded border border-border/20 dark:border-white/6 hover:text-foreground hover:border-border/40 transition-all"
            >
              <Play size={10} /> Run all presets
            </button>
          </div>
        )}

        {/* Variant Cards Grid */}
        {variants.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {variants.map((v) => (
              <VariantCard
                key={v.id}
                variant={v}
                isFastest={v.id === fastestId}
                onDelete={handleDeleteVariant}
                onApply={handleApply}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {selectedTest && variants.length === 0 && (
          <div className="text-center py-8">
            <Beaker size={24} className="text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/40">
              Add variants to compare different pipeline configurations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
