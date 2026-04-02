/**
 * HomeStats — "Mando's Journal" design
 *
 * Greeting + hero stat + GitHub-style activity heatmap (full width)
 * Heatmap: 7 rows (days of week) x N columns (weeks), amber tones.
 * Hover shows day stats. Click filters transcripts to that day.
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

function getUserName(): string {
  // Try to get from OS or fall back
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    if (api?.getSystemUser) return api.getSystemUser();
  } catch { /* */ }
  return "";
}

// --- Heatmap data builder (GitHub-style: 7 rows x N weeks) ---

interface DayData {
  date: string; // YYYY-MM-DD
  count: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
}

function buildHeatmapData(entriesPerDay: { day: string; count: number }[], weeks: number = 18): DayData[][] {
  // Build a map of day -> count
  const countMap = new Map<string, number>();
  for (const e of entriesPerDay) {
    countMap.set(e.day, e.count);
  }

  // Generate grid: columns = weeks, rows = days of week
  const today = new Date();
  const totalDays = weeks * 7;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);
  // Align to start of week (Sunday)
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const columns: DayData[][] = [];
  const current = new Date(startDate);

  while (current <= today || columns.length < weeks) {
    const week: DayData[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = current.toISOString().split("T")[0];
      const isFuture = current > today;
      week.push({
        date: dateStr,
        count: isFuture ? -1 : (countMap.get(dateStr) ?? 0),
        dayOfWeek: dow,
      });
      current.setDate(current.getDate() + 1);
    }
    columns.push(week);
    if (columns.length >= weeks) break;
  }

  return columns;
}

function heatLevel(count: number, max: number): string {
  if (count < 0) return "bg-transparent"; // future
  if (count === 0) return "bg-white/[0.03]";
  const ratio = count / Math.max(max, 1);
  if (ratio < 0.25) return "bg-[#A06A3C]/[0.15]";
  if (ratio < 0.5) return "bg-[#A06A3C]/[0.3]";
  if (ratio < 0.75) return "bg-[#A06A3C]/[0.5]";
  return "bg-[#A06A3C]/[0.75]";
}

// --- Heatmap component ---

function ActivityHeatmap({ entriesPerDay }: { entriesPerDay: { day: string; count: number }[] }) {
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  const columns = useMemo(() => buildHeatmapData(entriesPerDay, 18), [entriesPerDay]);
  const maxCount = useMemo(() => {
    let m = 0;
    for (const week of columns) for (const d of week) if (d.count > m) m = d.count;
    return m;
  }, [columns]);

  return (
    <div className="relative">
      <div className="flex gap-[3px] overflow-hidden">
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                className={cn(
                  "w-[11px] h-[11px] rounded-[2px] transition-all duration-100 cursor-pointer",
                  heatLevel(day.count, maxCount),
                  hoveredDay?.date === day.date && day.count >= 0 && "ring-1 ring-[#A06A3C]/50 scale-125"
                )}
                onMouseEnter={() => day.count >= 0 && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                title={day.count >= 0 ? `${day.date}: ${day.count} entries` : ""}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoveredDay && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-[#1A1714] border border-[#2E2923] text-[10px] text-[#E8DDD0] whitespace-nowrap z-10 pointer-events-none shadow-lg">
          <span className="font-semibold">{hoveredDay.count}</span> entries on {new Date(hoveredDay.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}

      {/* Labels */}
      <div className="flex justify-between mt-1.5 text-[9px] text-[#736858]">
        <span>{columns.length > 0 ? `${columns.length} weeks ago` : ""}</span>
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
  const userName = getUserName();
  const greeting = getGreeting();

  // Voice percentage
  const voice = sourceBreakdown.find((s) => s.source === "voice");
  const total = sourceBreakdown.reduce((sum, s) => sum + s.count, 0);
  const voicePct = total > 0 && voice ? Math.round((voice.count / total) * 100) : 0;

  // Sub-stats line
  const parts: string[] = [];
  parts.push(`${summary.todayEntries} today`);
  if (streaks.current > 0) parts.push(`${streaks.current}-day streak`);
  if (voicePct > 0) parts.push(`${voicePct}% voice`);

  return (
    <div className="px-1 pt-3 pb-2 mb-1">
      {/* Greeting */}
      <p className="text-[13px] text-[#736858]">
        {greeting}{userName ? `, ${userName}` : ""}
      </p>

      {/* Hero stat */}
      <h2 className="text-[28px] font-extrabold tracking-tight leading-tight mt-0.5">
        <span className="text-[#A06A3C]">{summary.thisWeekEntries}</span>
        <span className="text-[#E8DDD0]"> entries this week</span>
      </h2>

      {/* Sub-stats */}
      <p className="text-[11px] text-[#736858] mt-1">{parts.join(" · ")}</p>

      {/* Heatmap */}
      <div className="mt-3">
        <ActivityHeatmap entriesPerDay={entriesPerDay || []} />
      </div>
    </div>
  );
}
