import React, { useState, useEffect, useCallback } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { Toggle } from "../../../components/ui/toggle";
import {
  SettingsSection,
  SettingsGroup,
  SettingsRow,
} from "../../../components/ui/SettingsSection";

// BarkFlow-specific electronAPI methods (exposed in preload.js).
interface BarkFlowSettingsAPI {
  barkflowOllamaCheck: () => Promise<{ available: boolean; models: string[] }>;
  barkflowClipboardToggle: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
  barkflowGetNotesDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
  openExternal: (url: string) => Promise<void>;
}

function getAPI(): BarkFlowSettingsAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI as BarkFlowSettingsAPI;
}

// State held as a single immutable snapshot, replaced on each update.
interface OllamaStatus {
  readonly checking: boolean;
  readonly available: boolean;
  readonly models: readonly string[];
}

interface SettingsState {
  readonly polishEnabled: boolean;
  readonly ollamaModel: string;
  readonly ollama: OllamaStatus;
  readonly clipboardEnabled: boolean;
  readonly notesDir: string;
  readonly notesDirLoading: boolean;
}

function buildInitialState(): SettingsState {
  return {
    polishEnabled: localStorage.getItem("barkflow-polish-enabled") !== "false",
    ollamaModel: localStorage.getItem("barkflow-ollama-model") || "llama3.2:1b",
    ollama: { checking: true, available: false, models: [] },
    clipboardEnabled: localStorage.getItem("barkflow-clipboard-enabled") !== "false",
    notesDir: "",
    notesDirLoading: true,
  };
}

interface BarkFlowSettingsProps {
  readonly className?: string;
}

export default function BarkFlowSettings({ className }: BarkFlowSettingsProps) {
  const [state, setState] = useState<SettingsState>(buildInitialState);

  // Check Ollama availability on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await getAPI().barkflowOllamaCheck();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            ollama: { checking: false, available: result.available, models: result.models ?? [] },
          }));
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            ollama: { checking: false, available: false, models: [] },
          }));
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // Fetch notes directory on mount
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const result = await getAPI().barkflowGetNotesDir();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            notesDir: result.success && result.path ? result.path : "Unknown",
            notesDirLoading: false,
          }));
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, notesDir: "Error loading path", notesDirLoading: false }));
        }
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, []);

  const handlePolishToggle = useCallback((checked: boolean) => {
    localStorage.setItem("barkflow-polish-enabled", String(checked));
    setState((prev) => ({ ...prev, polishEnabled: checked }));
  }, []);

  const handleModelChange = useCallback((value: string) => {
    localStorage.setItem("barkflow-ollama-model", value);
    setState((prev) => ({ ...prev, ollamaModel: value }));
  }, []);

  const handleClipboardToggle = useCallback(async (checked: boolean) => {
    try {
      await getAPI().barkflowClipboardToggle(checked);
      localStorage.setItem("barkflow-clipboard-enabled", String(checked));
      setState((prev) => ({ ...prev, clipboardEnabled: checked }));
    } catch {
      // Toggle failed — keep previous state
    }
  }, []);

  const handleOpenNotesFolder = useCallback(async () => {
    if (state.notesDir && state.notesDir !== "Unknown" && state.notesDir !== "Error loading path") {
      try {
        await getAPI().openExternal(`file://${state.notesDir}`);
      } catch {
        // Failed to open — silently ignore
      }
    }
  }, [state.notesDir]);

  const ollamaStatusText = state.ollama.checking
    ? "Checking..."
    : state.ollama.available
      ? `Ollama running (${state.ollama.models.length} model${state.ollama.models.length !== 1 ? "s" : ""})`
      : "Ollama not detected";

  const ollamaStatusColor = state.ollama.checking
    ? "text-muted-foreground"
    : state.ollama.available
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground/60";

  return (
    <div className={`max-w-2xl mx-auto w-full space-y-6 p-6 ${className ?? ""}`}>
      <div>
        <h2 className="text-sm font-semibold text-foreground">BarkFlow</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Voice capture, clipboard monitoring, and local AI polish.
        </p>
      </div>

      {/* Polish (Ollama) */}
      <SettingsSection title="Polish (Ollama)">
        <SettingsGroup>
          <SettingsRow label="Enable polish" description="Polish transcriptions with a local LLM via Ollama.">
            <Toggle
              checked={state.polishEnabled}
              onChange={handlePolishToggle}
              disabled={state.ollama.checking}
            />
          </SettingsRow>

          <div className="flex items-center gap-2">
            {state.ollama.checking && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
            <span className={`text-xs ${ollamaStatusColor}`}>{ollamaStatusText}</span>
          </div>

          <SettingsRow label="Model" description="Ollama model used for text polish.">
            <input
              type="text"
              value={state.ollamaModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="h-7 w-40 rounded-md border border-border/50 dark:border-white/10 bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      {/* Clipboard */}
      <SettingsSection title="Clipboard">
        <SettingsGroup>
          <SettingsRow label="Enable clipboard monitoring" description="Capture clipboard text to build searchable history.">
            <Toggle
              checked={state.clipboardEnabled}
              onChange={handleClipboardToggle}
            />
          </SettingsRow>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            Captures clipboard text to build searchable history. Passwords from password managers are never captured.
          </p>
        </SettingsGroup>
      </SettingsSection>

      {/* Notes (Fn+N) */}
      <SettingsSection title="Notes (Fn+N)">
        <SettingsGroup>
          <SettingsRow label="Notes directory">
            <button
              onClick={handleOpenNotesFolder}
              disabled={state.notesDirLoading}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-foreground border border-border/50 dark:border-white/10 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <FolderOpen size={13} />
              Open Folder
            </button>
          </SettingsRow>
          <p className="text-xs text-muted-foreground/70 font-mono truncate" title={state.notesDir}>
            {state.notesDirLoading ? "Loading..." : state.notesDir}
          </p>
        </SettingsGroup>
      </SettingsSection>

      {/* Storage */}
      <SettingsSection title="Storage">
        <SettingsGroup>
          <SettingsRow label="Entry history" description="Voice and clipboard entries stored locally in SQLite.">
            <span className="text-xs text-muted-foreground">View History</span>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
