import { Fragment, useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListAgents,
  useGetSession,
  useListBoardViews,
  useCreateBoardView,
  useUpdateBoardView,
  useDeleteBoardView,
  getListBoardViewsQueryKey,
  type ProjectSummary,
  type ProjectPhase,
} from "@workspace/api-client-react";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ProjectImportDialog,
  ProjectDetailDialog,
} from "@/components/project-detail-dialog";
import {
  CalendarDays,
  Check,
  CheckSquare,
  ChevronRight,
  ChevronsUpDown,
  KanbanSquare,
  Pause,
  Plus,
  Star,
  Trash2,
  Upload,
  Search,
  Filter as FilterIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PlanningYearFilter,
  usePlanningYear,
  planningYearHelperText,
  planningYearEmptyText,
  currentPlanningYear,
} from "@/components/planning-year-filter";

// Phase board columns, in canonical order. The board is global — every
// project is shown in exactly one column based on its `phase`.
const PHASE_COLUMNS: { key: ProjectPhase; label: string; color: string }[] = [
  {
    key: "backlog_needs_assignment",
    label: "Backlog · Needs Assignment",
    color: "#94A3B8",
  },
  { key: "planning", label: "Planning", color: "#0EA5E9" },
  { key: "in_progress", label: "Implementation", color: "#10B981" },
  { key: "on_hold", label: "On Hold", color: "#F59E0B" },
  { key: "completed", label: "Completed", color: "#0D9488" },
  { key: "closed", label: "Closed", color: "#64748B" },
  { key: "cancelled", label: "Cancelled", color: "#F43F5E" },
];

// Hint copy under each lane title — mirrors the Risk Register pattern so
// viewers can see the "what should I do next" cue without opening a card.
const PHASE_HINT: Record<ProjectPhase, string> = {
  backlog_needs_assignment: "Assign owner + dates to schedule",
  planning: "Scoping, kickoff, dependencies",
  in_progress: "Active execution + checklist",
  on_hold: "Paused — needs unblock",
  completed: "Delivered — pending closeout",
  closed: "Closed out and archived",
  cancelled: "Stopped — no further work",
};

// Lane chrome (colored header band + ring) keyed to the same hue as the
// header counter chips. Mirrors LANE_TONE on the Risk Register so the two
// boards read as one design language.
const PHASE_TONE: Record<
  ProjectPhase,
  { header: string; ring: string }
> = {
  backlog_needs_assignment: {
    header: "bg-slate-100 text-slate-700",
    ring: "ring-slate-200",
  },
  planning: {
    header: "bg-sky-50 text-sky-800",
    ring: "ring-sky-200",
  },
  in_progress: {
    header: "bg-emerald-50 text-emerald-800",
    ring: "ring-emerald-200",
  },
  on_hold: {
    header: "bg-amber-50 text-amber-800",
    ring: "ring-amber-200",
  },
  completed: {
    header: "bg-teal-50 text-teal-800",
    ring: "ring-teal-200",
  },
  closed: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
  },
  cancelled: {
    header: "bg-rose-50 text-rose-800",
    ring: "ring-rose-200",
  },
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
  medium: "bg-sky-100 text-sky-700 border-sky-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  urgent: "bg-rose-100 text-rose-800 border-rose-200",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function formatDue(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Backlog sub-status is purely derived — there is no `subStatus` column. A
// project sits in Backlog as "Scheduled" once it has an owner AND both a
// start and an anticipated completion date; otherwise it's "Needs Assignment".
// Removing any of those three reverts the badge automatically. Sub-status is
// for clarity only — the project never leaves the Backlog phase column.
export type BacklogSubStatus = "needs_assignment" | "scheduled";

export function backlogSubStatus(p: {
  ownerId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): BacklogSubStatus {
  return p.ownerId != null && p.startDate != null && p.endDate != null
    ? "scheduled"
    : "needs_assignment";
}

// Days between today (UTC date-only) and an ISO `YYYY-MM-DD` date string.
// Positive = future, 0 = today, negative = past. Returns null if no date.
export function daysFromTodayTo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const today = Date.UTC(
    Number(todayISO.slice(0, 4)),
    Number(todayISO.slice(5, 7)) - 1,
    Number(todayISO.slice(8, 10)),
  );
  const target = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Dynamic, human-friendly label for a Backlog start date.
// `tone` indicates whether the schedule is healthy ("ok") or has slipped
// ("late"); the caller styles accordingly (rose for "late").
export function startDateLabel(
  iso: string | null | undefined,
): { text: string; tone: "ok" | "late" } | null {
  const days = daysFromTodayTo(iso);
  if (days === null) return null;
  if (days < 0) {
    return {
      text: `Start date missed by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
      tone: "late",
    };
  }
  if (days === 0) return { text: "Starts today", tone: "ok" };
  if (days === 1) return { text: "Starts tomorrow", tone: "ok" };
  return { text: `Starts in ${days} days`, tone: "ok" };
}

type ProjectSortKey = "default" | "due_asc" | "due_desc";

type ProjectFilters = {
  priority: string; // "all" | "low" | "medium" | "high" | "urgent"
  ownerId: string; // "all" | "unassigned" | numeric id as string
  // Initiative-triage axes carried over on approval. Empty string on
  // the project row means "not set" (e.g. imported, not promoted).
  riskLevel: string;
  category: string;
  alignment: string;
  effort: string;
};

const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
  priority: "all",
  ownerId: "all",
  riskLevel: "all",
  category: "all",
  alignment: "all",
  effort: "all",
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

// These mirror the initiative-side option sets so the filter dropdowns
// here line up exactly with what gets copied onto the project at
// approval time. Kept inline (vs. shared module) because the lists are
// short, stable, and only consumed by these two pages.
const LMH_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PROJECT_CATEGORY_OPTIONS = [
  { value: "process", label: "Process" },
  { value: "tooling", label: "Tooling / Software" },
  { value: "policy", label: "Policy" },
  { value: "training", label: "Training" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "other", label: "Other" },
];

const PROJECT_ALIGNMENT_OPTIONS = [
  { value: "yes", label: "Aligned" },
  { value: "no", label: "Not aligned" },
  { value: "unsure", label: "Unsure" },
];

// Tone for the per-phase counter chip in the page header. Mirrors the column
// dot color so the chip set reads as a quick "where do my projects live"
// summary.
const PHASE_CHIP_TONE: Record<ProjectPhase, string> = {
  backlog_needs_assignment: "bg-zinc-100 text-zinc-700 border-zinc-200",
  planning: "bg-sky-50 text-sky-700 border-sky-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  on_hold: "bg-amber-50 text-amber-800 border-amber-200",
  completed: "bg-teal-50 text-teal-700 border-teal-200",
  closed: "bg-zinc-100 text-zinc-700 border-zinc-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

const PHASE_CHIP_LABEL: Record<ProjectPhase, string> = {
  backlog_needs_assignment: "Backlog",
  planning: "Planning",
  in_progress: "Implementation",
  on_hold: "On Hold",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function ProjectsPage() {
  const { data: session } = useGetSession();
  const queryClient = useQueryClient();
  const canCreate = session?.role === "admin" || session?.role === "agent";
  const [createOpen, setCreateOpen] = useState(false);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ProjectFilters>(
    DEFAULT_PROJECT_FILTERS,
  );
  const [sortKey, setSortKey] = useState<ProjectSortKey>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const scope = useTeamScope();
  const { data: agents } = useListAgents({});
  const activeDept = useMemo(
    () =>
      scope.single
        ? scope.accessible.find((d) => d.id === scope.singleId) ?? null
        : null,
    [scope.single, scope.singleId, scope.accessible],
  );

  const scopeLabel = useMemo(() => {
    if (scope.loading) return "Loading…";
    if (scope.accessible.length === 0) return "No teams";
    if (scope.isAll && scope.accessible.length > 1) return "All Teams";
    if (scope.single) {
      const dept = scope.accessible.find((d) => d.id === scope.singleId);
      return dept?.name ?? "1 team";
    }
    // Multi-select: list the actual team names so the header reads
    // like a real breadcrumb. Cap at 3 to keep the title from
    // wrapping on small screens.
    const names = scope.selectedIds
      .map((id) => scope.accessible.find((d) => d.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return `${scope.selectedIds.length} teams`;
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  }, [
    scope.loading,
    scope.accessible,
    scope.isAll,
    scope.single,
    scope.singleId,
    scope.selectedIds,
  ]);

  // Saved views — scoped to "project".
  const { data: views } = useListBoardViews({ scope: "project" });
  const createView = useCreateBoardView();
  const updateView = useUpdateBoardView();
  const deleteView = useDeleteBoardView();

  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Auto-apply the user's default saved view once on first load.
  useEffect(() => {
    if (defaultApplied || !views) return;
    const def = views.find((v) => v.isDefault);
    if (def) {
      applyView(def.id);
    }
    setDefaultApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, defaultApplied]);

  type ProjectViewConfig = {
    search?: string | null;
    priority?: string | null;
    ownerId?: string | null;
    riskLevel?: string | null;
    category?: string | null;
    alignment?: string | null;
    effort?: string | null;
    sort?: { field: string; dir: "asc" | "desc" } | null;
    departmentId?: number | null;
  };

  function buildConfigFromFilters(): ProjectViewConfig {
    return {
      search: search ? search : null,
      priority: filters.priority === "all" ? null : filters.priority,
      ownerId: filters.ownerId === "all" ? null : filters.ownerId,
      riskLevel: filters.riskLevel === "all" ? null : filters.riskLevel,
      category: filters.category === "all" ? null : filters.category,
      alignment: filters.alignment === "all" ? null : filters.alignment,
      effort: filters.effort === "all" ? null : filters.effort,
      sort:
        sortKey === "default"
          ? null
          : {
              field: "endDate",
              dir: sortKey === "due_asc" ? "asc" : "desc",
            },
      departmentId: activeDept?.id ?? null,
    };
  }

  function applyView(viewId: number) {
    const v = views?.find((x) => x.id === viewId);
    if (!v) return;
    const c = (v.config ?? {}) as ProjectViewConfig;
    setSearch(typeof c.search === "string" ? c.search : "");
    setFilters({
      priority: c.priority ?? "all",
      ownerId: c.ownerId ?? "all",
      riskLevel: c.riskLevel ?? "all",
      category: c.category ?? "all",
      alignment: c.alignment ?? "all",
      effort: c.effort ?? "all",
    });
    if (c.sort && (c.sort.dir === "asc" || c.sort.dir === "desc")) {
      setSortKey(c.sort.dir === "asc" ? "due_asc" : "due_desc");
    } else {
      setSortKey("default");
    }
    setActiveViewId(viewId);
  }

  const activeView = useMemo(
    () => (activeViewId ? views?.find((v) => v.id === activeViewId) : null) ?? null,
    [views, activeViewId],
  );

  async function handleSaveView() {
    if (!saveName.trim()) return;
    const created = await createView.mutateAsync({
      data: {
        scope: "project",
        name: saveName.trim(),
        config: buildConfigFromFilters() as unknown as Record<string, unknown>,
        isDefault: saveAsDefault,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "project" }),
    });
    setActiveViewId(created.id);
    setSaveName("");
    setSaveAsDefault(false);
    setSaveOpen(false);
  }

  async function handleSetDefaultView(viewId: number, value: boolean) {
    await updateView.mutateAsync({ id: viewId, data: { isDefault: value } });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "project" }),
    });
  }

  async function handleDeleteView(viewId: number) {
    await deleteView.mutateAsync({ id: viewId });
    if (activeViewId === viewId) setActiveViewId(null);
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "project" }),
    });
  }

  // We always render the same fixed 6-column phase board; if a department
  // is selected via URL we just narrow the result set to that dept.
  // Search is applied fully client-side below so it can match across more
  // fields than the backend's name+description-only `q=` parameter.
  // Planning Year filter — server enforces the visibility rule (open
  // projects always shown when current year is selected).
  const [planningYear, setPlanningYear] = usePlanningYear("projects");
  const { data: projects, isLoading } = useListProjects({ planningYear });

  const activeFilterCount = useMemo(
    () =>
      (Object.keys(filters) as (keyof ProjectFilters)[]).filter(
        (k) => filters[k] !== "all",
      ).length + (sortKey !== "default" ? 1 : 0),
    [filters, sortKey],
  );

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();
    const scoped = filterByTeamScope(projects, scope);
    let list = scoped.filter((p) => {
      if (q) {
        const hay = [
          p.name,
          p.description,
          p.ownerName ?? "",
          p.departmentName ?? "",
          p.linkedInitiativeTitle ?? "",
          p.assignedTeam ?? "",
          p.holdReason ?? "",
          p.holdNotes ?? "",
          p.bucketName ?? "",
        ]
          .join(" \u0001 ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.priority !== "all" && p.priority !== filters.priority)
        return false;
      if (filters.ownerId !== "all") {
        if (filters.ownerId === "unassigned") {
          if (p.ownerId != null) return false;
        } else if (String(p.ownerId ?? "") !== filters.ownerId) {
          return false;
        }
      }
      // Initiative-triage axes: an empty string on the project row
      // means "not set", so any active filter on these axes will hide
      // legacy/imported projects that lack the data. That's the
      // intended behavior — these filters are about narrowing the
      // initiative-promoted slice of the board.
      if (filters.riskLevel !== "all" && p.riskLevel !== filters.riskLevel)
        return false;
      if (filters.category !== "all" && p.category !== filters.category)
        return false;
      if (
        filters.alignment !== "all" &&
        p.businessAlignment !== filters.alignment
      )
        return false;
      if (filters.effort !== "all" && p.initialEffort !== filters.effort)
        return false;
      return true;
    });

    if (sortKey !== "default") {
      const dir = sortKey === "due_asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const ad = a.endDate ?? a.dueAt ?? "";
        const bd = b.endDate ?? b.dueAt ?? "";
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad < bd ? -1 * dir : ad > bd ? 1 * dir : 0;
      });
    }
    return list;
  }, [projects, scope, filters, sortKey, search]);

  const byPhase = useMemo(() => {
    const map: Record<ProjectPhase, ProjectSummary[]> = {
      backlog_needs_assignment: [],
      planning: [],
      in_progress: [],
      on_hold: [],
      completed: [],
      closed: [],
      cancelled: [],
    };
    for (const p of filtered) {
      const phase = (p.phase ?? "backlog_needs_assignment") as ProjectPhase;
      (map[phase] ?? map.backlog_needs_assignment).push(p);
    }
    return map;
  }, [filtered]);

  const clearAll = () => {
    setFilters(DEFAULT_PROJECT_FILTERS);
    setSortKey("default");
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto" data-testid="projects-page">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-1 text-[26px] font-display font-semibold tracking-tight m-0">
            <span>Projects</span>
            <span className="text-muted-foreground font-normal mx-1.5">·</span>
            <span
              className="px-1.5 py-0.5 text-[26px] font-display font-semibold"
              data-testid="text-scope-label"
            >
              {scopeLabel}
            </span>

            <ChevronRight className="h-4 w-4 opacity-50 mx-0.5" />

            <DropdownMenu
              open={viewsMenuOpen}
              onOpenChange={setViewsMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 text-[26px] font-display font-semibold"
                  data-testid="button-project-views"
                >
                  <span>
                    {activeView ? activeView.name : "Default view"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Views
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setViewsMenuOpen(false);
                    setActiveViewId(null);
                    setSearch("");
                    setFilters(DEFAULT_PROJECT_FILTERS);
                    setSortKey("default");
                  }}
                  className="flex items-center justify-between"
                  data-testid="project-view-option-default"
                >
                  <span>Default view</span>
                  {!activeView && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </DropdownMenuItem>
                {(views ?? []).map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      setViewsMenuOpen(false);
                      applyView(v.id);
                    }}
                    className="flex items-center justify-between gap-2"
                    data-testid={`project-menu-view-${v.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{v.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {v.isDefault && (
                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      )}
                      {activeViewId === v.id && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setViewsMenuOpen(false);
                    setSaveName(
                      activeView ? `${activeView.name} (copy)` : "My view",
                    );
                    setSaveAsDefault(false);
                    setSaveOpen(true);
                  }}
                  disabled={
                    activeFilterCount === 0 &&
                    search.trim().length === 0 &&
                    !activeView
                  }
                  data-testid="project-menu-save-view"
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Save current view
                </DropdownMenuItem>
                {activeView && (
                  <>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleSetDefaultView(
                          activeView.id,
                          !activeView.isDefault,
                        );
                      }}
                      data-testid="project-menu-toggle-default"
                    >
                      <Star className="h-3.5 w-3.5 mr-2" />
                      {activeView.isDefault
                        ? "Unset as default view"
                        : "Set as default view"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleDeleteView(activeView.id);
                      }}
                      className="text-red-600 focus:text-red-700"
                      data-testid="project-menu-delete-view"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete this view
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Move projects through Backlog → Planning → Implementation →
            Completed. Click a card to assign owners, manage the
            checklist, and post status updates.
          </p>
          <p
            className="text-[12px] text-muted-foreground mt-1"
            data-testid="text-planning-year-helper"
          >
            {planningYearHelperText(planningYear)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlanningYearFilter
            value={planningYear}
            onChange={setPlanningYear}
          />
          {canCreate && (
            <Button
              variant="outline"
              data-testid="button-import-project"
              onClick={() => setCreateOpen(true)}
              disabled={scope.loading || scope.accessible.length === 0}
              title="Backfill an existing in-flight project"
            >
              <Upload className="h-4 w-4 mr-1.5" /> Import project
            </Button>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 flex-wrap mb-5"
        data-testid="phase-counters"
      >
        {PHASE_COLUMNS.map((col) => (
          <Badge
            key={col.key}
            variant="outline"
            className={cn(
              "text-[11.5px] font-medium px-2 py-0.5",
              PHASE_CHIP_TONE[col.key],
            )}
            data-testid={`chip-count-${col.key}`}
          >
            {byPhase[col.key].length} {PHASE_CHIP_LABEL[col.key]}
          </Badge>
        ))}
      </div>

      <ProjectImportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDepartmentId={activeDept?.id ?? null}
        defaultPlanningYear={planningYear}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              data-testid="button-project-filters"
            >
              <FilterIcon className="h-3.5 w-3.5 mr-1.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-5 px-1.5 text-[10.5px] font-semibold"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-3" align="start">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-zinc-700">
                Filters
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11.5px] text-muted-foreground hover:text-foreground"
                data-testid="button-clear-project-filters"
              >
                Clear all
              </button>
            </div>
            <p className="text-[10.5px] text-muted-foreground italic mb-2">
              Risk Level, Category, Business Alignment, and Effort are
              copied from the Initiative on approval — imported projects
              won't match those filters.
            </p>
            <div className="space-y-2.5">
              <ProjectFilterField label="Risk Level">
                <Select
                  value={filters.riskLevel}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, riskLevel: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-risk"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {LMH_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Category">
                <Select
                  value={filters.category}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, category: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-category"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {PROJECT_CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Business Alignment">
                <Select
                  value={filters.alignment}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, alignment: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-alignment"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {PROJECT_ALIGNMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Priority">
                <Select
                  value={filters.priority}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, priority: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-priority"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Effort">
                <Select
                  value={filters.effort}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, effort: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-effort"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {LMH_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Assignee">
                <Select
                  value={filters.ownerId}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, ownerId: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-assignee"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {agents?.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProjectFilterField>
              <ProjectFilterField label="Sort by Due Date">
                <Select
                  value={sortKey}
                  onValueChange={(v) => setSortKey(v as ProjectSortKey)}
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-project-sort"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default order</SelectItem>
                    <SelectItem value="due_asc">Soonest first</SelectItem>
                    <SelectItem value="due_desc">Latest first</SelectItem>
                  </SelectContent>
                </Select>
              </ProjectFilterField>
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-project-search"
          />
        </div>
        {(activeFilterCount > 0 || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-[12px]"
            onClick={() => {
              clearAll();
              setSearch("");
            }}
            data-testid="button-reset-project-filters"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <div
          className="rounded-xl border border-dashed bg-muted/30 p-12 text-center"
          data-testid="empty-state-projects"
        >
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <KanbanSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">No projects to show</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {planningYearEmptyText(planningYear)}
            {planningYear !== currentPlanningYear() ? (
              <>
                {" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2 hover:text-primary"
                  onClick={() => setPlanningYear(currentPlanningYear())}
                  data-testid="button-jump-to-current-year"
                >
                  Jump to {currentPlanningYear()} (current).
                </button>
              </>
            ) : null}
            {canCreate &&
              " Use \u201CImport project\u201D to backfill any work that\u2019s already in flight."}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div
          className="flex items-stretch gap-2 overflow-x-auto pb-4"
          data-testid="phase-board"
        >
          {PHASE_COLUMNS.map((col, idx) => (
            <Fragment key={col.key}>
              <PhaseColumn
                phaseKey={col.key}
                label={col.label}
                projects={byPhase[col.key]}
                onCardClick={(p) => setOpenProjectId(p.id)}
                testId={`column-${col.key}`}
              />
              {idx < PHASE_COLUMNS.length - 1 && (
                <div
                  className="flex items-center justify-center shrink-0 w-5 text-zinc-300"
                  aria-hidden
                >
                  <ChevronRight className="h-5 w-5" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}

      {openProjectId != null && (
        <ProjectDetailDialog
          projectId={openProjectId}
          onClose={() => setOpenProjectId(null)}
        />
      )}

      {/* Save view dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-view-name">View name</Label>
              <Input
                id="project-view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. My in-flight projects"
                data-testid="input-project-view-name"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-project-save-default"
              />
              Make this my default view
            </label>
            <p className="text-xs text-muted-foreground">
              Saves your search, filters, and the current team scope.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!saveName.trim() || createView.isPending}
              data-testid="button-confirm-save-project-view"
            >
              {createView.isPending ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhaseColumn({
  phaseKey,
  label,
  projects,
  onCardClick,
  testId,
}: {
  phaseKey: ProjectPhase;
  label: string;
  projects: ProjectSummary[];
  onCardClick: (p: ProjectSummary) => void;
  testId: string;
}) {
  const tone = PHASE_TONE[phaseKey];
  return (
    <div
      className={cn(
        "w-[280px] shrink-0 rounded-lg ring-1 bg-white flex flex-col",
        tone.ring,
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "px-3 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide rounded-t-lg",
          tone.header,
        )}
      >
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{projects.length}</span>
      </div>
      <div className="px-3 py-1 text-[11.5px] text-muted-foreground border-b border-zinc-100">
        {PHASE_HINT[phaseKey]}
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">
            Nothing here yet.
          </p>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => onCardClick(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project: p,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}) {
  const total = p.checklistTotal;
  const done = p.checklistDone;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const due = formatDue(p.endDate ?? p.dueAt);
  const start = formatDue(p.startDate);
  const isBacklog = p.phase === "backlog_needs_assignment";
  const subStatus = isBacklog ? backlogSubStatus(p) : null;
  const startInfo = isBacklog ? startDateLabel(p.startDate) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-project-${p.id}`}
      className="w-full text-left rounded-md bg-card border border-border/70 hover:border-primary/60 hover:shadow-sm transition-all overflow-hidden block"
    >
      <div
        className="h-1"
        style={{ backgroundColor: p.color }}
        aria-hidden
      />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start gap-2">
          <p className="font-medium text-[12.5px] leading-snug flex-1 min-w-0">
            {p.name}
          </p>
          <Badge
            variant="outline"
            className={cn(
              "text-[9.5px] shrink-0 px-1 py-0",
              PRIORITY_BADGE[p.priority] ?? PRIORITY_BADGE.medium,
            )}
          >
            {p.priority}
          </Badge>
        </div>

        {isBacklog && subStatus && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[9.5px] px-1 py-0 font-medium",
                subStatus === "scheduled"
                  ? "bg-sky-50 text-sky-700 border-sky-200"
                  : "bg-amber-50 text-amber-800 border-amber-200",
              )}
              data-testid={`badge-substatus-${p.id}`}
            >
              {subStatus === "scheduled" ? "Scheduled" : "Needs Assignment"}
            </Badge>
            {startInfo && (
              <span
                className={cn(
                  "text-[10px]",
                  startInfo.tone === "late"
                    ? "text-rose-700 font-medium"
                    : "text-muted-foreground",
                )}
                data-testid={`text-start-label-${p.id}`}
              >
                {startInfo.text}
              </span>
            )}
          </div>
        )}

        {p.linkedInitiativeTitle && (
          <p className="text-[10.5px] text-muted-foreground italic truncate">
            ↳ {p.linkedInitiativeTitle}
          </p>
        )}

        {p.assignedTeam && (
          <p className="text-[10.5px] text-muted-foreground truncate">
            Team: {p.assignedTeam}
          </p>
        )}

        {p.phase === "on_hold" && p.holdReason && (
          <p className="text-[10.5px] text-amber-800 inline-flex items-center gap-1">
            <Pause className="h-2.5 w-2.5" /> {p.holdReason}
          </p>
        )}

        {total > 0 ? (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="h-2.5 w-2.5" />
                {done}/{total}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: p.color,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground pt-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {p.ownerName ? (
              <Avatar className="h-4 w-4">
                <AvatarFallback className="bg-primary/10 text-primary text-[8px] font-semibold">
                  {initials(p.ownerName)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </div>
          {due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" />
              {start ? `${start} – ${due}` : due}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ProjectFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
