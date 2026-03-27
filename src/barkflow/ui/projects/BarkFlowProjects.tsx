import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, FolderOpen, Mic, Clipboard } from "lucide-react";
import { cn } from "../../../components/lib/utils";
import type { Entry, EntrySource, Project } from "../../core/storage/types";

interface BarkFlowProjectsProps {
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

function EntryRow({ entry }: { readonly entry: Entry }) {
  const text = displayText(entry);

  return (
    <div className="w-full text-left px-3 py-2.5 rounded-md hover:bg-foreground/4 dark:hover:bg-white/4 transition-colors duration-150">
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
    </div>
  );
}

interface ProjectItemProps {
  readonly project: Project;
  readonly isSelected: boolean;
  readonly entryCount: number | undefined;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}

function ProjectItem({ project, isSelected, entryCount, onSelect, onDelete }: ProjectItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md transition-colors duration-150 outline-none group",
        "focus-visible:ring-1 focus-visible:ring-primary/30",
        isSelected
          ? "bg-primary/8 dark:bg-primary/12"
          : "hover:bg-foreground/4 dark:hover:bg-white/4"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{project.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {entryCount !== undefined ? `${entryCount} entries` : "\u2026"}
          </p>
        </div>
        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Delete ${project.name}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </button>
  );
}

function NewProjectInput({
  onSubmit,
  onCancel,
}: {
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        onSubmit(trimmed);
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="px-3 py-1.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder="Project name\u2026"
        className="w-full h-7 px-2 text-xs rounded-md border border-border/25 dark:border-white/10 bg-background outline-none focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

// Main component

export default function BarkFlowProjects({ className }: BarkFlowProjectsProps) {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await window.electronAPI.barkflowGetProjects();
      setProjects(data ?? []);
    } catch {
      setError("Failed to load projects.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Load entries when a project is selected
  useEffect(() => {
    if (selectedId == null) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await window.electronAPI.barkflowGetProjectEntries(selectedId, 100);
        if (!cancelled) {
          setEntries(data ?? []);
          setEntryCounts((prev) => ({ ...prev, [selectedId]: (data ?? []).length }));
        }
      } catch {
        if (!cancelled) setError("Failed to load project entries.");
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedId]);

  // Load entry counts for all projects
  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      for (const project of projects) {
        try {
          const data = await window.electronAPI.barkflowGetProjectEntries(project.id, 0);
          if (cancelled) return;
          counts[project.id] = (data ?? []).length;
        } catch {
          counts[project.id] = 0;
        }
      }
      if (!cancelled) setEntryCounts(counts);
    };

    if (projects.length > 0) loadCounts();
    return () => { cancelled = true; };
  }, [projects]);

  const handleCreateProject = useCallback(async (name: string) => {
    try {
      const created = await window.electronAPI.barkflowCreateProject(name);
      if (created) {
        setProjects((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setEntryCounts((prev) => ({ ...prev, [created.id]: 0 }));
      }
    } catch {
      setError("Failed to create project.");
    } finally {
      setIsCreating(false);
    }
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await window.electronAPI.barkflowDeleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
      setEntryCounts((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    } catch {
      setError("Failed to delete project.");
    }
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className={cn("flex h-full max-w-5xl mx-auto w-full", className)}>
      {/* Project list panel */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border/15 dark:border-white/6">
        <div className="p-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-foreground/80">Projects</span>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 rounded hover:bg-foreground/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="New Project"
          >
            <Plus size={15} />
          </button>
        </div>

        {isCreating && (
          <NewProjectInput
            onSubmit={handleCreateProject}
            onCancel={() => setIsCreating(false)}
          />
        )}

        <div className="flex-1 overflow-y-auto px-1.5">
          {isLoading && projects.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          )}

          {error && (
            <div className="px-3 py-4">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {!isLoading && !error && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <FolderOpen size={28} className="text-muted-foreground/30 mb-3" />
              <p className="text-xs text-muted-foreground">
                No projects yet. Click + to create one.
              </p>
            </div>
          )}

          {projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              isSelected={project.id === selectedId}
              entryCount={entryCounts[project.id]}
              onSelect={() => setSelectedId(project.id)}
              onDelete={() => handleDeleteProject(project.id)}
            />
          ))}
        </div>
      </div>

      {/* Entries panel */}
      <div className="flex-1 overflow-y-auto">
        {selectedProject ? (
          <div className="flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-base font-medium text-foreground">{selectedProject.name}</h2>
            </div>
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-8">
                <FolderOpen size={28} className="text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No entries in this project yet. Use Fn+P to capture thoughts here.
                </p>
              </div>
            ) : (
              <div className="px-1.5">
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a project to view entries
          </div>
        )}
      </div>
    </div>
  );
}
