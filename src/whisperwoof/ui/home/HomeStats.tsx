/**
 * HomeStats — Compact stat pills + sparkline + fun fact
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Mic, Flame, Sparkles, Brain, Clock, Clipboard, TrendingUp } from "lucide-react";
import { cn } from "../../../components/lib/utils";

interface Dashboard {
  summary: { totalEntries: number; todayEntries: number; thisWeekEntries: number; thisMonthEntries: number };
  entriesPerDay: { day: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
  polishStats: { totalPolished: number; totalRaw: number; avgCharsSaved: number; polishRate: number };
  streaks: { current: number; longest: number };
  busiestHours: number[];
  averageDuration: { avgMs: number; totalMs: number; count: number };
}

function getAPI(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

// --- Sparkline ---

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 120, h = 24;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`
  ).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0">
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        className="fill-[#A06A3C]/[0.08]"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#A06A3C"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

// --- Fun facts ---

function pickFact(d: Dashboard, vocabTotal: number): string {
  const facts: string[] = [];

  // Always-available facts based on basic counts
  if (d.summary.totalEntries > 0) {
    facts.push(`${d.summary.totalEntries.toLocaleString()} entries total`);
  }
  if (d.summary.thisMonthEntries > 0) {
    facts.push(`${d.summary.thisMonthEntries} entries this month`);
  }

  // Busiest hour
  if (d.busiestHours && d.busiestHours.some((h) => h > 0)) {
    const maxH = d.busiestHours.indexOf(Math.max(...d.busiestHours));
    const t = maxH === 0 ? "midnight" : maxH < 12 ? `${maxH}am` : maxH === 12 ? "noon" : `${maxH - 12}pm`;
    facts.push(`Most active around ${t}`);
  }

  // Polish savings
  if (d.polishStats.totalPolished > 0) {
    const saved = Math.round(d.polishStats.avgCharsSaved * d.polishStats.totalPolished);
    if (saved > 0) facts.push(`~${saved.toLocaleString()} chars of filler cleaned`);
  }

  // Streak
  if (d.streaks.longest > 1) facts.push(`Best streak: ${d.streaks.longest} days`);

  // Voice ratio
  const voice = d.sourceBreakdown.find((s) => s.source === "voice");
  const clip = d.sourceBreakdown.find((s) => s.source === "clipboard");
  if (voice && clip && voice.count + clip.count > 0) {
    const pct = Math.round((voice.count / (voice.count + clip.count)) * 100);
    facts.push(`${pct}% of entries are voice`);
  }

  // Vocab
  if (vocabTotal > 0) facts.push(`Memory knows ${vocabTotal} words`);

  // Avg duration
  if (d.averageDuration.avgMs > 0) {
    facts.push(`Avg recording: ${(d.averageDuration.avgMs / 1000).toFixed(1)}s`);
  }

  if (facts.length === 0) return "Keep talking, fun facts will appear here";

  // Rotate based on day
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return facts[day % facts.length];
}

// --- Pill ---

function Pill({ icon: Icon, value, label, show = true }: {
  icon: typeof Mic; value: string | number; label: string; show?: boolean;
}) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground/[0.04] dark:bg-white/[0.04] text-xs whitespace-nowrap">
      <Icon size={11} className="text-[#A06A3C] shrink-0" />
      <span className="font-semibold text-foreground/90 tabular-nums">{value}</span>
      <span className="text-muted-foreground/40 text-[10px]">{label}</span>
    </span>
  );
}

// --- Main ---

export default function HomeStats() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [vocabTotal, setVocabTotal] = useState(0);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    try {
      if (typeof api.whisperwoofGetAnalytics === "function")
        setData(await (api.whisperwoofGetAnalytics as () => Promise<Dashboard>)());
    } catch { /* */ }
    try {
      if (typeof api.whisperwoofGetVocabularyStats === "function") {
        const s = await (api.whisperwoofGetVocabularyStats as () => Promise<{ total: number }>)();
        setVocabTotal(s?.total ?? 0);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fact = useMemo(() => data ? pickFact(data, vocabTotal) : null, [data, vocabTotal]);

  if (!data || data.summary.totalEntries === 0) return null;

  const { summary, entriesPerDay, polishStats, streaks } = data;
  const spark = (entriesPerDay || []).slice(-14).map((d) => d.count);

  return (
    <div className="space-y-2 px-1 pt-2 pb-3 mb-1 border-b border-border/10 dark:border-white/[0.04]">
      {/* Row 1: Stat pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill icon={Mic} value={summary.todayEntries} label="today" />
        <Pill icon={Flame} value={`${streaks.current}d`} label="streak" show={streaks.current > 0} />
        <Pill icon={Sparkles} value={`${Math.round(polishStats.polishRate)}%`} label="polished" show={polishStats.polishRate > 0} />
        <Pill icon={Brain} value={vocabTotal} label="memory" show={vocabTotal > 0} />
        <Pill icon={Clipboard} value={summary.thisWeekEntries} label="this week" />
      </div>

      {/* Row 2: Sparkline + fun fact */}
      <div className="flex items-center gap-3">
        {spark.length >= 2 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <TrendingUp size={10} className="text-muted-foreground/25" />
            <span className="text-[10px] text-muted-foreground/30">14d</span>
            <MiniSparkline data={spark} />
          </div>
        )}
        {fact && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40 ml-auto truncate">
            <Clock size={9} className="shrink-0" />
            <span className="truncate">{fact}</span>
          </span>
        )}
      </div>
    </div>
  );
}
