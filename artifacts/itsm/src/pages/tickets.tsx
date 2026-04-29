import {
  useListTickets,
  useGetSession,
  useListDepartments,
  useListAgents,
  useListTicketViews,
  useCreateTicketView,
  useUpdateTicketView,
  useDeleteTicketView,
  useUpdateMePreferences,
  getListTicketViewsQueryKey,
  getGetSessionQueryKey,
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
  Filter as FilterIcon,
  Inbox,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useMemo, useState } from "react";
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

type SortField = "created" | "priority" | "level" | "assignee" | "status";
type SortDir = "asc" | "desc";

type Filters = {
  search: string;
  status: string; // "all" | open | pending | resolved | closed
  priority: string; // "all" | low | medium | high | urgent
  supportLevel: string; // "all" | "1" | "2" | "3"
  assigneeId: string; // "all" | "unassigned" | numeric id
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "all",
  priority: "all",
  supportLevel: "all",
  assigneeId: "all",
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

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
  const { data: views } = useListTicketViews();
  const createView = useCreateTicketView();
  const updateView = useUpdateTicketView();
  const deleteView = useDeleteTicketView();
  const updatePreferences = useUpdateMePreferences();

  // If the user lands on the bare /tickets page and has a default ticket
  // board configured, redirect to that board. The dropdown on the page
  // still lets them switch back manually.
  useEffect(() => {
    if (deptSlug) return;
    if (!session || !departments) return;
    const slug = session.defaultTicketBoard;
    if (!slug) return;
    if (departments.some((d) => d.slug === slug)) {
      setLocation(`/tickets/dept/${slug}`, { replace: true });
    }
  }, [deptSlug, session, departments, setLocation]);

  const currentBoardSlug: string = deptSlug ?? "all";
  async function handleChangeBoard(value: string) {
    if (value === "all") {
      setLocation("/tickets");
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
  const defaultBoardSlug: string = session?.defaultTicketBoard ?? "all";

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "created",
    dir: "desc",
  });
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Filters popover state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    "status" | "priority" | "supportLevel" | "assigneeId" | null
  >("status");
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

  function applyView(viewId: number) {
    const v = views?.find((x) => x.id === viewId);
    if (!v) return;
    const c = v.config ?? {};
    setFilters({
      search: c.search ?? "",
      status: c.status ?? "all",
      priority: c.priority ?? "all",
      supportLevel:
        c.supportLevel === 1 || c.supportLevel === 2 || c.supportLevel === 3
          ? String(c.supportLevel)
          : "all",
      assigneeId: c.unassigned
        ? "unassigned"
        : c.assigneeId == null
          ? "all"
          : String(c.assigneeId),
    });
    setActiveViewId(viewId);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setActiveViewId(null);
  }

  const { data: tickets, isLoading } = useListTickets({
    departmentId: dept?.id,
    q: filters.search || undefined,
    status:
      filters.status === "all"
        ? undefined
        : (filters.status as "open" | "pending" | "resolved" | "closed"),
    priority:
      filters.priority === "all"
        ? undefined
        : (filters.priority as "low" | "medium" | "high" | "urgent"),
    supportLevel:
      filters.supportLevel === "all"
        ? undefined
        : (Number(filters.supportLevel) as 1 | 2 | 3),
    assigneeId:
      filters.assigneeId === "all" || filters.assigneeId === "unassigned"
        ? undefined
        : Number(filters.assigneeId),
    unassigned: filters.assigneeId === "unassigned" ? true : undefined,
  });

  const sortedTickets = useMemo(() => {
    const list = [...(tickets ?? [])];
    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sort.field) {
        case "priority":
          return (
            ((PRIORITY_RANK[a.priority] ?? 0) -
              (PRIORITY_RANK[b.priority] ?? 0)) *
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

  const summary = useMemo(() => {
    const t = tickets ?? [];
    return {
      total: t.length,
      open: t.filter((x) => x.status === "open").length,
      pending: t.filter((x) => x.status === "pending").length,
      breached: t.filter((x) => x.slaBreached).length,
    };
  }, [tickets]);

  const activeView = views?.find((v) => v.id === activeViewId) ?? null;
  const filtersDirty =
    filters.search !== DEFAULT_FILTERS.search ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.priority !== DEFAULT_FILTERS.priority ||
    filters.supportLevel !== DEFAULT_FILTERS.supportLevel ||
    filters.assigneeId !== DEFAULT_FILTERS.assigneeId;

  // ────────────────────────────────────────────────────────────────────
  // Filter metadata (categories shown in the Filters panel)
  // ────────────────────────────────────────────────────────────────────
  type FilterKey = Exclude<keyof Filters, "search">;
  const FILTER_CATEGORIES: { key: FilterKey; label: string }[] = [
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "supportLevel", label: "Support Level" },
    { key: "assigneeId", label: "Assignee" },
  ];

  function agentNameById(id: number): string {
    const a = agents?.find((x) => x.id === id);
    return a?.name ?? `Agent #${id}`;
  }

  function optionsForCategory(
    key: FilterKey,
  ): { value: string; label: string }[] {
    switch (key) {
      case "status":
        return [
          { value: "open", label: "Open" },
          { value: "pending", label: "Pending" },
          { value: "resolved", label: "Resolved" },
          { value: "closed", label: "Closed" },
        ];
      case "priority":
        return [
          { value: "urgent", label: "Urgent" },
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
    }
  }

  function labelForFilterValue(key: FilterKey, value: string): string {
    if (key === "assigneeId" && value !== "unassigned" && value !== "all") {
      return agentNameById(Number(value));
    }
    const opt = optionsForCategory(key).find((o) => o.value === value);
    return opt?.label ?? value;
  }

  const activeFilterChips = FILTER_CATEGORIES.filter(
    (c) => filters[c.key] !== DEFAULT_FILTERS[c.key],
  ).map((c) => ({
    key: c.key,
    categoryLabel: c.label,
    valueLabel: labelForFilterValue(c.key, filters[c.key]),
  }));

  const activeFilterCount = activeFilterChips.length;

  function clearFilter(key: FilterKey) {
    setFilter(key, DEFAULT_FILTERS[key]);
  }

  function buildConfigFromFilters() {
    return {
      search: filters.search ? filters.search : null,
      status: filters.status === "all" ? null : (filters.status as any),
      priority: filters.priority === "all" ? null : (filters.priority as any),
      supportLevel:
        filters.supportLevel === "all"
          ? null
          : (Number(filters.supportLevel) as 1 | 2 | 3),
      assigneeId:
        filters.assigneeId === "all" || filters.assigneeId === "unassigned"
          ? null
          : Number(filters.assigneeId),
      unassigned: filters.assigneeId === "unassigned" ? true : null,
      departmentId: dept?.id ?? null,
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
                {!deptSlug && (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
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
              {/* Default (no view applied) */}
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
              {summary.open} open
            </span>
            <span className="px-2 py-1 rounded bg-orange-50 text-orange-700">
              {summary.pending} pending
            </span>
            {summary.breached > 0 && (
              <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">
                {summary.breached} breached
              </span>
            )}
          </div>

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
            className="p-0 w-[520px]"
            data-testid="popover-filters"
          >
            <div className="flex h-[340px]">
              {/* Left: categories */}
              <div className="w-[180px] border-r bg-muted/30 py-2 overflow-y-auto">
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
                          const checked = filters[activeCategory] === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                              data-testid={`filter-option-${activeCategory}-${opt.value}`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setFilter(
                                    activeCategory,
                                    v
                                      ? opt.value
                                      : DEFAULT_FILTERS[activeCategory],
                                  );
                                }}
                                className="h-4 w-4"
                              />
                              <span className="truncate">{opt.label}</span>
                            </label>
                          );
                        })}
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

        {/* Sort */}
        <div className="inline-flex h-9 items-center gap-1">
          <Select
            value={sort.field}
            onValueChange={(v) =>
              setSort((s) => ({ ...s, field: v as SortField }))
            }
          >
            <SelectTrigger className="w-[150px] h-9" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Sort: Created</SelectItem>
              <SelectItem value="priority">Sort: Priority</SelectItem>
              <SelectItem value="level">Sort: Level</SelectItem>
              <SelectItem value="assignee">Sort: Assignee</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() =>
              setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))
            }
            data-testid="button-sort-dir"
            title={sort.dir === "asc" ? "Ascending" : "Descending"}
          >
            {sort.dir === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
        </div>

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

      <div className="bg-card rounded-lg border shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[110px]">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-[140px]">Department</TableHead>
                <TableHead className="w-[110px]">Priority</TableHead>
                <TableHead className="w-[80px]">Level</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[160px]">Assignee</TableHead>
                <TableHead className="w-[120px]">SLA</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading tickets…
                  </TableCell>
                </TableRow>
              ) : sortedTickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedTickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="group cursor-pointer"
                    data-testid={`row-ticket-${ticket.id}`}
                  >
                    <TableCell>
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-600 hover:underline tabular-nums"
                      >
                        {ticket.ticketKey}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/tickets/${ticket.id}`} className="block">
                        <div className="font-medium text-foreground truncate max-w-[420px]">
                          {ticket.title}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {ticket.type}
                          {ticket.location ? ` · ${ticket.location}` : ""}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.departmentName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={priorityColor(ticket.priority)}
                      >
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={ticket.supportLevel ?? 1} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 capitalize">
                        {statusIcon(ticket.status)}
                        <span className="text-sm font-medium">
                          {ticket.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.assigneeName ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(ticket.assigneeName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[120px]">
                            {ticket.assigneeName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground/70">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ticket.slaBreached ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Breached
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">
                          On track
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ticket.createdAt), "MMM d")}
                    </TableCell>
                  </TableRow>
                ))
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
              Saves your current search, status, priority, level, and assignee
              filters.
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
    case "open":
      return <Inbox className="h-4 w-4 text-blue-500" />;
    case "pending":
      return <Clock className="h-4 w-4 text-orange-500" />;
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

// Silence unused-import warnings for icons only used as visual cues
void MoreHorizontal;
