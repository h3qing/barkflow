/**
 * HomeStats — Single-line status bar, not a dashboard
 *
 * Just a subtle text line: "25 today · 4d streak · 265 this week"
 * Feels like a status bar, not a feature. Gets out of the way.
 */

import { useState, useEffect, useCallback } from "react";

interface Dashboard {
  summary: { totalEntries: number; todayEntries: number; thisWeekEntries: number; thisMonthEntries: number };
  streaks: { current: number; longest: number };
  polishStats: { polishRate: number; totalPolished: number; avgCharsSaved: number; totalRaw: number };
  sourceBreakdown: { source: string; count: number }[];
  entriesPerDay: { day: string; count: number }[];
  busiestHours: number[];
  averageDuration: { avgMs: number; totalMs: number; count: number };
}

function getAPI(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI ?? {};
}

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

  const { summary, streaks } = data;

  const parts: string[] = [];
  parts.push(`${summary.todayEntries} today`);
  if (streaks.current > 0) parts.push(`${streaks.current}d streak`);
  parts.push(`${summary.thisWeekEntries} this week`);

  return (
    <p className="text-[11px] text-muted-foreground/40 px-1 py-1.5">
      {parts.join(" · ")}
    </p>
  );
}
