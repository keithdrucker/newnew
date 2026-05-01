import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRisks,
  useGetRisk,
  useCreateRisk,
  useUpdateRisk,
  useDeleteRisk,
  useListAgents,
  useListBoardViews,
  useCreateBoardView,
  useUpdateBoardView,
  useDeleteBoardView,
  getListRisksQueryKey,
  getGetRiskQueryKey,
  getListBoardViewsQueryKey,
  type Risk,
  type RiskAuditEvent,
  type Agent,
} from "@workspace/api-client-react";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShieldAlert,
  Plus,
  Trash2,
  ArrowRight,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  History as HistoryIcon,
  Search,
  Filter as FilterIcon,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Check,
  Star,
} from "lucide-react";
import { RiskWorkflowApproval } from "@/components/risk-workflow-approval";

// ---------- Constants ----------

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "identified", label: "Identified" },
  { value: "under_analysis", label: "Under Analysis" },
  { value: "under_treatment", label: "Under Treatment" },
  { value: "mitigation", label: "Mitigation" },
  { value: "accepted", label: "Accepted" },
  { value: "transferred", label: "Transferred" },
  { value: "avoided", label: "Avoided" },
  { value: "closed", label: "Closed" },
];

// Kanban lane order — drives both the count chips in the header and
// the column layout below the filter bar. "all" is intentionally
// excluded from the lanes (the chips already total to it).
type RiskLane =
  | "identified"
  | "under_analysis"
  | "under_treatment"
  | "mitigation"
  | "accepted"
  | "transferred"
  | "avoided"
  | "closed";

const LANE_ORDER: RiskLane[] = [
  "identified",
  "under_analysis",
  "under_treatment",
  "mitigation",
  "accepted",
  "transferred",
  "avoided",
  "closed",
];

const LANE_LABEL: Record<RiskLane, string> = {
  identified: "Identified",
  under_analysis: "Under Analysis",
  under_treatment: "Under Treatment",
  mitigation: "Mitigation",
  accepted: "Accepted",
  transferred: "Transferred",
  avoided: "Avoided",
  closed: "Closed",
};

const LANE_HINT: Record<RiskLane, string> = {
  identified: "Logged — needs analysis",
  under_analysis: "Score likelihood × impact",
  under_treatment: "Pick a treatment + approve",
  mitigation: "Approved — became a Project",
  accepted: "Approved — accept the risk",
  transferred: "Approved — transferred out",
  avoided: "Approved — avoidance plan",
  closed: "Resolved — no longer tracked",
};

const LANE_TONE: Record<
  RiskLane,
  { header: string; ring: string; chip: string }
> = {
  identified: {
    header: "bg-slate-100 text-slate-700",
    ring: "ring-slate-200",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
  },
  under_analysis: {
    header: "bg-sky-50 text-sky-800",
    ring: "ring-sky-200",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
  },
  under_treatment: {
    header: "bg-violet-50 text-violet-800",
    ring: "ring-violet-200",
    chip: "bg-violet-50 text-violet-800 border-violet-200",
  },
  mitigation: {
    header: "bg-emerald-50 text-emerald-800",
    ring: "ring-emerald-200",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  accepted: {
    header: "bg-amber-50 text-amber-800",
    ring: "ring-amber-200",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
  },
  transferred: {
    header: "bg-indigo-50 text-indigo-800",
    ring: "ring-indigo-200",
    chip: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  avoided: {
    header: "bg-teal-50 text-teal-800",
    ring: "ring-teal-200",
    chip: "bg-teal-50 text-teal-800 border-teal-200",
  },
  closed: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
    chip: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
};

const RATING_FILTERS = ["critical", "high", "medium", "low"] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];

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

const RISK_TYPES = [
  "Security",
  "Operational",
  "Compliance",
  "Financial",
  "Other",
];

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TREATMENT_DECISIONS = [
  { value: "mitigation", label: "Mitigation (creates Project)" },
  { value: "acceptance", label: "Acceptance" },
  { value: "transfer", label: "Transfer" },
  { value: "avoidance", label: "Avoidance" },
];

function statusLabel(s: string): string {
  return (
    STATUS_TABS.find((t) => t.value === s)?.label ??
    s.replace(/_/g, " ")
  );
}

function ratingBadgeClass(rating: string): string {
  if (rating === "critical") return "bg-rose-100 text-rose-700 border-rose-200";
  if (rating === "high") return "bg-orange-100 text-orange-700 border-orange-200";
  if (rating === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  if (rating === "low") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-muted text-muted-foreground";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "identified":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "under_analysis":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "under_treatment":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "mitigation":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "accepted":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "transferred":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "avoided":
      return "bg-teal-100 text-teal-700 border-teal-200";
    case "closed":
      return "bg-muted text-muted-foreground";
    default:
      return "";
  }
}

// ---------- Page ----------

export default function RisksPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const isAgentOrAdmin =
    session?.role === "admin" || session?.role === "agent";
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter | "all">("all");

  // Team scope — narrows the board to a single team or "All Teams" the
  // same way Initiatives + Projects do, so the header reads as a true
  // "section · scope › view" breadcrumb.
  const scope = useTeamScope();
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

  // Saved views — scoped to "risk". Mirrors Projects/Initiatives so a
  // user's per-section default view is auto-applied on first load.
  const { data: views } = useListBoardViews({ scope: "risk" });
  const createView = useCreateBoardView();
  const updateView = useUpdateBoardView();
  const deleteView = useDeleteBoardView();

  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  type RiskViewConfig = {
    search?: string | null;
    typeFilter?: string | null;
    ratingFilter?: string | null;
  };

  function buildConfigFromFilters(): RiskViewConfig {
    return {
      search: search ? search : null,
      typeFilter: typeFilter === "all" ? null : typeFilter,
      ratingFilter: ratingFilter === "all" ? null : ratingFilter,
    };
  }

  function applyView(viewId: number) {
    const v = views?.find((x) => x.id === viewId);
    if (!v) return;
    const c = (v.config ?? {}) as RiskViewConfig;
    setSearch(typeof c.search === "string" ? c.search : "");
    setTypeFilter(typeof c.typeFilter === "string" ? c.typeFilter : "all");
    setRatingFilter(
      c.ratingFilter === "critical" ||
        c.ratingFilter === "high" ||
        c.ratingFilter === "medium" ||
        c.ratingFilter === "low"
        ? c.ratingFilter
        : "all",
    );
    setActiveViewId(viewId);
  }

  // Auto-apply the user's default saved view once on first load.
  useEffect(() => {
    if (defaultApplied || !views) return;
    const def = views.find((v) => v.isDefault);
    if (def) applyView(def.id);
    setDefaultApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, defaultApplied]);

  const activeView = useMemo(
    () =>
      (activeViewId ? views?.find((v) => v.id === activeViewId) : null) ??
      null,
    [views, activeViewId],
  );

  async function handleSaveView() {
    if (!saveName.trim()) return;
    const created = await createView.mutateAsync({
      data: {
        scope: "risk",
        name: saveName.trim(),
        config: buildConfigFromFilters() as unknown as Record<string, unknown>,
        isDefault: saveAsDefault,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "risk" }),
    });
    setActiveViewId(created.id);
    setSaveName("");
    setSaveAsDefault(false);
    setSaveOpen(false);
  }

  async function handleSetDefaultView(viewId: number, value: boolean) {
    await updateView.mutateAsync({ id: viewId, data: { isDefault: value } });
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "risk" }),
    });
  }

  async function handleDeleteView(viewId: number) {
    await deleteView.mutateAsync({ id: viewId });
    if (activeViewId === viewId) setActiveViewId(null);
    await queryClient.invalidateQueries({
      queryKey: getListBoardViewsQueryKey({ scope: "risk" }),
    });
  }

  const { data: risks = [], isLoading } = useListRisks(undefined);

  // Risks store the team key as `owningDepartmentId`; the shared
  // team-scope helper expects `departmentId`. Map once here so the
  // generic helper can do its job — keeps a single source of truth
  // for scope semantics across all three boards.
  const scopedRisks = useMemo(() => {
    const projected = risks.map((r) => ({
      __raw: r,
      departmentId: r.owningDepartmentId ?? null,
    }));
    return filterByTeamScope(projected, scope).map((p) => p.__raw);
  }, [risks, scope]);

  const filteredRisks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedRisks.filter((r) => {
      if (typeFilter !== "all" && r.riskType !== typeFilter) return false;
      if (ratingFilter !== "all" && r.riskRating !== ratingFilter) return false;
      if (q) {
        const hay = `${r.title} ${r.description ?? ""} ${
          r.owningDepartmentName ?? ""
        } ${r.riskOwnerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedRisks, search, typeFilter, ratingFilter]);

  const grouped = useMemo(() => {
    const m = new Map<RiskLane, Risk[]>();
    for (const lane of LANE_ORDER) m.set(lane, []);
    for (const r of filteredRisks) {
      const lane = LANE_ORDER.includes(r.status as RiskLane)
        ? (r.status as RiskLane)
        : null;
      if (lane) m.get(lane)!.push(r);
    }
    return m;
  }, [filteredRisks]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) + (ratingFilter !== "all" ? 1 : 0);

  if (!isAgentOrAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Risk Register is available to agents and admins.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-risks">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-10 w-10 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h1
              className="flex items-center gap-1 text-[26px] font-display font-semibold tracking-tight m-0"
              data-testid="text-risks-title"
            >
              <span>Risk Register</span>
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
                    data-testid="button-risk-views"
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
                      setTypeFilter("all");
                      setRatingFilter("all");
                    }}
                    className="flex items-center justify-between"
                    data-testid="risk-view-option-default"
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
                      data-testid={`risk-menu-view-${v.id}`}
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
                    data-testid="risk-menu-save-view"
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
                        data-testid="risk-menu-toggle-default"
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
                        data-testid="risk-menu-delete-view"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete this view
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Track risks through identification, analysis, treatment, and
            closure. Treatment decisions go through the approval workflow;
            approved mitigations automatically become Projects.
          </p>
          {/* Status counts chips — mirror the per-phase chip set on the
              Projects/Initiatives boards so users can see the lifecycle
              distribution at a glance. */}
          <div
            className="flex items-center gap-1.5 flex-wrap pt-1"
            data-testid="risk-counters"
          >
            {LANE_ORDER.map((lane) => (
              <Badge
                key={lane}
                variant="outline"
                className={`text-[11.5px] font-medium px-2 py-0.5 ${LANE_TONE[lane].chip}`}
                data-testid={`chip-count-${lane}`}
              >
                {grouped.get(lane)?.length ?? 0} {LANE_LABEL[lane]}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-risk"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Risk
        </Button>
      </header>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              data-testid="button-risks-filters"
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
          <PopoverContent className="w-[280px] p-3 space-y-3" align="start">
            <div className="space-y-1.5">
              <Label className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
                Risk Type
              </Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8" data-testid="select-filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {RISK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
                Risk Rating
              </Label>
              <Select
                value={ratingFilter}
                onValueChange={(v) =>
                  setRatingFilter(v as RatingFilter | "all")
                }
              >
                <SelectTrigger className="h-8" data-testid="select-filter-rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ratings</SelectItem>
                  {RATING_FILTERS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setRatingFilter("all");
              }}
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
              data-testid="button-clear-risk-filters"
            >
              Clear all
            </button>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search risks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-risk-search"
          />
        </div>

        {(activeFilterCount > 0 || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-[12px]"
            onClick={() => {
              setTypeFilter("all");
              setRatingFilter("all");
              setSearch("");
            }}
            data-testid="button-reset-risk-filters"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Kanban board: 8 lanes, horizontally scrollable to keep all
          columns visible without cramping on smaller screens */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-2 min-w-max">
            {LANE_ORDER.map((lane, idx) => (
              <Fragment key={lane}>
                <Lane
                  lane={lane}
                  items={grouped.get(lane) ?? []}
                  onPick={setSelectedId}
                />
                {idx < LANE_ORDER.length - 1 && (
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

      {createOpen && (
        <CreateRiskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            setCreateOpen(false);
            setSelectedId(id);
          }}
        />
      )}

      {selectedId !== null && (
        <RiskDetailDialog
          riskId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Save view dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Saved views capture your filters so you can recall them with a
              single click.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="risk-view-name">Name</Label>
              <Input
                id="risk-view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. High & critical only"
                data-testid="input-risk-view-name"
              />
            </div>
            <label className="flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                data-testid="checkbox-risk-view-default"
              />
              <span>Set as my default view</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!saveName.trim() || createView.isPending}
              data-testid="button-risk-view-save"
            >
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Kanban lane + card ----------

function Lane({
  lane,
  items,
  onPick,
}: {
  lane: RiskLane;
  items: Risk[];
  onPick: (id: number) => void;
}) {
  const tone = LANE_TONE[lane];
  return (
    <div
      className={`w-[280px] shrink-0 rounded-lg ring-1 ${tone.ring} bg-white flex flex-col`}
      data-testid={`lane-${lane}`}
    >
      <div
        className={`${tone.header} px-3 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide rounded-t-lg`}
      >
        <span>{LANE_LABEL[lane]}</span>
        <span data-testid={`count-${lane}`}>{items.length}</span>
      </div>
      <div className="px-3 py-1 text-[11.5px] text-muted-foreground border-b border-zinc-100">
        {LANE_HINT[lane]}
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">
            Nothing here yet.
          </p>
        ) : (
          items.map((r) => (
            <RiskCard key={r.id} risk={r} onPick={onPick} />
          ))
        )}
      </div>
    </div>
  );
}

function RiskCard({
  risk,
  onPick,
}: {
  risk: Risk;
  onPick: (id: number) => void;
}) {
  const summary = (risk.description ?? "").trim() || "—";
  const isResolved =
    risk.status === "mitigation" ||
    risk.status === "accepted" ||
    risk.status === "transferred" ||
    risk.status === "avoided";
  return (
    <button
      type="button"
      onClick={() => onPick(risk.id)}
      className="w-full text-left rounded-md border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition p-3 space-y-2"
      data-testid={`card-risk-${risk.id}`}
    >
      <div className="text-[13.5px] font-medium leading-snug line-clamp-2">
        {risk.title}
      </div>
      <div className="text-[12px] text-muted-foreground line-clamp-2">
        {summary}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Avatar className="h-5 w-5 text-[10px]">
          <AvatarFallback>
            {initials(risk.riskOwnerName ?? risk.reporterName)}
          </AvatarFallback>
        </Avatar>
        <Badge
          variant="outline"
          className="text-[10.5px] py-0 h-5 font-normal"
        >
          {risk.riskType}
        </Badge>
        {risk.owningDepartmentName && (
          <Badge
            variant="outline"
            className="text-[10.5px] py-0 h-5 font-normal"
          >
            {risk.owningDepartmentName}
          </Badge>
        )}
        {risk.riskRating && (
          <Badge
            variant="outline"
            className={`text-[10.5px] py-0 h-5 font-normal ${ratingBadgeClass(risk.riskRating)}`}
            data-testid={`badge-rating-${risk.id}`}
          >
            {risk.riskRating.toUpperCase()}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {ageLabel(risk.createdAt)}
        </span>
      </div>
      {risk.status === "mitigation" && risk.createdProjectId && (
        <div className="text-[11.5px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Project P-{risk.createdProjectId}
        </div>
      )}
      {isResolved && risk.status !== "mitigation" && (
        <div className="text-[11.5px] text-zinc-600 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {LANE_LABEL[risk.status as RiskLane]}
        </div>
      )}
      {risk.status === "closed" && (
        <div className="text-[11.5px] text-zinc-500 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Closed
        </div>
      )}
    </button>
  );
}

// ---------- Create dialog ----------

function CreateRiskDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const scope = useTeamScope();
  const { data: agents = [] } = useListAgents({});
  const createRisk = useCreateRisk();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [riskType, setRiskType] = useState(RISK_TYPES[1]);
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [ownerUserId, setOwnerUserId] = useState<string>("none");

  const teams = scope.accessible;

  async function handleSubmit() {
    if (!title.trim() || !departmentId) {
      toast.error("Title and owning team are required.");
      return;
    }
    try {
      const created = await createRisk.mutateAsync({
        data: {
          title: title.trim(),
          riskType,
          description: description.trim(),
          owningDepartmentId: Number(departmentId),
          riskOwnerUserId:
            ownerUserId === "none" ? null : Number(ownerUserId),
        },
      });
      qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
      toast.success("Risk created.");
      onCreated(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create risk.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-create-risk">
        <DialogHeader>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>
            Capture the risk now; analysis and treatment happen later in the
            lifecycle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="risk-title">Title</Label>
            <Input
              id="risk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g. Outdated TLS on customer portal"
              data-testid="input-risk-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Risk type</Label>
              <Select value={riskType} onValueChange={setRiskType}>
                <SelectTrigger data-testid="select-risk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owning team</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger data-testid="select-risk-department">
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Risk owner (optional)</Label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger data-testid="select-risk-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {agents.map((a: Agent) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="risk-desc">Description</Label>
            <Textarea
              id="risk-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the risk? Where does it apply?"
              data-testid="input-risk-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createRisk.isPending}
            data-testid="button-submit-create-risk"
          >
            Create Risk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail dialog ----------

function RiskDetailDialog({
  riskId,
  onClose,
}: {
  riskId: number;
  onClose: () => void;
}) {
  const { data: risk, isLoading } = useGetRisk(riskId);
  const [isDirty, setIsDirty] = useState(false);
  const saveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const registerSaveHandler = useCallback(
    (fn: (() => Promise<boolean>) | null) => {
      saveHandlerRef.current = fn;
    },
    [],
  );

  function attemptClose() {
    if (isDirty) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  }

  return (
    <>
      <Dialog open={true} onOpenChange={(o) => !o && attemptClose()}>
        <DialogContent
          className="max-w-3xl p-0 max-h-[90vh] flex flex-col"
          data-testid="dialog-risk-detail"
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmCloseOpen(true);
            }
          }}
          // Use only `onInteractOutside` to cover both pointer + focus-based
          // outside interactions; combining with `onPointerDownOutside` would
          // double-fire the prompt.
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmCloseOpen(true);
            }
          }}
        >
          {isLoading || !risk ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <RiskDetailContent
              risk={risk}
              onClose={onClose}
              onDirtyChange={setIsDirty}
              registerSaveHandler={registerSaveHandler}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent data-testid="dialog-unsaved-changes">
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes before closing?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this risk. Would you like to save
              them, or discard and close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-editing">
              Keep editing
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmCloseOpen(false);
                onClose();
              }}
              data-testid="button-discard-changes"
            >
              Discard changes
            </Button>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                const fn = saveHandlerRef.current;
                if (fn) {
                  const ok = await fn();
                  if (ok) {
                    setConfirmCloseOpen(false);
                    onClose();
                  }
                } else {
                  setConfirmCloseOpen(false);
                  onClose();
                }
              }}
              data-testid="button-save-and-close"
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Maps a risk status to the tab that represents that phase. Anything past
// "under_treatment" lives on the Overview tab (the workflow is done from a
// phase-progression standpoint), and anything ambiguous falls back to overview.
function defaultTabForStatus(status: string): string {
  if (status === "under_analysis") return "analysis";
  if (status === "under_treatment") return "treatment";
  return "overview";
}

// Returns extra classes for a phase tab trigger so tabs render in
// yellow (current phase), green (completed phase), or default (future phase).
// "linked" and "history" are not lifecycle phases — they always use defaults.
function phaseTabClass(status: string, tabValue: string): string {
  const phaseOrder = ["overview", "analysis", "treatment"];
  // Status → index of current phase in `phaseOrder`. Anything beyond
  // "under_treatment" means all three phases are completed.
  const statusIndex: Record<string, number> = {
    identified: 0,
    under_analysis: 1,
    under_treatment: 2,
    mitigation: 3,
    accepted: 3,
    transferred: 3,
    avoided: 3,
    closed: 3,
  };
  const idx = phaseOrder.indexOf(tabValue);
  if (idx === -1) return "";
  const current = statusIndex[status] ?? 0;
  if (idx < current) {
    // Completed phase
    return "data-[state=active]:bg-emerald-500 data-[state=active]:text-white bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }
  if (idx === current) {
    // Current/active phase
    return "data-[state=active]:bg-amber-500 data-[state=active]:text-white bg-amber-100 text-amber-900 hover:bg-amber-200";
  }
  return "";
}

function RiskDetailContent({
  risk,
  onClose,
  onDirtyChange,
  registerSaveHandler,
}: {
  risk: Risk;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  registerSaveHandler: (fn: (() => Promise<boolean>) | null) => void;
}) {
  const { session } = useSession();
  const isAdmin = session?.role === "admin";
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const [activeTab, setActiveTab] = useState(() =>
    defaultTabForStatus(risk.status),
  );

  // Lifted analysis form state so the parent can detect dirty + provide a
  // single "Launch Treatment Phase" footer action that saves first.
  const [likelihood, setLikelihood] = useState(risk.likelihood || "");
  const [impact, setImpact] = useState(risk.impact || "");
  const [impactScope, setImpactScope] = useState(risk.impactScope || "");
  const [businessImpact, setBusinessImpact] = useState(
    risk.businessImpact || "",
  );
  const [analysisNotes, setAnalysisNotes] = useState(risk.analysisNotes || "");

  const analysisEditable =
    risk.status === "under_analysis" || risk.status === "identified";

  const analysisDirty =
    analysisEditable &&
    ((likelihood || "") !== (risk.likelihood || "") ||
      (impact || "") !== (risk.impact || "") ||
      (impactScope || "") !== (risk.impactScope || "") ||
      (businessImpact || "") !== (risk.businessImpact || "") ||
      (analysisNotes || "") !== (risk.analysisNotes || ""));

  useEffect(() => {
    onDirtyChange(analysisDirty);
  }, [analysisDirty, onDirtyChange]);

  // After a successful save (or any external refresh of `risk`) the local
  // form state may already match the server values, in which case `dirty`
  // naturally clears. But if the server normalized something (trim, etc.) or
  // the risk got updated outside this dialog, sync local state from the new
  // record only when the form is **not** currently dirty — this preserves
  // in-flight user edits while still re-baselining after saves.
  useEffect(() => {
    if (!analysisDirty) {
      setLikelihood(risk.likelihood || "");
      setImpact(risk.impact || "");
      setImpactScope(risk.impactScope || "");
      setBusinessImpact(risk.businessImpact || "");
      setAnalysisNotes(risk.analysisNotes || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    risk.likelihood,
    risk.impact,
    risk.impactScope,
    risk.businessImpact,
    risk.analysisNotes,
  ]);

  function refresh() {
    qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRiskQueryKey(risk.id) });
  }

  async function saveAnalysis(): Promise<boolean> {
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          likelihood,
          impact,
          impactScope,
          businessImpact,
          analysisNotes,
        },
      });
      refresh();
      toast.success("Analysis saved.");
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save analysis.",
      );
      return false;
    }
  }

  // Expose the save function to the parent so its "Save changes" prompt
  // can persist before closing the dialog.
  useEffect(() => {
    registerSaveHandler(analysisDirty ? saveAnalysis : null);
    return () => registerSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analysisDirty,
    likelihood,
    impact,
    impactScope,
    businessImpact,
    analysisNotes,
  ]);

  const canMoveToTreatment =
    risk.status === "under_analysis" &&
    !!likelihood &&
    !!impact &&
    !!impactScope.trim() &&
    !!businessImpact.trim();

  async function launchTreatmentPhase() {
    // Persist any pending analysis edits first, then transition.
    if (analysisDirty) {
      const ok = await saveAnalysis();
      if (!ok) return;
    }
    await transition("under_treatment");
    setActiveTab("treatment");
  }

  async function transition(
    newStatus: string,
    extra: Record<string, unknown> = {},
  ) {
    let transitionReason: string | undefined;
    if (newStatus === "closed") {
      const r = window.prompt("Reason for closing this risk:");
      if (r === null) return;
      if (!r.trim()) {
        toast.error("Closing reason is required.");
        return;
      }
      transitionReason = r.trim();
    }
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          status: newStatus as Risk["status"],
          ...(transitionReason !== undefined ? { transitionReason } : {}),
          ...extra,
        },
      });
      refresh();
      toast.success(`Risk moved to ${statusLabel(newStatus)}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update the risk.",
      );
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this risk and all its history? This cannot be undone.",
      )
    )
      return;
    try {
      await deleteRisk.mutateAsync({ id: risk.id });
      qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
      toast.success("Risk deleted.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't delete the risk.",
      );
    }
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate">{risk.title}</DialogTitle>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {risk.riskType}
              </Badge>
              <Badge variant="outline" className={statusBadgeClass(risk.status)}>
                {statusLabel(risk.status)}
              </Badge>
              {risk.riskRating && (
                <Badge className={ratingBadgeClass(risk.riskRating)}>
                  Rating: {risk.riskRating.toUpperCase()}
                </Badge>
              )}
              {risk.createdProjectId && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Project P-{risk.createdProjectId}
                </Badge>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-destructive"
              data-testid="button-delete-risk"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </DialogHeader>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 overflow-hidden flex flex-col"
      >
        <TabsList className="mx-6 mt-3 self-start">
          <TabsTrigger
            value="overview"
            data-testid="tab-overview"
            className={cn(phaseTabClass(risk.status, "overview"))}
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="analysis"
            data-testid="tab-analysis"
            className={cn(phaseTabClass(risk.status, "analysis"))}
          >
            Analysis
          </TabsTrigger>
          <TabsTrigger
            value="treatment"
            data-testid="tab-treatment"
            className={cn(phaseTabClass(risk.status, "treatment"))}
          >
            Treatment
          </TabsTrigger>
          <TabsTrigger value="linked" data-testid="tab-linked">
            Linked Work
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            History
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <OverviewTab risk={risk} onTransition={transition} />
            </TabsContent>
            <TabsContent value="analysis" className="mt-0 space-y-4">
              <AnalysisTab
                risk={risk}
                likelihood={likelihood}
                impact={impact}
                impactScope={impactScope}
                businessImpact={businessImpact}
                analysisNotes={analysisNotes}
                onLikelihoodChange={setLikelihood}
                onImpactChange={setImpact}
                onImpactScopeChange={setImpactScope}
                onBusinessImpactChange={setBusinessImpact}
                onAnalysisNotesChange={setAnalysisNotes}
                onSave={saveAnalysis}
                onLaunchTreatment={launchTreatmentPhase}
                canMoveToTreatment={canMoveToTreatment}
                saving={updateRisk.isPending}
              />
            </TabsContent>
            <TabsContent value="treatment" className="mt-0 space-y-4">
              <TreatmentTab risk={risk} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="linked" className="mt-0 space-y-4">
              <LinkedWorkTab risk={risk} onNavigate={(p) => navigate(p)} />
            </TabsContent>
            <TabsContent value="history" className="mt-0 space-y-4">
              <HistoryTab events={risk.auditEvents} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {risk.status === "under_analysis" && (
        <div className="px-6 py-3 border-t bg-muted/40 flex items-center justify-end gap-2">
          {analysisDirty && (
            <span className="text-xs text-muted-foreground mr-auto">
              You have unsaved analysis changes.
            </span>
          )}
          <Button
            size="sm"
            onClick={launchTreatmentPhase}
            disabled={!canMoveToTreatment || updateRisk.isPending}
            data-testid="button-launch-treatment-phase"
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            Launch Treatment Phase
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- Tabs ----------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function OverviewTab({
  risk,
  onTransition,
}: {
  risk: Risk;
  onTransition: (s: string, extra?: Record<string, unknown>) => void;
}) {
  const canStartAnalysis = risk.status === "identified";
  const canClose =
    risk.status !== "closed" && risk.status !== "under_treatment";

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Risk Type">{risk.riskType}</Field>
        <Field label="Status">{statusLabel(risk.status)}</Field>
        <Field label="Owning Team">{risk.owningDepartmentName ?? "—"}</Field>
        <Field label="Risk Owner">{risk.riskOwnerName ?? "Unassigned"}</Field>
        <Field label="Reporter">{risk.reporterName ?? "—"}</Field>
        <Field label="Created">
          {new Date(risk.createdAt).toLocaleString()}
        </Field>
      </div>
      <Field label="Description">
        <p className="whitespace-pre-wrap">{risk.description || "—"}</p>
      </Field>
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {canStartAnalysis && (
          <Button
            size="sm"
            onClick={() => onTransition("under_analysis")}
            data-testid="button-start-analysis"
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            Start Analysis
          </Button>
        )}
        {canClose && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTransition("closed")}
            data-testid="button-close-risk"
          >
            Close Risk
          </Button>
        )}
      </div>
    </>
  );
}

function AnalysisTab({
  risk,
  likelihood,
  impact,
  impactScope,
  businessImpact,
  analysisNotes,
  onLikelihoodChange,
  onImpactChange,
  onImpactScopeChange,
  onBusinessImpactChange,
  onAnalysisNotesChange,
  onSave,
  onLaunchTreatment,
  canMoveToTreatment,
  saving,
}: {
  risk: Risk;
  likelihood: string;
  impact: string;
  impactScope: string;
  businessImpact: string;
  analysisNotes: string;
  onLikelihoodChange: (v: string) => void;
  onImpactChange: (v: string) => void;
  onImpactScopeChange: (v: string) => void;
  onBusinessImpactChange: (v: string) => void;
  onAnalysisNotesChange: (v: string) => void;
  onSave: () => Promise<boolean>;
  onLaunchTreatment: () => Promise<void>;
  canMoveToTreatment: boolean;
  saving: boolean;
}) {
  // Visible Under Analysis and beyond.
  const editable =
    risk.status === "under_analysis" || risk.status === "identified";

  // Cheap client-side rating preview mirroring the server formula.
  const previewRating = useMemo(() => {
    const lvl: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    const a = lvl[likelihood] ?? 0;
    const b = lvl[impact] ?? 0;
    if (!a || !b) return "";
    const score = a * b;
    if (score >= 12) return "critical";
    if (score >= 8) return "high";
    if (score >= 4) return "medium";
    return "low";
  }, [likelihood, impact]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Likelihood</Label>
          <Select
            value={likelihood}
            onValueChange={onLikelihoodChange}
            disabled={!editable}
          >
            <SelectTrigger data-testid="select-likelihood">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Impact</Label>
          <Select
            value={impact}
            onValueChange={onImpactChange}
            disabled={!editable}
          >
            <SelectTrigger data-testid="select-impact">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {previewRating && (
        <Badge className={ratingBadgeClass(previewRating)}>
          Computed Rating: {previewRating.toUpperCase()}
        </Badge>
      )}
      <div className="space-y-1.5">
        <Label>Impact Scope</Label>
        <Input
          value={impactScope}
          onChange={(e) => onImpactScopeChange(e.target.value)}
          placeholder="What systems / users / processes are affected?"
          disabled={!editable}
          data-testid="input-impact-scope"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Business Impact</Label>
        <Textarea
          rows={3}
          value={businessImpact}
          onChange={(e) => onBusinessImpactChange(e.target.value)}
          placeholder="What happens to the business if this risk materializes?"
          disabled={!editable}
          data-testid="input-business-impact"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Analysis Notes</Label>
        <Textarea
          rows={4}
          value={analysisNotes}
          onChange={(e) => onAnalysisNotesChange(e.target.value)}
          placeholder="Add references, root cause, dependencies, etc."
          disabled={!editable}
          data-testid="input-analysis-notes"
        />
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void onSave();
            }}
            disabled={saving}
            data-testid="button-save-analysis"
          >
            Save Analysis
          </Button>
          {canMoveToTreatment && (
            <Button
              size="sm"
              onClick={() => {
                void onLaunchTreatment();
              }}
              disabled={saving}
              data-testid="button-move-to-treatment"
            >
              <ArrowRight className="h-4 w-4 mr-1.5" />
              Move to Treatment
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function TreatmentTab({ risk, onSaved }: { risk: Risk; onSaved: () => void }) {
  const updateRisk = useUpdateRisk();
  const [decision, setDecision] = useState(risk.treatmentDecision || "");
  const [acceptanceJustification, setAcceptanceJustification] = useState(
    risk.acceptanceJustification || "",
  );
  const [transferMethod, setTransferMethod] = useState(
    risk.transferMethod || "",
  );
  const [transferResponsibleParty, setTransferResponsibleParty] = useState(
    risk.transferResponsibleParty || "",
  );
  const [avoidanceActionNotes, setAvoidanceActionNotes] = useState(
    risk.avoidanceActionNotes || "",
  );

  // Decision is editable only while still Under Treatment.
  const editable = risk.status === "under_treatment";
  const visible =
    risk.status === "under_treatment" ||
    risk.status === "mitigation" ||
    risk.status === "accepted" ||
    risk.status === "transferred" ||
    risk.status === "avoided";

  if (!visible) {
    return (
      <p className="text-sm text-muted-foreground">
        Treatment is available once the risk reaches Under Treatment. Complete
        the Analysis tab to move it forward.
      </p>
    );
  }

  async function saveDecision() {
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          treatmentDecision: decision || undefined,
          acceptanceJustification,
          transferMethod,
          transferResponsibleParty,
          avoidanceActionNotes,
        },
      });
      onSaved();
      toast.success("Treatment proposal saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save treatment.",
      );
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label>Treatment Decision</Label>
        <Select
          value={decision}
          onValueChange={setDecision}
          disabled={!editable}
        >
          <SelectTrigger data-testid="select-treatment-decision">
            <SelectValue placeholder="Pick a decision…" />
          </SelectTrigger>
          <SelectContent>
            {TREATMENT_DECISIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {decision === "mitigation" && (
        <p className="text-sm text-muted-foreground">
          On approval, a Project will be auto-created for the mitigation work
          (named “Risk Mitigation: {risk.title}”), inheriting team and owner.
        </p>
      )}
      {decision === "acceptance" && (
        <div className="space-y-1.5">
          <Label>Acceptance Justification</Label>
          <Textarea
            rows={3}
            value={acceptanceJustification}
            onChange={(e) => setAcceptanceJustification(e.target.value)}
            placeholder="Why are we accepting this risk?"
            disabled={!editable}
            data-testid="input-acceptance-justification"
          />
        </div>
      )}
      {decision === "transfer" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Transfer Method</Label>
            <Input
              value={transferMethod}
              onChange={(e) => setTransferMethod(e.target.value)}
              placeholder="E.g. Cyber-insurance policy, vendor contract"
              disabled={!editable}
              data-testid="input-transfer-method"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsible Party</Label>
            <Input
              value={transferResponsibleParty}
              onChange={(e) => setTransferResponsibleParty(e.target.value)}
              placeholder="Name of party assuming the risk"
              disabled={!editable}
              data-testid="input-transfer-party"
            />
          </div>
        </div>
      )}
      {decision === "avoidance" && (
        <div className="space-y-1.5">
          <Label>Avoidance Action Notes</Label>
          <Textarea
            rows={3}
            value={avoidanceActionNotes}
            onChange={(e) => setAvoidanceActionNotes(e.target.value)}
            placeholder="What activity is being stopped or replaced?"
            disabled={!editable}
            data-testid="input-avoidance-notes"
          />
        </div>
      )}

      {editable && (
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={saveDecision}
            disabled={updateRisk.isPending || !decision}
            data-testid="button-save-treatment"
          >
            Save Treatment Proposal
          </Button>
        </div>
      )}

      <div className="pt-4 border-t space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Approval
        </p>
        <RiskWorkflowApproval row={risk} />
      </div>
    </>
  );
}

function LinkedWorkTab({
  risk,
  onNavigate,
}: {
  risk: Risk;
  onNavigate: (path: string) => void;
}) {
  if (risk.createdProjectId == null) {
    return (
      <p className="text-sm text-muted-foreground">
        No linked Project yet. Approving a Mitigation treatment will
        automatically create one.
      </p>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            P-{risk.createdProjectId}
          </Badge>
          Linked Mitigation Project
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onNavigate(`/projects?selected=${risk.createdProjectId}`)
          }
          data-testid="button-view-project"
        >
          <ExternalLink className="h-4 w-4 mr-1.5" />
          View Project
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryTab({ events }: { events: RiskAuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex gap-3 text-sm border rounded-md p-3"
          data-testid={`history-event-${e.id}`}
        >
          <HistoryIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {e.oldStatus === e.newStatus
                ? statusLabel(e.newStatus)
                : `${statusLabel(e.oldStatus)} → ${statusLabel(e.newStatus)}`}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                · {e.action}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {e.changedByName ?? "—"} · {new Date(e.changedAt).toLocaleString()}
            </p>
            {e.reason && (
              <p className="text-xs mt-1 text-muted-foreground italic">
                “{e.reason}”
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
