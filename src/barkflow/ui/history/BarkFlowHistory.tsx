import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, Mic, Clipboard, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../components/lib/utils";
import type { Entry, EntrySource } from "../../core/storage/types";

// BarkFlow-specific electronAPI methods (exposed in preload.js).
// These augment the global Window.electronAPI declared in src/types/electron.ts.
interface BarkFlowElectronAPI {
  barkflowGetEntries: (limit: number, offset: number) => Promise<Entry[]>;
  barkflowSearchEntries: (query: string, limit: number) => Promise<Entry[]>;
  barkflowDeleteEntry: (id: string) => Promise<{ success: boolean }>;
}

function getAPI(): BarkFlowElectronAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI as BarkFlowElectronAPI;
}

type SourceFilter = "all" | "voice" | "clipboard";

interface BarkFlowHistoryProps {
  readonly className?: string;
}

// Helpers (pure, side-effect-free)

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\u2026";
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

function displayText(entry: Entry): string {
  return entry.polished ?? entry.rawText ?? "";
}

function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Subcomponents

function SourceIcon({ source }: { readonly source: EntrySource }) {
  if (source === "voice") {
    return <Mic size={14} className="shrink-0 text-amber-500" />;
  }
  return <Clipboard size={14} className="shrink-0 text-muted-foreground" />;
}

function SourceBadge({ source }: { readonly source: EntrySource }) {
  const label = source === "voice" ? "Voice" : source === "clipboard" ? "Clipboard" : source;
  const badgeClass =
    source === "voice"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", badgeClass)}>
      {label}
    </span>
  );
}

function FilterChips({
  active,
  onChange,
}: {
  readonly active: SourceFilter;
  readonly onChange: (f: SourceFilter) => void;
}) {
  const filters: readonly SourceFilter[] = ["all", "voice", "clipboard"];
  return (
    <div className="flex items-center gap-1">
      {filters.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150",
            active === f
              ? "bg-primary/10 text-primary dark:bg-primary/15"
              : "text-muted-foreground hover:bg-foreground/5 dark:hover:bg-white/5"
          )}
        >
          {f === "all" ? "All" : f === "voice" ? "Voice" : "Clipboard"}
        </button>
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  isSelected,
  onSelect,
}: {
  readonly entry: Entry;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  const text = displayText(entry);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-md transition-colors duration-150 outline-none",
        "focus-visible:ring-1 focus-visible:ring-primary/30",
        isSelected
          ? "bg-primary/8 dark:bg-primary/12"
          : "hover:bg-foreground/4 dark:hover:bg-white/4"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          <SourceIcon source={entry.source} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug truncate">
            {text ? truncate(text, 80) : <span className="italic text-muted-foreground">Empty entry</span>}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-muted-foreground">{relativeTime(entry.createdAt)}</span>
            <SourceBadge source={entry.source} />
            {entry.routedTo && (
              <span className="text-[11px] text-muted-foreground">
                &rarr; {entry.routedTo}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EntryDetail({
  entry,
  onDelete,
}: {
  readonly entry: Entry;
  readonly onDelete: (id: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const hasRawText = entry.rawText != null && entry.rawText !== entry.polished;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge source={entry.source} />
        <span className="text-xs text-muted-foreground">{formatFullTimestamp(entry.createdAt)}</span>
        {entry.hotkeyUsed && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {entry.hotkeyUsed}
          </span>
        )}
      </div>

      {/* Polished text */}
      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {displayText(entry) || <span className="italic text-muted-foreground">No text content</span>}
      </div>

      {/* Raw text (collapsible) */}
      {hasRawText && (
        <div>
          <button
            onClick={() => setShowRaw((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Show original
          </button>
          {showRaw && (
            <div className="mt-2 p-3 rounded-md bg-muted/50 dark:bg-white/5 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {entry.rawText}
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      {entry.routedTo && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">Routed to:</span>
          <span>{entry.routedTo}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/20 dark:border-white/6">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(entry.id)}
          className="gap-1.5"
        >
          <Trash2 size={13} />
          Delete
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
      <Mic size={32} className="text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">
        No entries yet. Hold Fn and speak, or copy something to get started.
      </p>
    </div>
  );
}

function NoSelectionPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      Select an entry to view details
    </div>
  );
}

// Virtual scroll constants
const ROW_HEIGHT = 56;
const BUFFER = 10;
const PAGE_SIZE = 500;
const LOAD_MORE_THRESHOLD = 100; // px from bottom to trigger load-more

// Main component

export default function BarkFlowHistory({ className }: BarkFlowHistoryProps) {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Virtual scroll state
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track container height via ResizeObserver
  useEffect(() => {
    const node = listContainerRef.current;
    if (node == null) return;

    setContainerHeight(node.clientHeight);

    const observer = new ResizeObserver((resizeEntries) => {
      const rect = resizeEntries[0];
      if (rect != null) {
        setContainerHeight(rect.contentRect.height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAPI().barkflowGetEntries(PAGE_SIZE, 0);
      const fetched = data ?? [];
      setEntries(fetched);
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (err) {
      setError("Failed to load entries. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMoreEntries = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    try {
      setIsLoadingMore(true);
      const data = await getAPI().barkflowGetEntries(PAGE_SIZE, entries.length);
      const fetched = data ?? [];
      if (fetched.length === 0) {
        setHasMore(false);
      } else {
        setEntries((prev) => [...prev, ...fetched]);
        setHasMore(fetched.length >= PAGE_SIZE);
      }
    } catch {
      // Silently fail load-more; user can scroll again to retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [entries.length, hasMore, isLoadingMore]);

  const searchEntries = useCallback(async (query: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setHasMore(false); // Search returns all matches; no pagination
      const data = await getAPI().barkflowSearchEntries(query, PAGE_SIZE);
      setEntries(data ?? []);
    } catch (err) {
      setError("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.trim() === "") {
      fetchEntries();
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchEntries(searchQuery.trim());
    }, 300);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, fetchEntries, searchEntries]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await getAPI().barkflowDeleteEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    } catch {
      setError("Failed to delete entry. Please try again.");
    }
  }, []);

  const filteredEntries = useMemo(() => {
    if (sourceFilter === "all") return entries;
    return entries.filter((e) => e.source === sourceFilter);
  }, [entries, sourceFilter]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((e) => e.id === selectedId) ?? null,
    [filteredEntries, selectedId]
  );

  // Virtual scroll calculations
  const totalHeight = filteredEntries.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const endIdx = Math.min(
    filteredEntries.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER
  );
  const visibleEntries = filteredEntries.slice(startIdx, endIdx);

  const handleListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);

      // Trigger load-more when near the bottom
      const distanceFromBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceFromBottom < LOAD_MORE_THRESHOLD && hasMore && !isLoadingMore) {
        loadMoreEntries();
      }
    },
    [hasMore, isLoadingMore, loadMoreEntries]
  );

  return (
    <div className={cn("flex h-full max-w-5xl mx-auto w-full", className)}>
      {/* List panel */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border/15 dark:border-white/6">
        {/* Search */}
        <div className="p-3 pb-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries\u2026"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="px-3 pb-2">
          <FilterChips active={sourceFilter} onChange={setSourceFilter} />
        </div>

        {/* Entry list — virtual scrolled */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto px-1.5"
          onScroll={handleListScroll}
        >
          {isLoading && filteredEntries.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-muted-foreground">Loading\u2026</span>
            </div>
          )}

          {error && (
            <div className="px-3 py-4">
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline-flat" size="sm" onClick={fetchEntries} className="mt-2 text-xs">
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !error && filteredEntries.length === 0 && <EmptyState />}

          {filteredEntries.length > 0 && (
            <div style={{ height: totalHeight, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: startIdx * ROW_HEIGHT,
                  width: "100%",
                }}
              >
                {visibleEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    onSelect={() => setSelectedId(entry.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {isLoadingMore && (
            <div className="flex items-center justify-center py-3">
              <span className="text-xs text-muted-foreground">Loading more\u2026</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {selectedEntry ? (
          <EntryDetail entry={selectedEntry} onDelete={handleDelete} />
        ) : (
          <NoSelectionPlaceholder />
        )}
      </div>
    </div>
  );
}
