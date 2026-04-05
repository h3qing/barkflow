/**
 * TuningBench — Horizontal flow chart pipeline tuner
 *
 * Three columns: STT Model → Polish Preset → LLM Model
 * Users record audio, select nodes in each column to create paths,
 * run them, and see output cards on the right.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Beaker,
  Mic,
  MicOff,
  Play,
  Trash2,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  Star,
  Copy,
  StopCircle,
  Plus,
} from "lucide-react";
import { cn } from "../../../components/lib/utils";

// --- Types ---

interface Variant {
  id: string;
  sttModel: string;
  polishPreset: string;
  llmProvider: string;
  llmModel: string;
  sttOutput: string | null;
  polishedOutput: string | null;
  durationMs: number | null;
  error: string | null;
  status: "pending" | "running" | "done" | "error";
}

interface TuningAPI {
  whisperwoofTuningGetConfigs?: () => Promise<{ presets: string[]; providers: { provider: string; models: string[] }[] }>;
  whisperwoofTuningRunVariant?: (config: Record<string, string>) => Promise<Variant>;
}

function getAPI(): TuningAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

// --- Constants ---

const STT_MODELS = [
  { id: "tiny", label: "Tiny", size: "75MB", speed: "fastest" },
  { id: "base", label: "Base", size: "142MB", speed: "fast" },
  { id: "small", label: "Small", size: "466MB", speed: "balanced" },
  { id: "medium", label: "Medium", size: "1.5GB", speed: "slow" },
  { id: "large", label: "Large", size: "3GB", speed: "best quality" },
  { id: "turbo", label: "Turbo", size: "1.6GB", speed: "fast + good" },
];

const PRESETS = [
  { id: "clean", label: "Clean", desc: "Remove fillers, fix grammar" },
  { id: "professional", label: "Professional", desc: "Confident, formal tone" },
  { id: "casual", label: "Casual", desc: "Light cleanup, natural" },
  { id: "minimal", label: "Minimal", desc: "Only remove fillers" },
  { id: "structured", label: "Structured", desc: "Markdown with headings" },
];

const LLM_MODELS = [
  { id: "ollama:llama3.2:1b", label: "Llama 3.2 1B", provider: "ollama", speed: "fastest" },
  { id: "ollama:llama3.2:3b", label: "Llama 3.2 3B", provider: "ollama", speed: "fast" },
  { id: "ollama:llama3.1:8b", label: "Llama 3.1 8B", provider: "ollama", speed: "balanced" },
  { id: "ollama:mistral:7b", label: "Mistral 7B", provider: "ollama", speed: "balanced" },
  { id: "groq:llama-3.1-8b-instant", label: "Groq Llama 8B", provider: "groq", speed: "very fast" },
  { id: "openai:gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", speed: "fast" },
];

// --- Flow Node ---

function FlowNode({
  label,
  sublabel,
  selected,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg border transition-all duration-150",
        selected
          ? "border-[#A06A3C]/40 bg-[#A06A3C]/[0.08] text-foreground"
          : "border-border/15 dark:border-white/6 text-muted-foreground/60 hover:text-foreground hover:border-border/30",
        active && "ring-1 ring-[#A06A3C]/30"
      )}
    >
      <span className="text-xs font-medium block">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground/40 block mt-0.5">{sublabel}</span>}
    </button>
  );
}

// --- Recording Button ---

function RecordButton({
  onRecorded,
}: {
  onRecorded: (text: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedText, setRecordedText] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // For now, use the text input approach since we can't run STT from here
        // In the real implementation, this would send audio to the whisper-server
        setIsRecording(false);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all",
            isRecording
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-[#A06A3C]/10 text-[#A06A3C] border border-[#A06A3C]/20 hover:bg-[#A06A3C]/15"
          )}
        >
          {isRecording ? <StopCircle size={14} className="animate-pulse" /> : <Mic size={14} />}
          {isRecording ? "Stop recording" : "Record a sample"}
        </button>
        {isRecording && (
          <span className="text-[10px] text-red-400/60 animate-pulse">Recording...</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/40">
        Or paste text below to test polish quality without recording
      </p>
    </div>
  );
}

// --- Output Card ---

function OutputCard({
  variant,
  isFastest,
}: {
  variant: Variant;
  isFastest: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      variant.status === "done"
        ? "border-border/20 dark:border-white/8 bg-foreground/[0.015] dark:bg-white/[0.02]"
        : variant.status === "error"
          ? "border-red-500/20 bg-red-500/[0.03]"
          : "border-border/10 dark:border-white/4"
    )}>
      {/* Path label */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <span className="px-1.5 py-0.5 rounded bg-foreground/[0.04] dark:bg-white/[0.04]">{variant.polishPreset}</span>
        <ChevronRight size={8} />
        <span className="px-1.5 py-0.5 rounded bg-foreground/[0.04] dark:bg-white/[0.04]">{variant.llmModel.split(":").pop()}</span>
        {variant.durationMs && (
          <span className="ml-auto flex items-center gap-0.5">
            <Clock size={8} />
            {(variant.durationMs / 1000).toFixed(1)}s
            {isFastest && <Star size={8} className="text-emerald-500/60 ml-0.5" />}
          </span>
        )}
      </div>

      {/* Output */}
      {variant.status === "running" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50 py-3">
          <Loader2 size={12} className="animate-spin" /> Processing...
        </div>
      )}
      {variant.status === "error" && (
        <p className="text-xs text-red-400/70 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          {variant.error}
        </p>
      )}
      {variant.status === "done" && variant.polishedOutput && (
        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {variant.polishedOutput}
        </p>
      )}
      {variant.status === "pending" && (
        <p className="text-xs text-muted-foreground/30 italic py-3">Waiting...</p>
      )}
    </div>
  );
}

// --- Main ---

export default function TuningBench() {
  const [inputText, setInputText] = useState("");
  const [selectedSTT, setSelectedSTT] = useState<Set<string>>(new Set(["small"]));
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set(["clean"]));
  const [selectedLLMs, setSelectedLLMs] = useState<Set<string>>(new Set(["ollama:llama3.2:1b"]));
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  const pathCount = selectedPresets.size * selectedLLMs.size;

  const handleRun = async () => {
    if (!inputText.trim() || pathCount === 0) return;
    setIsRunning(true);

    // Generate all combinations
    const combos: { preset: string; provider: string; model: string }[] = [];
    for (const preset of selectedPresets) {
      for (const llmId of selectedLLMs) {
        const [provider, ...modelParts] = llmId.split(":");
        combos.push({ preset, provider, model: modelParts.join(":") });
      }
    }

    // Create pending variants
    const pending: Variant[] = combos.map((c, i) => ({
      id: `v-${Date.now()}-${i}`,
      sttModel: [...selectedSTT][0] || "small",
      polishPreset: c.preset,
      llmProvider: c.provider,
      llmModel: c.model,
      sttOutput: inputText,
      polishedOutput: null,
      durationMs: null,
      error: null,
      status: "running" as const,
    }));
    setVariants(pending);

    // Run all in parallel
    const api = getAPI();
    if (api.whisperwoofTuningRunVariant) {
      const results = await Promise.all(
        combos.map((c) =>
          api.whisperwoofTuningRunVariant!({
            testCaseId: "live",
            inputText: inputText,
            polishPreset: c.preset,
            llmProvider: c.provider,
            llmModel: c.model,
          }).catch((err) => ({
            id: `err-${Date.now()}`,
            testCaseId: "live",
            sttModel: "n/a",
            polishPreset: c.preset,
            llmProvider: c.provider,
            llmModel: c.model,
            output: null,
            polishedOutput: null,
            sttOutput: null,
            durationMs: null,
            error: err.message,
            status: "error" as const,
          }))
        )
      );
      // Map the results to match our Variant shape
      setVariants(results.map((r) => ({
        ...r,
        polishedOutput: (r as any).output || (r as any).polishedOutput || null,
        status: (r as any).status || "done",
      })));
    }

    setIsRunning(false);
  };

  const doneVariants = variants.filter((v) => v.status === "done" && v.durationMs);
  const fastestId = doneVariants.length > 0
    ? doneVariants.reduce((a, b) => (a.durationMs! < b.durationMs! ? a : b)).id
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/15 dark:border-white/6 shrink-0">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Beaker size={14} className="text-primary/70" />
          Pipeline Tuning Bench
        </h2>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
          Select nodes in each stage, then run to compare outputs
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Input: Record or paste */}
        <div className="space-y-2">
          <RecordButton onRecorded={setInputText} />
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste a voice transcript to test... e.g. 'um so like I need to buy milk and uh eggs from the store'"
            className="w-full text-xs bg-transparent border border-border/20 dark:border-white/8 rounded-lg px-3 py-2.5 outline-none focus:border-primary/30 min-h-[56px] resize-none placeholder:text-muted-foreground/25"
            rows={2}
          />
        </div>

        {/* Three-column flow chart */}
        <div className="flex gap-2 items-start">
          {/* Column 1: STT Model */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-medium mb-2 px-1">
              1. STT Model
            </div>
            <div className="space-y-1.5">
              {STT_MODELS.map((m) => (
                <FlowNode
                  key={m.id}
                  label={m.label}
                  sublabel={`${m.size} · ${m.speed}`}
                  selected={selectedSTT.has(m.id)}
                  onClick={() => setSelectedSTT(toggleSet(selectedSTT, m.id))}
                />
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center pt-8 shrink-0 text-muted-foreground/15">
            <ChevronRight size={16} />
          </div>

          {/* Column 2: Polish Preset */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-medium mb-2 px-1">
              2. Polish Preset
            </div>
            <div className="space-y-1.5">
              {PRESETS.map((p) => (
                <FlowNode
                  key={p.id}
                  label={p.label}
                  sublabel={p.desc}
                  selected={selectedPresets.has(p.id)}
                  onClick={() => setSelectedPresets(toggleSet(selectedPresets, p.id))}
                />
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center pt-8 shrink-0 text-muted-foreground/15">
            <ChevronRight size={16} />
          </div>

          {/* Column 3: LLM Model */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-medium mb-2 px-1">
              3. LLM Model
            </div>
            <div className="space-y-1.5">
              {LLM_MODELS.map((m) => (
                <FlowNode
                  key={m.id}
                  label={m.label}
                  sublabel={`${m.provider} · ${m.speed}`}
                  selected={selectedLLMs.has(m.id)}
                  onClick={() => setSelectedLLMs(toggleSet(selectedLLMs, m.id))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={isRunning || !inputText.trim() || pathCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#A06A3C] text-white hover:bg-[#B8863C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Run {pathCount} variant{pathCount !== 1 ? "s" : ""}
          </button>
          <span className="text-[10px] text-muted-foreground/40">
            {selectedPresets.size} preset{selectedPresets.size !== 1 ? "s" : ""} × {selectedLLMs.size} model{selectedLLMs.size !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Output Cards */}
        {variants.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-medium px-1">
              Results
            </div>
            <div className="grid grid-cols-1 gap-2">
              {variants.map((v) => (
                <OutputCard key={v.id} variant={v} isFastest={v.id === fastestId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
