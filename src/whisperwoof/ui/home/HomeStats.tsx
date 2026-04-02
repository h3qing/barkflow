/**
 * HomeStats — "Mando's Journal" with full-width heatmap
 *
 * Two-column layout: left = greeting + hero stat, right = heatmap
 * Heatmap stretches to fill available space.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "../../../components/lib/utils";

interface Dashboard {
  summary: { totalEntries: number; todayEntries: number; thisWeekEntries: number; thisMonthEntries: number };
  entriesPerDay: { day: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
  polishStats: { polishRate: number; totalPolished: number; avgCharsSaved: number; totalRaw: number };
  streaks: { current: number; longest: number };
  busiestHours: number[];
  averageDuration: { avgMs: number; totalMs: number; count: number };
}

function getAPI(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// --- Heatmap ---

interface DayData { date: string; count: number; }

function buildHeatmapWeeks(entriesPerDay: { day: string; count: number }[], numWeeks: number): DayData[][] {
  const countMap = new Map<string, number>();
  for (const e of entriesPerDay) countMap.set(e.day, e.count);

  const today = new Date();
  const columns: DayData[][] = [];

  // Work backwards from today's week
  for (let w = numWeeks - 1; w >= 0; w--) {
    const week: DayData[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w * 7) - (today.getDay() - d));
      const dateStr = date.toISOString().split("T")[0];
      const isFuture = date > today;
      week.push({ date: dateStr, count: isFuture ? -1 : (countMap.get(dateStr) ?? 0) });
    }
    columns.push(week);
  }
  return columns;
}

function heatColor(count: number, max: number): string {
  if (count < 0) return "transparent";
  if (count === 0) return "rgba(255,255,255,0.03)";
  const r = count / Math.max(max, 1);
  if (r < 0.25) return "rgba(160,106,60,0.15)";
  if (r < 0.5) return "rgba(160,106,60,0.3)";
  if (r < 0.75) return "rgba(160,106,60,0.55)";
  return "rgba(160,106,60,0.8)";
}

function ActivityHeatmap({ entriesPerDay }: { entriesPerDay: { day: string; count: number }[] }) {
  const [hovered, setHovered] = useState<DayData | null>(null);
  const columns = useMemo(() => buildHeatmapWeeks(entriesPerDay, 26), [entriesPerDay]);
  const maxCount = useMemo(() => {
    let m = 0;
    for (const w of columns) for (const d of w) if (d.count > m) m = d.count;
    return m;
  }, [columns]);

  return (
    <div className="relative w-full">
      {/* Grid: uses CSS grid to fill full width */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          gridTemplateRows: "repeat(7, 1fr)",
          gap: "2px",
          width: "100%",
        }}
      >
        {columns.map((week, wi) =>
          week.map((day, di) => (
            <div
              key={`${wi}-${di}`}
              style={{
                gridColumn: wi + 1,
                gridRow: di + 1,
                aspectRatio: "1",
                borderRadius: "2px",
                background: heatColor(day.count, maxCount),
                cursor: day.count >= 0 ? "pointer" : "default",
                transition: "transform 0.1s, box-shadow 0.1s",
                ...(hovered?.date === day.date && day.count >= 0
                  ? { transform: "scale(1.3)", boxShadow: "0 0 0 1px rgba(160,106,60,0.5)", zIndex: 2, position: "relative" as const }
                  : {}),
              }}
              onMouseEnter={() => day.count >= 0 && setHovered(day)}
              onMouseLeave={() => setHovered(null)}
            />
          ))
        )}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-[#1A1714] border border-[#2E2923] text-[10px] text-[#E8DDD0] whitespace-nowrap z-10 pointer-events-none shadow-lg">
          <span className="font-semibold">{hovered.count}</span> entries · {new Date(hovered.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}

      {/* Labels */}
      <div className="flex justify-between mt-1 text-[9px] text-[#736858]">
        <span>26 weeks ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

// --- Main ---

export default function HomeStats() {
  const [data, setData] = useState<Dashboard | null>(null);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    try {
      if (typeof api.whisperwoofGetAnalytics === "function")
        setData(await (api.whisperwoofGetAnalytics as () => Promise<Dashboard>)());
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data || data.summary.totalEntries === 0) return null;

  const { summary, streaks, entriesPerDay, sourceBreakdown } = data;

  const voice = sourceBreakdown.find((s) => s.source === "voice");
  const total = sourceBreakdown.reduce((sum, s) => sum + s.count, 0);
  const voicePct = total > 0 && voice ? Math.round((voice.count / total) * 100) : 0;

  const parts: string[] = [];
  parts.push(`${summary.todayEntries} today`);
  if (streaks.current > 0) parts.push(`${streaks.current}-day streak`);
  if (voicePct > 0) parts.push(`${voicePct}% voice`);

  return (
    <div className="px-1 pt-2 pb-3 mb-1">
      {/* Two-column: left = text, right = heatmap */}
      <div className="flex gap-6 items-start">
        {/* Left: greeting + hero */}
        <div className="shrink-0 min-w-[200px]">
          <p className="text-[13px] text-[#736858]">{getGreeting()}</p>
          <h2 className="text-[26px] font-extrabold tracking-tight leading-tight mt-0.5">
            <span className="text-[#A06A3C]">{summary.thisWeekEntries}</span>
            <span className="text-[#E8DDD0]"> this week</span>
          </h2>
          <p className="text-[11px] text-[#736858] mt-1">{parts.join(" · ")}</p>
        </div>

        {/* Right: heatmap (fills remaining space) */}
        <div className="flex-1 min-w-0 pt-1">
          <ActivityHeatmap entriesPerDay={entriesPerDay || []} />
        </div>
      </div>
    </div>
  );
}
