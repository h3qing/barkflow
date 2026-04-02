/**
 * HomeStats — Dashboard cards + activity sparkline + fun facts
 *
 * Calls the existing whisperwoofGetAnalytics() IPC (already wired)
 * and renders stats at the top of the Home view.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Mic, Clipboard, Flame, Sparkles, Brain, Clock } from "lucide-react";
import { cn } from "../../../components/lib/utils";

// --- Types matching analytics.js getDashboard() output ---

interface AnalyticsSummary {
  totalEntries: number;
  todayEntries: number;
  thisWeekEntries: number;
  thisMonthEntries: number;
}

interface SourceBreakdown {
  source: string;
  count: number;
}

interface PolishStats {
  totalPolished: number;
  totalRaw: number;
  avgCharsSaved: number;
  polishRate: number;
}

interface StreakData {
  current: number;
  longest: number;
}

interface DayCount {
  day: string;
  count: number;
}

interface Dashboard {
  summary: AnalyticsSummary;
  entriesPerDay: DayCount[];
  sourceBreakdown: SourceBreakdown[];
  polishStats: PolishStats;
  streaks: StreakData;
  busiestHours: number[];
  averageDuration: { avgMs: number; totalMs: number; count: number };
}

interface AnalyticsAPI {
  whisperwoofGetAnalytics?: () => Promise<Dashboard>;
  whisperwoofGetVocabularyStats?: () => Promise<{ total: number; autoLearned: number }>;
}

function getAPI(): AnalyticsAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

// --- Sparkline (pure SVG, no deps) ---

function Sparkline({ data, width = 200, height = 32 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary/40"
      />
      {/* Fill area under the line */}
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        className="fill-primary/[0.06]"
      />
    </svg>
  );
}

// --- Fun fact generator ---

function generateFunFact(dashboard: Dashboard, vocabTotal: number): string {
  const facts: string[] = [];

  // Busiest hour
  if (dashboard.busiestHours) {
    const maxHour = dashboard.busiestHours.indexOf(Math.max(...dashboard.busiestHours));
    if (maxHour >= 0 && Math.max(...dashboard.busiestHours) > 0) {
      const hour = maxHour === 0 ? "12am" : maxHour < 12 ? `${maxHour}am` : maxHour === 12 ? "12pm" : `${maxHour - 12}pm`;
      facts.push(`You're most productive around ${hour}`);
    }
  }

  // Polish savings
  if (dashboard.polishStats.avgCharsSaved > 0) {
    const saved = Math.round(dashboard.polishStats.avgCharsSaved * dashboard.polishStats.totalPolished);
    if (saved > 100) {
      facts.push(`AI polish has cleaned up ~${saved.toLocaleString()} characters of filler`);
    }
  }

  // Streak
  if (dashboard.streaks.longest > 1) {
    facts.push(`Your longest usage streak was ${dashboard.streaks.longest} days`);
  }

  // Voice vs clipboard ratio
  const voice = dashboard.sourceBreakdown.find((s) => s.source === "voice");
  const clip = dashboard.sourceBreakdown.find((s) => s.source === "clipboard");
  if (voice && clip && voice.count > 0 && clip.count > 0) {
    const ratio = (voice.count / (voice.count + clip.count) * 100).toFixed(0);
    facts.push(`${ratio}% of your entries come from voice`);
  }

  // Vocab
  if (vocabTotal > 5) {
    facts.push(`Memory has learned ${vocabTotal} words from your speech`);
  }

  // Average recording duration
  if (dashboard.averageDuration.avgMs > 0) {
    const avgSec = (dashboard.averageDuration.avgMs / 1000).toFixed(1);
    facts.push(`Your average recording is ${avgSec} seconds`);
  }

  if (facts.length === 0) return "Start talking and fun facts will appear here";

  // Rotate based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return facts[dayOfYear % facts.length];
}

// --- Stat Card ---

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  className,
}: {
  icon: typeof Mic;
  label: string;
  value: string | number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex-1 min-w-[120px] rounded-lg border border-border/15 dark:border-white/6",
      "bg-foreground/[0.015] dark:bg-white/[0.02] px-3.5 py-3",
      className,
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className="text-primary/60 shrink-0" />
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-foreground tracking-tight leading-none">{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground/40 mt-1">{subtitle}</div>}
    </div>
  );
}

// --- Main component ---

export default function HomeStats() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [vocabTotal, setVocabTotal] = useState(0);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    try {
      if (api.whisperwoofGetAnalytics) {
        const data = await api.whisperwoofGetAnalytics();
        setDashboard(data);
      }
    } catch { /* analytics unavailable */ }

    try {
      if (api.whisperwoofGetVocabularyStats) {
        const stats = await api.whisperwoofGetVocabularyStats();
        setVocabTotal(stats?.total ?? 0);
      }
    } catch { /* vocab unavailable */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const funFact = useMemo(
    () => dashboard ? generateFunFact(dashboard, vocabTotal) : null,
    [dashboard, vocabTotal],
  );

  // Don't render anything if analytics aren't available yet
  if (!dashboard) return null;

  const { summary, entriesPerDay, polishStats, streaks } = dashboard;
  const sparkData = (entriesPerDay || []).slice(-14).map((d) => d.count);

  return (
    <div className="px-4 pt-3 pb-2 space-y-3">
      {/* Stats cards */}
      <div className="flex gap-2 overflow-x-auto">
        <StatCard
          icon={Mic}
          label="Today"
          value={summary.todayEntries}
          subtitle={`${summary.thisWeekEntries} this week`}
        />
        <StatCard
          icon={Flame}
          label="Streak"
          value={streaks.current > 0 ? `${streaks.current}d` : "—"}
          subtitle={streaks.longest > 1 ? `Best: ${streaks.longest}d` : undefined}
        />
        <StatCard
          icon={Sparkles}
          label="Polished"
          value={polishStats.polishRate > 0 ? `${Math.round(polishStats.polishRate)}%` : "—"}
          subtitle={polishStats.totalPolished > 0 ? `${polishStats.totalPolished} entries` : undefined}
        />
        <StatCard
          icon={Brain}
          label="Memory"
          value={vocabTotal}
          subtitle="words learned"
        />
      </div>

      {/* Activity sparkline */}
      {sparkData.length >= 2 && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/40 shrink-0">14d activity</span>
          <Sparkline data={sparkData} width={240} height={28} />
        </div>
      )}

      {/* Fun fact */}
      {funFact && (
        <div className="flex items-center gap-2 px-1">
          <Clock size={11} className="text-muted-foreground/30 shrink-0" />
          <span className="text-[11px] text-muted-foreground/50 italic">{funFact}</span>
        </div>
      )}
    </div>
  );
}
