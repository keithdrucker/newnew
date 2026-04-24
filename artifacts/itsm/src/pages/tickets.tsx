import {
  useListTickets,
  useGetSession,
  useListDepartments,
  useListAgents,
  useListTicketViews,
  useCreateTicketView,
  useUpdateTicketView,
  useDeleteTicketView,
  getListTicketViewsQueryKey,
} from "@workspace/api-client-react";
import { Link, useRoute } from "wouter";
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
  CheckCircle2,
  Clock,
  Inbox,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
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
import { useQueryClient } from "@tanstack/react-query";

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
  useGetSession();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/tickets/dept/:slug");
  const deptSlug = params?.slug ?? null;

  const { data: departments } = useListDepartments();
  const dept = deptSlug
    ? (departments?.find((d) => d.slug === deptSlug) ?? null)
    : null;

  const { data: agents } = useListAgents();
  const { data: views } = useListTicketViews();
  const createView = useCreateTicketView();
  const updateView = useUpdateTicketView();
  const deleteView = useDeleteTicketView();

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
      assigneeId:
        c.assigneeId == null ? "all" : String(c.assigneeId),
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

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>Ticket Board</span>
            <span>›</span>
            <span>{dept ? dept.name : "All Tickets"}</span>
            {activeView && (
              <>
                <span>›</span>
                <span className="text-foreground font-medium">
                  {activeView.name}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {dept ? dept.name : "All Tickets"}
            <Badge variant="secondary" className="text-[11px]">
              {summary.total}
            </Badge>
          </h1>
          {dept?.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {dept.description}
            </p>
          )}
        </div>
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
      </div>

      {/* Toolbar: Views + Filters + Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Views menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              data-testid="button-views"
            >
              <Star className="h-4 w-4" />
              <span className="font-medium">
                {activeView ? activeView.name : "Views"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {views && views.length > 0 ? (
              views.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    applyView(v.id);
                  }}
                  className="flex items-center justify-between gap-2"
                  data-testid={`menu-view-${v.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {v.isDefault && (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    )}
                    <span className="truncate">{v.name}</span>
                  </div>
                  {activeViewId === v.id && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No saved views yet.
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setSaveName(
                  activeView ? `${activeView.name} (copy)` : "My view",
                );
                setSaveAsDefault(false);
                setSaveOpen(true);
              }}
              data-testid="menu-save-view"
            >
              Save current filters as view…
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
                  {activeView.isDefault
                    ? "Unset as default"
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

        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search tickets…"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilter("status", v)}
        >
          <SelectTrigger className="w-[130px] h-9" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.priority}
          onValueChange={(v) => setFilter("priority", v)}
        >
          <SelectTrigger className="w-[130px] h-9" data-testid="select-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Support level chips: All / L1 / L2 / L3 */}
        <div className="inline-flex h-9 items-center rounded-md border bg-background p-0.5">
          {[
            { v: "all", label: "All levels" },
            { v: "1", label: "L1" },
            { v: "2", label: "L2" },
            { v: "3", label: "L3" },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setFilter("supportLevel", opt.v)}
              className={`px-2.5 h-8 rounded-[5px] text-xs font-medium transition-colors ${
                filters.supportLevel === opt.v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`chip-level-${opt.v}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Assignee filter */}
        <Select
          value={filters.assigneeId}
          onValueChange={(v) => setFilter("assigneeId", v)}
        >
          <SelectTrigger className="w-[180px] h-9" data-testid="select-assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(agents ?? []).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {filtersDirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={clearAll}
            data-testid="button-clear-filters"
          >
            Clear
          </Button>
        )}
      </div>

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
