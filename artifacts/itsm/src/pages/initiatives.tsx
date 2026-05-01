import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInitiatives,
  useCreateInitiative,
  useUpdateInitiative,
  useListAgents,
  useGetSession,
  useListBoardViews,
  useCreateBoardView,
  useUpdateBoardView,
  useDeleteBoardView,
  getListBoardViewsQueryKey,
  type Initiative,
  type InitiativeStatus,
  type InitiativeAuditEvent,
  getListInitiativesQueryKey,
  getGetInitiativeQueryKey,
} from "@workspace/api-client-react";
import { useTeamScope, filterByTeamScope, type TeamScope } from "@/lib/team-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  UnsavedChangesDialog,
  useBeforeUnloadGuard,
} from "@/components/unsaved-changes-dialog";
import { useIsDirty } from "@/lib/use-dirty-tracking";
import { formatMoneyOnBlur } from "@/lib/format-input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Lightbulb,
  Clock,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  Plus,
  Star,
  Trash2,
  Users,
  XCircle,
  PauseCircle,
  Undo2,
  RotateCcw,
  History,
  FileDown,
  Filter as FilterIcon,
  Search,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitiativeWorkflowApproval } from "@/components/initiative-workflow-approval";
import { downloadInitiativeReport } from "@/components/initiative-report";
import {
  PlanningYearFilter,
  usePlanningYear,
  planningYearOptions,
  planningYearHelperText,
  planningYearEmptyText,
  currentPlanningYear,
  PLANNING_YEAR_RADIUS,
} from "@/components/planning-year-filter";

// ---------- Constants ----------

const STATUS_ORDER: InitiativeStatus[] = [
  "backlog",
  "under_review",
  "approved",
  "rejected_deferred",
];

// ---- Lifecycle phase tabs (in-dialog) ----
// The Initiative detail dialog mirrors the Risk detail dialog: a clickable
// tab strip below the title, where tabs left of the current phase are
// emerald (completed), the current phase is amber, and tabs to the right
// are grey/default. The third tab ("decision") covers both Approved and
// Rejected/Deferred since they share the same content surface.
type InitiativePhaseTab = "backlog" | "under_review" | "decision";

const PHASE_TAB_ORDER: InitiativePhaseTab[] = [
  "backlog",
  "under_review",
  "decision",
];

function defaultTabForStatus(status: InitiativeStatus): InitiativePhaseTab {
  if (status === "backlog") return "backlog";
  if (status === "under_review") return "under_review";
  // approved | rejected_deferred -> decision
  return "decision";
}

// Returns the index of the lifecycle phase the initiative is currently in.
// approved + rejected_deferred both resolve to the "decision" tab (index 2).
function phaseIndexForStatus(status: InitiativeStatus): number {
  if (status === "backlog") return 0;
  if (status === "under_review") return 1;
  return 2;
}

// Color a single TabsTrigger based on whether it sits left of, on, or right
// of the initiative's current phase. Identical pattern to the Risks dialog.
function phaseTabClass(
  status: InitiativeStatus,
  tabValue: InitiativePhaseTab,
): string {
  const idx = PHASE_TAB_ORDER.indexOf(tabValue);
  const current = phaseIndexForStatus(status);
  if (idx < current) {
    return "data-[state=active]:bg-emerald-500 data-[state=active]:text-white bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }
  if (idx === current) {
    return "data-[state=active]:bg-amber-500 data-[state=active]:text-white bg-amber-100 text-amber-900 hover:bg-amber-200";
  }
  return "";
}

const STATUS_LABEL: Record<InitiativeStatus, string> = {
  backlog: "Backlog",
  under_review: "Under Review",
  approved: "Approved",
  rejected_deferred: "Rejected / Deferred",
};

const STATUS_HINT: Record<InitiativeStatus, string> = {
  backlog: "Fresh ideas — needs triage",
  under_review: "Light analysis — pros/cons, cost, risk",
  approved: "Approved → became a Project",
  rejected_deferred: "Decision recorded — no work proceeds",
};

const STATUS_COLORS: Record<
  InitiativeStatus,
  { header: string; ring: string; pill: string }
> = {
  backlog: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
    pill: "bg-zinc-100 text-zinc-800 border-zinc-300",
  },
  under_review: {
    header: "bg-amber-50 text-amber-800",
    ring: "ring-amber-200",
    pill: "bg-amber-50 text-amber-800 border-amber-200",
  },
  approved: {
    header: "bg-emerald-50 text-emerald-800",
    ring: "ring-emerald-200",
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  rejected_deferred: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
    pill: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
};

const IMPACT_SCOPE_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "team", label: "Team" },
  { value: "department", label: "Department" },
  { value: "company_wide", label: "Company-wide" },
];

const CATEGORY_OPTIONS = [
  { value: "it", label: "IT" },
  { value: "security", label: "Security" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
  { value: "compliance", label: "Compliance" },
  { value: "customer_experience", label: "Customer Experience" },
  { value: "other", label: "Other" },
];

const LMH_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const LMHU_OPTIONS = [...LMH_OPTIONS, { value: "unknown", label: "Unknown" }];

const ALIGNMENT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" },
];

const INVESTIGATION_OPTIONS = [
  { value: "investigate_further", label: "Investigate Further" },
  { value: "do_not_investigate", label: "Do Not Investigate" },
];

const VALIDATION_OPTIONS = [
  { value: "not_reviewed", label: "Not Reviewed" },
  { value: "discussed", label: "Discussed" },
  { value: "demoed", label: "Demoed" },
  { value: "piloted", label: "Piloted" },
];

// ---------- Helpers ----------

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ageLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function levelTone(value: string) {
  const v = value.toLowerCase();
  if (v === "high")
    return "bg-rose-50 text-rose-700 border-rose-200";
  if (v === "medium")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (v === "low")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

function fmtOption(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value;
}

// ---------- Page ----------

type InitiativeSortKey = "default" | "due_asc" | "due_desc";

type InitiativeFilters = {
  riskLevel: string; // "all" | "low" | "medium" | "high"
  category: string; // "all" | category value
  alignment: string; // "all" | "yes" | "no" | "unsure"
  priority: string; // "all" | "low" | "medium" | "high"
  effort: string; // "all" | "low" | "medium" | "high"
  assigneeId: string; // "all" | "unassigned" | numeric id as string
};

const DEFAULT_INITIATIVE_FILTERS: InitiativeFilters = {
  riskLevel: "all",
  category: "all",
  alignment: "all",
  priority: "all",
  effort: "all",
  assigneeId: "all",
};

const STATUS_CHIP_TONE: Record<InitiativeStatus, string> = {
  backlog: "bg-zinc-100 text-zinc-700 border-zinc-200",
  under_review: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected_deferred: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function InitiativesPage() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const queryClient = useQueryClient();
  // Planning year filter — see `planning-year-filter.tsx` for the
  // visibility rule. The dropdown lives top-right in the header and
  // we plumb the chosen year into the list query so the server does
  // the actual filtering.
  const [planningYear, setPlanningYear] = usePlanningYear("initiatives");
  const { data, isLoading } = useListInitiatives({ planningYear });
  const initiatives = (data ?? []) as Initiative[];
  const { data: agents } = useListAgents({});
  const scope = useTeamScope();
  const [, setLocation] = useLocation();
  const activeDept = useMemo(
    () =>
      scope.single
        ? scope.accessible.find((d) => d.id === scope.singleId) ?? null
        : null,
    [scope.single, scope.singleId, scope.accessible],
  );

  // Saved views — mirrors the Tickets page. Scoped to "initiative" so
  // each section has its own list and its own per-section default.
  const { data: views } = useListBoardViews({ scope: "initiative" });
  const createView = useCreateBoardView();
  const updateView = useUpdateBoardView();
  const deleteView = useDeleteBoardView();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InitiativeFilters>(
    DEFAULT_INITIATIVE_FILTERS,
  );
  const [sortKey, setSortKey] = useState<InitiativeSortKey>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Saved-view UI state
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const activeFilterCount = useMemo(
    () =>
      (Object.keys(filters) as (keyof InitiativeFilters)[]).filter(
        (k) => filters[k] !== "all",
      ).length + (sortKey !== "default" ? 1 : 0),
    [filters, sortKey],
  );

  // ---------- Saved view orchestration ----------

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

  // Persisted shape of a saved view. Mirrors what the page actually
  // controls — search, filters, and sort key. The generic
  // BoardViewConfig schema accepts any extra keys, so this is a safe
  // superset of what other sections will store.
  type InitiativeViewConfig = {
    search?: string | null;
    riskLevel?: string | null;
    category?: string | null;
    alignment?: string | null;
    priority?: string | null;
    effort?: string | null;
    assigneeId?: string | null;
    sort?: { field: string; dir: "asc" | "desc" } | null;
  };

  function buildConfigFromFilters(): InitiativeViewConfig {
    return {
      search: search ? search : null,
      riskLevel: filters.riskLevel === "all" ? null : filters.riskLevel,
      category: filters.category === "all" ? null : filters.category,
      alignment: filters.alignment === "all" ? null : filters.alignment,
      priority: filters.priority === "all" ? null : filters.priority,
      effort: filters.effort === "all" ? null : filters.effort,
      assigneeId: filters.assigneeId === "all" ? null : filters.assigneeId,
      sort:
        sortKey === "default"
          ? null
          : {
              field: "anticipatedApprovalDate",
              dir: sortKey === "due_asc" ? "asc" : "desc",
            },
    };
  }

  function applyView(viewId: number) {
    const v = views?.find((x) => x.id === viewId);
    if (!v) return;
    const c = (v.config ?? {}) as InitiativeViewConfig;
    setSearch(typeof c.search === "string" ? c.search : "");
    setFilters({
      riskLevel: c.riskLevel ?? "all",
      category: c.category ?? "all",
      alignment: c.alignment ?? "all",
      priority: c.priority ?? "all",
      effort: c.effort ?? "all",
      assigneeId: c.assigneeId ?? "all",
    });
    if (
      c.sort &&
      typeof c.sort.dir === "string" &&
      (c.sort.dir === "asc" || c.sort.dir === "desc")
    ) {
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

  // "Dirty" = at least one filter / search / sort differs from
  // defaults. Used to gate the "Save current view" menu item.
  const filtersDirty =
    activeFilterCount > 0 || search.trim().length > 0;

  async function handleSaveView() {
    if (!saveName.trim()) return;
    const created = await createView.mutateAsync({
      data: {
        scope: "initiative",
        name: saveName.trim(),
        config: buildConfigFromFilters() as unknown as Record<string, unknown>,
        isDefault: saveAsDefault,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "initiative" }),
    });
    setActiveViewId(created.id);
    setSaveName("");
    setSaveAsDefault(false);
    setSaveOpen(false);
  }

  async function handleSetDefaultView(viewId: number, value: boolean) {
    await updateView.mutateAsync({ id: viewId, data: { isDefault: value } });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "initiative" }),
    });
  }

  async function handleDeleteView(viewId: number) {
    await deleteView.mutateAsync({ id: viewId });
    if (activeViewId === viewId) setActiveViewId(null);
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "initiative" }),
    });
  }

  // Detach the active saved view whenever the user manually edits the
  // working filter state — same behaviour as Tickets so the "active
  // view" badge stays honest.
  function setFilter<K extends keyof InitiativeFilters>(
    key: K,
    value: InitiativeFilters[K],
  ) {
    setFilters((f) => ({ ...f, [key]: value }));
    setActiveViewId(null);
  }

  const boardLabel = (() => {
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
  })();
  const viewLabel = activeView ? activeView.name : "Default view";

  // Apply global team-scope filter before the page's own filters.
  // Initiatives with a null departmentId are cross-team and always
  // pass through.
  const visibleInitiatives = useMemo(
    () => filterByTeamScope(initiatives, scope),
    [initiatives, scope],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = visibleInitiatives.filter((i) => {
      if (q) {
        const hay = [
          i.title,
          i.description,
          i.problemOpportunity,
          i.expectedBenefit,
          i.reporterName ?? "",
          i.assigneeName ?? "",
          i.departmentName ?? "",
        ]
          .join(" \u0001 ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.riskLevel !== "all" && i.riskLevel !== filters.riskLevel)
        return false;
      if (filters.category !== "all" && i.category !== filters.category)
        return false;
      if (
        filters.alignment !== "all" &&
        i.businessAlignment !== filters.alignment
      )
        return false;
      if (
        filters.priority !== "all" &&
        i.initialPriority !== filters.priority
      )
        return false;
      if (filters.effort !== "all" && i.initialEffort !== filters.effort)
        return false;
      if (filters.assigneeId !== "all") {
        if (filters.assigneeId === "unassigned") {
          if (i.assigneeId != null) return false;
        } else if (String(i.assigneeId ?? "") !== filters.assigneeId) {
          return false;
        }
      }
      return true;
    });

    if (sortKey !== "default") {
      const dir = sortKey === "due_asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const ad = a.anticipatedApprovalDate ?? "";
        const bd = b.anticipatedApprovalDate ?? "";
        // Empties always sink to the bottom regardless of direction.
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad < bd ? -1 * dir : ad > bd ? 1 * dir : 0;
      });
    }
    return list;
  }, [visibleInitiatives, search, filters, sortKey]);

  const grouped = useMemo(() => {
    const m = new Map<InitiativeStatus, Initiative[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const i of filtered)
      m.get(i.status as InitiativeStatus)?.push(i);
    return m;
  }, [filtered]);

  const selected =
    selectedId != null
      ? initiatives.find((i) => i.id === selectedId) ?? null
      : null;

  const clearAll = () => {
    setFilters(DEFAULT_INITIATIVE_FILTERS);
    setSortKey("default");
  };

  // Initiatives is hidden from end users in the sidebar; also block
  // direct navigation so the route can't be reached by URL either.
  if (sessionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!session || session.role === "end_user") {
    return <Redirect to="/" />;
  }

  return (
    <div
      className="p-6 space-y-6"
      data-testid="page-initiatives"
    >
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Lightbulb className="h-5 w-5" />
            </div>
            <h1
              className="flex items-center gap-1 text-2xl font-semibold tracking-tight m-0"
              data-testid="text-initiatives-title"
            >
              <span>Initiatives</span>
              <span className="text-muted-foreground font-normal mx-1.5">
                ·
              </span>

              {/* Static team-scope label — driven by the global selector */}
              <span
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 text-2xl font-semibold"
                data-testid="text-scope-label"
              >
                <Users className="h-4 w-4 opacity-60" />
                <span>{boardLabel}</span>
              </span>

              <ChevronRight className="h-4 w-4 opacity-50 mx-0.5" />

              {/* Saved-views picker */}
              <DropdownMenu
                open={viewsMenuOpen}
                onOpenChange={setViewsMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 text-2xl font-semibold"
                    data-testid="button-initiative-views"
                  >
                    <span>{viewLabel}</span>
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
                      setFilters(DEFAULT_INITIATIVE_FILTERS);
                      setSortKey("default");
                    }}
                    className="flex items-center justify-between"
                    data-testid="initiative-view-option-default"
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
                      data-testid={`initiative-menu-view-${v.id}`}
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
                    disabled={!filtersDirty && !activeView}
                    data-testid="initiative-menu-save-view"
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
                        data-testid="initiative-menu-toggle-default"
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
                        data-testid="initiative-menu-delete-view"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete this view
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap ml-1">
              {STATUS_ORDER.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className={`text-[11.5px] font-medium px-2 py-0.5 ${STATUS_CHIP_TONE[s]}`}
                  data-testid={`chip-count-${s}`}
                >
                  {grouped.get(s)?.length ?? 0} {STATUS_LABEL[s]}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {activeDept
              ? `Initiatives belonging to the ${activeDept.name} team. Approved initiatives become Projects.`
              : "Decide whether work should be done — no planning, no execution. Approved initiatives automatically become Projects in the Improvements section."}
          </p>
          <p
            className="text-[12px] text-muted-foreground"
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
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={scope.loading || scope.accessible.length === 0}
            data-testid="button-new-initiative"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New initiative
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              data-testid="button-initiatives-filters"
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
                data-testid="button-clear-initiative-filters"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-2.5">
              <FilterField label="Risk Level">
                <Select
                  value={filters.riskLevel}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, riskLevel: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-risk"
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
              </FilterField>
              <FilterField label="Category">
                <Select
                  value={filters.category}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, category: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-category"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Business Alignment">
                <Select
                  value={filters.alignment}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, alignment: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-alignment"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {ALIGNMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Priority">
                <Select
                  value={filters.priority}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, priority: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-priority"
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
              </FilterField>
              <FilterField label="Effort">
                <Select
                  value={filters.effort}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, effort: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-effort"
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
              </FilterField>
              <FilterField label="Assignee">
                <Select
                  value={filters.assigneeId}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, assigneeId: v }))
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-assignee"
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
              </FilterField>
              <FilterField label="Sort by Due Date">
                <Select
                  value={sortKey}
                  onValueChange={(v) =>
                    setSortKey(v as InitiativeSortKey)
                  }
                >
                  <SelectTrigger
                    className="h-8 text-[12px]"
                    data-testid="filter-initiative-sort"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default order</SelectItem>
                    <SelectItem value="due_asc">
                      Soonest first
                    </SelectItem>
                    <SelectItem value="due_desc">Latest first</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search initiatives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-initiative-search"
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
            data-testid="button-reset-initiative-filters"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-md border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="empty-state-initiatives"
        >
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
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-2 min-w-max">
            {STATUS_ORDER.map((status, idx) => (
              <Fragment key={status}>
                <Column
                  status={status}
                  items={grouped.get(status) ?? []}
                  onPick={setSelectedId}
                />
                {idx < STATUS_ORDER.length - 1 && (
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
        </div>
      )}

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        scope={scope}
        defaultPlanningYear={planningYear}
      />
      {selected && (
        <DetailDialog
          row={selected}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Save view dialog — wired to handleSaveView */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
            <DialogDescription>
              Saves your search, filters, and the current team scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="initiative-view-name">View name</Label>
              <Input
                id="initiative-view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Pending IT review"
                data-testid="input-initiative-view-name"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-initiative-save-default"
              />
              Make this my default view
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!saveName.trim() || createView.isPending}
              data-testid="button-confirm-save-initiative-view"
            >
              {createView.isPending ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterField({
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

// ---------- Column ----------

function Column({
  status,
  items,
  onPick,
}: {
  status: InitiativeStatus;
  items: Initiative[];
  onPick: (id: number) => void;
}) {
  const tone = STATUS_COLORS[status];
  return (
    <div
      className={`w-[280px] shrink-0 rounded-lg ring-1 ${tone.ring} bg-white flex flex-col`}
      data-testid={`column-${status}`}
    >
      <div
        className={`${tone.header} px-3 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide rounded-t-lg`}
      >
        <span>{STATUS_LABEL[status]}</span>
        <span data-testid={`count-${status}`}>{items.length}</span>
      </div>
      <div className="px-3 py-1 text-[11.5px] text-muted-foreground border-b border-zinc-100">
        {STATUS_HINT[status]}
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">
            Nothing here yet.
          </p>
        ) : (
          items.map((i) => (
            <InitiativeCard key={i.id} row={i} onPick={onPick} />
          ))
        )}
      </div>
    </div>
  );
}

function InitiativeCard({
  row,
  onPick,
}: {
  row: Initiative;
  onPick: (id: number) => void;
}) {
  const summary =
    row.problemOpportunity?.trim() ||
    row.description?.trim() ||
    "—";
  const overdue = isInitiativeLate(row);
  return (
    <button
      type="button"
      onClick={() => onPick(row.id)}
      className="w-full text-left rounded-md border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition p-3 space-y-2"
      data-testid={`card-initiative-${row.id}`}
    >
      <div className="text-[13.5px] font-medium leading-snug line-clamp-2">
        {row.title}
      </div>
      <div className="text-[12px] text-muted-foreground line-clamp-2">
        {summary}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Avatar className="h-5 w-5 text-[10px]">
          <AvatarFallback>{initials(row.reporterName)}</AvatarFallback>
        </Avatar>
        {row.departmentName && (
          <Badge
            variant="outline"
            className="text-[10.5px] py-0 h-5 font-normal"
          >
            {row.departmentName}
          </Badge>
        )}
        {overdue && (
          <Badge
            variant="outline"
            className="text-[10.5px] py-0 h-5 font-normal border-rose-300 text-rose-700 bg-rose-50"
            data-testid={`badge-late-${row.id}`}
            title={
              row.anticipatedApprovalDate
                ? `Past anticipated approval (${new Date(row.anticipatedApprovalDate).toLocaleDateString()})`
                : "Past anticipated approval"
            }
          >
            Late
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {ageLabel(row.createdAt)}
        </span>
      </div>
      {row.status === "approved" && row.createdProjectId && (
        <div className="text-[11.5px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Project P-{row.createdProjectId}
        </div>
      )}
      {row.status === "rejected_deferred" && (
        <div className="text-[11.5px] text-zinc-600 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Decision recorded
        </div>
      )}
    </button>
  );
}

// ---------- Create Dialog ----------

function CreateDialog({
  open,
  onOpenChange,
  scope,
  defaultPlanningYear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: TeamScope;
  defaultPlanningYear: number;
}) {
  const qc = useQueryClient();
  const create = useCreateInitiative({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
        toast.success("Initiative created in Backlog.");
        onOpenChange(false);
      },
      onError: (e: Error) => toast.error(e.message),
    },
  });

  // Available team options come from the global scope. When the user
  // has narrowed scope, the create form mirrors that narrowing so the
  // result is guaranteed to be visible afterwards.
  const teamOptions = useMemo(() => {
    if (scope.isAll) return scope.accessible;
    const set = new Set(scope.selectedIds);
    return scope.accessible.filter((d) => set.has(d.id));
  }, [scope.isAll, scope.accessible, scope.selectedIds]);

  const single = scope.single;
  const singleDept = single
    ? scope.accessible.find((d) => d.id === scope.singleId) ?? null
    : null;

  const [title, setTitle] = useState("");
  const [problemOpportunity, setProblemOpportunity] = useState("");
  const [expectedBenefit, setExpectedBenefit] = useState("");
  const [impactScope, setImpactScope] = useState("");
  // "none" → cross-team initiative (null departmentId). Allowed in
  // multi-team mode only — single-team mode pins to the active team.
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [additionalNotes, setAdditionalNotes] = useState("");
  // Defaults to the year currently selected in the page filter so the
  // newly-created initiative is immediately visible. User may override
  // within the rolling ±3 window — future-year creation is allowed.
  const [plannedStartYear, setPlannedStartYear] =
    useState<number>(defaultPlanningYear);

  // Reset on close, and re-seed the team selector whenever the dialog
  // (re)opens. In single-team mode we lock to that team; otherwise we
  // start unselected and require an explicit pick.
  useEffect(() => {
    if (!open) {
      setTitle("");
      setProblemOpportunity("");
      setExpectedBenefit("");
      setImpactScope("");
      setAdditionalNotes("");
    } else {
      // Re-seed planning year on each open so the dropdown reflects
      // the page filter's *current* value, not the value at mount.
      setPlannedStartYear(defaultPlanningYear);
    }
    if (single && scope.singleId != null) {
      setDepartmentId(String(scope.singleId));
    } else {
      setDepartmentId("");
    }
  }, [open, single, scope.singleId, defaultPlanningYear]);

  const teamValid = single
    ? scope.singleId != null
    : departmentId !== "" &&
      (departmentId === "none" ||
        teamOptions.some((d) => String(d.id) === departmentId));

  const canSubmit =
    title.trim().length > 0 &&
    problemOpportunity.trim().length > 0 &&
    expectedBenefit.trim().length > 0 &&
    impactScope.length > 0 &&
    teamValid;

  const submit = () => {
    if (!canSubmit) return;
    const resolvedDeptId = single
      ? scope.singleId
      : departmentId === "none"
        ? null
        : Number.parseInt(departmentId, 10);
    create.mutate({
      data: {
        title: title.trim(),
        problemOpportunity: problemOpportunity.trim(),
        expectedBenefit: expectedBenefit.trim(),
        impactScope,
        additionalNotes: additionalNotes.trim(),
        departmentId: resolvedDeptId,
        plannedStartYear,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New initiative</DialogTitle>
          <DialogDescription>
            Capture the idea. It will land in Backlog for triage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, descriptive name"
              data-testid="input-create-title"
            />
          </Field>
          <Field label="Problem / Opportunity" required>
            <Textarea
              rows={3}
              value={problemOpportunity}
              onChange={(e) => setProblemOpportunity(e.target.value)}
              placeholder="What problem are we solving or opportunity are we addressing?"
              data-testid="input-create-problem"
            />
          </Field>
          <Field label="Expected Benefit" required>
            <Textarea
              rows={2}
              value={expectedBenefit}
              onChange={(e) => setExpectedBenefit(e.target.value)}
              placeholder="What value could this create? Example: time savings, cost reduction, efficiency, risk reduction, compliance, or user experience."
              data-testid="input-create-benefit"
            />
          </Field>
          <Field label="Impact Scope" required>
            <Select value={impactScope} onValueChange={setImpactScope}>
              <SelectTrigger data-testid="select-create-scope">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {IMPACT_SCOPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {single ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-[12px] text-muted-foreground"
              data-testid="chip-create-owning-team"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Owning team: {singleDept?.name ?? "—"}</span>
            </div>
          ) : (
            <Field label="Team" required>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger data-testid="select-create-department">
                  <SelectValue placeholder="Choose a team…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific team / cross-team</SelectItem>
                  {teamOptions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Planning Year">
            <PlanningYearSelect
              value={plannedStartYear}
              onChange={setPlannedStartYear}
              testId="select-create-planning-year"
            />
          </Field>
          <Field label="Additional Notes">
            <Textarea
              rows={2}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              data-testid="input-create-notes"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || create.isPending}
            data-testid="button-submit-create"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Compact ±3-year selector reused inside create + detail dialogs.
// Lives in this file because it depends on the page-local select
// component imports; the data shape comes from the shared filter
// module.
function PlanningYearSelect({
  value,
  onChange,
  testId,
}: {
  value: number;
  onChange: (year: number) => void;
  testId?: string;
}) {
  const options = useMemo(() => planningYearOptions(), []);
  const now = currentPlanningYear();
  // If the persisted value is somehow outside the rolling window
  // (e.g. an old record from a prior year that aged out), include it
  // anyway so the user isn't forced into a silent change.
  const includesValue = options.some((o) => o.year === value);
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n)) onChange(n);
      }}
    >
      <SelectTrigger data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!includesValue && (
          <SelectItem value={String(value)}>{value} (out of range)</SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.year} value={String(o.year)}>
            {o.year}
            {o.year === now ? " (current)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Detail Dialog ----------

function DetailDialog({
  row,
  onClose,
}: {
  row: Initiative;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // Holds the most recent rendered `current` snapshot so the
  // mutation onSuccess (which fires for every save path, including
  // saveTriage / saveReview / decide / move-back / reopen, not just
  // saveAndClose) can promote the just-persisted values into
  // savedSnapshot. Without this, the dirty calculation flickers true
  // for the few hundred ms between mutation success and the row
  // refetch landing — long enough that an immediate close attempt
  // would falsely prompt "Unsaved changes."
  const currentRef = useRef<typeof baseline | null>(null);
  const update = useUpdateInitiative({
    mutation: {
      onSuccess: () => {
        if (currentRef.current) setSavedSnapshot(currentRef.current);
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
        qc.invalidateQueries({
          queryKey: getGetInitiativeQueryKey(row.id),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    },
  });

  // ---- Local form state (so we can stage edits) ----
  // Backlog
  const [category, setCategory] = useState(row.category);
  const [initialPriority, setInitialPriority] = useState(row.initialPriority);
  const [initialEffort, setInitialEffort] = useState(row.initialEffort);
  const [businessAlignment, setBusinessAlignment] = useState(
    row.businessAlignment,
  );
  const [investigationDecision, setInvestigationDecision] = useState(
    row.investigationDecision,
  );
  const [backlogNotes, setBacklogNotes] = useState(row.backlogNotes);
  // Backlog accountability dates. Saved with every Backlog edit and
  // surfaced as a "Late" badge once anticipatedApprovalDate < today
  // and the initiative still hasn't reached a terminal lane.
  const [reviewStartDate, setReviewStartDate] = useState<string>(
    row.reviewStartDate ?? "",
  );
  const [anticipatedApprovalDate, setAnticipatedApprovalDate] = useState<string>(
    row.anticipatedApprovalDate ?? "",
  );
  // Under review (with legacy fallbacks for first edit)
  const [benefits, setBenefits] = useState(row.benefits);
  const [tradeoffs, setTradeoffs] = useState(row.tradeoffs || row.prosCons);
  const [businessValueLevel, setBusinessValueLevel] = useState(
    row.businessValueLevel,
  );
  const [businessValueSummary, setBusinessValueSummary] = useState(
    row.businessValueSummary || row.expectedBenefit,
  );
  const [costLevel, setCostLevel] = useState(row.costLevel);
  const [estimatedCost, setEstimatedCost] = useState(
    row.estimatedCost || row.roughCost,
  );
  const [riskLevel, setRiskLevel] = useState(row.riskLevel);
  const [riskNotes, setRiskNotes] = useState(row.riskNotes);
  const [validationStatus, setValidationStatus] = useState(
    row.validationStatus,
  );
  const [impactedTeams, setImpactedTeams] = useState(row.impactedTeams);
  // Planning year — surfaced as a compact inline editor in the
  // triage section. Server enforces the ±3 range; the dropdown
  // restricts the user to the same window.
  const [plannedStartYear, setPlannedStartYear] = useState<number>(
    row.plannedStartYear,
  );
  // Final decision
  const [finalDecision, setFinalDecision] = useState(row.finalDecision);
  const [decisionReason, setDecisionReason] = useState(row.decisionReason);
  const [revisitDate, setRevisitDate] = useState<string>(
    row.revisitDate ?? "",
  );
  // Reopen / move-back reason
  const [transitionReason, setTransitionReason] = useState("");
  // Open state of the "Move back to Backlog" confirmation dialog,
  // launched by the "Move back to Backlog" footer button shown while
  // the initiative is Under Review.
  const [moveBackOpen, setMoveBackOpen] = useState(false);
  // Active lifecycle tab. Defaults to the initiative's current phase
  // (backlog → "backlog", under_review → "under_review",
  // approved/rejected_deferred → "decision") so opening a card always
  // lands the user on the relevant content. Resets if the user opens a
  // different initiative.
  const [activeTab, setActiveTab] = useState<InitiativePhaseTab>(() =>
    defaultTabForStatus(row.status as InitiativeStatus),
  );
  useEffect(() => {
    setActiveTab(defaultTabForStatus(row.status as InitiativeStatus));
  }, [row.id, row.status]);

  // Sync when picking a different row.
  useEffect(() => {
    setCategory(row.category);
    setInitialPriority(row.initialPriority);
    setInitialEffort(row.initialEffort);
    setBusinessAlignment(row.businessAlignment);
    setInvestigationDecision(row.investigationDecision);
    setBacklogNotes(row.backlogNotes);
    setReviewStartDate(row.reviewStartDate ?? "");
    setAnticipatedApprovalDate(row.anticipatedApprovalDate ?? "");
    setBenefits(row.benefits);
    setTradeoffs(row.tradeoffs || row.prosCons);
    setBusinessValueLevel(row.businessValueLevel);
    setBusinessValueSummary(
      row.businessValueSummary || row.expectedBenefit,
    );
    setCostLevel(row.costLevel);
    setEstimatedCost(row.estimatedCost || row.roughCost);
    setRiskLevel(row.riskLevel);
    setRiskNotes(row.riskNotes);
    setValidationStatus(row.validationStatus);
    setImpactedTeams(row.impactedTeams);
    setPlannedStartYear(row.plannedStartYear);
    setFinalDecision(row.finalDecision);
    setDecisionReason(row.decisionReason);
    setRevisitDate(row.revisitDate ?? "");
    setTransitionReason("");
  }, [row.id, row]);

  const status = row.status as InitiativeStatus;
  const tone = STATUS_COLORS[status];

  // ---- Field-only patch (no status change) ----
  const fieldPatch = () => ({
    category,
    initialPriority,
    initialEffort,
    businessAlignment,
    investigationDecision,
    backlogNotes,
    reviewStartDate: reviewStartDate || null,
    anticipatedApprovalDate: anticipatedApprovalDate || null,
    benefits,
    tradeoffs,
    businessValueLevel,
    businessValueSummary,
    costLevel,
    estimatedCost,
    riskLevel,
    riskNotes,
    validationStatus,
    impactedTeams,
    plannedStartYear,
  });

  // ---- Unsaved-changes protection -----------------------------------
  // We snapshot the row's current values into the same shape as the
  // local form state and compare on every render. Any divergence —
  // a field edit, description change, decision-rationale typing, or
  // checklist tick — flips `isDirty` to true and arms the close
  // interceptor below. Identical to the reset performed in the
  // useEffect on row change, so a freshly-loaded dialog reads as
  // clean and a freshly-saved dialog returns to clean once the row
  // refetch lands.
  const baseline = useMemo(
    () => ({
      category: row.category,
      initialPriority: row.initialPriority,
      initialEffort: row.initialEffort,
      businessAlignment: row.businessAlignment,
      investigationDecision: row.investigationDecision,
      backlogNotes: row.backlogNotes,
      reviewStartDate: row.reviewStartDate ?? "",
      anticipatedApprovalDate: row.anticipatedApprovalDate ?? "",
      benefits: row.benefits,
      tradeoffs: row.tradeoffs || row.prosCons,
      businessValueLevel: row.businessValueLevel,
      businessValueSummary: row.businessValueSummary || row.expectedBenefit,
      costLevel: row.costLevel,
      estimatedCost: row.estimatedCost || row.roughCost,
      riskLevel: row.riskLevel,
      riskNotes: row.riskNotes,
      validationStatus: row.validationStatus,
      impactedTeams: row.impactedTeams,
      plannedStartYear: row.plannedStartYear,
      finalDecision: row.finalDecision,
      decisionReason: row.decisionReason,
      revisitDate: row.revisitDate ?? "",
      // Transition rationale is reset to "" on every row change in
      // the form-state useEffect above. Including it here means a
      // typed-but-unsubmitted "Move back / Reopen" reason also
      // counts as dirty and prompts before discarding.
      transitionReason: "",
    }),
    [row],
  );
  const current = {
    category,
    initialPriority,
    initialEffort,
    businessAlignment,
    investigationDecision,
    backlogNotes,
    reviewStartDate,
    anticipatedApprovalDate,
    benefits,
    tradeoffs,
    businessValueLevel,
    businessValueSummary,
    costLevel,
    estimatedCost,
    riskLevel,
    riskNotes,
    validationStatus,
    impactedTeams,
    plannedStartYear,
    finalDecision,
    decisionReason,
    revisitDate,
    transitionReason,
  };
  // Compare against either the row baseline OR the values we most
  // recently persisted. The "saved" comparison closes the post-save
  // race window: after a successful PATCH the server invalidation
  // triggers a refetch, but until that refetch lands the row prop
  // still holds stale values — without this we would briefly report
  // dirty=true and prompt the user even though they just saved.
  const [savedSnapshot, setSavedSnapshot] =
    useState<typeof baseline | null>(null);
  useEffect(() => {
    setSavedSnapshot(null);
  }, [row.id]);
  const dirtyVsBaseline = useIsDirty(current, baseline);
  const dirtyVsSaved = useIsDirty(current, savedSnapshot ?? baseline);
  const isDirty = dirtyVsBaseline && dirtyVsSaved;
  useBeforeUnloadGuard(isDirty);
  // Keep the ref synced every render so the shared mutation
  // onSuccess (declared above) can read the freshest snapshot.
  currentRef.current = current;
  // Open state of the "You have unsaved changes" prompt that
  // intercepts close vectors (Esc, overlay click, X button, footer
  // Close button) when there are staged edits.
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);
  const [savingAndClosing, setSavingAndClosing] = useState(false);

  // Single entry point for "the user wants out". Honors dirty state
  // and routes to the prompt instead of dropping edits silently.
  const requestClose = () => {
    if (isDirty) setUnsavedPromptOpen(true);
    else onClose();
  };

  // "Save & Close" persists the staged edits *without* changing
  // status (so it never accidentally promotes the initiative to a
  // new lane), then closes the editor. Status transitions remain
  // gated behind their dedicated buttons.
  const saveAndClose = async () => {
    setSavingAndClosing(true);
    try {
      await update.mutateAsync({
        id: row.id,
        data: {
          ...fieldPatch(),
          finalDecision,
          decisionReason,
          revisitDate: revisitDate || null,
        },
      });
      // Commit the post-save snapshot before closing so dirty
      // collapses to false immediately even though the row refetch
      // hasn't landed yet.
      setSavedSnapshot(current);
      toast.success("Changes saved.");
      setUnsavedPromptOpen(false);
      onClose();
    } catch {
      // Toast is already raised by the mutation's onError handler.
      // Leave the prompt open so the user can retry or discard.
    } finally {
      setSavingAndClosing(false);
    }
  };

  const saveTriage = () => {
    update.mutate(
      { id: row.id, data: fieldPatch() },
      {
        onSuccess: () => toast.success("Backlog triage saved."),
      },
    );
  };

  const saveReview = () => {
    update.mutate(
      { id: row.id, data: fieldPatch() },
      {
        onSuccess: () => toast.success("Review saved."),
      },
    );
  };

  const moveToUnderReview = () => {
    if (investigationDecision !== "investigate_further") {
      toast.error('Set Investigation Decision to "Investigate Further".');
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: { ...fieldPatch(), status: "under_review" },
      },
      { onSuccess: () => toast.success("Moved to Under Review.") },
    );
  };

  const closeFromBacklog = () => {
    if (investigationDecision !== "do_not_investigate") {
      toast.error('Set Investigation Decision to "Do Not Investigate".');
      return;
    }
    if (backlogNotes.trim().length === 0) {
      toast.error("Add Backlog Notes explaining why we shouldn't pursue.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: { ...fieldPatch(), status: "rejected_deferred" },
      },
      { onSuccess: () => toast.success("Closed — decision recorded.") },
    );
  };

  const moveBackToBacklog = (onAfterSuccess?: () => void) => {
    if (transitionReason.trim().length === 0) {
      toast.error("Reason is required to move back to Backlog.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: {
          ...fieldPatch(),
          status: "backlog",
          transitionReason: transitionReason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Moved back to Backlog.");
          setTransitionReason("");
          onAfterSuccess?.();
        },
      },
    );
  };

  const decide = (decision: "approve" | "defer" | "reject") => {
    if (decisionReason.trim().length === 0) {
      toast.error("Decision Rationale is required.");
      return;
    }
    const newStatus: InitiativeStatus =
      decision === "approve" ? "approved" : "rejected_deferred";
    update.mutate(
      {
        id: row.id,
        data: {
          ...fieldPatch(),
          status: newStatus,
          decisionReason: decisionReason.trim(),
          finalDecision: decision,
          revisitDate:
            decision === "defer" && revisitDate ? revisitDate : null,
        },
      },
      {
        onSuccess: () => {
          if (decision === "approve")
            toast.success("Approved — Project created.");
          else if (decision === "defer") toast.success("Deferred.");
          else toast.success("Rejected.");
        },
      },
    );
  };

  const reopen = (target: InitiativeStatus) => {
    if (transitionReason.trim().length === 0) {
      toast.error("Reason is required to reopen.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: {
          status: target,
          transitionReason: transitionReason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Reopened to ${STATUS_LABEL[target]}.`);
          setTransitionReason("");
        },
      },
    );
  };

  return (
    <>
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-initiative-detail"
      >
        <DialogHeader>
          <div className="space-y-3">
            <DialogTitle className="text-xl pr-8">{row.title}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge
                variant="outline"
                className={tone.pill}
                data-testid="badge-current-status"
              >
                {STATUS_LABEL[status]}
              </Badge>
              {row.departmentName && (
                <Badge variant="outline" className="font-normal">
                  <Building2 className="h-3 w-3 mr-1" />
                  {row.departmentName}
                </Badge>
              )}
              <span className="text-muted-foreground">
                Created by {row.reporterName ?? "Unknown"}
              </span>
              <span className="text-muted-foreground">
                · {new Date(row.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Lifecycle phase tabs — clickable progression strip below the
            title. Mirrors the Risks dialog: tabs left of the current
            phase are emerald (completed), the current phase is amber,
            and tabs to the right are grey/default. The third tab covers
            both Approved and Rejected/Deferred since they share the
            same content surface; its label adapts to the actual outcome.
            The "Move back to Backlog" affordance that used to live on
            the Backlog stage chip is exposed via a button inside the
            Backlog tab footer area when the initiative is Under Review. */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as InitiativePhaseTab)}
          className="flex-1 flex flex-col"
        >
          <TabsList className="self-start" data-testid="phase-tablist">
            <TabsTrigger
              value="backlog"
              data-testid="tab-backlog"
              className={cn(phaseTabClass(status, "backlog"))}
            >
              Backlog
            </TabsTrigger>
            <TabsTrigger
              value="under_review"
              data-testid="tab-under-review"
              className={cn(phaseTabClass(status, "under_review"))}
            >
              Under Review
            </TabsTrigger>
            <TabsTrigger
              value="decision"
              data-testid="tab-decision"
              className={cn(phaseTabClass(status, "decision"))}
            >
              {status === "rejected_deferred"
                ? row.finalDecision === "defer"
                  ? "Deferred"
                  : "Rejected"
                : status === "approved"
                  ? "Approved"
                  : "Decision"}
            </TabsTrigger>
          </TabsList>

          {/* ---------- Backlog tab ---------- */}
          {/* `forceMount` keeps inactive tab content in the DOM (just
              visually hidden via data-[state=inactive]:hidden). This
              mirrors the Risks dialog and prevents in-progress form
              state — Intake fields, Backlog Triage drafts — from being
              lost when the user clicks a different tab and back. */}
          <TabsContent
            value="backlog"
            forceMount
            className="space-y-4 pt-2 mt-0 data-[state=inactive]:hidden"
            data-testid="tabpanel-backlog"
          >
            {/* Intake summary — read-only reference data captured at
                creation time. Lives under Backlog because that's the
                phase the user fills it in. */}
            <Section
              title="Intake"
            defaultOpen
            tone={status === "backlog" ? "default" : "done"}
          >
            <ReadField
              label="Problem / Opportunity"
              value={row.problemOpportunity || row.description}
            />
            <div className="grid grid-cols-2 gap-3">
              <ReadField
                label="Expected Benefit"
                value={
                  row.businessValueSummary ||
                  row.expectedBenefit ||
                  "—"
                }
              />
              <ReadField
                label="Impact Scope"
                value={fmtOption(row.impactScope, IMPACT_SCOPE_OPTIONS)}
              />
            </div>
            {row.additionalNotes && (
              <ReadField
                label="Additional Notes"
                value={row.additionalNotes}
              />
            )}
          </Section>

          {/* Backlog Triage */}
          <Section
            title="Backlog Triage"
            defaultOpen={status === "backlog"}
            tone={
              status === "backlog"
                ? "active"
                : status === "under_review" ||
                    status === "approved" ||
                    status === "rejected_deferred"
                  ? "done"
                  : "default"
            }
            badge={
              row.backlogReviewedAt ? (
                <Badge
                  variant="outline"
                  className="text-[10.5px] font-normal"
                >
                  Reviewed by {row.backlogReviewedByName ?? "Unknown"} ·{" "}
                  {new Date(row.backlogReviewedAt).toLocaleDateString()}
                </Badge>
              ) : null
            }
          >
            {status === "backlog" ? (
              <BacklogTriageEditor
                category={category}
                setCategory={setCategory}
                initialPriority={initialPriority}
                setInitialPriority={setInitialPriority}
                initialEffort={initialEffort}
                setInitialEffort={setInitialEffort}
                businessAlignment={businessAlignment}
                setBusinessAlignment={setBusinessAlignment}
                investigationDecision={investigationDecision}
                setInvestigationDecision={setInvestigationDecision}
                backlogNotes={backlogNotes}
                setBacklogNotes={setBacklogNotes}
                reviewStartDate={reviewStartDate}
                setReviewStartDate={setReviewStartDate}
                anticipatedApprovalDate={anticipatedApprovalDate}
                setAnticipatedApprovalDate={setAnticipatedApprovalDate}
                plannedStartYear={plannedStartYear}
                setPlannedStartYear={setPlannedStartYear}
              />
            ) : (
              <BacklogTriageView
                row={row}
                plannedStartYear={plannedStartYear}
                setPlannedStartYear={setPlannedStartYear}
              />
            )}
          </Section>
          </TabsContent>

          {/* ---------- Under Review tab ---------- */}
          <TabsContent
            value="under_review"
            forceMount
            className="space-y-4 pt-2 mt-0 data-[state=inactive]:hidden"
            data-testid="tabpanel-under-review"
          >
          {/* Under Review analysis */}
          <Section
            title="Under Review — Analysis"
            defaultOpen={status === "under_review"}
            tone={
              status === "under_review"
                ? "active"
                : status === "approved" || status === "rejected_deferred"
                  ? "done"
                  : "default"
            }
          >
            {status === "under_review" ? (
              <UnderReviewEditor
                benefits={benefits}
                setBenefits={setBenefits}
                tradeoffs={tradeoffs}
                setTradeoffs={setTradeoffs}
                businessValueLevel={businessValueLevel}
                setBusinessValueLevel={setBusinessValueLevel}
                businessValueSummary={businessValueSummary}
                setBusinessValueSummary={setBusinessValueSummary}
                costLevel={costLevel}
                setCostLevel={setCostLevel}
                estimatedCost={estimatedCost}
                setEstimatedCost={setEstimatedCost}
                riskLevel={riskLevel}
                setRiskLevel={setRiskLevel}
                riskNotes={riskNotes}
                setRiskNotes={setRiskNotes}
                validationStatus={validationStatus}
                setValidationStatus={setValidationStatus}
                impactedTeams={impactedTeams}
                setImpactedTeams={setImpactedTeams}
              />
            ) : (
              <UnderReviewView row={row} />
            )}
          </Section>

          {/* Approval workflow runs (Initiatives module) */}
          {(status === "under_review" ||
            status === "approved" ||
            status === "rejected_deferred") && (
            <Section
              title="Approval Workflow"
              defaultOpen={
                status === "under_review" &&
                ((row.workflowRuns ?? []).length > 0)
              }
              tone={status === "under_review" ? "active" : "done"}
              badge={
                (row.workflowRuns ?? []).length > 0 ? (
                  <Badge
                    variant="outline"
                    className="text-[10.5px] font-normal"
                  >
                    {(row.workflowRuns ?? []).length}{" "}
                    {(row.workflowRuns ?? []).length === 1
                      ? "run"
                      : "runs"}
                  </Badge>
                ) : null
              }
            >
              <InitiativeWorkflowApproval row={row} />
            </Section>
          )}
          </TabsContent>

          {/* ---------- Decision tab (Approved / Rejected-Deferred) ---------- */}
          <TabsContent
            value="decision"
            forceMount
            className="space-y-4 pt-2 mt-0 data-[state=inactive]:hidden"
            data-testid="tabpanel-decision"
          >
          {/* Final decision (only meaningful in Under Review or post-decision) */}
          {(status === "under_review" ||
            status === "approved" ||
            status === "rejected_deferred") && (
            <Section
              title="Final Decision"
              defaultOpen={status === "under_review"}
              tone={status === "under_review" ? "active" : "done"}
            >
              {status === "under_review" ? (
                <FinalDecisionEditor
                  decisionReason={decisionReason}
                  setDecisionReason={setDecisionReason}
                  revisitDate={revisitDate}
                  setRevisitDate={setRevisitDate}
                  finalDecision={finalDecision}
                  setFinalDecision={setFinalDecision}
                />
              ) : (
                <FinalDecisionView row={row} />
              )}
            </Section>
          )}

          {/* Approved → project link */}
          {status === "approved" && (
            <div
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 flex items-start gap-2"
              data-testid="banner-approved"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-medium text-emerald-900">
                  {row.createdProjectId
                    ? `Approved → Project P-${row.createdProjectId}`
                    : "Approved"}
                </p>
                <p className="text-[11.5px] text-emerald-800 mt-0.5">
                  Decided{" "}
                  {row.decidedAt
                    ? new Date(row.decidedAt).toLocaleString()
                    : ""}
                  {row.decidedByName ? ` by ${row.decidedByName}` : ""}.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300"
                  onClick={async () => {
                    try {
                      await downloadInitiativeReport(row);
                      toast.success("Initiative report downloaded");
                    } catch (e) {
                      toast.error("Could not generate PDF", {
                        description: (e as Error).message,
                      });
                    }
                  }}
                  data-testid="button-export-initiative-pdf"
                >
                  <FileDown className="h-3.5 w-3.5 mr-1" />
                  Export PDF
                </Button>
                {row.createdProjectId && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-emerald-300"
                  >
                    <Link href={`/projects`} data-testid="link-view-project">
                      View Project
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
          {status === "rejected_deferred" && (
            <div
              className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-3 space-y-1"
              data-testid="banner-rejected"
            >
              <p className="text-[13px] font-medium text-zinc-800">
                {row.finalDecision === "defer"
                  ? "Deferred"
                  : "Rejected / Closed"}
              </p>
              <p className="text-[11.5px] text-zinc-600">
                Decided{" "}
                {row.decidedAt
                  ? new Date(row.decidedAt).toLocaleString()
                  : ""}
                {row.decidedByName ? ` by ${row.decidedByName}` : ""}.
              </p>
              {row.revisitDate && (
                <p className="text-[11.5px] text-zinc-600">
                  Revisit on{" "}
                  {new Date(row.revisitDate).toLocaleDateString()}.
                </p>
              )}
            </div>
          )}

          {/* Reopen reason input — only for terminal lanes. The
              "Move back to Backlog" flow for Under Review is exposed
              via a footer button (visible while status === "under_review")
              that opens the confirm dialog at the bottom of this
              component. */}
          {(status === "approved" ||
            status === "rejected_deferred") && (
            <Section title="Reopen" defaultOpen={false}>
              <Field label="Why are we reopening this?">
                <Textarea
                  rows={2}
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  data-testid="input-transition-reason"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {status === "approved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reopen("under_review")}
                    disabled={update.isPending}
                    data-testid="button-reopen-under-review"
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Reopen to Under Review
                  </Button>
                )}
                {status === "rejected_deferred" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopen("backlog")}
                      disabled={update.isPending}
                      data-testid="button-reopen-backlog"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Reopen to Backlog
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopen("under_review")}
                      disabled={update.isPending}
                      data-testid="button-reopen-under-review"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Reopen to Under Review
                    </Button>
                  </>
                )}
              </div>
            </Section>
          )}
          </TabsContent>
        </Tabs>

        {/* Audit / history — global, mirrors the Risks dialog where the
            history tab sits outside any phase. We render it as a Section
            below the tab strip so it's always reachable regardless of
            which phase tab is active. */}
        <Section
          title="Previous Review History"
          defaultOpen={false}
          badge={
            row.auditEvents && row.auditEvents.length > 0 ? (
              <Badge
                variant="outline"
                className="text-[10.5px] font-normal"
              >
                {row.auditEvents.length}{" "}
                {row.auditEvents.length === 1 ? "event" : "events"}
              </Badge>
            ) : null
          }
        >
          <AuditTimeline events={row.auditEvents ?? []} />
        </Section>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button variant="ghost" onClick={requestClose}>
            Close
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {status === "backlog" && (
              <>
                <Button
                  variant="outline"
                  onClick={saveTriage}
                  disabled={update.isPending}
                  data-testid="button-save-triage"
                >
                  Save Triage
                </Button>
                <Button
                  variant="outline"
                  onClick={closeFromBacklog}
                  disabled={update.isPending}
                  data-testid="button-close-not-pursue"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Close / Do Not Pursue
                </Button>
                <Button
                  onClick={moveToUnderReview}
                  disabled={update.isPending}
                  data-testid="button-move-to-review"
                >
                  Move to Under Review
                </Button>
              </>
            )}
            {status === "under_review" && (
              <>
                {/* Move back to Backlog — replaces the formerly-clickable
                    Backlog chip in PhaseProgress. Same flow: opens the
                    confirmation dialog with a transition reason field. */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTransitionReason("");
                    setMoveBackOpen(true);
                  }}
                  disabled={update.isPending}
                  data-testid="button-move-back-to-backlog"
                >
                  <Undo2 className="h-4 w-4 mr-1.5" />
                  Move back to Backlog
                </Button>
                <Button
                  variant="outline"
                  onClick={saveReview}
                  disabled={update.isPending}
                  data-testid="button-save-review"
                >
                  Save Review
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide("reject")}
                  disabled={update.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide("defer")}
                  disabled={update.isPending}
                  data-testid="button-defer"
                >
                  <PauseCircle className="h-4 w-4 mr-1.5" />
                  Defer
                </Button>
                <Button
                  onClick={() => decide("approve")}
                  disabled={update.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Approve &amp; Create Project
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmation dialog launched by the "Move back to Backlog"
        footer button while an initiative is Under Review. Captures the
        rationale before invoking the existing moveBackToBacklog
        mutation. */}
    <Dialog
      open={moveBackOpen}
      onOpenChange={(o) => {
        if (!o) {
          // Dismiss (Esc / overlay click) acts like Cancel: clear the
          // rationale draft so it doesn't leak into the Reopen flow if
          // the initiative later transitions to a terminal state.
          setTransitionReason("");
          setMoveBackOpen(false);
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        data-testid="dialog-move-back-confirm"
      >
        <DialogHeader>
          <DialogTitle>Move back to Backlog</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Field label="Why are you taking this initiative back?">
            <Textarea
              rows={3}
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              placeholder="e.g. Needs more discovery before review."
              data-testid="input-move-back-reason"
              autoFocus
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTransitionReason("");
              setMoveBackOpen(false);
            }}
            data-testid="button-move-back-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              // Only close after the mutation actually succeeds; if
              // validation fails (empty reason) or the request errors
              // we keep the dialog open so the user can correct it.
              moveBackToBacklog(() => setMoveBackOpen(false));
            }}
            disabled={update.isPending}
            data-testid="button-move-back-confirm"
          >
            <Undo2 className="h-4 w-4 mr-1.5" />
            Move back to Backlog
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Unsaved-changes prompt — armed by `requestClose()` whenever the
        user tries to exit the editor while local edits diverge from
        the row. */}
    <UnsavedChangesDialog
      open={unsavedPromptOpen}
      isSaving={savingAndClosing}
      onCancel={() => setUnsavedPromptOpen(false)}
      onSave={saveAndClose}
      onDiscard={() => {
        setUnsavedPromptOpen(false);
        onClose();
      }}
    />
    </>
  );
}

// ---------- Section / Field primitives ----------

function Section({
  title,
  badge,
  defaultOpen,
  tone = "default",
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  // active = the phase the user needs to fill in right now
  // done   = data already entered in a previous phase (muted, read-only)
  // default = neutral
  tone?: "active" | "done" | "default";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const wrapClass =
    tone === "active"
      ? "rounded-md border-2 border-amber-300 bg-amber-50/60 ring-1 ring-amber-200/60 shadow-sm"
      : tone === "done"
        ? "rounded-md border border-zinc-200 bg-zinc-50"
        : "rounded-md border border-zinc-200 bg-white";
  const titleClass =
    tone === "active"
      ? "flex items-center gap-2 text-[13px] font-semibold text-amber-900"
      : tone === "done"
        ? "flex items-center gap-2 text-[13px] font-medium text-zinc-500"
        : "flex items-center gap-2 text-[13px] font-medium text-zinc-800";
  const chevronClass =
    tone === "done" ? "h-4 w-4 text-zinc-400 transition" : "h-4 w-4 text-zinc-500 transition";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={wrapClass}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <div className={titleClass}>
              {tone === "active" && (
                <span
                  className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5"
                  data-testid="section-active-pill"
                >
                  Current step
                </span>
              )}
              {tone === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
              )}
              {title}
              {badge}
            </div>
            <ChevronDown
              className={`${chevronClass} ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div
            className={
              tone === "done"
                ? "p-3 space-y-3 text-zinc-500 [&_*]:text-inherit"
                : "p-3 space-y-3"
            }
          >
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-zinc-700">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-[13px] text-zinc-800 whitespace-pre-wrap">
        {value && value.trim() ? value : "—"}
      </div>
    </div>
  );
}

function LevelBadge({ value }: { value: string }) {
  if (!value) return <span className="text-zinc-400 text-[12px]">—</span>;
  return (
    <Badge variant="outline" className={`${levelTone(value)} font-normal`}>
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </Badge>
  );
}

// ---------- Sub-editors ----------

function BacklogTriageEditor(props: {
  category: string;
  setCategory: (v: string) => void;
  initialPriority: string;
  setInitialPriority: (v: string) => void;
  initialEffort: string;
  setInitialEffort: (v: string) => void;
  businessAlignment: string;
  setBusinessAlignment: (v: string) => void;
  investigationDecision: string;
  setInvestigationDecision: (v: string) => void;
  backlogNotes: string;
  setBacklogNotes: (v: string) => void;
  reviewStartDate: string;
  setReviewStartDate: (v: string) => void;
  anticipatedApprovalDate: string;
  setAnticipatedApprovalDate: (v: string) => void;
  plannedStartYear: number;
  setPlannedStartYear: (v: number) => void;
}) {
  // Inline validation hint: anticipated approval should be on or after
  // the review start date. Doesn't block save (the dates can be filled
  // in any order during triage), just warns the reviewer.
  const dateOrderInvalid =
    !!props.reviewStartDate &&
    !!props.anticipatedApprovalDate &&
    props.anticipatedApprovalDate < props.reviewStartDate;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={props.category} onValueChange={props.setCategory}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Business Alignment">
          <Select
            value={props.businessAlignment}
            onValueChange={props.setBusinessAlignment}
          >
            <SelectTrigger data-testid="select-alignment">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {ALIGNMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Initial Priority">
          <Select
            value={props.initialPriority}
            onValueChange={props.setInitialPriority}
          >
            <SelectTrigger data-testid="select-initial-priority">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Initial Effort">
          <Select
            value={props.initialEffort}
            onValueChange={props.setInitialEffort}
          >
            <SelectTrigger data-testid="select-initial-effort">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Investigation Decision">
        <Select
          value={props.investigationDecision}
          onValueChange={props.setInvestigationDecision}
        >
          <SelectTrigger data-testid="select-investigation-decision">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {INVESTIGATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Start Review Date">
          <Input
            type="date"
            value={props.reviewStartDate}
            onChange={(e) => props.setReviewStartDate(e.target.value)}
            data-testid="input-review-start-date"
          />
        </Field>
        <Field label="Anticipated Approval Date">
          <Input
            type="date"
            value={props.anticipatedApprovalDate}
            onChange={(e) => props.setAnticipatedApprovalDate(e.target.value)}
            data-testid="input-anticipated-approval-date"
          />
        </Field>
        <Field label="Planning Year">
          <PlanningYearSelect
            value={props.plannedStartYear}
            onChange={props.setPlannedStartYear}
            testId="select-detail-planning-year"
          />
        </Field>
      </div>
      {dateOrderInvalid && (
        <p className="text-[11.5px] text-amber-700">
          Anticipated approval is before the review start date — consider
          adjusting one of the two.
        </p>
      )}
      <Field label="Backlog Notes">
        <Textarea
          rows={2}
          value={props.backlogNotes}
          onChange={(e) => props.setBacklogNotes(e.target.value)}
          placeholder="Why should this move forward for deeper review, or why should it stop here?"
          data-testid="input-backlog-notes"
        />
      </Field>
    </>
  );
}

function BacklogTriageView({
  row,
  plannedStartYear,
  setPlannedStartYear,
}: {
  row: Initiative;
  plannedStartYear: number;
  setPlannedStartYear: (v: number) => void;
}) {
  const overdue = isInitiativeLate(row);
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <ReadField
        label="Category"
        value={fmtOption(row.category, CATEGORY_OPTIONS)}
      />
      <ReadField
        label="Business Alignment"
        value={fmtOption(row.businessAlignment, ALIGNMENT_OPTIONS)}
      />
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Initial Priority
        </div>
        <LevelBadge value={row.initialPriority} />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Initial Effort
        </div>
        <LevelBadge value={row.initialEffort} />
      </div>
      <ReadField
        label="Investigation Decision"
        value={fmtOption(row.investigationDecision, INVESTIGATION_OPTIONS)}
      />
      <div />
      <ReadField
        label="Start Review Date"
        value={
          row.reviewStartDate
            ? new Date(row.reviewStartDate).toLocaleDateString()
            : "—"
        }
      />
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Anticipated Approval Date
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <span>
            {row.anticipatedApprovalDate
              ? new Date(row.anticipatedApprovalDate).toLocaleDateString()
              : "—"}
          </span>
          {overdue && (
            <Badge
              variant="outline"
              className="text-[10.5px] py-0 h-5 font-normal border-rose-300 text-rose-700 bg-rose-50"
              data-testid="badge-late"
            >
              Late
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">
          Planning Year
        </Label>
        <PlanningYearSelect
          value={plannedStartYear}
          onChange={setPlannedStartYear}
          testId="select-detail-planning-year-readview"
        />
      </div>
      <div />
      <div className="col-span-2">
        <ReadField label="Backlog Notes" value={row.backlogNotes} />
      </div>
    </div>
  );
}

// Initiative is "late" when an anticipated approval date was set, that
// date is in the past, and the initiative hasn't reached a terminal
// lane yet (still in backlog or under_review).
function isInitiativeLate(row: Initiative): boolean {
  if (!row.anticipatedApprovalDate) return false;
  if (row.status !== "backlog" && row.status !== "under_review") return false;
  const today = new Date().toISOString().slice(0, 10);
  return row.anticipatedApprovalDate < today;
}

function UnderReviewEditor(props: {
  benefits: string;
  setBenefits: (v: string) => void;
  tradeoffs: string;
  setTradeoffs: (v: string) => void;
  businessValueLevel: string;
  setBusinessValueLevel: (v: string) => void;
  businessValueSummary: string;
  setBusinessValueSummary: (v: string) => void;
  costLevel: string;
  setCostLevel: (v: string) => void;
  estimatedCost: string;
  setEstimatedCost: (v: string) => void;
  riskLevel: string;
  setRiskLevel: (v: string) => void;
  riskNotes: string;
  setRiskNotes: (v: string) => void;
  validationStatus: string;
  setValidationStatus: (v: string) => void;
  impactedTeams: string;
  setImpactedTeams: (v: string) => void;
}) {
  return (
    <>
      <Field label="Benefits">
        <Textarea
          rows={3}
          value={props.benefits}
          onChange={(e) => props.setBenefits(e.target.value)}
          placeholder="What are the key advantages or expected outcomes?"
          data-testid="input-benefits"
        />
      </Field>
      <Field label="Tradeoffs / Considerations">
        <Textarea
          rows={3}
          value={props.tradeoffs}
          onChange={(e) => props.setTradeoffs(e.target.value)}
          placeholder="What are the downsides, risks, dependencies, or concerns?"
          data-testid="input-tradeoffs"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Business Value Level">
          <Select
            value={props.businessValueLevel}
            onValueChange={props.setBusinessValueLevel}
          >
            <SelectTrigger data-testid="select-bv-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cost Level">
          <Select value={props.costLevel} onValueChange={props.setCostLevel}>
            <SelectTrigger data-testid="select-cost-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMHU_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Business Value Summary">
        <Textarea
          rows={2}
          value={props.businessValueSummary}
          onChange={(e) => props.setBusinessValueSummary(e.target.value)}
          placeholder="Summarize the expected business value in 1–2 sentences."
          data-testid="input-bv-summary"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Estimated Cost ($)">
          <Input
            value={props.estimatedCost}
            onChange={(e) => props.setEstimatedCost(e.target.value)}
            onBlur={(e) =>
              props.setEstimatedCost(formatMoneyOnBlur(e.target.value))
            }
            placeholder="Optional"
            data-testid="input-estimated-cost"
          />
        </Field>
        <Field label="Risk Level">
          <Select value={props.riskLevel} onValueChange={props.setRiskLevel}>
            <SelectTrigger data-testid="select-risk-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Risk Notes">
        <Textarea
          rows={2}
          value={props.riskNotes}
          onChange={(e) => props.setRiskNotes(e.target.value)}
          data-testid="input-risk-notes"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Validation Status">
          <Select
            value={props.validationStatus}
            onValueChange={props.setValidationStatus}
          >
            <SelectTrigger data-testid="select-validation">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {VALIDATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Impacted Teams / Departments">
          <Input
            value={props.impactedTeams}
            onChange={(e) => props.setImpactedTeams(e.target.value)}
            placeholder="Optional"
            data-testid="input-impacted-teams"
          />
        </Field>
      </div>
    </>
  );
}

function UnderReviewView({ row }: { row: Initiative }) {
  const benefits = row.benefits || "";
  const tradeoffs = row.tradeoffs || row.prosCons || "";
  const summary = row.businessValueSummary || row.expectedBenefit || "";
  const cost = row.estimatedCost || row.roughCost || "";
  if (
    !benefits &&
    !tradeoffs &&
    !summary &&
    !cost &&
    !row.businessValueLevel &&
    !row.costLevel &&
    !row.riskLevel &&
    !row.validationStatus &&
    !row.impactedTeams &&
    !row.riskNotes
  ) {
    return (
      <p className="text-[12.5px] text-muted-foreground italic">
        No analysis recorded.
      </p>
    );
  }
  return (
    <>
      {benefits && <ReadField label="Benefits" value={benefits} />}
      {tradeoffs && (
        <ReadField label="Tradeoffs / Considerations" value={tradeoffs} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Business Value
          </div>
          <LevelBadge value={row.businessValueLevel} />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Cost
          </div>
          <LevelBadge value={row.costLevel} />
        </div>
      </div>
      {summary && (
        <ReadField label="Business Value Summary" value={summary} />
      )}
      <div className="grid grid-cols-2 gap-3">
        {cost && <ReadField label="Estimated Cost" value={cost} />}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Risk
          </div>
          <LevelBadge value={row.riskLevel} />
        </div>
      </div>
      {row.riskNotes && (
        <ReadField label="Risk Notes" value={row.riskNotes} />
      )}
      {row.validationStatus && (
        <ReadField
          label="Validation Status"
          value={fmtOption(row.validationStatus, VALIDATION_OPTIONS)}
        />
      )}
      {row.impactedTeams && (
        <ReadField label="Impacted Teams" value={row.impactedTeams} />
      )}
    </>
  );
}

function FinalDecisionEditor(props: {
  decisionReason: string;
  setDecisionReason: (v: string) => void;
  revisitDate: string;
  setRevisitDate: (v: string) => void;
  finalDecision: string;
  setFinalDecision: (v: string) => void;
}) {
  return (
    <>
      <Field
        label="Decision Rationale"
        required
      >
        <Textarea
          rows={3}
          value={props.decisionReason}
          onChange={(e) => props.setDecisionReason(e.target.value)}
          placeholder="Briefly explain why this was approved, deferred, or rejected. Consider business value, cost, risk, validation, timing, and missing information."
          data-testid="input-decision-rationale"
        />
      </Field>
      <Field label="Revisit Date (only meaningful for Defer)">
        <Input
          type="date"
          value={props.revisitDate}
          onChange={(e) => props.setRevisitDate(e.target.value)}
          data-testid="input-revisit-date"
        />
      </Field>
    </>
  );
}

function FinalDecisionView({ row }: { row: Initiative }) {
  return (
    <>
      <ReadField
        label="Final Decision"
        value={
          row.finalDecision === "approve"
            ? "Approve & Create Project"
            : row.finalDecision === "defer"
              ? "Defer"
              : row.finalDecision === "reject"
                ? "Reject"
                : row.finalDecision || "—"
        }
      />
      <ReadField label="Decision Rationale" value={row.decisionReason} />
      {row.revisitDate && (
        <ReadField
          label="Revisit Date"
          value={new Date(row.revisitDate).toLocaleDateString()}
        />
      )}
    </>
  );
}

// ---------- Audit timeline ----------

function AuditTimeline({ events }: { events: InitiativeAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground italic flex items-center gap-2">
        <History className="h-3.5 w-3.5" />
        No status changes yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2" data-testid="audit-timeline">
      {events.map((e) => (
        <li
          key={e.id}
          className="rounded-md border border-zinc-200 bg-zinc-50/40 px-3 py-2"
          data-testid={`audit-event-${e.id}`}
        >
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <div className="font-medium text-zinc-800">
              <span className="capitalize">{e.action.replace("_", " ")}</span>
              <span className="text-zinc-500 font-normal">
                {" · "}
                {STATUS_LABEL[e.oldStatus as InitiativeStatus]} →{" "}
                {STATUS_LABEL[e.newStatus as InitiativeStatus]}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(e.changedAt).toLocaleString()}
            </div>
          </div>
          <div className="text-[11.5px] text-zinc-600 mt-0.5">
            {e.changedByName ?? "Unknown"}
            {e.reason ? ` — ${e.reason}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
