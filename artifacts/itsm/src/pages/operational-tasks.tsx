import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  useGetSession,
  useListDepartments,
  useListAgents,
  useListOperationalTasks,
  useCreateOperationalTask,
  useUpdateOperationalTask,
  useDeleteOperationalTask,
  useCompleteOperationalTask,
  useUpdateMePreferences,
  getGetSessionQueryKey,
  getListOperationalTasksQueryKey,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
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
] as const;

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
  if (isOverdue && status !== "completed") {
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
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const [, deptParams] = useRoute("/operational-tasks/dept/:slug");
  const [, setLocation] = useLocation();
  const deptSlug = deptParams?.slug ?? null;
  const activeDept = useMemo(
    () =>
      deptSlug && Array.isArray(departments)
        ? departments.find((d) => d.slug === deptSlug) ?? null
        : null,
    [departments, deptSlug],
  );

  const updatePreferences = useUpdateMePreferences();
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);

  // Default-board redirect (matches Tickets/Initiatives/Projects pattern).
  const explicitlyAll =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("all") === "1";
  useEffect(() => {
    if (deptSlug) return;
    if (explicitlyAll) return;
    if (!session || !departments) return;
    const slug = session.defaultOperationalTaskBoard;
    if (!slug) return;
    if (departments.some((d) => d.slug === slug)) {
      setLocation(`/operational-tasks/dept/${slug}`, { replace: true });
    }
  }, [deptSlug, explicitlyAll, session, departments, setLocation]);

  // ---- Filters -------------------------------------------------------
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dueWindowFilter, setDueWindowFilter] = useState<string>("all");

  const queryParams = useMemo(() => {
    const p: Parameters<typeof useListOperationalTasks>[0] = {};
    if (activeDept) p.departmentId = activeDept.id;
    if (statusFilter !== "all") p.status = statusFilter;
    if (ownerFilter !== "all") p.ownerId = Number(ownerFilter);
    if (frequencyFilter !== "all")
      p.frequency = frequencyFilter as never;
    if (typeFilter !== "all") p.type = typeFilter as never;
    if (dueWindowFilter !== "all")
      p.dueWindow = dueWindowFilter as never;
    if (search.trim()) p.search = search.trim();
    return p;
  }, [
    activeDept,
    statusFilter,
    ownerFilter,
    frequencyFilter,
    typeFilter,
    dueWindowFilter,
    search,
  ]);

  const { data: tasks, isLoading: tasksLoading, refetch } =
    useListOperationalTasks(queryParams);

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

  async function handleChangeBoard(value: string) {
    setBoardMenuOpen(false);
    if (value === "all") {
      setLocation("/operational-tasks?all=1");
    } else {
      setLocation(`/operational-tasks/dept/${value}`);
    }
  }

  async function handleSetDefaultBoard(value: string) {
    const next = value === "all" ? null : value;
    await updatePreferences.mutateAsync({
      data: { defaultOperationalTaskBoard: next },
    });
    await queryClient.invalidateQueries({
      queryKey: getGetSessionQueryKey(),
    });
  }

  const boardLabel = activeDept ? activeDept.name : "All Operational Tasks";
  const currentBoardIsDefault =
    (session.defaultOperationalTaskBoard ?? null) === (deptSlug ?? null);

  const filtersActive =
    statusFilter !== "all" ||
    ownerFilter !== "all" ||
    frequencyFilter !== "all" ||
    typeFilter !== "all" ||
    dueWindowFilter !== "all" ||
    search.trim() !== "";

  function clearFilters() {
    setStatusFilter("all");
    setOwnerFilter("all");
    setFrequencyFilter("all");
    setTypeFilter("all");
    setDueWindowFilter("all");
    setSearch("");
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
            <DropdownMenu
              open={boardMenuOpen}
              onOpenChange={setBoardMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 text-[22px] font-semibold"
                  data-testid="button-operational-board-picker"
                >
                  <span>{boardLabel}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Teams
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleChangeBoard("all");
                  }}
                  className="flex items-center justify-between"
                  data-testid="operational-board-option-all"
                >
                  <span>All Operational Tasks</span>
                  {!deptSlug && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </DropdownMenuItem>
                {(departments ?? []).map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      handleChangeBoard(d.slug);
                    }}
                    className="flex items-center justify-between"
                    data-testid={`operational-board-option-${d.slug}`}
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
                  data-testid="button-set-default-operational-board"
                >
                  <Star className="h-3.5 w-3.5 mr-2 text-amber-500" />
                  {currentBoardIsDefault
                    ? `${boardLabel} is your default team`
                    : `Set ${boardLabel} as default team`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            disabled={!activeDept}
            title={
              activeDept
                ? "Create operational task"
                : "Pick a team first to create a task"
            }
            data-testid="button-new-operational-task"
          >
            <Plus className="h-4 w-4 mr-1" />
            New task
          </Button>
        </div>
      </header>

      {/* Filter bar — matches Tickets layout */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card/40 px-3 py-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="pl-7 h-8"
            data-testid="input-search-tasks"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="h-8 w-[140px]"
            data-testid="select-filter-status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger
            className="h-8 w-[160px]"
            data-testid="select-filter-owner"
          >
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {(agents ?? []).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
          <SelectTrigger
            className="h-8 w-[140px]"
            data-testid="select-filter-frequency"
          >
            <SelectValue placeholder="Frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All frequencies</SelectItem>
            {FREQUENCY_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger
            className="h-8 w-[130px]"
            data-testid="select-filter-type"
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dueWindowFilter} onValueChange={setDueWindowFilter}>
          <SelectTrigger
            className="h-8 w-[140px]"
            data-testid="select-filter-due"
          >
            <SelectValue placeholder="Due date" />
          </SelectTrigger>
          <SelectContent>
            {DUE_WINDOW_OPTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8"
            data-testid="button-clear-filters"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Task Name</TableHead>
              <TableHead className="w-[120px]">Frequency</TableHead>
              <TableHead className="w-[110px]">Type</TableHead>
              <TableHead className="w-[130px]">Next Due</TableHead>
              <TableHead className="w-[180px]">Owner</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasksLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : (tasks ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground py-10"
                >
                  {filtersActive
                    ? "No tasks match these filters."
                    : "No operational tasks yet. Use “New task” to add one."}
                </TableCell>
              </TableRow>
            ) : (
              (tasks ?? []).map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailId(t.id)}
                  data-testid={`row-operational-task-${t.id}`}
                >
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {freqLabel(t.frequency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {typeLabel(t.type)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(t.nextDueDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.ownerName ?? "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} isOverdue={t.isOverdue} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createOpen && activeDept && (
        <CreateTaskDialog
          departmentId={activeDept.id}
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
  departmentId,
  agents,
  onClose,
  onCreated,
  createTask,
}: {
  departmentId: number;
  agents: Array<{ id: number; name: string }>;
  onClose: () => void;
  onCreated: () => void;
  createTask: ReturnType<typeof useCreateOperationalTask>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"recurring" | "one_time">("recurring");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [nextDueDate, setNextDueDate] = useState<string>(todayYmd());
  const [ownerId, setOwnerId] = useState<string>("none");
  const [error, setError] = useState<string | null>(null);

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
    try {
      await createTask.mutateAsync({
        data: {
          departmentId,
          name: name.trim(),
          description: description.trim(),
          type,
          frequency: type === "recurring" ? (frequency as never) : null,
          nextDueDate,
          ownerId: ownerId === "none" ? null : Number(ownerId),
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

  if (!task) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading…
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const isCompleted = task.status === "completed";

  async function patch(patchData: Parameters<
    typeof updateTask.mutateAsync
  >[0]["data"]) {
    setError(null);
    try {
      await updateTask.mutateAsync({ id: taskId, data: patchData });
      await refetch();
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
      await completeTask.mutateAsync({ id: taskId });
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{task.name}</span>
            <StatusBadge status={task.status} isOverdue={task.isOverdue} />
          </DialogTitle>
          <DialogDescription>{task.departmentName}</DialogDescription>
        </DialogHeader>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <p className="mt-0.5">{typeLabel(task.type)}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            <p className="mt-0.5">{freqLabel(task.frequency)}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Next Due Date
            </Label>
            {isCompleted ? (
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
            {isCompleted ? (
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
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Status</Label>
            {isCompleted ? (
              <p className="mt-0.5">
                Completed{" "}
                {task.completedAt
                  ? `on ${formatDate(task.completedAt.slice(0, 10))}`
                  : ""}{" "}
                {task.completedByName ? `by ${task.completedByName}` : ""}
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
          {isCompleted ? (
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
            {!isCompleted && (
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
                    disabled={isCompleted}
                    onCheckedChange={(v) =>
                      handleToggleChecklist(i, v === true)
                    }
                    className="mt-1"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-2">
                    <Input
                      defaultValue={it.text}
                      onBlur={(e) => {
                        if (e.target.value !== it.text) {
                          handleEditChecklist(i, "text", e.target.value);
                        }
                      }}
                      disabled={isCompleted}
                      className="h-8"
                      data-testid={`input-checklist-text-${i}`}
                    />
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
                      disabled={isCompleted}
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
                      disabled={isCompleted}
                      className="h-8"
                      data-testid={`input-checklist-due-${i}`}
                    />
                  </div>
                  {!isCompleted && (
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

        {error && (
          <p className="text-sm text-destructive" data-testid="text-detail-error">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isCompleted && (
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
            {!isCompleted &&
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
