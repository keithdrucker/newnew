import type { Ticket } from "@workspace/api-client-react";
import type { ReactNode } from "react";
import {
  useListTickets,
  useGetSession,
  useListDepartments,
  useListAgents,
  useListPeople,
  useListTicketViews,
  useCreateTicketView,
  useUpdateTicketView,
  useDeleteTicketView,
  useUpdateMePreferences,
  useUpdateTicket,
  useListRiskRules,
  getListTicketViewsQueryKey,
  getGetSessionQueryKey,
  getListTicketsQueryKey,
} from "@workspace/api-client-react";
import { Link, useRoute, useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Columns3,
  Download,
  Filter as FilterIcon,
  Inbox,
  MoreHorizontal,
  Pause,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { CreateTicketDialog } from "@/components/create-ticket-dialog";
import { SlaCountdown } from "@/components/sla-countdown";

type SortField =
  | "id"
  | "created"
  | "updated"
  | "priority"
  | "risk"
  | "level"
  | "assignee"
  | "user"
  | "status"
  | "title"
  | "category"
  | "sla";
type SortDir = "asc" | "desc";

type ColumnKey =
  | "id"
  | "priority"
  | "riskLevel"
  | "status"
  | "title"
  | "user"
  | "supportLevel"
  | "agent"
  | "category"
  | "created"
  | "updated"
  | "sla";

const ALL_COLUMN_KEYS: ColumnKey[] = [
  "id",
  "priority",
  "riskLevel",
  "status",
  "title",
  "user",
  "supportLevel",
  "agent",
  "category",
  "created",
  "updated",
  "sla",
];

const COLUMN_VISIBILITY_KEY = "itsm.tickets.visibleColumns";

// Static column metadata (label, sort field, width, alwaysVisible). Renderers
// live inside the component because they reference helper functions that
// close over component-local state.
const COLUMN_DEFS_META: Record<
  ColumnKey,
  {
    label: string;
    width?: string;
    sortField?: SortField;
    alwaysVisible?: boolean;
  }
> = {
  id: { label: "ID", width: "w-[100px]", sortField: "id", alwaysVisible: true },
  priority: { label: "Priority", width: "w-[110px]", sortField: "priority" },
  riskLevel: { label: "Risk Level", width: "w-[120px]", sortField: "risk" },
  status: { label: "Status", width: "w-[130px]", sortField: "status" },
  title: { label: "Title", sortField: "title", alwaysVisible: true },
  user: { label: "User", width: "w-[170px]", sortField: "user" },
  supportLevel: { label: "Level", width: "w-[90px]", sortField: "level" },
  agent: { label: "Agent", width: "w-[170px]", sortField: "assignee" },
  category: { label: "Category", width: "w-[150px]", sortField: "category" },
  created: { label: "Created", width: "w-[120px]", sortField: "created" },
  updated: {
    label: "Last Update",
    width: "w-[120px]",
    sortField: "updated",
  },
  sla: { label: "SLA", width: "w-[140px]", sortField: "sla" },
};

type DateRange = "all" | "today" | "week" | "month";
type TriState = "all" | "yes" | "no";

// 8-state ticket workflow. The four "active" statuses (new..scheduled) plus
// the two terminal ones (resolved, closed). Default views hide resolved /
// closed so agents land on a focused work queue.
const ALL_STATUSES = [
  "new",
  "in_progress",
  "with_user",
  "with_vendor",
  "on_hold",
  "scheduled",
  "resolved",
  "closed",
] as const;
const ACTIVE_STATUSES: readonly string[] = [
  "new",
  "in_progress",
  "with_user",
  "with_vendor",
  "on_hold",
  "scheduled",
  "resolved",
];

type Filters = {
  search: string;
  // Multi-select: array of status strings. Empty array = no status filter
  // (i.e. show every status). DEFAULT_FILTERS pre-populates with the six
  // active statuses so resolved/closed are hidden by default.
  status: string[];
  priority: string; // "all" | low | medium | high | urgent
  riskLevel: string; // "all" | low | medium | high | critical
  supportLevel: string; // "all" | "1" | "2" | "3"
  assigneeId: string; // "all" | "unassigned" | numeric id
  category: string; // "all" | category name
  slaStatus: string; // "all" | "on_track" | "breached"
  hasRootCause: TriState;
  hasResolution: TriState;
  createdRange: DateRange;
  updatedRange: DateRange;
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: [...ACTIVE_STATUSES],
  priority: "all",
  riskLevel: "all",
  supportLevel: "all",
  assigneeId: "all",
  category: "all",
  slaStatus: "all",
  hasRootCause: "all",
  hasResolution: "all",
  createdRange: "all",
  updatedRange: "all",
};

// Compare two arrays of statuses as sets, since order doesn't matter for
// filter equivalence checks (chip strip, dirty detection).
function sameStatusSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  with_user: "With User",
  with_vendor: "With Vendor",
  on_hold: "On Hold",
  scheduled: "Scheduled",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const RISK_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function rangeToAfter(range: DateRange): string | undefined {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (range === "month") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  return undefined;
}

export default function Tickets() {
  const { data: session } = useGetSession();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/tickets/dept/:slug");
  const [, setLocation] = useLocation();
  const deptSlug = params?.slug ?? null;

  const { data: departments } = useListDepartments({ scope: "accessible" });
  const dept = deptSlug
    ? (departments?.find((d) => d.slug === deptSlug) ?? null)
    : null;

  const { data: agents } = useListAgents();
  const { data: people } = useListPeople();
  const { data: views } = useListTicketViews();
  const { data: riskRules } = useListRiskRules();
  const createView = useCreateTicketView();
  const updateView = useUpdateTicketView();
  const updateTicket = useUpdateTicket();
  const canTriage =
    session?.role === "admin" || session?.role === "agent";

  // Selection state — used both by the per-row checkboxes (for the
  // Export CSV "Selected vs All" choice) and as a hint for the
  // selection-status strip. Cleared on department change, pruned to
  // visible ids whenever the working set changes.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(),
  );

  // Single-cell PATCH used by the inline-edit popovers. The generated
  // mutation hook does not invalidate the tickets cache on its own, so
  // we explicitly invalidate every `listTickets` query (regardless of
  // its `params` suffix) after a successful PATCH so the table re-reads
  // the row and reflects the new value.
  async function patchTicket(id: number, data: Record<string, unknown>) {
    const result = await updateTicket.mutateAsync({
      id,
      data: data as never,
    });
    await queryClient.invalidateQueries({
      queryKey: getListTicketsQueryKey(),
    });
    return result;
  }
  const deleteView = useDeleteTicketView();
  const updatePreferences = useUpdateMePreferences();

  // If the user lands on the bare /tickets page (e.g. via direct URL or page
  // refresh) and has a default ticket board configured, redirect to that
  // board. The "All Tickets" sidebar link and the dropdown's "All" option
  // navigate with `?all=1`, which is an explicit signal to skip the
  // redirect and show every department.
  const explicitlyAllTickets =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("all") === "1";
  useEffect(() => {
    if (deptSlug) return;
    if (explicitlyAllTickets) return;
    if (!session || !departments) return;
    const slug = session.defaultTicketBoard;
    if (!slug) return;
    if (departments.some((d) => d.slug === slug)) {
      setLocation(`/tickets/dept/${slug}`, { replace: true });
    }
  }, [deptSlug, explicitlyAllTickets, session, departments, setLocation]);

  async function handleChangeBoard(value: string) {
    if (value === "all") {
      setLocation("/tickets?all=1");
    } else {
      setLocation(`/tickets/dept/${value}`);
    }
  }
  async function handleSetDefaultBoard(value: string) {
    const next = value === "all" ? null : value;
    await updatePreferences.mutateAsync({
      data: { defaultTicketBoard: next },
    });
    await queryClient.invalidateQueries({
      queryKey: getGetSessionQueryKey(),
    });
  }

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Snapshot of the status filter taken right before the user enters
  // closed-only mode, so toggling back restores their prior selection
  // (e.g. a saved view) instead of clobbering it with the default set.
  const preClosedStatusRef = useRef<string[] | null>(null);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "created",
    dir: "desc",
  });
  // Visible columns are user-controlled via the "Columns" popover and
  // persisted in localStorage. ID and Title are always visible so the user
  // can never lose access to the row link or the headline summary.
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return ALL_COLUMN_KEYS;
    try {
      const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (!raw) return ALL_COLUMN_KEYS;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return ALL_COLUMN_KEYS;
      const filtered = parsed.filter((k): k is ColumnKey =>
        ALL_COLUMN_KEYS.includes(k as ColumnKey),
      );
      // Always-visible columns stay visible regardless of stored prefs.
      const required = ALL_COLUMN_KEYS.filter(
        (k) => COLUMN_DEFS_META[k].alwaysVisible,
      );
      return Array.from(new Set([...required, ...filtered]));
    } catch {
      return ALL_COLUMN_KEYS;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      COLUMN_VISIBILITY_KEY,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  function toggleSort(field: SortField) {
    setSort((s) =>
      s.field === field
        ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  }
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Filters popover state
  const [filtersOpen, setFiltersOpen] = useState(false);
  type FilterKey = Exclude<keyof Filters, "search">;
  const [activeCategory, setActiveCategory] = useState<FilterKey | null>(
    "status",
  );
  const [optionSearch, setOptionSearch] = useState("");

  // Board / Views menus
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    // Manual edits detach from the active view
    setActiveViewId(null);
  };

  // Auto-apply the user's default view once on first load (only when no
  // department-scoped route is active — that scoping wins).
  useEffect(() => {
    if (defaultApplied || !views || dept) return;
    const def = views.find((v) => v.isDefault);
    if (def) {
      applyView(def.id);
    }
    setDefaultApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, defaultApplied, dept]);

  // Clear selection on department change — the working set is a totally
  // different scope and we don't want to carry ids across.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [dept?.id]);

  function applyView(viewId: number) {
    const v = views?.find((x) => x.id === viewId);
    if (!v) return;
    const c = v.config ?? {};
    // Tolerate legacy single-value status saved by older clients — coerce
    // anything non-array into an array so the filter UI still works.
    const rawStatus = c.status as unknown;
    const statusArr: string[] = Array.isArray(rawStatus)
      ? (rawStatus as string[])
      : typeof rawStatus === "string" && rawStatus
        ? [rawStatus]
        : [];
    setFilters({
      search: c.search ?? "",
      status: statusArr,
      priority: c.priority ?? "all",
      riskLevel: c.riskLevel ?? "all",
      supportLevel:
        c.supportLevel === 1 || c.supportLevel === 2 || c.supportLevel === 3
          ? String(c.supportLevel)
          : "all",
      assigneeId: c.unassigned
        ? "unassigned"
        : c.assigneeId == null
          ? "all"
          : String(c.assigneeId),
      category: c.category ?? "all",
      slaStatus: c.slaStatus ?? "all",
      hasRootCause:
        c.hasRootCause === true
          ? "yes"
          : c.hasRootCause === false
            ? "no"
            : "all",
      hasResolution:
        c.hasResolution === true
          ? "yes"
          : c.hasResolution === false
            ? "no"
            : "all",
      createdRange: (c.createdRange as DateRange) ?? "all",
      updatedRange: (c.updatedRange as DateRange) ?? "all",
    });
    // Restore sort order if the view captured one. Older views without a
    // sort field fall back to the page default (created desc). Field +
    // dir are validated against the known enums before applying so a
    // malformed config can't push an arbitrary string into the sort
    // state.
    const validSortFields: SortField[] = [
      "id",
      "created",
      "updated",
      "priority",
      "risk",
      "level",
      "assignee",
      "user",
      "status",
      "title",
      "category",
      "sla",
    ];
    if (
      c.sort &&
      typeof c.sort.field === "string" &&
      validSortFields.includes(c.sort.field as SortField) &&
      (c.sort.dir === "asc" || c.sort.dir === "desc")
    ) {
      setSort({
        field: c.sort.field as SortField,
        dir: c.sort.dir as SortDir,
      });
    } else {
      setSort({ field: "created", dir: "desc" });
    }
    // Restore visible columns. Always-visible columns (id, title) are
    // re-added so a view can't accidentally hide the row link.
    if (Array.isArray(c.columns)) {
      const restored = c.columns.filter((k): k is ColumnKey =>
        ALL_COLUMN_KEYS.includes(k as ColumnKey),
      );
      const required = ALL_COLUMN_KEYS.filter(
        (k) => COLUMN_DEFS_META[k].alwaysVisible,
      );
      setVisibleColumns(Array.from(new Set([...required, ...restored])));
    } else {
      setVisibleColumns(ALL_COLUMN_KEYS);
    }
    setActiveViewId(viewId);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setActiveViewId(null);
  }

  const { data: tickets, isLoading } = useListTickets({
    departmentId: dept?.id,
    q: filters.search || undefined,
    // Multi-select: empty array means "no status filter" (let server return
    // every status). Otherwise pass the array; orval generates a repeated
    // ?status=... query string.
    status:
      filters.status.length === 0
        ? undefined
        : (filters.status as Array<
            | "new"
            | "in_progress"
            | "with_user"
            | "with_vendor"
            | "on_hold"
            | "scheduled"
            | "resolved"
            | "closed"
          >),
    priority:
      filters.priority === "all"
        ? undefined
        : (filters.priority as "low" | "medium" | "high" | "urgent"),
    riskLevel:
      filters.riskLevel === "all"
        ? undefined
        : (filters.riskLevel as
            | "low"
            | "medium"
            | "high"
            | "critical"),
    supportLevel:
      filters.supportLevel === "all"
        ? undefined
        : (Number(filters.supportLevel) as 1 | 2 | 3),
    assigneeId:
      filters.assigneeId === "all" || filters.assigneeId === "unassigned"
        ? undefined
        : Number(filters.assigneeId),
    unassigned: filters.assigneeId === "unassigned" ? true : undefined,
    category: filters.category === "all" ? undefined : filters.category,
    slaStatus:
      filters.slaStatus === "all"
        ? undefined
        : (filters.slaStatus as "on_track" | "breached"),
    hasRootCause:
      filters.hasRootCause === "all"
        ? undefined
        : filters.hasRootCause === "yes",
    hasResolution:
      filters.hasResolution === "all"
        ? undefined
        : filters.hasResolution === "yes",
    createdAfter: rangeToAfter(filters.createdRange),
    updatedAfter: rangeToAfter(filters.updatedRange),
  });

  // Separate small query that always counts closed tickets in the current
  // department, regardless of the active filter set. Powers the badge on
  // the "Show closed" toggle so users can see how many closed tickets
  // they're hiding.
  const { data: closedTickets } = useListTickets({
    departmentId: dept?.id,
    status: ["closed"],
  });
  const closedCount = closedTickets?.length ?? 0;

  const sortedTickets = useMemo(() => {
    const list = [...(tickets ?? [])];
    const dir = sort.dir === "asc" ? 1 : -1;
    const SLA_RANK: Record<string, number> = { breached: 2, on_track: 1 };
    list.sort((a, b) => {
      switch (sort.field) {
        case "id":
          return (a.id - b.id) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "user":
          return (
            (a.reporterName ?? "~").localeCompare(b.reporterName ?? "~") * dir
          );
        case "category":
          return (
            (a.category ?? "~").localeCompare(b.category ?? "~") * dir
          );
        case "sla": {
          // Sort by urgency: breached first, then by soonest deadline.
          const ra = SLA_RANK[a.slaStatus ?? ""] ?? 0;
          const rb = SLA_RANK[b.slaStatus ?? ""] ?? 0;
          if (ra !== rb) return (ra - rb) * dir;
          const da = a.resolutionDueAt
            ? new Date(a.resolutionDueAt).getTime()
            : Number.POSITIVE_INFINITY;
          const db = b.resolutionDueAt
            ? new Date(b.resolutionDueAt).getTime()
            : Number.POSITIVE_INFINITY;
          return (da - db) * dir;
        }
        case "priority":
          return (
            ((PRIORITY_RANK[a.priority] ?? 0) -
              (PRIORITY_RANK[b.priority] ?? 0)) *
            dir
          );
        case "risk":
          return (
            ((RISK_RANK[a.riskLevel] ?? 0) - (RISK_RANK[b.riskLevel] ?? 0)) *
            dir
          );
        case "level":
          return ((a.supportLevel ?? 1) - (b.supportLevel ?? 1)) * dir;
        case "assignee":
          return (
            (a.assigneeName ?? "~").localeCompare(b.assigneeName ?? "~") * dir
          );
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "updated":
          return (
            (new Date(a.updatedAt).getTime() -
              new Date(b.updatedAt).getTime()) *
            dir
          );
        case "created":
        default:
          return (
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime()) *
            dir
          );
      }
    });
    return list;
  }, [tickets, sort]);

  // Prune the selection down to ids that are currently visible. Whenever
  // the working set changes (filters, search, status toggles, refetch
  // after a bulk update, automation re-classifying tickets, etc.) any
  // selected id that drops out of view is removed so subsequent bulk
  // actions can never patch a hidden ticket.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set(sortedTickets.map((t) => t.id));
    let changed = false;
    const next = new Set<number>();
    selectedIds.forEach((id) => {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
  }, [sortedTickets, selectedIds]);

  const summary = useMemo(() => {
    const t = tickets ?? [];
    return {
      total: t.length,
      // Replaces the previous open/pending tiles with the new entry-state
      // counts. Active = anything not resolved/closed.
      newCount: t.filter((x) => x.status === "new").length,
      inProgress: t.filter((x) => x.status === "in_progress").length,
      active: t.filter(
        (x) => x.status !== "resolved" && x.status !== "closed",
      ).length,
      waiting: t.filter((x) =>
        ["with_user", "with_vendor", "on_hold", "scheduled"].includes(x.status),
      ).length,
      resolved: t.filter((x) => x.status === "resolved").length,
      closed: t.filter((x) => x.status === "closed").length,
      breached: t.filter((x) => x.slaStatus === "breached").length,
    };
  }, [tickets]);

  const activeView = views?.find((v) => v.id === activeViewId) ?? null;

  // ────────────────────────────────────────────────────────────────────
  // Filter metadata (categories shown in the Filters panel)
  // ────────────────────────────────────────────────────────────────────
  const FILTER_CATEGORIES: { key: FilterKey; label: string }[] = [
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "riskLevel", label: "Risk Level" },
    { key: "supportLevel", label: "Support Level" },
    { key: "category", label: "Category" },
    { key: "slaStatus", label: "SLA" },
    { key: "hasRootCause", label: "Root Cause" },
    { key: "hasResolution", label: "Resolution" },
    { key: "createdRange", label: "Created Date" },
    { key: "updatedRange", label: "Last Update Date" },
    { key: "assigneeId", label: "Assignee" },
  ];

  function agentNameById(id: number): string {
    const a = agents?.find((x) => x.id === id);
    return a?.name ?? `Agent #${id}`;
  }

  // Categories for the Category filter come from the union of configured risk
  // rules and any categories present in the currently-loaded ticket list.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    (riskRules ?? []).forEach((r) => set.add(r.category));
    (tickets ?? []).forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [riskRules, tickets]);

  function optionsForCategory(
    key: FilterKey,
  ): { value: string; label: string }[] {
    switch (key) {
      case "status":
        return ALL_STATUSES.map((s) => ({
          value: s,
          label: STATUS_LABEL[s] ?? s,
        }));
      case "priority":
        return [
          { value: "urgent", label: "Urgent" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ];
      case "riskLevel":
        return [
          { value: "critical", label: "Critical" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ];
      case "supportLevel":
        return [
          { value: "1", label: "L1" },
          { value: "2", label: "L2" },
          { value: "3", label: "L3" },
        ];
      case "assigneeId":
        return [
          { value: "unassigned", label: "Unassigned" },
          ...(agents ?? []).map((a) => ({
            value: String(a.id),
            label: a.name,
          })),
        ];
      case "category":
        return categoryOptions.map((c) => ({ value: c, label: c }));
      case "slaStatus":
        return [
          { value: "on_track", label: "On track" },
          { value: "breached", label: "Breached" },
        ];
      case "hasRootCause":
      case "hasResolution":
        return [
          { value: "yes", label: "Recorded" },
          { value: "no", label: "Missing" },
        ];
      case "createdRange":
      case "updatedRange":
        return [
          { value: "today", label: "Today" },
          { value: "week", label: "Last 7 days" },
          { value: "month", label: "Last 30 days" },
        ];
    }
  }

  function labelForFilterValue(key: FilterKey, value: string): string {
    if (key === "assigneeId" && value !== "unassigned" && value !== "all") {
      return agentNameById(Number(value));
    }
    if (key === "category" && value !== "all") return value;
    const opt = optionsForCategory(key).find((o) => o.value === value);
    return opt?.label ?? value;
  }

  // Status is a multi-select array; everything else is a single string.
  // For chip purposes, status renders as "Status: A, B, C" when its set
  // differs from the default (active-statuses) set. Single-value categories
  // chip on simple inequality with their default.
  type FilterChip = {
    key: FilterKey;
    categoryLabel: string;
    valueLabel: string;
  };
  const activeFilterChips: FilterChip[] = [];
  for (const c of FILTER_CATEGORIES) {
    if (c.key === "status") {
      if (sameStatusSet(filters.status, DEFAULT_FILTERS.status)) continue;
      const labels = filters.status
        .map((s) => STATUS_LABEL[s] ?? s)
        .join(", ");
      activeFilterChips.push({
        key: c.key,
        categoryLabel: c.label,
        valueLabel: labels || "(none)",
      });
      continue;
    }
    if (filters[c.key] === DEFAULT_FILTERS[c.key]) continue;
    activeFilterChips.push({
      key: c.key,
      categoryLabel: c.label,
      valueLabel: labelForFilterValue(c.key, filters[c.key] as string),
    });
  }

  // "Dirty" includes sort + visible columns now that those are part of
  // the saved view payload — otherwise tweaking only the sort wouldn't
  // enable the Save action.
  const sortIsDefault = sort.field === "created" && sort.dir === "desc";
  const columnsAreDefault =
    visibleColumns.length === ALL_COLUMN_KEYS.length &&
    ALL_COLUMN_KEYS.every((k) => visibleColumns.includes(k));
  const filtersDirty =
    activeFilterChips.length > 0 ||
    filters.search !== DEFAULT_FILTERS.search ||
    !sortIsDefault ||
    !columnsAreDefault;

  const activeFilterCount = activeFilterChips.length;

  function clearFilter(key: FilterKey) {
    setFilter(key, DEFAULT_FILTERS[key]);
  }

  function buildConfigFromFilters() {
    return {
      search: filters.search ? filters.search : null,
      // Persist multi-select status as an array. Null = no filter.
      status:
        filters.status.length === 0
          ? null
          : (filters.status as Array<
              | "new"
              | "in_progress"
              | "with_user"
              | "with_vendor"
              | "on_hold"
              | "scheduled"
              | "resolved"
              | "closed"
            >),
      priority:
        filters.priority === "all" ? null : (filters.priority as never),
      riskLevel:
        filters.riskLevel === "all" ? null : (filters.riskLevel as never),
      supportLevel:
        filters.supportLevel === "all"
          ? null
          : (Number(filters.supportLevel) as 1 | 2 | 3),
      assigneeId:
        filters.assigneeId === "all" || filters.assigneeId === "unassigned"
          ? null
          : Number(filters.assigneeId),
      unassigned: filters.assigneeId === "unassigned" ? true : null,
      category: filters.category === "all" ? null : filters.category,
      slaStatus:
        filters.slaStatus === "all" ? null : (filters.slaStatus as never),
      hasRootCause:
        filters.hasRootCause === "all"
          ? null
          : filters.hasRootCause === "yes",
      hasResolution:
        filters.hasResolution === "all"
          ? null
          : filters.hasResolution === "yes",
      createdRange:
        filters.createdRange === "all"
          ? null
          : (filters.createdRange as never),
      updatedRange:
        filters.updatedRange === "all"
          ? null
          : (filters.updatedRange as never),
      departmentId: dept?.id ?? null,
      // Sort + visible columns are part of "what the screen looks like
      // right now" — capture them so saved views restore exactly.
      sort: { field: sort.field as never, dir: sort.dir },
      columns: visibleColumns as never,
    };
  }

  async function handleSaveView() {
    if (!saveName.trim()) return;
    const created = await createView.mutateAsync({
      data: {
        name: saveName.trim(),
        config: buildConfigFromFilters(),
        isDefault: saveAsDefault,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: getListTicketViewsQueryKey(),
    });
    setActiveViewId(created.id);
    setSaveName("");
    setSaveAsDefault(false);
    setSaveOpen(false);
  }

  async function handleSetDefault(viewId: number, value: boolean) {
    await updateView.mutateAsync({ id: viewId, data: { isDefault: value } });
    await queryClient.invalidateQueries({
      queryKey: getListTicketViewsQueryKey(),
    });
  }

  async function handleDeleteView(viewId: number) {
    await deleteView.mutateAsync({ id: viewId });
    if (activeViewId === viewId) setActiveViewId(null);
    await queryClient.invalidateQueries({
      queryKey: getListTicketViewsQueryKey(),
    });
  }

  const boardLabel = dept ? dept.name : "All Tickets";
  const viewLabel = activeView ? activeView.name : "Default view";
  const currentBoardIsDefault =
    (session?.defaultTicketBoard ?? null) === (deptSlug ?? null);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header: Board > View dropdown */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="flex items-center gap-1 text-xl font-semibold tracking-tight m-0">
          {/* Board picker */}
          <DropdownMenu open={boardMenuOpen} onOpenChange={setBoardMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/60 -ml-1"
                data-testid="button-board-picker"
              >
                <span>{boardLabel}</span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Boards
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setBoardMenuOpen(false);
                  handleChangeBoard("all");
                }}
                className="flex items-center justify-between"
                data-testid="board-option-all"
              >
                <span>All Tickets</span>
                {!deptSlug && <Check className="h-4 w-4 text-emerald-500" />}
              </DropdownMenuItem>
              {(departments ?? []).map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    setBoardMenuOpen(false);
                    handleChangeBoard(d.slug);
                  }}
                  className="flex items-center justify-between"
                  data-testid={`board-option-${d.slug}`}
                >
                  <span>{d.name}</span>
                  {deptSlug === d.slug && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleSetDefaultBoard(deptSlug ?? "all");
                }}
                disabled={currentBoardIsDefault}
                data-testid="button-set-default-board"
              >
                <Star className="h-3.5 w-3.5 mr-2 text-amber-500" />
                {currentBoardIsDefault
                  ? `${boardLabel} is your default board`
                  : `Set ${boardLabel} as default board`}
              </DropdownMenuItem>
              <div className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
                Opening Tickets from the sidebar lands here.
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <ChevronRight className="h-4 w-4 opacity-50" />

          {/* Views picker */}
          <DropdownMenu open={viewsMenuOpen} onOpenChange={setViewsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/60"
                data-testid="button-views"
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
                  setFilters(DEFAULT_FILTERS);
                }}
                className="flex items-center justify-between"
                data-testid="view-option-default"
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
                  data-testid={`menu-view-${v.id}`}
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
                data-testid="menu-save-view"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Save current view
              </DropdownMenuItem>
              {activeView && (
                <>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleSetDefault(activeView.id, !activeView.isDefault);
                    }}
                    data-testid="menu-toggle-default"
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
                    data-testid="menu-delete-view"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete this view
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </h1>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">
              {summary.newCount} new
            </span>
            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">
              {summary.inProgress} in progress
            </span>
            {summary.waiting > 0 && (
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">
                {summary.waiting} waiting
              </span>
            )}
            {summary.breached > 0 && (
              <span className="px-2 py-1 rounded bg-red-50 text-red-700">
                {summary.breached} breached
              </span>
            )}
          </div>

          {/* Quick toggle: Closed tickets are hidden by default. Clicking
              this swaps the status filter to "closed only" so the table
              shows just closed tickets; clicking again restores whatever
              status set was active beforehand (preserving saved-view or
              custom selections). The badge surfaces the total number of
              closed tickets in this department so users can see how many
              they're hiding. */}
          {(() => {
            const closedOnly =
              filters.status.length === 1 && filters.status[0] === "closed";
            return (
              <Button
                variant={closedOnly ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-2"
                onClick={() => {
                  if (closedOnly) {
                    // Restore the previously-saved status snapshot if
                    // we have one; otherwise fall back to the default.
                    const restore =
                      preClosedStatusRef.current ??
                      (DEFAULT_FILTERS.status as string[]);
                    preClosedStatusRef.current = null;
                    setFilter("status", restore as never);
                  } else {
                    // Snapshot the current status set so we can restore
                    // it when the user toggles back off.
                    preClosedStatusRef.current = [...filters.status];
                    setFilter("status", ["closed"] as never);
                  }
                }}
                data-testid="button-toggle-closed"
              >
                <CheckCircle2 className="h-4 w-4" />
                {closedOnly ? "Hide closed" : "Show closed"}
                <span
                  className={
                    "ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium " +
                    (closedOnly
                      ? "bg-background/80 text-foreground"
                      : "bg-muted text-muted-foreground")
                  }
                  data-testid="badge-closed-count"
                >
                  {closedCount}
                </span>
              </Button>
            );
          })()}

          <Button
            onClick={() => setCreateTicketOpen(true)}
            data-testid="button-create-ticket"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create ticket
          </Button>
        </div>
      </div>

      <CreateTicketDialog
        open={createTicketOpen}
        onOpenChange={setCreateTicketOpen}
        defaultDepartmentSlug={deptSlug ?? null}
      />

      {dept?.description && (
        <p className="text-sm text-muted-foreground -mt-2">
          {dept.description}
        </p>
      )}

      {/* Toolbar: Filters | Search | (right) Sort | Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filters popover */}
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
            className="p-0 w-[560px]"
            data-testid="popover-filters"
          >
            <div className="flex h-[380px]">
              {/* Left: categories */}
              <div className="w-[200px] border-r bg-muted/30 py-2 overflow-y-auto">
                {FILTER_CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.key;
                  const isSet = filters[cat.key] !== DEFAULT_FILTERS[cat.key];
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

              {/* Right: options for selected category */}
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
                          // Status is multi-select: checked iff present in
                          // the filters.status array. All other categories
                          // are single-value, so checked iff the value
                          // matches.
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
                                    // Toggle membership in the array.
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
                                    setFilter(
                                      "status",
                                      next as never,
                                    );
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
                              {activeCategory === "status" && (
                                <span className="shrink-0">
                                  {statusIcon(opt.value)}
                                </span>
                              )}
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
                onClick={clearAll}
                disabled={!filtersDirty}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={() => setFiltersOpen(false)}
                data-testid="button-filters-done"
              >
                Done
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-[420px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>

        <div className="flex-1" />

        {/* Export to CSV — when no tickets are selected, exports every
            row currently visible in the table (after filters + sort).
            When the user has selected one or more rows, opens a
            popover that lets them choose between exporting just the
            selection or every visible row. */}
        {selectedIds.size > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 gap-2"
                data-testid="button-export-csv"
                disabled={(sortedTickets?.length ?? 0) === 0}
              >
                <Download className="h-4 w-4" />
                Export CSV
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              <button
                type="button"
                className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() =>
                  exportTicketsToCsv(
                    sortedTickets.filter((t) => selectedIds.has(t.id)),
                    visibleColumns,
                  )
                }
                data-testid="button-export-selected"
              >
                <span className="font-medium">
                  Export selected ({selectedIds.size})
                </span>
                <span className="text-xs text-muted-foreground">
                  Only the rows you've checked
                </span>
              </button>
              <button
                type="button"
                className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => exportTicketsToCsv(sortedTickets, visibleColumns)}
                data-testid="button-export-all"
              >
                <span className="font-medium">
                  Export all ({sortedTickets.length})
                </span>
                <span className="text-xs text-muted-foreground">
                  Every row currently visible
                </span>
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            variant="outline"
            className="h-9 gap-2"
            data-testid="button-export-csv"
            disabled={(sortedTickets?.length ?? 0) === 0}
            onClick={() => exportTicketsToCsv(sortedTickets, visibleColumns)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        )}

        {/* Manage columns */}
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
              Visible columns — drag the arrows to reorder
            </div>
            {/* Visible columns first, in their on-screen order. Each row
                gets up/down arrows so the user can shuffle them; the
                resulting order is what they see in the table and is
                persisted to localStorage so it survives reloads and
                follows the logged-in user. */}
            <div className="space-y-0.5">
              {visibleColumns.map((key, idx) => {
                const def = COLUMN_DEFS_META[key];
                const disabledCheckbox = def.alwaysVisible;
                const isFirst = idx === 0;
                const isLast = idx === visibleColumns.length - 1;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                    data-testid={`column-row-${key}`}
                  >
                    <Checkbox
                      checked
                      disabled={disabledCheckbox}
                      onCheckedChange={(v) => {
                        if (disabledCheckbox) return;
                        if (!v) {
                          setVisibleColumns((prev) =>
                            prev.filter((k) => k !== key),
                          );
                        }
                      }}
                      data-testid={`column-toggle-${key}`}
                    />
                    <span className="flex-1 truncate">{def.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={isFirst}
                      onClick={() =>
                        setVisibleColumns((prev) => {
                          const next = [...prev];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })
                      }
                      data-testid={`column-move-up-${key}`}
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={isLast}
                      onClick={() =>
                        setVisibleColumns((prev) => {
                          const next = [...prev];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          return next;
                        })
                      }
                      data-testid={`column-move-down-${key}`}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Hidden columns sit below; checking one appends it to the
                end of the visible order, where the user can then shuffle
                it into place with the arrows above. */}
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
                      const def = COLUMN_DEFS_META[key];
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
                  setVisibleColumns(
                    ALL_COLUMN_KEYS.filter((k) => COLUMN_DEFS_META[k].alwaysVisible),
                  )
                }
                data-testid="button-columns-hide-all"
              >
                Reset
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() =>
            queryClient.invalidateQueries({
              predicate: (q) =>
                Array.isArray(q.queryKey) &&
                typeof q.queryKey[0] === "string" &&
                q.queryKey[0].includes("/tickets"),
            })
          }
          title="Refresh tickets"
          data-testid="button-refresh-tickets"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
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
                onClick={() => clearFilter(chip.key)}
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
            onClick={clearAll}
            data-testid="button-clear-all-chips"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Selection status — appears whenever the user has selected one
          or more tickets via the per-row checkboxes. Inline editing is
          done directly in the row cells; this strip just shows the
          count and a clear link, and lets the Export CSV button know
          to offer "Export selected" vs "Export all". */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 mb-2 text-sm"
          data-testid="selection-status"
        >
          <span className="font-medium">{selectedIds.size} selected</span>
          <span className="text-muted-foreground">
            Click any cell in the row to edit it directly.
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-clear-selection"
          >
            Clear selection
          </Button>
        </div>
      )}

      <div className="bg-card rounded-lg border shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow>
                {/* Select-all checkbox. Indeterminate when partial. */}
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      sortedTickets.length > 0 &&
                      sortedTickets.every((t) => selectedIds.has(t.id))
                    }
                    onCheckedChange={(v) => {
                      if (v) {
                        setSelectedIds(
                          new Set(sortedTickets.map((t) => t.id)),
                        );
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    data-testid="checkbox-select-all"
                    aria-label="Select all tickets"
                  />
                </TableHead>
                {visibleColumns.map((key) => {
                  const def = COLUMN_DEFS_META[key];
                  const active = sort.field === def.sortField;
                  const ariaSort: "ascending" | "descending" | "none" = active
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
                  return (
                    <TableHead
                      key={key}
                      className={def.width}
                      aria-sort={def.sortField ? ariaSort : undefined}
                    >
                      {def.sortField ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(def.sortField!)}
                          className="group/h -ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-left hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid={`header-sort-${key}`}
                          title={`Sort by ${def.label}`}
                        >
                          <span>{def.label}</span>
                          {active ? (
                            sort.dir === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5 text-foreground" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-foreground" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-30 group-hover/h:opacity-60" />
                          )}
                        </button>
                      ) : (
                        def.label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading tickets…
                  </TableCell>
                </TableRow>
              ) : sortedTickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedTickets.map((ticket) => {
                  const checked = selectedIds.has(ticket.id);
                  return (
                    <TableRow
                      key={ticket.id}
                      className="group"
                      data-testid={`row-ticket-${ticket.id}`}
                      data-state={checked ? "selected" : undefined}
                    >
                      <TableCell className="w-[40px]">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(ticket.id);
                              else next.delete(ticket.id);
                              return next;
                            });
                          }}
                          data-testid={`checkbox-row-${ticket.id}`}
                          aria-label={`Select ticket ${ticket.ticketKey ?? ticket.id}`}
                        />
                      </TableCell>
                      {visibleColumns.map((key) => (
                        <TableCell
                          key={key}
                          className={
                            key === "category" ||
                            key === "created" ||
                            key === "updated"
                              ? "text-sm text-muted-foreground"
                              : undefined
                          }
                        >
                          {renderTicketCell(key, ticket, {
                            canEdit: canTriage,
                            onPatch: (id, data) => {
                              void patchTicket(id, data);
                            },
                            agents: agents ?? [],
                            people: people ?? [],
                            categoryOptions,
                          })}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Save view dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. My open L2 tickets"
                data-testid="input-view-name"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-save-default"
              />
              Make this my default view
            </label>
            <p className="text-xs text-muted-foreground">
              Saves your search and all filter selections.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!saveName.trim() || createView.isPending}
              data-testid="button-confirm-save-view"
            >
              {createView.isPending ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-blue-100 text-blue-700";
    case "low":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function RiskBadge({ level }: { level: string | null | undefined }) {
  const v = (level ?? "low").toLowerCase();
  const tone =
    v === "critical"
      ? "bg-red-100 text-red-800"
      : v === "high"
        ? "bg-orange-100 text-orange-800"
        : v === "medium"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-muted text-muted-foreground";
  const label = v.charAt(0).toUpperCase() + v.slice(1);
  return (
    <Badge
      variant="secondary"
      className={`${tone} font-medium`}
      data-testid={`badge-risk-${v}`}
    >
      {label}
    </Badge>
  );
}

function LevelBadge({ level }: { level: number }) {
  const tone =
    level === 3
      ? "bg-purple-100 text-purple-700"
      : level === 2
        ? "bg-indigo-100 text-indigo-700"
        : "bg-slate-100 text-slate-700";
  return (
    <Badge variant="secondary" className={`${tone} font-semibold tabular-nums`}>
      L{level}
    </Badge>
  );
}

function statusIcon(status: string) {
  switch (status) {
    case "new":
      return <Inbox className="h-4 w-4 text-blue-500" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "with_user":
      return <Clock className="h-4 w-4 text-purple-500" />;
    case "with_vendor":
      return <Clock className="h-4 w-4 text-indigo-500" />;
    case "on_hold":
      return <Pause className="h-4 w-4 text-slate-500" />;
    case "scheduled":
      return <Clock className="h-4 w-4 text-cyan-500" />;
    case "resolved":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "closed":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Inbox className="h-4 w-4" />;
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Inline-editable cell. Renders `display` as a clickable trigger; clicking
// opens a popover with the supplied options. Used for priority, risk
// level, status, level, agent, user, and category cells so triagers can
// change individual ticket fields without leaving the list.
function EditablePopoverCell({
  display,
  options,
  value,
  onChange,
  testId,
  disabled,
  align = "start",
  width = "w-48",
}: {
  display: ReactNode;
  options: { value: string; label: string }[];
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  testId?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  width?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Show the search box automatically once the option count justifies
  // it — small fixed lists (priority, risk, status, level) stay
  // distraction-free while long lists (agents, users, categories) get
  // a type-to-filter input.
  const showSearch = options.length > 6;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);
  if (disabled) return <>{display}</>;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-1 cursor-pointer rounded px-1 py-0.5 text-left hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid={testId}
          onClick={(e) => e.stopPropagation()}
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={`p-1 ${width} max-h-72 overflow-hidden flex flex-col`}
        align={align}
      >
        {showSearch && (
          <div className="p-1">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 text-sm"
              data-testid={testId ? `${testId}-search` : undefined}
            />
          </div>
        )}
        <div className="overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No matches
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  o.value === (value ?? "") ? "bg-muted font-medium" : ""
                }`}
                onClick={() => {
                  onChange(o.value === "__unset__" ? null : o.value);
                  setOpen(false);
                  setQuery("");
                }}
                data-testid={testId ? `${testId}-option-${o.value}` : undefined}
              >
                <span className="truncate">{o.label}</span>
                {o.value === (value ?? "") && (
                  <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-foreground" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Centralised cell renderer keyed by ColumnKey so the table body can be
// driven by the user-controlled visibleColumns array. When `ctx.canEdit`
// is true and the column is editable, the cell becomes a popover that
// dispatches a PATCH via `ctx.onPatch`.
function renderTicketCell(
  key: ColumnKey,
  ticket: Ticket,
  ctx?: {
    canEdit: boolean;
    onPatch: (id: number, data: Record<string, unknown>) => void;
    agents: {
      id: number;
      name: string;
      // Departments the agent can work tickets on. The cell renderer
      // uses this to hide assignees that lack access to the row's
      // board (mirroring the server-side rule on PATCH).
      boardDepartmentIds: number[];
    }[];
    people: { id: number; name: string }[];
    categoryOptions: string[];
  },
): ReactNode {
  const canEdit = ctx?.canEdit ?? false;
  switch (key) {
    case "id":
      return (
        <Link
          href={`/tickets/${ticket.id}`}
          className="font-medium text-indigo-600 hover:underline tabular-nums"
        >
          {ticket.ticketKey}
        </Link>
      );
    case "priority": {
      const display = (
        <Badge
          variant="secondary"
          className={priorityColor(ticket.priority)}
        >
          {ticket.priority}
        </Badge>
      );
      return (
        <EditablePopoverCell
          display={display}
          value={ticket.priority}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
          onChange={(v) => v && ctx?.onPatch(ticket.id, { priority: v })}
          testId={`edit-priority-${ticket.id}`}
          disabled={!canEdit}
          width="w-36"
        />
      );
    }
    case "riskLevel": {
      const display = <RiskBadge level={ticket.riskLevel} />;
      return (
        <EditablePopoverCell
          display={display}
          value={ticket.riskLevel}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ]}
          onChange={(v) => v && ctx?.onPatch(ticket.id, { riskLevel: v })}
          testId={`edit-risk-${ticket.id}`}
          disabled={!canEdit}
          width="w-36"
        />
      );
    }
    case "status": {
      const display = (
        <div className="flex items-center gap-2">
          {statusIcon(ticket.status)}
          <span className="text-sm font-medium">
            {STATUS_LABEL[ticket.status] ?? ticket.status}
          </span>
        </div>
      );
      return (
        <EditablePopoverCell
          display={display}
          value={ticket.status}
          options={[
            { value: "new", label: "New" },
            { value: "in_progress", label: "In Progress" },
            { value: "with_user", label: "With User" },
            { value: "with_vendor", label: "With Vendor" },
            { value: "on_hold", label: "On Hold" },
            { value: "scheduled", label: "Scheduled" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
          onChange={(v) => v && ctx?.onPatch(ticket.id, { status: v })}
          testId={`edit-status-${ticket.id}`}
          disabled={!canEdit}
          width="w-44"
        />
      );
    }
    case "title":
      return (
        <Link href={`/tickets/${ticket.id}`} className="block">
          <div className="font-medium text-foreground truncate max-w-[420px]">
            {ticket.title}
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {ticket.type}
            {ticket.location ? ` · ${ticket.location}` : ""}
            {ticket.departmentName ? ` · ${ticket.departmentName}` : ""}
          </div>
        </Link>
      );
    case "user": {
      const display = (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {initials(ticket.reporterName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm truncate max-w-[120px]">
            {ticket.reporterName}
          </span>
        </div>
      );
      const peopleOpts = (ctx?.people ?? []).map((p) => ({
        value: String(p.id),
        label: p.name,
      }));
      return (
        <EditablePopoverCell
          display={display}
          value={String(ticket.reporterId ?? "")}
          options={peopleOpts}
          onChange={(v) =>
            v && ctx?.onPatch(ticket.id, { reporterId: Number(v) })
          }
          testId={`edit-user-${ticket.id}`}
          disabled={!canEdit || peopleOpts.length === 0}
          width="w-56"
        />
      );
    }
    case "supportLevel": {
      const display = <LevelBadge level={ticket.supportLevel ?? 1} />;
      return (
        <EditablePopoverCell
          display={display}
          value={String(ticket.supportLevel ?? 1)}
          options={[
            { value: "1", label: "L1" },
            { value: "2", label: "L2" },
            { value: "3", label: "L3" },
          ]}
          onChange={(v) =>
            v && ctx?.onPatch(ticket.id, { supportLevel: Number(v) })
          }
          testId={`edit-level-${ticket.id}`}
          disabled={!canEdit}
          width="w-28"
        />
      );
    }
    case "agent": {
      const display = ticket.assigneeName ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {initials(ticket.assigneeName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-foreground/80">
            {ticket.assigneeName}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/60">Unassigned</span>
      );
      // Restrict the assignee dropdown to agents who actually have
      // access to this ticket's board. The server enforces the same
      // rule on PATCH (rejecting unauthorized assignees with 400), so
      // showing all agents would just expose options that fail to
      // save. Admins are included on every board (the server returns
      // every department id in their `boardDepartmentIds`).
      const agentOpts = [
        { value: "__unset__", label: "Unassigned" },
        ...(ctx?.agents ?? [])
          .filter((a) => a.boardDepartmentIds.includes(ticket.departmentId))
          .map((a) => ({
            value: String(a.id),
            label: a.name,
          })),
      ];
      return (
        <EditablePopoverCell
          display={display}
          value={String(ticket.assigneeId ?? "")}
          options={agentOpts}
          onChange={(v) =>
            ctx?.onPatch(ticket.id, {
              assigneeId: v === null ? null : Number(v),
            })
          }
          testId={`edit-agent-${ticket.id}`}
          disabled={!canEdit}
          width="w-56"
        />
      );
    }
    case "category": {
      const display = ticket.category ?? (
        <span className="text-muted-foreground/50">—</span>
      );
      const catOpts = [
        { value: "__unset__", label: "— None —" },
        ...(ctx?.categoryOptions ?? []).map((c) => ({ value: c, label: c })),
      ];
      return (
        <EditablePopoverCell
          display={display}
          value={ticket.category ?? ""}
          options={catOpts}
          onChange={(v) => ctx?.onPatch(ticket.id, { category: v })}
          testId={`edit-category-${ticket.id}`}
          disabled={!canEdit || catOpts.length <= 1}
          width="w-56"
        />
      );
    }
    case "created":
      return format(new Date(ticket.createdAt), "MMM d");
    case "updated":
      return format(new Date(ticket.updatedAt), "MMM d");
    case "sla":
      return (
        <SlaCountdown
          slaStatus={ticket.slaStatus}
          slaPhase={ticket.slaPhase}
          slaPaused={ticket.slaPaused}
          slaActiveDueAt={ticket.slaActiveDueAt}
          resolutionDueAt={ticket.resolutionDueAt}
          resolvedAt={ticket.resolvedAt}
        />
      );
  }
}

// ────────────────────────────────────────────────────────────────────
// CSV export
// ────────────────────────────────────────────────────────────────────
// Plain-text value for a given column, mirroring what the user sees in
// the table cell but stripped of all JSX/markup. Used by the CSV
// exporter so the downloaded file matches the on-screen view.
function csvValueForColumn(key: ColumnKey, ticket: Ticket): string {
  switch (key) {
    case "id":
      return ticket.ticketKey ?? String(ticket.id);
    case "priority":
      return ticket.priority ?? "";
    case "riskLevel":
      return ticket.riskLevel ?? "";
    case "status":
      return STATUS_LABEL[ticket.status] ?? ticket.status ?? "";
    case "title":
      return ticket.title ?? "";
    case "user":
      return ticket.reporterName ?? "";
    case "supportLevel":
      return ticket.supportLevel != null ? `L${ticket.supportLevel}` : "";
    case "agent":
      return ticket.assigneeName ?? "Unassigned";
    case "category":
      return ticket.category ?? "";
    case "created":
      return ticket.createdAt
        ? format(new Date(ticket.createdAt), "yyyy-MM-dd HH:mm")
        : "";
    case "updated":
      return ticket.updatedAt
        ? format(new Date(ticket.updatedAt), "yyyy-MM-dd HH:mm")
        : "";
    case "sla": {
      // Capture phase + status so the CSV is self-describing.
      const phase = ticket.slaPhase ?? "none";
      const paused = ticket.slaPaused ? " (paused)" : "";
      const status = ticket.slaStatus ?? "on_track";
      return `${status}:${phase}${paused}`;
    }
    default:
      return "";
  }
}

// RFC 4180 cell escaping: wrap in quotes when the value contains a
// comma, quote, or newline; double up any embedded quotes.
function csvEscape(raw: string): string {
  if (raw == null) return "";
  const s = String(raw);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportTicketsToCsv(
  tickets: Ticket[],
  visibleColumns: ColumnKey[],
): void {
  if (!tickets.length) return;
  const headers = visibleColumns.map(
    (k) => COLUMN_DEFS_META[k]?.label ?? k,
  );
  const rows = tickets.map((t) =>
    visibleColumns.map((k) => csvEscape(csvValueForColumn(k, t))).join(","),
  );
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const csv =
    "\uFEFF" + [headers.map(csvEscape).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Silence unused-import warnings for icons only used as visual cues
void MoreHorizontal;
