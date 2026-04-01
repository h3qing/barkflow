/**
 * MemoryView — Context-Aware Vocabulary Dashboard
 *
 * Shows words WhisperWoof has learned, grouped by app context.
 * Auto-learned from corrections, manual additions secondary.
 * Replaces the old flat DictionaryView.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Monitor,
  Plus,
  Trash2,
  Zap,
  Mic,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { cn } from "../../../components/lib/utils";

// --- Types ---

interface VocabEntry {
  readonly id: string;
  readonly word: string;
  readonly category: string;
  readonly alternatives: readonly string[];
  readonly createdAt: string;
  readonly source: string;
  readonly usageCount: number;
  readonly appContexts?: Record<string, { count: number; firstSeen: string; lastSeen: string }>;
  // Added by getVocabularyForApp
  readonly appCount?: number;
  readonly appFirstSeen?: string;
  readonly appLastSeen?: string;
}

interface TrackedApp {
  readonly bundleId: string;
  readonly wordCount: number;
  readonly totalUsage: number;
}

interface VocabStats {
  readonly total: number;
  readonly max: number;
  readonly autoLearned: number;
  readonly manual: number;
  readonly categories: Record<string, number>;
  readonly trackedApps: readonly TrackedApp[];
  readonly topUsed: readonly { word: string; usageCount: number }[];
}

interface MemoryAPI {
  whisperwoofGetVocabulary?: (options?: Record<string, unknown>) => Promise<VocabEntry[]>;
  whisperwoofGetVocabularyStats?: () => Promise<VocabStats>;
  whisperwoofGetTrackedApps?: () => Promise<TrackedApp[]>;
  whisperwoofGetVocabularyForApp?: (bundleId: string) => Promise<VocabEntry[]>;
  whisperwoofAddWord?: (word: string, options?: Record<string, unknown>) => Promise<{ success: boolean; entry?: VocabEntry }>;
  whisperwoofRemoveWord?: (id: string) => Promise<{ success: boolean }>;
}

function getAPI(): MemoryAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

// --- App name mapping (common macOS bundleIds to friendly names) ---

const APP_NAMES: Record<string, string> = {
  "com.microsoft.VSCode": "VS Code",
  "com.todesktop.230313mzl4w4u92": "Cursor",
  "dev.zed.Zed": "Zed",
  "com.apple.dt.Xcode": "Xcode",
  "com.googlecode.iterm2": "iTerm2",
  "com.apple.Terminal": "Terminal",
  "com.tinyspeck.slackmacgap": "Slack",
  "com.hnc.Discord": "Discord",
  "com.apple.MobileSMS": "Messages",
  "ru.keepcoder.Telegram": "Telegram",
  "net.whatsapp.WhatsApp": "WhatsApp",
  "com.microsoft.teams2": "Teams",
  "com.apple.mail": "Mail",
  "com.microsoft.Outlook": "Outlook",
  "com.apple.Notes": "Notes",
  "md.obsidian": "Obsidian",
  "com.notion.id": "Notion",
  "com.apple.Safari": "Safari",
  "com.google.Chrome": "Chrome",
  "org.mozilla.firefox": "Firefox",
  "com.microsoft.Word": "Word",
  "com.apple.iWork.Pages": "Pages",
};

function appName(bundleId: string): string {
  return APP_NAMES[bundleId] || bundleId.split(".").pop() || bundleId;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// --- Sub-components ---

function SourceBadge({ source }: { readonly source: string }) {
  const isAuto = source === "auto-learn";
  return (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded",
      isAuto
        ? "bg-emerald-500/10 text-emerald-500/70"
        : source === "import"
          ? "bg-blue-500/10 text-blue-500/70"
          : "bg-foreground/[0.04] text-muted-foreground/60"
    )}>
      {isAuto ? "auto" : source}
    </span>
  );
}

function WordRow({
  entry,
  onDelete,
}: {
  readonly entry: VocabEntry;
  readonly onDelete: (id: string) => void;
}) {
  const appCount = entry.appContexts ? Object.keys(entry.appContexts).length : 0;

  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-foreground/[0.02] dark:hover:bg-white/[0.03] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{entry.word}</span>
          <SourceBadge source={entry.source} />
          {entry.usageCount > 0 && (
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
              <Zap size={9} /> {entry.usageCount}x
            </span>
          )}
        </div>
        {appCount > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            {Object.entries(entry.appContexts || {}).slice(0, 4).map(([bid, ctx]) => (
              <span key={bid} className="text-[9px] text-muted-foreground/40">
                {appName(bid)} ({ctx.count})
              </span>
            ))}
            {appCount > 4 && <span className="text-[9px] text-muted-foreground/30">+{appCount - 4} more</span>}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/30 hover:text-red-400 transition-all"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// --- Main component ---

interface MemoryViewProps {
  readonly className?: string;
}

export default function MemoryView({ className }: MemoryViewProps) {
  const [allWords, setAllWords] = useState<VocabEntry[]>([]);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [trackedApps, setTrackedApps] = useState<TrackedApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [appWords, setAppWords] = useState<VocabEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [newWord, setNewWord] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const api = getAPI();
      if (api.whisperwoofGetVocabularyStats && api.whisperwoofGetVocabulary) {
        const [statsData, wordsData, appsData] = await Promise.all([
          api.whisperwoofGetVocabularyStats(),
          api.whisperwoofGetVocabulary(),
          api.whisperwoofGetTrackedApps?.() ?? [],
        ]);
        setStats(statsData);
        setAllWords(wordsData);
        setTrackedApps(appsData as TrackedApp[]);
        setError(null);
      } else {
        // Demo data
        setStats({
          total: 12, max: 1000, autoLearned: 8, manual: 4,
          categories: { technical: 5, names: 3, general: 4 },
          trackedApps: [
            { bundleId: "com.microsoft.VSCode", wordCount: 7, totalUsage: 34 },
            { bundleId: "com.tinyspeck.slackmacgap", wordCount: 5, totalUsage: 18 },
            { bundleId: "com.apple.mail", wordCount: 3, totalUsage: 8 },
          ],
          topUsed: [
            { word: "Supabase", usageCount: 12 },
            { word: "WhisperWoof", usageCount: 9 },
            { word: "Heqing", usageCount: 7 },
          ],
        });
        setTrackedApps([
          { bundleId: "com.microsoft.VSCode", wordCount: 7, totalUsage: 34 },
          { bundleId: "com.tinyspeck.slackmacgap", wordCount: 5, totalUsage: 18 },
          { bundleId: "com.apple.mail", wordCount: 3, totalUsage: 8 },
        ]);
        setAllWords([
          { id: "1", word: "Supabase", category: "technical", alternatives: [], createdAt: new Date().toISOString(), source: "auto-learn", usageCount: 12, appContexts: { "com.microsoft.VSCode": { count: 10, firstSeen: "2026-03-25", lastSeen: "2026-04-01" }, "com.tinyspeck.slackmacgap": { count: 2, firstSeen: "2026-03-28", lastSeen: "2026-03-30" } } },
          { id: "2", word: "Heqing", category: "names", alternatives: ["he ching"], createdAt: new Date().toISOString(), source: "manual", usageCount: 7, appContexts: { "com.tinyspeck.slackmacgap": { count: 5, firstSeen: "2026-03-24", lastSeen: "2026-04-01" }, "com.apple.mail": { count: 2, firstSeen: "2026-03-26", lastSeen: "2026-03-29" } } },
          { id: "3", word: "WhisperWoof", category: "names", alternatives: ["whisper woof"], createdAt: new Date().toISOString(), source: "auto-learn", usageCount: 9, appContexts: { "com.microsoft.VSCode": { count: 6, firstSeen: "2026-03-24", lastSeen: "2026-04-01" }, "com.tinyspeck.slackmacgap": { count: 3, firstSeen: "2026-03-25", lastSeen: "2026-03-31" } } },
          { id: "4", word: "kubectl", category: "technical", alternatives: ["kube control", "kube c t l"], createdAt: new Date().toISOString(), source: "auto-learn", usageCount: 5, appContexts: { "com.microsoft.VSCode": { count: 4, firstSeen: "2026-03-26", lastSeen: "2026-04-01" }, "com.googlecode.iterm2": { count: 1, firstSeen: "2026-03-30", lastSeen: "2026-03-30" } } },
        ]);
      }
    } catch {
      setError("Unable to load Memory data.");
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch app-specific words when selecting an app tab
  useEffect(() => {
    if (!selectedApp) return;
    const api = getAPI();
    if (api.whisperwoofGetVocabularyForApp) {
      api.whisperwoofGetVocabularyForApp(selectedApp).then(setAppWords).catch(() => {});
    } else {
      // Demo: filter from allWords
      setAppWords(allWords.filter((w) => w.appContexts?.[selectedApp]));
    }
  }, [selectedApp, allWords]);

  const handleAddWord = async () => {
    if (!newWord.trim()) return;
    try {
      const api = getAPI();
      if (api.whisperwoofAddWord) {
        await api.whisperwoofAddWord(newWord.trim(), { source: "manual", category: "general" });
      }
      setNewWord("");
      setIsAddingWord(false);
      fetchData();
    } catch {
      setError("Failed to add word.");
    }
  };

  const handleDeleteWord = async (id: string) => {
    try {
      const api = getAPI();
      if (api.whisperwoofRemoveWord) {
        await api.whisperwoofRemoveWord(id);
      }
      setAllWords((prev) => prev.filter((w) => w.id !== id));
      setAppWords((prev) => prev.filter((w) => w.id !== id));
    } catch {
      setError("Failed to remove word.");
    }
  };

  const displayWords = selectedApp ? appWords : allWords;
  const filteredWords = searchQuery.trim()
    ? displayWords.filter((w) => w.word.toLowerCase().includes(searchQuery.toLowerCase()))
    : displayWords;

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => { setError(null); fetchData(); }} className="text-xs text-primary">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/15 dark:border-white/6 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Brain size={14} className="text-primary/70" />
              Memory
            </h2>
            {stats && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                {stats.total} words learned
                {stats.autoLearned > 0 && ` (${stats.autoLearned} auto, ${stats.manual} manual)`}
                {trackedApps.length > 0 && ` across ${trackedApps.length} apps`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search words..."
                className="w-36 text-xs bg-transparent border border-border/20 dark:border-white/8 rounded-md pl-7 pr-2 py-1.5 outline-none focus:border-primary/40 placeholder:text-muted-foreground/30"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
                  <X size={10} />
                </button>
              )}
            </div>
            {isAddingWord ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Word or phrase"
                  className="w-32 text-xs bg-transparent border border-border/30 dark:border-white/10 rounded-md px-2 py-1.5 outline-none focus:border-primary/40"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddWord(); if (e.key === "Escape") setIsAddingWord(false); }}
                />
                <button onClick={handleAddWord} className="p-1 rounded text-primary hover:bg-primary/10"><Pencil size={12} /></button>
                <button onClick={() => setIsAddingWord(false)} className="p-1 rounded text-muted-foreground hover:bg-foreground/5"><X size={12} /></button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingWord(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground px-2 py-1.5 rounded-md border border-border/20 dark:border-white/6 hover:border-border/40 transition-all"
              >
                <Plus size={11} /> Add word
              </button>
            )}
          </div>
        </div>

        {/* App context tabs */}
        {trackedApps.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedApp(null)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors",
                selectedApp === null
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]"
              )}
            >
              All ({stats?.total ?? 0})
            </button>
            {trackedApps.map((app) => (
              <button
                key={app.bundleId}
                onClick={() => setSelectedApp(app.bundleId)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors",
                  selectedApp === app.bundleId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]"
                )}
              >
                <Monitor size={10} />
                {appName(app.bundleId)} ({app.wordCount})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Word list */}
      <div className="flex-1 overflow-y-auto">
        {filteredWords.length === 0 && !searchQuery && allWords.length === 0 ? (
          // Empty state — onboarding
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
            <Brain size={36} className="text-muted-foreground/20 mb-4" />
            <p className="text-sm font-medium text-foreground/70 mb-1.5">Memory learns as you talk</p>
            <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-[280px] mb-4">
              Start dictating in different apps. When you correct a transcription,
              Memory auto-learns the right word and remembers which app you were in.
            </p>
            <div className="rounded-lg border border-border/20 dark:border-white/6 bg-foreground/[0.02] dark:bg-white/[0.02] px-4 py-3 max-w-[280px]">
              <p className="text-[11px] text-foreground/50 leading-relaxed">
                <span className="font-medium text-foreground/70">How it works:</span> You say "deploy to supabase."
                Whisper hears "deploy to super base." You fix it. Memory learns "Supabase"
                and tags it to VS Code.
              </p>
            </div>
          </div>
        ) : filteredWords.length === 0 && searchQuery ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground/40 italic">No words matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="py-1">
            {filteredWords.map((entry) => (
              <WordRow key={entry.id} entry={entry} onDelete={handleDeleteWord} />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {stats && stats.topUsed.length > 0 && !searchQuery && (
        <div className="px-5 py-2.5 border-t border-border/10 dark:border-white/4 shrink-0">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
            <span>Top words:</span>
            {stats.topUsed.slice(0, 3).map((w) => (
              <span key={w.word} className="text-foreground/50">
                {w.word} <span className="text-muted-foreground/30">({w.usageCount}x)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
