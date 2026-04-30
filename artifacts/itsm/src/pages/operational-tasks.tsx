import { useEffect, useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Columns3,
  Filter as FilterIcon,
  FileDown,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { DraggableColumnList } from "@/components/draggable-column-list";
import {
  useGetSession,
  useListAgents,
  useListOperationalTasks,
  useCreateOperationalTask,
  useUpdateOperationalTask,
  useDeleteOperationalTask,
  useCompleteOperationalTask,
  useListOperationalTaskActivity,
  useListOperationalTaskTimeEntries,
  useCreateOperationalTaskTimeEntry,
  useDeleteOperationalTaskTimeEntry,
  getListOperationalTasksQueryKey,
  getListOperationalTaskActivityQueryKey,
  getListOperationalTaskTimeEntriesQueryKey,
} from "@workspace/api-client-react";
import type {
  OperationalTask,
  OperationalTaskActivity,
  OperationalTaskTimeEntry,
} from "@workspace/api-client-react";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

// ---- Constants ----------------------------------------------------

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "bi_annual", label: "Bi-Annual" },
  { value: "annual", label: "Annual" },
  { value: "multi_year", label: "Multi-Year" },
] as const;

const TYPE_OPTIONS = [
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One-Time" },
] as const;

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
] as const;

// Optional control taxonomy. The values match the OpenAPI enum so
// the dropdown round-trips with no client/server translation. Kept
// here so the labels live with the rest of the page's vocabulary.
const CONTROL_CATEGORY_OPTIONS = [
  { value: "operations", label: "Operations" },
  { value: "maintenance", label: "Maintenance" },
  { value: "monitoring", label: "Monitoring" },
  { value: "reviews_audits", label: "Reviews & Audits" },
  { value: "documentation", label: "Documentation" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "health_checks", label: "Health Checks" },
  { value: "enablement_training", label: "Enablement / Training" },
  { value: "systems", label: "Systems" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "applications", label: "Applications" },
  { value: "automation", label: "Automation" },
  { value: "data_reporting", label: "Data & Reporting" },
  { value: "access_identity", label: "Access & Identity" },
  { value: "security", label: "Security" },
  { value: "compliance", label: "Compliance" },
  { value: "business_continuity", label: "Business Continuity" },
  { value: "risk_management", label: "Risk Management" },
] as const;

// Same options grouped for the dropdowns. Category is purely an
// informational tag — it never affects status, lifecycle, approvals,
// or any business logic. Multi-team friendly: IT, Security, Ops,
// Admin, Facilities all pick from the same vocabulary so the page
// stays department-agnostic. ("Category provides context, not
// control.")
const CATEGORY_GROUPS = [
  {
    label: "Core Operational",
    values: [
      "operations",
      "maintenance",
      "monitoring",
      "reviews_audits",
      "documentation",
      "housekeeping",
      "health_checks",
      "enablement_training",
    ] as const,
  },
  {
    label: "Technology & Systems",
    values: [
      "systems",
      "infrastructure",
      "applications",
      "automation",
      "data_reporting",
      "access_identity",
    ] as const,
  },
  {
    label: "Risk & Assurance",
    values: [
      "security",
      "compliance",
      "business_continuity",
      "risk_management",
    ] as const,
  },
] as const;

function controlCategoryLabel(value: string | null | undefined) {
  if (!value) return "—";
  return (
    CONTROL_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

const DUE_WINDOW_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "overdue", label: "Overdue" },
] as const;

function freqLabel(value: string | null | undefined) {
  if (!value) return "—";
  return FREQUENCY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
function typeLabel(value: string) {
  return TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
function statusLabel(value: string) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// ---- Column system -----------------------------------------------
//
// Mirrors the Tickets page: columns are user-controlled (toggle +
// reorder) and the choice persists per-user via localStorage. Every
// column has a label, a renderer for the table cell, and a plain-text
// formatter used by Export PDF.

type ColumnKey =
  | "name"
  | "frequency"
  | "type"
  | "nextDueDate"
  | "ownerName"
  | "status"
  | "controlCategory"
  | "description"
  | "completedAt"
  | "createdAt";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  alwaysVisible?: boolean;
  // Width hint for the table header (CSS class, not enforced).
  className?: string;
  // Plain text used by the PDF export. Not used for table rendering.
  text: (t: OperationalTask) => string;
};

const COLUMN_DEFS: Record<ColumnKey, ColumnDef> = {
  name: {
    key: "name",
    label: "Task Name",
    alwaysVisible: true,
    className: "w-[28%]",
    text: (t) => t.name,
  },
  frequency: {
    key: "frequency",
    label: "Frequency",
    className: "w-[110px]",
    text: (t) => freqLabel(t.frequency),
  },
  type: {
    key: "type",
    label: "Type",
    className: "w-[100px]",
    text: (t) => typeLabel(t.type),
  },
  nextDueDate: {
    key: "nextDueDate",
    label: "Next Due",
    className: "w-[120px]",
    text: (t) => formatDate(t.nextDueDate),
  },
  ownerName: {
    key: "ownerName",
    label: "Owner",
    className: "w-[160px]",
    text: (t) => t.ownerName ?? "Unassigned",
  },
  status: {
    key: "status",
    label: "Status",
    className: "w-[130px]",
    text: (t) =>
      t.isOverdue && t.status !== "completed" && t.status !== "closed"
        ? "Overdue"
        : statusLabel(t.status),
  },
  controlCategory: {
    key: "controlCategory",
    label: "Category",
    className: "w-[170px]",
    text: (t) => controlCategoryLabel(t.controlCategory),
  },
  description: {
    key: "description",
    label: "Description",
    className: "min-w-[200px]",
    text: (t) => t.description || "",
  },
  completedAt: {
    key: "completedAt",
    label: "Last Completed",
    className: "w-[140px]",
    text: (t) =>
      t.completedAt ? formatDate(t.completedAt.slice(0, 10)) : "",
  },
  createdAt: {
    key: "createdAt",
    label: "Created",
    className: "w-[120px]",
    text: (t) => formatDate(t.createdAt.slice(0, 10)),
  },
};

const ALL_COLUMN_KEYS: ColumnKey[] = [
  "name",
  "frequency",
  "type",
  "nextDueDate",
  "ownerName",
  "status",
  "controlCategory",
  "description",
  "completedAt",
  "createdAt",
];

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  "name",
  "frequency",
  "type",
  "nextDueDate",
  "ownerName",
  "status",
];

const COLUMN_VISIBILITY_KEY = "itsm.operationalTasks.visibleColumns";

// Cell renderer keyed by ColumnKey. Most cells are plain text from
// the column def, but a few (Next Due icon, Status badge) get richer
// rendering. Kept as a top-level helper so the table body stays
// declarative.
function renderCell(key: ColumnKey, t: OperationalTask) {
  switch (key) {
    case "nextDueDate":
      return (
        <span className="inline-flex items-center gap-1 text-sm">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {formatDate(t.nextDueDate)}
        </span>
      );
    case "status":
      return <StatusBadge status={t.status} isOverdue={t.isOverdue} />;
    case "controlCategory":
      return t.controlCategory ? (
        <Badge variant="outline" className="font-normal">
          {controlCategoryLabel(t.controlCategory)}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "completedAt":
      return t.completedAt ? formatDate(t.completedAt.slice(0, 10)) : "—";
    case "createdAt":
      return formatDate(t.createdAt.slice(0, 10));
    case "description":
      return (
        <span className="line-clamp-1" title={t.description || undefined}>
          {t.description || "—"}
        </span>
      );
    default:
      return COLUMN_DEFS[key].text(t);
  }
}

// ---- Filters -----------------------------------------------------

type Filters = {
  search: string;
  status: string[]; // multi-select
  ownerId: string; // "all" | "<id>"
  frequency: string; // "all" | freq
  type: string; // "all" | type
  dueWindow: string; // "all" | "today" | "week" | "overdue"
  // Optional Category tag. "all" means no filter. The API has no
  // server-side filter for this field today, so we narrow client-side
  // in `visibleTasks` instead of pushing into queryParams.
  controlCategory: string;
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: [],
  ownerId: "all",
  frequency: "all",
  type: "all",
  dueWindow: "all",
  controlCategory: "all",
};

type FilterCategoryKey = Exclude<keyof Filters, "search">;

const FILTER_CATEGORIES: { key: FilterCategoryKey; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "ownerId", label: "Owner" },
  { key: "frequency", label: "Frequency" },
  { key: "type", label: "Type" },
  { key: "dueWindow", label: "Due date" },
  { key: "controlCategory", label: "Category" },
];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(ymd: string) {
  // Display the calendar date as-is (no timezone shift). Parse parts.
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({
  status,
  isOverdue,
}: {
  status: string;
  isOverdue: boolean;
}) {
  if (isOverdue && status !== "completed" && status !== "closed") {
    return (
      <Badge
        variant="destructive"
        className="gap-1"
        data-testid="badge-status-overdue"
      >
        <AlertCircle className="h-3 w-3" />
        Overdue
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-muted-foreground/30 text-muted-foreground"
        data-testid="badge-status-closed"
      >
        <Lock className="h-3 w-3" /> Closed
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
        data-testid="badge-status-completed"
      >
        <Check className="h-3 w-3" /> Completed
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/40 text-blue-700 dark:text-blue-400"
        data-testid="badge-status-in-progress"
      >
        In Progress
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="badge-status-scheduled">
      Scheduled
    </Badge>
  );
}

// ---- Page ---------------------------------------------------------

export default function OperationalTasks() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const queryClient = useQueryClient();
  const scope = useTeamScope();
  // The page no longer derives team context from the URL :slug — the
  // global team-scope context (sidebar selector) is the single source
  // of truth. `activeDept` is only meaningful when the user has
  // narrowed scope to exactly one team; otherwise it stays null and
  // the create dialog shows a team picker.
  const activeDept = useMemo(
    () =>
      scope.single
        ? scope.accessible.find((d) => d.id === scope.singleId) ?? null
        : null,
    [scope.single, scope.singleId, scope.accessible],
  );

  // ---- Filters -------------------------------------------------------
  // One-shape Filters object mirrors the Tickets toolbar so the
  // categorical popover, the chip strip, and the URL/query layer can
  // all read from the same source of truth.
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const clearFilter = (key: keyof Filters) =>
    setFilter(key, DEFAULT_FILTERS[key] as never);
  const clearAllFilters = () => setFilters(DEFAULT_FILTERS);

  // Filters popover state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<FilterCategoryKey | null>("status");
  const [optionSearch, setOptionSearch] = useState("");

  // "Show closed" toggle. Mirrors the Tickets page UX — closed tasks
  // are hidden by default to keep the operational view actionable; a
  // single toggle in the header pulls them back in.
  const [showClosed, setShowClosed] = useState(false);

  // ---- Visible columns (persisted per-user via localStorage) -------
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
      const valid = parsed.filter(
        (k): k is ColumnKey =>
          typeof k === "string" && (ALL_COLUMN_KEYS as string[]).includes(k),
      );
      // Always include alwaysVisible columns (e.g. "name") even if the
      // saved list dropped them.
      const required = ALL_COLUMN_KEYS.filter(
        (k) => COLUMN_DEFS[k].alwaysVisible,
      );
      const merged = Array.from(new Set([...required, ...valid]));
      return merged.length > 0 ? merged : DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        COLUMN_VISIBILITY_KEY,
        JSON.stringify(visibleColumns),
      );
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — silent.
    }
  }, [visibleColumns]);

  const queryParams = useMemo(() => {
    const p: Parameters<typeof useListOperationalTasks>[0] = {};
    if (activeDept) p.departmentId = activeDept.id;
    // Server `status` is single-string; if multiple selected we let
    // server return all and then narrow client-side below.
    if (filters.status.length === 1) p.status = filters.status[0];
    if (filters.ownerId !== "all") p.ownerId = Number(filters.ownerId);
    if (filters.frequency !== "all")
      p.frequency = filters.frequency as never;
    if (filters.type !== "all") p.type = filters.type as never;
    if (filters.dueWindow !== "all")
      p.dueWindow = filters.dueWindow as never;
    if (filters.search.trim()) p.search = filters.search.trim();
    if (showClosed) p.includeClosed = true;
    return p;
  }, [activeDept, filters, showClosed]);

  const { data: tasks, isLoading: tasksLoading, refetch } =
    useListOperationalTasks(queryParams);

  // When the user selects multiple statuses (e.g. Scheduled + In
  // Progress) the server can only filter on a single status, so we
  // also narrow the result set client-side. Single-select and empty
  // selection are no-ops here because queryParams already pushed them
  // to the server.
  const visibleTasks = useMemo<OperationalTask[]>(() => {
    // Apply the global team-scope filter first so the page's own
    // filters always operate against the user's currently active set
    // of teams. The server already enforces the user's max accessible
    // teams; this narrows further when the sidebar selection is a
    // strict subset.
    let list = filterByTeamScope(
      (tasks ?? []) as OperationalTask[],
      scope,
    );
    if (filters.status.length > 1) {
      const set = new Set(filters.status);
      list = list.filter((t) => set.has(t.status));
    }
    // Category is filtered client-side because the API doesn't
    // accept a `controlCategory` query param yet. Tag-style only —
    // it just narrows the visible rows, no other behavior changes.
    if (filters.controlCategory !== "all") {
      list = list.filter(
        (t) => (t.controlCategory ?? "") === filters.controlCategory,
      );
    }
    return list;
  }, [tasks, scope, filters.status, filters.controlCategory]);

  // Owner picker — load agents for whichever department is active
  // (fall back to global list when "All Operational Tasks").
  const { data: agents } = useListAgents(
    activeDept ? { departmentId: activeDept.id } : {},
  );

  // ---- Mutations ----------------------------------------------------
  const createTask = useCreateOperationalTask();
  const updateTask = useUpdateOperationalTask();
  const deleteTask = useDeleteOperationalTask();
  const completeTask = useCompleteOperationalTask();

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: getListOperationalTasksQueryKey(),
    });
  }

  // ---- Detail / create dialog state --------------------------------
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Hide from end users (also belt-and-suspenders alongside sidebar hide).
  if (sessionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!session || session.role === "end_user") {
    return <Redirect to="/" />;
  }

  // Header label that mirrors the global team-scope selector in the
  // sidebar. The page no longer renders its own picker — this is a
  // read-only echo so the user can see the active scope at a glance.
  const boardLabel = (() => {
    if (scope.loading) return "Loading…";
    if (scope.accessible.length === 0) return "No teams";
    if (scope.isAll && scope.accessible.length > 1) return "All Teams";
    if (scope.single) {
      return (
        scope.accessible.find((d) => d.id === scope.singleId)?.name ??
        "1 team"
      );
    }
    return `${scope.selectedIds.length} teams`;
  })();

  // Active filter chips: one chip per non-default filter. The chip
  // strip lives below the toolbar and lets the user clear filters one
  // at a time without opening the popover.
  const ownerLabel = (id: string) =>
    id === "all"
      ? "All owners"
      : (agents ?? []).find((a) => String(a.id) === id)?.name ?? `#${id}`;
  const dueLabel = (v: string) =>
    DUE_WINDOW_OPTIONS.find((o) => o.value === v)?.label ?? v;

  type FilterChip = {
    key: string;
    categoryLabel: string;
    valueLabel: string;
    clear: () => void;
  };
  const activeFilterChips: FilterChip[] = [];
  for (const s of filters.status) {
    activeFilterChips.push({
      key: `status:${s}`,
      categoryLabel: "Status",
      valueLabel: statusLabel(s),
      clear: () =>
        setFilter(
          "status",
          filters.status.filter((v) => v !== s),
        ),
    });
  }
  if (filters.ownerId !== "all") {
    activeFilterChips.push({
      key: "ownerId",
      categoryLabel: "Owner",
      valueLabel: ownerLabel(filters.ownerId),
      clear: () => clearFilter("ownerId"),
    });
  }
  if (filters.frequency !== "all") {
    activeFilterChips.push({
      key: "frequency",
      categoryLabel: "Frequency",
      valueLabel: freqLabel(filters.frequency),
      clear: () => clearFilter("frequency"),
    });
  }
  if (filters.type !== "all") {
    activeFilterChips.push({
      key: "type",
      categoryLabel: "Type",
      valueLabel: typeLabel(filters.type),
      clear: () => clearFilter("type"),
    });
  }
  if (filters.dueWindow !== "all") {
    activeFilterChips.push({
      key: "dueWindow",
      categoryLabel: "Due date",
      valueLabel: dueLabel(filters.dueWindow),
      clear: () => clearFilter("dueWindow"),
    });
  }
  if (filters.controlCategory !== "all") {
    activeFilterChips.push({
      key: "controlCategory",
      categoryLabel: "Category",
      valueLabel: controlCategoryLabel(filters.controlCategory),
      clear: () => clearFilter("controlCategory"),
    });
  }
  const activeFilterCount = activeFilterChips.length;
  const filtersActive =
    activeFilterCount > 0 || filters.search.trim() !== "";

  // Options shown in the right-hand pane of the filters popover for
  // the currently active category.
  function optionsForCategory(
    cat: FilterCategoryKey,
  ): Array<{ value: string; label: string }> {
    switch (cat) {
      case "status":
        return STATUS_OPTIONS.map((s) => ({ ...s }));
      case "ownerId":
        return [
          { value: "all", label: "All owners" },
          ...(agents ?? []).map((a) => ({
            value: String(a.id),
            label: a.name,
          })),
        ];
      case "frequency":
        return [
          { value: "all", label: "All frequencies" },
          ...FREQUENCY_OPTIONS.map((f) => ({ ...f })),
        ];
      case "type":
        return [
          { value: "all", label: "All types" },
          ...TYPE_OPTIONS.map((t) => ({ ...t })),
        ];
      case "dueWindow":
        return DUE_WINDOW_OPTIONS.map((d) => ({ ...d }));
      case "controlCategory":
        return [
          { value: "all", label: "All categories" },
          ...CONTROL_CATEGORY_OPTIONS.map((c) => ({ ...c })),
        ];
    }
  }

  async function handleExportPdf() {
    if (visibleTasks.length === 0) {
      toast.message("Nothing to export — no tasks match the current filters.");
      return;
    }
    try {
      await exportTasksToPdf({
        title: `Operational Tasks — ${boardLabel}`,
        columns: visibleColumns.map((k) => COLUMN_DEFS[k]),
        tasks: visibleTasks,
      });
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("Couldn’t export PDF. Please try again.");
    }
  }

  return (
    <div className="px-2 py-2 space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1
            className="flex items-center gap-1 text-[22px] font-semibold tracking-tight m-0"
            data-testid="text-operational-tasks-title"
          >
            <span>Operational Tasks</span>
            <span className="text-muted-foreground font-normal mx-1.5">
              ·
            </span>
            <span
              className="px-1.5 py-0.5 text-[22px] font-semibold"
              data-testid="text-scope-label"
            >
              {boardLabel}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            {activeDept
              ? `Recurring or one-time work for the ${activeDept.name} team — time-based, not request-based.`
              : "Recurring or one-time work that keeps the lights on — time-based, not request-based."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-tasks"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={scope.loading || scope.accessible.length === 0}
            title={
              scope.accessible.length === 0
                ? "You don't have access to any teams"
                : "Create operational task"
            }
            data-testid="button-new-operational-task"
          >
            <Plus className="h-4 w-4 mr-1" />
            New task
          </Button>
        </div>
      </header>

      {/* Toolbar: Filters | Search | (right) Export PDF | Edit Columns | Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filters popover — categorical, mirrors the Tickets pattern.
            Categories sit in a left rail; the selected category's
            options render on the right. Status is multi-select (an
            unchecked status means "don't filter on that status"). All
            other categories are single-select with an explicit
            "All …" option that maps to the default. */}
        <Popover
          open={filtersOpen}
          onOpenChange={(o) => {
            setFiltersOpen(o);
            if (o) setOptionSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              data-testid="button-filters"
            >
              <FilterIcon className="h-4 w-4" />
              <span className="font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px]"
                  data-testid="badge-filter-count"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="p-0 w-[520px]"
            data-testid="popover-filters"
          >
            <div className="flex h-[340px]">
              {/* Left: categories */}
              <div className="w-[180px] border-r bg-muted/30 py-2 overflow-y-auto">
                {FILTER_CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.key;
                  const isSet =
                    cat.key === "status"
                      ? filters.status.length > 0
                      : filters[cat.key] !== DEFAULT_FILTERS[cat.key];
                  return (
                    <button
                      key={cat.key}
                      onClick={() => {
                        setActiveCategory(cat.key);
                        setOptionSearch("");
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        isActive
                          ? "bg-background text-foreground font-medium"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      }`}
                      data-testid={`filter-category-${cat.key}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{cat.label}</span>
                        {isSet && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </button>
                  );
                })}
              </div>

              {/* Right: options for the selected category */}
              <div className="flex-1 flex flex-col">
                {activeCategory && (
                  <>
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
                        <Input
                          placeholder="Search…"
                          value={optionSearch}
                          onChange={(e) => setOptionSearch(e.target.value)}
                          className="pl-8 h-9"
                          data-testid="input-filter-options-search"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                      {optionsForCategory(activeCategory)
                        .filter((o) =>
                          o.label
                            .toLowerCase()
                            .includes(optionSearch.toLowerCase()),
                        )
                        .map((opt) => {
                          // Status is multi-select; everything else is
                          // a single value with an explicit "all" reset.
                          const checked =
                            activeCategory === "status"
                              ? filters.status.includes(opt.value)
                              : (filters[activeCategory] as string) ===
                                opt.value;
                          return (
                            <label
                              key={opt.value}
                              className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                              data-testid={`filter-option-${activeCategory}-${opt.value}`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  if (activeCategory === "status") {
                                    const next = v
                                      ? Array.from(
                                          new Set([
                                            ...filters.status,
                                            opt.value,
                                          ]),
                                        )
                                      : filters.status.filter(
                                          (s) => s !== opt.value,
                                        );
                                    setFilter("status", next);
                                    return;
                                  }
                                  setFilter(
                                    activeCategory,
                                    (v
                                      ? opt.value
                                      : DEFAULT_FILTERS[
                                          activeCategory
                                        ]) as never,
                                  );
                                }}
                                className="h-4 w-4"
                              />
                              <span className="truncate">{opt.label}</span>
                            </label>
                          );
                        })}
                      {optionsForCategory(activeCategory).length === 0 && (
                        <p className="px-3 py-3 text-sm text-muted-foreground">
                          No options available.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={clearAllFilters}
                disabled={!filtersActive}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={() => setFiltersOpen(false)}
                data-testid="button-apply-filters"
              >
                Done
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 min-w-[220px] max-w-[420px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search tasks…"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search-tasks"
          />
        </div>

        <div className="flex-1" />

        {/* Show closed toggle — closed tasks (auto-promoted from
            completed one_time tasks after 24h) are hidden by default.
            Mirrors the Tickets page convention. */}
        <div
          className="flex items-center gap-2 h-9 px-2 rounded border border-input"
          data-testid="show-closed-toggle"
        >
          <Switch
            id="show-closed"
            checked={showClosed}
            onCheckedChange={setShowClosed}
            data-testid="switch-show-closed"
          />
          <Label
            htmlFor="show-closed"
            className="text-sm font-medium cursor-pointer"
          >
            Show closed
          </Label>
        </div>

        {/* Export PDF — exports the rows currently on screen (after
            filters and search) using the user's chosen visible columns
            and order. Disabled when there is nothing to export. */}
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={handleExportPdf}
          disabled={visibleTasks.length === 0}
          data-testid="button-export-pdf"
        >
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>

        {/* Edit Columns — toggle visibility and reorder the table
            columns. Choices persist per-user via localStorage. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 gap-2"
              data-testid="button-manage-columns"
            >
              <Columns3 className="h-4 w-4" />
              Edit Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Visible columns — drag to reorder
            </div>
            <DraggableColumnList
              items={visibleColumns.map((key) => ({
                key,
                label: COLUMN_DEFS[key].label,
                alwaysVisible: COLUMN_DEFS[key].alwaysVisible,
              }))}
              onReorder={(next) =>
                setVisibleColumns(next as typeof visibleColumns)
              }
              onHide={(key) =>
                setVisibleColumns((prev) => prev.filter((k) => k !== key))
              }
            />

            {(() => {
              const hidden = ALL_COLUMN_KEYS.filter(
                (k) => !visibleColumns.includes(k),
              );
              if (hidden.length === 0) return null;
              return (
                <>
                  <Separator className="my-2" />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Hidden columns
                  </div>
                  <div className="space-y-0.5">
                    {hidden.map((key) => {
                      const def = COLUMN_DEFS[key];
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer"
                          data-testid={`column-row-${key}`}
                        >
                          <Checkbox
                            checked={false}
                            onCheckedChange={(v) => {
                              if (!v) return;
                              setVisibleColumns((prev) =>
                                Array.from(new Set([...prev, key])),
                              );
                            }}
                            data-testid={`column-toggle-${key}`}
                          />
                          <span className="flex-1 truncate">{def.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            <Separator className="my-2" />
            <div className="flex items-center justify-between px-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setVisibleColumns(ALL_COLUMN_KEYS)}
                data-testid="button-columns-show-all"
              >
                Show all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
                }
                data-testid="button-columns-reset"
              >
                Reset
              </Button>
            </div>
          </PopoverContent>
        </Popover>

      </div>

      {/* Active filter chip strip */}
      {activeFilterChips.length > 0 && (
        <div
          className="flex items-center gap-2 flex-wrap -mt-2"
          data-testid="active-filter-chips"
        >
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-muted text-xs font-medium"
              data-testid={`chip-${chip.key}`}
            >
              <span className="text-muted-foreground">
                {chip.categoryLabel}:
              </span>
              <span className="text-foreground">{chip.valueLabel}</span>
              <button
                onClick={chip.clear}
                className="ml-0.5 h-5 w-5 rounded-full hover:bg-background/80 flex items-center justify-center"
                aria-label={`Clear ${chip.categoryLabel} filter`}
                data-testid={`chip-${chip.key}-clear`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={clearAllFilters}
            data-testid="button-clear-all-chips"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Table — driven by visibleColumns so it reflects whatever the
          user picked in the Edit Columns popover. */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((key) => {
                const def = COLUMN_DEFS[key];
                return (
                  <TableHead key={key} className={def.className}>
                    {def.label}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasksLoading ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : visibleTasks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="text-center text-sm text-muted-foreground py-10"
                >
                  {filtersActive
                    ? "No tasks match these filters."
                    : "No operational tasks yet. Use “New task” to add one."}
                </TableCell>
              </TableRow>
            ) : (
              visibleTasks.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailId(t.id)}
                  data-testid={`row-operational-task-${t.id}`}
                >
                  {visibleColumns.map((key) => (
                    <TableCell
                      key={key}
                      className={
                        key === "name"
                          ? "font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {renderCell(key, t)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createOpen && scope.accessible.length > 0 && (
        <CreateTaskDialog
          scope={scope}
          agents={agents ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
          createTask={createTask}
        />
      )}

      {detailId != null && (
        <TaskDetailDialog
          taskId={detailId}
          agents={agents ?? []}
          onClose={() => setDetailId(null)}
          onMutated={refresh}
          updateTask={updateTask}
          deleteTask={deleteTask}
          completeTask={completeTask}
        />
      )}
    </div>
  );
}

// ---- Create dialog ------------------------------------------------

function CreateTaskDialog({
  scope,
  agents,
  onClose,
  onCreated,
  createTask,
}: {
  scope: ReturnType<typeof useTeamScope>;
  agents: Array<{ id: number; name: string }>;
  onClose: () => void;
  onCreated: () => void;
  createTask: ReturnType<typeof useCreateOperationalTask>;
}) {
  // Operational tasks have a non-nullable departmentId. When scope is
  // narrowed to a single team we auto-bind to it and hide the picker;
  // otherwise the user must explicitly choose which team owns the new
  // task from their currently-active scope.
  const teamOptions = useMemo(() => {
    if (scope.isAll) return scope.accessible;
    const set = new Set(scope.selectedIds);
    return scope.accessible.filter((d) => set.has(d.id));
  }, [scope.isAll, scope.selectedIds, scope.accessible]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"recurring" | "one_time">("recurring");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [nextDueDate, setNextDueDate] = useState<string>(todayYmd());
  const [ownerId, setOwnerId] = useState<string>("none");
  const [controlCategory, setControlCategory] = useState<string>("none");
  const [departmentId, setDepartmentId] = useState<string>(() =>
    scope.single && scope.singleId != null ? String(scope.singleId) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const owningTeam = scope.single
    ? scope.accessible.find((d) => d.id === scope.singleId) ?? null
    : null;

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!nextDueDate) {
      setError("Next due date is required");
      return;
    }
    const resolvedDeptId = scope.single
      ? scope.singleId
      : departmentId
        ? Number(departmentId)
        : null;
    if (resolvedDeptId == null) {
      setError("Team is required");
      return;
    }
    try {
      await createTask.mutateAsync({
        data: {
          departmentId: resolvedDeptId,
          name: name.trim(),
          description: description.trim(),
          type,
          frequency: type === "recurring" ? (frequency as never) : null,
          nextDueDate,
          ownerId: ownerId === "none" ? null : Number(ownerId),
          controlCategory:
            controlCategory === "none" ? null : (controlCategory as never),
        },
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New operational task</DialogTitle>
          <DialogDescription>
            Time-based work for this team. Recurring tasks automatically
            create the next instance when completed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {scope.single && owningTeam ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
              data-testid="chip-owning-team"
            >
              <span className="text-muted-foreground">Owning team:</span>
              <span className="font-medium">{owningTeam.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="op-task-team">Team</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => setDepartmentId(v)}
              >
                <SelectTrigger
                  id="op-task-team"
                  data-testid="select-new-task-team"
                >
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="op-task-name">Name</Label>
            <Input
              id="op-task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-new-task-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-task-desc">Description</Label>
            <Textarea
              id="op-task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this task and why does it exist?"
              data-testid="input-new-task-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as never)}
              >
                <SelectTrigger data-testid="select-new-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === "recurring" && (
              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger data-testid="select-new-task-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="op-task-due">Next due date</Label>
              <Input
                id="op-task-due"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                data-testid="input-new-task-due"
              />
            </div>
            <div className="space-y-1">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger data-testid="select-new-task-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Category (optional)</Label>
            <Select
              value={controlCategory}
              onValueChange={setControlCategory}
            >
              <SelectTrigger data-testid="select-new-task-control-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {CATEGORY_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.values.map((v) => (
                      <SelectItem key={v} value={v}>
                        {controlCategoryLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Tag this task with a category (Operations, Maintenance,
              Security, etc.) for context and reporting. Category is
              informational only — it doesn’t affect status or workflow.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="text-create-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createTask.isPending}
            data-testid="button-submit-new-task"
          >
            {createTask.isPending ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Detail dialog ------------------------------------------------

import { useGetOperationalTask } from "@workspace/api-client-react";

function TaskDetailDialog({
  taskId,
  agents,
  onClose,
  onMutated,
  updateTask,
  deleteTask,
  completeTask,
}: {
  taskId: number;
  agents: Array<{ id: number; name: string }>;
  onClose: () => void;
  onMutated: () => void;
  updateTask: ReturnType<typeof useUpdateOperationalTask>;
  deleteTask: ReturnType<typeof useDeleteOperationalTask>;
  completeTask: ReturnType<typeof useCompleteOperationalTask>;
}) {
  const { data: task, refetch } = useGetOperationalTask(taskId);
  const [error, setError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);

  // Time entries + activity log are loaded alongside the task.
  // The hooks already gate on `!!id` internally, so we don't need to
  // pass any options — taskId is always > 0 when this dialog renders.
  const { data: timeEntries, refetch: refetchTimeEntries } =
    useListOperationalTaskTimeEntries(taskId);
  const { data: activity, refetch: refetchActivity } =
    useListOperationalTaskActivity(taskId);

  const createTimeEntry = useCreateOperationalTaskTimeEntry();
  const deleteTimeEntry = useDeleteOperationalTaskTimeEntry();

  if (!task) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-3xl">
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading…
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- Lock model -------------------------------------------------
  // `closed` is the new terminal state — once a task is closed the
  // entire dialog is read-only (no edits, no checklist toggles, no
  // time logging, no deletion). `completed` is a softer state: most
  // metadata (name, description, type, freq, control category) stays
  // editable so people can correct typos after the fact, but the
  // due date / owner / status are pinned because they describe the
  // completed instance.
  const isClosed = task.status === "closed";
  const isCompleted = task.status === "completed";
  const lockAll = isClosed; // hard read-only

  async function patch(patchData: Parameters<
    typeof updateTask.mutateAsync
  >[0]["data"]) {
    setError(null);
    try {
      await updateTask.mutateAsync({ id: taskId, data: patchData });
      await Promise.all([refetch(), refetchActivity()]);
      onMutated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddChecklistItem() {
    const next = [
      ...(task!.checklist ?? []),
      { id: "", text: "New step", done: false },
    ];
    await patch({ checklist: next as never });
  }

  async function handleToggleChecklist(index: number, done: boolean) {
    const next = (task!.checklist ?? []).map((it, i) =>
      i === index ? { ...it, done } : it,
    );
    await patch({ checklist: next as never });
  }

  async function handleEditChecklist(
    index: number,
    field: "text" | "assigneeId" | "dueDate",
    value: string | number | null,
  ) {
    const next = (task!.checklist ?? []).map((it, i) =>
      i === index ? { ...it, [field]: value } : it,
    );
    await patch({ checklist: next as never });
  }

  async function handleRemoveChecklist(index: number) {
    const next = (task!.checklist ?? []).filter((_, i) => i !== index);
    await patch({ checklist: next as never });
  }

  async function handleComplete() {
    setError(null);
    try {
      // The API returns both the just-completed task and (for
      // recurring tasks) the auto-spawned next instance. Surface that
      // through a toast so the user can see exactly when the next
      // occurrence will land — otherwise the new instance just
      // appears in the list with no explanation.
      const result = await completeTask.mutateAsync({ id: taskId });
      const next = result?.nextInstance;
      if (next) {
        toast.success(
          `Marked complete. Next instance scheduled for ${formatDate(
            next.nextDueDate,
          )}.`,
        );
      } else {
        toast.success("Marked complete.");
      }
      onMutated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      await deleteTask.mutateAsync({ id: taskId });
      onMutated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Editable name. We keep the title visually prominent
                  but swap to an inline input so people can rename the
                  task in place. Closed tasks render as static text. */}
              {lockAll ? (
                <DialogTitle className="flex items-center gap-2">
                  <span className="truncate">{task.name}</span>
                </DialogTitle>
              ) : (
                <Input
                  defaultValue={task.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== task.name) patch({ name: v });
                  }}
                  className="h-9 text-base font-semibold"
                  data-testid="input-task-name"
                />
              )}
              <DialogDescription className="mt-1 flex items-center gap-2 text-xs">
                <span>{task.departmentName}</span>
                <StatusBadge
                  status={task.status}
                  isOverdue={task.isOverdue}
                />
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Closed banner. Once a task is closed it freezes — we make
            the read-only nature obvious so people don't think edits
            are silently failing. */}
        {lockAll && (
          <div
            className="flex items-center gap-2 rounded border border-muted-foreground/30 bg-muted/40 p-2 text-xs text-muted-foreground"
            data-testid="banner-task-closed"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>
              This task is closed and cannot be edited. Closed tasks
              are kept for the audit trail.
            </span>
          </div>
        )}

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            {lockAll ? (
              <p className="mt-0.5">{typeLabel(task.type)}</p>
            ) : (
              <Select
                value={task.type}
                onValueChange={(v) => {
                  // Switching one-time → recurring needs a frequency;
                  // default to the previous freq or "monthly" so the
                  // server doesn't reject the edit.
                  if (v === "recurring") {
                    patch({
                      type: "recurring",
                      frequency: (task.frequency ?? "monthly") as never,
                    });
                  } else {
                    patch({ type: "one_time", frequency: null });
                  }
                }}
              >
                <SelectTrigger
                  className="h-8 mt-0.5"
                  data-testid="select-task-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            {lockAll || task.type === "one_time" ? (
              <p className="mt-0.5">{freqLabel(task.frequency)}</p>
            ) : (
              <Select
                value={task.frequency ?? "monthly"}
                onValueChange={(v) => patch({ frequency: v as never })}
              >
                <SelectTrigger
                  className="h-8 mt-0.5"
                  data-testid="select-task-frequency"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Next Due Date
            </Label>
            {lockAll || isCompleted ? (
              <p className="mt-0.5">{formatDate(task.nextDueDate)}</p>
            ) : (
              <Input
                type="date"
                value={task.nextDueDate}
                onChange={(e) => patch({ nextDueDate: e.target.value })}
                className="h-8 mt-0.5"
                data-testid="input-task-due-date"
              />
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Owner</Label>
            {lockAll || isCompleted ? (
              <p className="mt-0.5">{task.ownerName ?? "Unassigned"}</p>
            ) : (
              <Select
                value={task.ownerId == null ? "none" : String(task.ownerId)}
                onValueChange={(v) =>
                  patch({ ownerId: v === "none" ? null : Number(v) })
                }
              >
                <SelectTrigger
                  className="h-8 mt-0.5"
                  data-testid="select-task-owner"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Category
            </Label>
            {lockAll ? (
              <p className="mt-0.5">
                {controlCategoryLabel(task.controlCategory)}
              </p>
            ) : (
              <Select
                value={task.controlCategory ?? "none"}
                onValueChange={(v) =>
                  patch({
                    controlCategory:
                      v === "none" ? null : (v as never),
                  })
                }
              >
                <SelectTrigger
                  className="h-8 mt-0.5"
                  data-testid="select-task-control-category"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CATEGORY_GROUPS.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.values.map((v) => (
                        <SelectItem key={v} value={v}>
                          {controlCategoryLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            {lockAll || isCompleted ? (
              <p className="mt-0.5">
                {isClosed
                  ? "Closed"
                  : `Completed${
                      task.completedAt
                        ? ` on ${formatDate(task.completedAt.slice(0, 10))}`
                        : ""
                    }${
                      task.completedByName
                        ? ` by ${task.completedByName}`
                        : ""
                    }`}
              </p>
            ) : (
              <Select
                value={task.status}
                onValueChange={(v) =>
                  patch({ status: v as "scheduled" | "in_progress" })
                }
              >
                <SelectTrigger
                  className="h-8 mt-0.5"
                  data-testid="select-task-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label htmlFor="task-desc" className="text-xs text-muted-foreground">
            Description — what this task is and why it exists
          </Label>
          {lockAll ? (
            <p
              className="text-sm whitespace-pre-wrap rounded bg-muted/30 p-2"
              data-testid="text-task-description"
            >
              {task.description || "—"}
            </p>
          ) : (
            <Textarea
              id="task-desc"
              defaultValue={task.description}
              onBlur={(e) => {
                if (e.target.value !== task.description) {
                  patch({ description: e.target.value });
                }
              }}
              rows={3}
              data-testid="input-task-description"
            />
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Checklist</Label>
            {!lockAll && !isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddChecklistItem}
                data-testid="button-add-checklist"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add step
              </Button>
            )}
          </div>
          {(task.checklist ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No checklist items yet.
            </p>
          ) : (
            <div className="space-y-2">
              {(task.checklist ?? []).map((it, i) => (
                <div
                  key={it.id || i}
                  className="flex items-start gap-2 rounded border p-2"
                  data-testid={`checklist-item-${i}`}
                >
                  <Checkbox
                    checked={it.done}
                    disabled={lockAll || isCompleted}
                    onCheckedChange={(v) =>
                      handleToggleChecklist(i, v === true)
                    }
                    className="mt-1"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-2">
                    <div className="flex flex-col gap-1">
                      <Input
                        defaultValue={it.text}
                        onBlur={(e) => {
                          if (e.target.value !== it.text) {
                            handleEditChecklist(i, "text", e.target.value);
                          }
                        }}
                        disabled={lockAll || isCompleted}
                        className="h-8"
                        data-testid={`input-checklist-text-${i}`}
                      />
                      {it.completedAt && (
                        <span
                          className="text-[11px] text-emerald-700 dark:text-emerald-400"
                          data-testid={`text-checklist-completed-${i}`}
                        >
                          Completed{" "}
                          {new Date(it.completedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <Select
                      value={
                        it.assigneeId == null ? "none" : String(it.assigneeId)
                      }
                      onValueChange={(v) =>
                        handleEditChecklist(
                          i,
                          "assigneeId",
                          v === "none" ? null : Number(v),
                        )
                      }
                      disabled={lockAll || isCompleted}
                    >
                      <SelectTrigger
                        className="h-8"
                        data-testid={`select-checklist-assignee-${i}`}
                      >
                        <SelectValue placeholder="Assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      defaultValue={it.dueDate ?? ""}
                      onBlur={(e) =>
                        handleEditChecklist(
                          i,
                          "dueDate",
                          e.target.value || null,
                        )
                      }
                      disabled={lockAll || isCompleted}
                      className="h-8"
                      data-testid={`input-checklist-due-${i}`}
                    />
                  </div>
                  {!lockAll && !isCompleted && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveChecklist(i)}
                      data-testid={`button-remove-checklist-${i}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Time entries — minutes spent on this task. Rolls up into
            the user's timesheet. */}
        <TaskTimeEntriesSection
          taskId={taskId}
          entries={timeEntries ?? []}
          createTimeEntry={createTimeEntry}
          deleteTimeEntry={deleteTimeEntry}
          onChanged={async () => {
            await Promise.all([refetchTimeEntries(), refetchActivity()]);
          }}
          locked={lockAll}
        />

        {/* Activity log — immutable audit trail of every change. */}
        <TaskActivitySection entries={activity ?? []} />

        {error && (
          <p className="text-sm text-destructive" data-testid="text-detail-error">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!lockAll && !isCompleted && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                data-testid="button-delete-task"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {!lockAll && !isCompleted &&
              (confirmComplete ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmComplete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={completeTask.isPending}
                    data-testid="button-confirm-complete-task"
                  >
                    {task.type === "recurring"
                      ? "Complete & schedule next"
                      : "Complete (final)"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    if (task.type === "one_time") {
                      setConfirmComplete(true);
                    } else {
                      handleComplete();
                    }
                  }}
                  disabled={completeTask.isPending}
                  data-testid="button-complete-task"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark complete
                </Button>
              ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Time entries section -----------------------------------------
//
// Lets people log work against a task. Each entry is a (start, end,
// note) tuple, automatically rounded up to the nearest 15 minutes
// server-side. Entries roll up into the Timesheets page.
//
// We keep this compact: a small "Log time" form on top, then a list
// of existing entries with a per-row delete (own entries only).

function TaskTimeEntriesSection({
  taskId,
  entries,
  createTimeEntry,
  deleteTimeEntry,
  onChanged,
  locked,
}: {
  taskId: number;
  entries: OperationalTaskTimeEntry[];
  createTimeEntry: ReturnType<typeof useCreateOperationalTaskTimeEntry>;
  deleteTimeEntry: ReturnType<typeof useDeleteOperationalTaskTimeEntry>;
  onChanged: () => Promise<void> | void;
  locked: boolean;
}) {
  const todayStr = todayYmd();
  // Default to "now" rounded to the previous quarter hour for the
  // start, and "now" for the end — most people log time right after
  // finishing a chunk of work.
  const [startAt, setStartAt] = useState<string>(
    `${todayStr}T${roundedNowQuarterHour()}`,
  );
  const [endAt, setEndAt] = useState<string>(
    `${todayStr}T${currentTimeHHMM()}`,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  async function handleAdd() {
    setError(null);
    if (!startAt || !endAt) {
      setError("Start and end are required.");
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setError("End time must be after start time.");
      return;
    }
    try {
      await createTimeEntry.mutateAsync({
        id: taskId,
        data: {
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          note: note.trim(),
        },
      });
      setNote("");
      await onChanged();
      toast.success("Time logged.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(entryId: number) {
    if (!confirm("Delete this time entry?")) return;
    try {
      await deleteTimeEntry.mutateAsync({ id: taskId, entryId });
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-2" data-testid="section-time-entries">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" />
          Time entries
        </Label>
        <span className="text-xs text-muted-foreground">
          Total: <strong>{formatMinutes(totalMinutes)}</strong>
        </span>
      </div>

      {!locked && (
        <div className="rounded border p-2 space-y-2 bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2">
            <div className="space-y-1">
              <Label
                htmlFor="te-start"
                className="text-[11px] text-muted-foreground"
              >
                Start
              </Label>
              <Input
                id="te-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="h-8"
                data-testid="input-time-entry-start"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="te-end"
                className="text-[11px] text-muted-foreground"
              >
                End
              </Label>
              <Input
                id="te-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="h-8"
                data-testid="input-time-entry-end"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="te-note"
                className="text-[11px] text-muted-foreground"
              >
                Note (optional)
              </Label>
              <Input
                id="te-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you do?"
                className="h-8"
                data-testid="input-time-entry-note"
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={createTimeEntry.isPending}
                data-testid="button-add-time-entry"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Log
              </Button>
            </div>
          </div>
          {error && (
            <p
              className="text-xs text-destructive"
              data-testid="text-time-entry-error"
            >
              {error}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Time is rounded up to the nearest 15 minutes. Entries roll
            up into your timesheet.
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No time entries yet.
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-2 rounded border p-2 text-sm"
              data-testid={`time-entry-${e.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {formatMinutes(e.durationMinutes)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.userName} ·{" "}
                    {new Date(e.startAt).toLocaleString()} →{" "}
                    {new Date(e.endAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {e.note && (
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {e.note}
                  </p>
                )}
              </div>
              {!locked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(e.id)}
                  data-testid={`button-delete-time-entry-${e.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Activity log section -----------------------------------------
//
// Read-only audit trail. Server is the single source of truth — it
// writes entries on every meaningful mutation (create, status changes,
// owner reassignment, completion, closure, checklist toggles, time
// entry CRUD, deletion). The dialog just renders them.

function TaskActivitySection({
  entries,
}: {
  entries: OperationalTaskActivity[];
}) {
  return (
    <div className="space-y-2" data-testid="section-activity-log">
      <Label className="text-xs text-muted-foreground">Activity log</Label>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No activity yet.
        </p>
      ) : (
        <div className="rounded border divide-y max-h-56 overflow-y-auto">
          {entries.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-2 px-2 py-1.5 text-xs"
              data-testid={`activity-entry-${a.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {a.userName ?? "System"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatActivity(a)}
                  </span>
                </div>
              </div>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(a.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Map server-side action codes into a short human description.
// Falls back to the raw action string so future additions still
// render usefully without a UI change.
function formatActivity(a: OperationalTaskActivity): string {
  const d = (a.details ?? {}) as Record<string, unknown>;
  switch (a.action) {
    case "created":
      return "created this task";
    case "name_changed":
      return `renamed task to "${String(d.to ?? "")}"`;
    case "description_changed":
      return "edited the description";
    case "type_changed":
      return `changed type to ${typeLabel(String(d.to ?? "") as never)}`;
    case "frequency_changed":
      return `changed frequency to ${freqLabel(
        (d.to ?? null) as never,
      )}`;
    case "due_date_changed":
      return `changed due date to ${formatDate(String(d.to ?? ""))}`;
    case "owner_reassigned":
      return d.toName
        ? `reassigned to ${String(d.toName)}`
        : "unassigned the owner";
    case "status_changed":
      return `changed status to ${statusLabel(String(d.to ?? ""))}`;
    case "control_category_changed":
      return `set category to ${controlCategoryLabel(
        (d.to ?? null) as never,
      )}`;
    case "checklist_item_added":
      return `added checklist step "${String(d.text ?? "")}"`;
    case "checklist_item_removed":
      return `removed checklist step "${String(d.text ?? "")}"`;
    case "checklist_item_completed":
      return `completed checklist step "${String(d.text ?? "")}"`;
    case "checklist_item_unchecked":
      return `un-checked checklist step "${String(d.text ?? "")}"`;
    case "completed":
      return "marked the task complete";
    case "closed":
      return d.reason === "auto_close_after_24h"
        ? "auto-closed after 24h"
        : "closed the task";
    case "deleted":
      return "deleted the task";
    case "time_logged":
      return `logged ${formatMinutes(Number(d.durationMinutes ?? 0))}`;
    case "time_edited":
      return `edited a time entry`;
    case "time_deleted":
      return `deleted a time entry`;
    default:
      return a.action.replace(/_/g, " ");
  }
}

// Format minutes as "Xh Ym" for tight column display.
function formatMinutes(m: number): string {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

function currentTimeHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

// Round the current time *down* to the previous quarter hour so the
// "Start" picker default is a sensible boundary. Server still
// rounds the resulting duration up to the next 15-minute increment.
function roundedNowQuarterHour(): string {
  const d = new Date();
  const m = Math.floor(d.getMinutes() / 15) * 15;
  return `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(
    2,
    "0",
  )}`;
}


// ---- Export to PDF -------------------------------------------------
//
// Generates a simple table-style PDF of the rows currently visible in
// the table (after filters + search) using whichever columns the user
// has chosen and in their order. The @react-pdf/renderer module is
// loaded lazily so the page doesn't pay its 300KB+ cost until the
// user actually clicks "Export PDF".

async function exportTasksToPdf({
  title,
  columns,
  tasks,
}: {
  title: string;
  columns: ColumnDef[];
  tasks: OperationalTask[];
}): Promise<void> {
  if (tasks.length === 0) return;
  const mod = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, StyleSheet, pdf } = mod;
  const styles = StyleSheet.create({
    page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
    title: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
    meta: { fontSize: 9, color: "#666", marginBottom: 12 },
    headerRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#222",
      paddingBottom: 4,
      marginBottom: 4,
    },
    headerCell: { fontSize: 9, fontWeight: 700 },
    row: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#ddd",
      paddingTop: 4,
      paddingBottom: 4,
    },
    cell: { fontSize: 9, paddingRight: 6 },
    footer: {
      position: "absolute",
      bottom: 16,
      left: 28,
      right: 28,
      textAlign: "center",
      fontSize: 8,
      color: "#888",
    },
  });

  // Equal-weight columns for simplicity; long descriptions just wrap
  // within their flex column.
  const colWidth = `${100 / columns.length}%`;
  const generated = new Date().toLocaleString();

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"} · Generated{" "}
          {generated}
        </Text>
        <View style={styles.headerRow} fixed>
          {columns.map((c) => (
            <View
              key={c.key}
              style={{ width: colWidth, paddingRight: 6 }}
            >
              <Text style={styles.headerCell}>{c.label}</Text>
            </View>
          ))}
        </View>
        {tasks.map((t) => (
          // Allow long-description rows to flow across page breaks —
          // wrap={false} would clip them. react-pdf will split a row
          // between pages when the cell text wraps beyond a single page.
          <View key={t.id} style={styles.row}>
            {columns.map((c) => (
              <View key={c.key} style={{ width: colWidth }}>
                <Text style={styles.cell}>{c.text(t) || "—"}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `operational-tasks-${stamp}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
