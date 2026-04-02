/**
 * HomeStats — Compact dashboard strip + sidebar-ready stats
 *
 * Design: Mix of "Cozy Dashboard" (inline pills) + "Command Center" (dense stats).
 * Compact, warm, data-rich. No fat cards. Stats feel like metadata, not a section.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Mic, Flame, Sparkles, Brain, Clock, Clipboard } from "lucide-react";
import { cn } from "../../../components/lib/utils";

// --- Types matching analytics.js getDashboard() ---

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

// --- Mini sparkline (pure SVG) ---

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80, h = 20;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle ml-1.5 opacity-60">
      <polyline points={points} fill="none" stroke="#A06A3C" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --- Fun fact ---

function pickFact(d: Dashboard, vocabTotal: number): string | null {
  const facts: string[] = [];
  if (d.busiestHours) {
    const maxH = d.busiestHours.indexOf(Math.max(...d.busiestHours));
    if (Math.max(...d.busiestHours) > 0) {
      const t = maxH === 0 ? "midnight" : maxH < 12 ? `${maxH}am` : maxH === 12 ? "noon" : `${maxH - 12}pm`;
      facts.push(`Most productive around ${t}`);
    }
  }
  if (d.polishStats.avgCharsSaved > 0) {
    const saved = Math.round(d.polishStats.avgCharsSaved * d.polishStats.totalPolished);
    if (saved > 50) facts.push(`${saved.toLocaleString()} chars of filler cleaned`);
  }
  if (d.streaks.longest > 1) facts.push(`Longest streak: ${d.streaks.longest}d`);
  if (vocabTotal > 3) facts.push(`Memory knows ${vocabTotal} words`);
  if (d.averageDuration.avgMs > 0) facts.push(`Avg recording: ${(d.averageDuration.avgMs / 1000).toFixed(1)}s`);
  const voice = d.sourceBreakdown.find((s) => s.source === "voice");
  const clip = d.sourceBreakdown.find((s) => s.source === "clipboard");
  if (voice && clip && voice.count + clip.count > 0) {
    facts.push(`${Math.round((voice.count / (voice.count + clip.count)) * 100)}% voice`);
  }
  if (facts.length === 0) return null;
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return facts[day % facts.length];
}

// --- Stat pill ---

function Pill({ icon: Icon, value, label, show = true }: {
  icon: typeof Mic; value: string | number; label: string; show?: boolean;
}) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground/[0.03] dark:bg-white/[0.03] text-xs">
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

  const fetch = useCallback(async () => {
    const api = getAPI();
    try {
      if (typeof api.whisperwoofGetAnalytics === "function") setData(await (api.whisperwoofGetAnalytics as () => Promise<Dashboard>)());
    } catch { /* */ }
    try {
      if (typeof api.whisperwoofGetVocabularyStats === "function") {
        const s = await (api.whisperwoofGetVocabularyStats as () => Promise<{ total: number }>)();
        setVocabTotal(s?.total ?? 0);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const fact = useMemo(() => data ? pickFact(data, vocabTotal) : null, [data, vocabTotal]);

  if (!data) return null;

  const { summary, entriesPerDay, polishStats, streaks } = data;
  const spark = (entriesPerDay || []).slice(-14).map((d) => d.count);

  // Hide the whole strip if there's literally no data
  if (summary.totalEntries === 0) return null;

  return (
    <div className="flex items-center gap-2 px-1 py-2 flex-wrap">
      <Pill icon={Mic} value={summary.todayEntries} label="today" />
      <Pill icon={Flame} value={`${streaks.current}d`} label="streak" show={streaks.current > 0} />
      <Pill icon={Sparkles} value={`${Math.round(polishStats.polishRate)}%`} label="polished" show={polishStats.polishRate > 0} />
      <Pill icon={Brain} value={vocabTotal} label="memory" show={vocabTotal > 0} />
      <Pill icon={Clipboard} value={summary.thisWeekEntries} label="this week" />
      {spark.length >= 2 && <MiniSparkline data={spark} />}
      {fact && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/35 ml-auto">
          <Clock size={9} /> {fact}
        </span>
      )}
    </div>
  );
}
