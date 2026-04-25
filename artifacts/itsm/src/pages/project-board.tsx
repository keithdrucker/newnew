import { useState, useEffect, useMemo } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetProject,
  useCreateProjectBucket,
  useUpdateProjectBucket,
  useDeleteProjectBucket,
  useCreateProjectTask,
  useUpdateProjectTask,
  useDeleteProjectTask,
  useListAgents,
  useListDepartments,
  useListProjectTaskComments,
  useCreateProjectTaskComment,
  useDeleteProjectTaskComment,
  useGetSession,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getListProjectTaskCommentsQueryKey,
  type ProjectTask,
  type ProjectBucketWithTasks,
  type ProjectDetail,
  type TaskLabel,
  type ChecklistItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Filter,
  Lightbulb,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Share2,
  Target,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LABEL_COLORS = [
  { name: "Sky", value: "#0EA5E9" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Emerald", value: "#10B981" },
  { name: "Slate", value: "#64748B" },
  { name: "Orange", value: "#F97316" },
];

const PRIORITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const;

const PRIORITY_DOT = {
  low: "bg-slate-400",
  medium: "bg-sky-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
} as const;

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
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
    return "Today";
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  )
    return "Tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(iso: string | null | undefined, completed: boolean) {
  if (!iso || completed) return false;
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export default function ProjectBoard() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? Number(params.id) : NaN;
  const { data: project, isLoading } = useGetProject(projectId);
  const { data: session } = useGetSession();
  const canManage = session?.role === "admin" || session?.role === "agent";
  const [search, setSearch] = useState("");
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);

  const filtered = useMemo(() => {
    if (!project) return [];
    if (!search.trim()) return project.buckets;
    const needle = search.toLowerCase();
    return project.buckets.map((b) => ({
      ...b,
      tasks: b.tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.description.toLowerCase().includes(needle) ||
          t.labels.some((l) => l.name.toLowerCase().includes(needle)),
      ),
    }));
  }, [project, search]);

  if (isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading board…</div>
    );
  }
  if (!project) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link
          href="/projects"
          className="text-sm text-primary hover:underline mt-2 inline-block"
        >
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]" data-testid="project-board">
      <BoardHeader project={project} />
      <BoardToolbar
        projectId={project.id}
        search={search}
        onSearch={setSearch}
      />

      <div className="flex-1 min-h-0 overflow-x-auto bg-[#1f1f2e] dark:bg-[#1a1a26]">
        <div className="inline-flex h-full gap-3 p-4 min-h-full">
          {filtered.map((bucket) => (
            <BucketColumn
              key={bucket.id}
              projectId={project.id}
              bucket={bucket}
              onEditTask={canManage ? setEditingTask : null}
              canManage={canManage}
            />
          ))}
          {canManage && <AddBucketColumn projectId={project.id} />}
        </div>
      </div>

      {canManage && editingTask && (
        <TaskEditorDialog
          task={editingTask}
          buckets={project.buckets}
          projectId={project.id}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

function BoardHeader({ project }: { project: ProjectDetail }) {
  return (
    <div className="bg-[#0f0f1a] text-white border-b border-white/10">
      <div className="px-6 pt-3 pb-1.5 flex items-center gap-3 text-[12.5px] text-white/60">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
          data-testid="link-back-projects"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> My plans
        </Link>
        <span className="text-white/30">/</span>
        <span className="text-white">{project.name}</span>
      </div>
      <div className="px-6 pb-1 flex items-center gap-3">
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: project.color }}
          aria-hidden
        >
          <ListChecks className="h-4 w-4 text-white/90" />
        </div>
        <h1 className="font-display font-semibold text-[18px] tracking-tight">
          {project.name}
        </h1>
        <span className="text-white/40 text-[12px]">
          {project.taskCount} task{project.taskCount === 1 ? "" : "s"}
          {project.completedTaskCount > 0 &&
            ` · ${project.completedTaskCount} done`}
        </span>
      </div>
      <div className="px-4 flex items-end gap-1 -mb-px">
        {["Board", "Charts", "Schedule"].map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={tab !== "Board"}
            className={cn(
              "px-4 py-2 text-[13px] font-medium rounded-t-md transition-colors",
              tab === "Board"
                ? "bg-[#1f1f2e] dark:bg-[#1a1a26] text-white"
                : "text-white/45 cursor-not-allowed",
            )}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardToolbar({
  projectId,
  search,
  onSearch,
}: {
  projectId: number;
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="bg-[#1f1f2e] dark:bg-[#1a1a26] px-4 py-2 flex items-center gap-2 border-b border-white/5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/45" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search tasks..."
          className="pl-8 h-8 w-64 bg-white/5 border-white/10 text-white placeholder:text-white/35 focus-visible:ring-white/20"
          data-testid="input-board-search"
        />
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white transition-colors cursor-not-allowed opacity-60"
        disabled
      >
        <Filter className="h-3.5 w-3.5" /> Filter
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
      >
        Group by Bucket <ChevronDown className="h-3 w-3" />
      </button>
      <div className="flex-1" />
      <button
        type="button"
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white transition-colors cursor-not-allowed opacity-60"
        disabled
      >
        <Share2 className="h-3.5 w-3.5" /> Share
      </button>
      <span className="sr-only">Project {projectId}</span>
    </div>
  );
}

function BucketColumn({
  projectId,
  bucket,
  onEditTask,
  canManage,
}: {
  projectId: number;
  bucket: ProjectBucketWithTasks;
  onEditTask: ((task: ProjectTask) => void) | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bucket.name);
  const renameMutation = useUpdateProjectBucket();
  const deleteMutation = useDeleteProjectBucket();
  const [adding, setAdding] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetProjectQueryKey(projectId),
    });

  const submitRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === bucket.name) {
      setName(bucket.name);
      setRenaming(false);
      return;
    }
    renameMutation.mutate(
      { id: bucket.id, data: { name: trimmed } },
      {
        onSuccess: () => {
          setRenaming(false);
          invalidate();
        },
      },
    );
  };

  const remove = () => {
    if (
      !window.confirm(
        `Delete bucket "${bucket.name}" and all ${bucket.tasks.length} task(s)?`,
      )
    )
      return;
    deleteMutation.mutate(
      { id: bucket.id },
      {
        onSuccess: () => {
          toast({ title: "Bucket deleted" });
          invalidate();
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
        },
      },
    );
  };

  return (
    <div
      className="w-[280px] shrink-0 flex flex-col"
      data-testid={`bucket-${bucket.id}`}
    >
      <div className="flex items-center gap-1.5 px-1 mb-2">
        {canManage && renaming ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setName(bucket.name);
                setRenaming(false);
              }
            }}
            autoFocus
            className="h-7 text-[13px] bg-white/10 border-white/15 text-white"
          />
        ) : canManage ? (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-[13px] font-semibold text-white hover:bg-white/5 rounded px-1.5 py-0.5 transition-colors"
            data-testid={`bucket-name-${bucket.id}`}
          >
            {bucket.name}
          </button>
        ) : (
          <span
            className="text-[13px] font-semibold text-white px-1.5 py-0.5"
            data-testid={`bucket-name-${bucket.id}`}
          >
            {bucket.name}
          </span>
        )}
        <span className="text-[11.5px] text-white/45 tabular-nums">
          {bucket.tasks.length}
        </span>
        <div className="flex-1" />
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-6 w-6 rounded flex items-center justify-center text-white/45 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Bucket menu"
                data-testid={`bucket-menu-${bucket.id}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                Rename bucket
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={remove}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete bucket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pr-1 pb-2">
        {canManage &&
          (adding ? (
            <NewTaskInline
              projectId={projectId}
              bucketId={bucket.id}
              onClose={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-[12.5px] text-white/55 hover:text-white py-1.5 px-2 rounded hover:bg-white/5 transition-colors"
              data-testid={`add-task-${bucket.id}`}
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          ))}
        {bucket.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={onEditTask ? () => onEditTask(task) : null}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}

function NewTaskInline({
  projectId,
  bucketId,
  onClose,
}: {
  projectId: number;
  bucketId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const createMutation = useCreateProjectTask();

  const submit = () => {
    if (!title.trim()) {
      onClose();
      return;
    }
    createMutation.mutate(
      { id: projectId, data: { bucketId, title: title.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(projectId),
          });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          setTitle("");
          onClose();
        },
      },
    );
  };

  return (
    <div className="rounded-md bg-[#2a2a3d] border border-white/10 p-2">
      <Textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onClose();
        }}
        placeholder="Enter a task name"
        autoFocus
        className="min-h-[52px] text-[13px] bg-transparent border-0 text-white placeholder:text-white/40 focus-visible:ring-0 resize-none p-0"
        data-testid="input-new-task-title"
      />
      <div className="flex justify-end gap-1.5 mt-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/5"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={createMutation.isPending}
          className="h-7 px-3"
          data-testid="button-submit-new-task"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onClick,
  canManage,
}: {
  task: ProjectTask;
  onClick: (() => void) | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateProjectTask();
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const due = formatDue(task.dueAt);
  const overdue = isOverdue(task.dueAt, task.completed);

  const toggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate(
      { id: task.id, data: { completed: !task.completed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(task.projectId),
          });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
        },
      },
    );
  };

  const interactive = canManage && onClick !== null;

  return (
    <div
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={cn(
        "text-left rounded-md bg-[#2a2a3d] border border-white/5 transition-all overflow-hidden p-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60",
        interactive &&
          "hover:bg-[#33334a] hover:border-white/10 cursor-pointer",
      )}
      data-testid={`task-card-${task.id}`}
    >
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label, idx) => (
            <span
              key={`${label.name}-${idx}`}
              className="inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        {canManage ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={task.completed}
            aria-label={
              task.completed ? "Mark as incomplete" : "Mark as complete"
            }
            onClick={toggleComplete}
            className="shrink-0 mt-0.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 rounded-full"
            data-testid={`task-toggle-${task.id}`}
          >
            {task.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <CircleDashed className="h-4 w-4 text-white/40 group-hover:text-white/70 transition-colors" />
            )}
          </button>
        ) : task.completed ? (
          <CheckCircle2
            className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400"
            aria-label="Completed"
          />
        ) : (
          <CircleDashed
            className="h-4 w-4 shrink-0 mt-0.5 text-white/40"
            aria-label="Not completed"
          />
        )}
        <p
          className={cn(
            "text-[13px] leading-snug text-white/95",
            task.completed && "line-through text-white/45",
          )}
        >
          {task.title}
        </p>
      </div>

      {task.priority !== "medium" && (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[task.priority])}
          />
          <span className="text-[10.5px] uppercase tracking-wide text-white/55">
            {PRIORITY_LABEL[task.priority]}
          </span>
        </div>
      )}

      {(task.suggestedByName || task.completedYear) && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-white/55">
          {task.suggestedByName && (
            <span className="truncate">
              Suggested by {task.suggestedByName}
            </span>
          )}
          {task.completedYear && (
            <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-medium">
              Completed {task.completedYear}
            </span>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/55">
        <div className="flex items-center gap-2">
          {task.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {checklistDone}/
              {task.checklist.length}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {task.commentCount}
            </span>
          )}
          {due && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "text-red-400",
              )}
            >
              <CalendarDays className="h-3 w-3" /> {due}
            </span>
          )}
        </div>
        {task.assigneeName && (
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-white/15 text-white text-[9px] font-semibold">
              {initials(task.assigneeName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}

function AddBucketColumn({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const createMutation = useCreateProjectBucket();

  const submit = () => {
    if (!name.trim()) {
      setAdding(false);
      return;
    }
    createMutation.mutate(
      { id: projectId, data: { name: name.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(projectId),
          });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          setName("");
          setAdding(false);
        },
      },
    );
  };

  if (adding) {
    return (
      <div className="w-[280px] shrink-0">
        <div className="rounded-md bg-white/5 border border-white/10 p-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Bucket name"
            autoFocus
            className="h-7 text-[13px] bg-transparent border-0 text-white placeholder:text-white/40 focus-visible:ring-0"
            data-testid="input-new-bucket-name"
          />
          <div className="flex justify-end gap-1.5 mt-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
              className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={createMutation.isPending}
              className="h-7 px-3"
              data-testid="button-submit-new-bucket"
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="w-[280px] shrink-0 h-10 mt-7 flex items-center gap-1.5 px-3 rounded-md text-[13px] text-white/55 hover:text-white hover:bg-white/5 transition-colors"
      data-testid="button-add-bucket"
    >
      <Plus className="h-3.5 w-3.5" /> Add bucket
    </button>
  );
}

// ---------- Initiative detail dialog ----------
//
// Each card on the project board represents a candidate initiative moving
// through the EW Howell pipeline (New Suggestions → Future Roadmap → …
// → Completed). The dialog is sectioned to mirror how the team thinks
// about an idea: who proposed it, what it is, why we'd do it, how we'd
// do it, and the running activity log of what's been done so far.
function TaskEditorDialog({
  task,
  buckets,
  projectId,
  onClose,
}: {
  task: ProjectTask;
  buckets: ProjectBucketWithTasks[];
  projectId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: agents } = useListAgents({});
  const { data: departments } = useListDepartments();
  const updateMutation = useUpdateProjectTask();
  const deleteMutation = useDeleteProjectTask();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [bucketId, setBucketId] = useState<number>(task.bucketId);
  const [assigneeId, setAssigneeId] = useState<string>(
    task.assigneeId == null ? "none" : String(task.assigneeId),
  );
  const [priority, setPriority] = useState<ProjectTask["priority"]>(
    task.priority,
  );
  const [dueDate, setDueDate] = useState<string>(
    task.dueAt ? task.dueAt.substring(0, 10) : "",
  );
  const [labels, setLabels] = useState<TaskLabel[]>(task.labels);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].value);

  // Initiative fields.
  const [suggestedById, setSuggestedById] = useState<string>(
    task.suggestedById == null ? "none" : String(task.suggestedById),
  );
  const [goal, setGoal] = useState(task.goal);
  const [implementation, setImplementation] = useState(task.implementation);
  const [rationale, setRationale] = useState(task.rationale);
  const [impactedDepartmentIds, setImpactedDepartmentIds] = useState<number[]>(
    task.impactedDepartmentIds,
  );
  const [additionalComments, setAdditionalComments] = useState(
    task.additionalComments,
  );

  // Keep local form state in sync if the task prop changes (e.g. after save).
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setBucketId(task.bucketId);
    setAssigneeId(task.assigneeId == null ? "none" : String(task.assigneeId));
    setPriority(task.priority);
    setDueDate(task.dueAt ? task.dueAt.substring(0, 10) : "");
    setLabels(task.labels);
    setChecklist(task.checklist);
    setSuggestedById(
      task.suggestedById == null ? "none" : String(task.suggestedById),
    );
    setGoal(task.goal);
    setImplementation(task.implementation);
    setRationale(task.rationale);
    setImpactedDepartmentIds(task.impactedDepartmentIds);
    setAdditionalComments(task.additionalComments);
  }, [task]);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetProjectQueryKey(projectId),
    });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const save = () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      {
        id: task.id,
        data: {
          title: title.trim(),
          description,
          bucketId,
          assigneeId: assigneeId === "none" ? null : Number(assigneeId),
          priority,
          dueAt: dueDate ? new Date(dueDate).toISOString() : null,
          labels,
          checklist,
          suggestedById:
            suggestedById === "none" ? null : Number(suggestedById),
          goal,
          implementation,
          rationale,
          impactedDepartmentIds,
          additionalComments,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Initiative updated" });
          onClose();
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm("Delete this initiative?")) return;
    deleteMutation.mutate(
      { id: task.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Initiative deleted" });
          onClose();
        },
      },
    );
  };

  const addLabel = () => {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    setLabels((prev) => [...prev, { name: trimmed, color: newLabelColor }]);
    setNewLabelName("");
  };

  const addChecklistItem = () => {
    const trimmed = newChecklistItem.trim();
    if (!trimmed) return;
    setChecklist((prev) => [...prev, { text: trimmed, done: false }]);
    setNewChecklistItem("");
  };

  const toggleDept = (id: number) => {
    setImpactedDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const completedDone = checklist.filter((c) => c.done).length;
  const checklistPct = checklist.length
    ? Math.round((completedDone / checklist.length) * 100)
    : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-3xl max-h-[92vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Initiative detail</span>
            {task.completedYear && (
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
                Completed {task.completedYear}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Title */}
          <div>
            <Label htmlFor="task-title" className="text-[12.5px]">
              Title
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 text-[15px]"
              data-testid="input-task-title"
            />
          </div>

          {/* IDEA */}
          <section className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> Idea
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12.5px]">Suggested by</Label>
                <Select
                  value={suggestedById}
                  onValueChange={setSuggestedById}
                >
                  <SelectTrigger
                    className="mt-1"
                    data-testid="select-task-suggested-by"
                  >
                    <SelectValue placeholder="Pick a person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {agents?.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-goal" className="text-[12.5px] inline-flex items-center gap-1">
                  <Target className="h-3 w-3" /> Goal
                </Label>
                <Input
                  id="task-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="What outcome are we after?"
                  className="mt-1"
                  data-testid="input-task-goal"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="task-desc" className="text-[12.5px]">
                Brief description
              </Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is the idea, in a sentence or two?"
                className="mt-1 min-h-[70px]"
                data-testid="input-task-description"
              />
            </div>
          </section>

          {/* PLAN */}
          <section className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Plan
            </h4>
            <div>
              <Label htmlFor="task-impl" className="text-[12.5px]">
                How should it be implemented?
              </Label>
              <Textarea
                id="task-impl"
                value={implementation}
                onChange={(e) => setImplementation(e.target.value)}
                placeholder="Steps, tools, vendors, rollout approach..."
                className="mt-1 min-h-[80px]"
                data-testid="input-task-implementation"
              />
            </div>
            <div>
              <Label htmlFor="task-rationale" className="text-[12.5px]">
                Why is there a need to implement this?
              </Label>
              <Textarea
                id="task-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="The pain or opportunity this addresses..."
                className="mt-1 min-h-[70px]"
                data-testid="input-task-rationale"
              />
            </div>
            <div>
              <Label className="text-[12.5px] inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Impacted departments
              </Label>
              <div
                className="mt-1.5 flex flex-wrap gap-1.5"
                data-testid="impacted-departments"
              >
                {(departments ?? []).length === 0 && (
                  <span className="text-[12px] text-muted-foreground">
                    Loading departments...
                  </span>
                )}
                {departments?.map((d) => {
                  const selected = impactedDepartmentIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.id)}
                      className={cn(
                        "text-[11.5px] font-medium px-2 py-1 rounded border transition-colors",
                        selected
                          ? "border-transparent text-white"
                          : "border-border bg-background hover:bg-muted",
                      )}
                      style={
                        selected
                          ? { backgroundColor: d.color || "#475569" }
                          : undefined
                      }
                      data-testid={`dept-toggle-${d.id}`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* WORKFLOW */}
          <section className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workflow
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12.5px]">Phase</Label>
                <Select
                  value={String(bucketId)}
                  onValueChange={(v) => setBucketId(Number(v))}
                >
                  <SelectTrigger className="mt-1" data-testid="select-task-bucket">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {buckets.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12.5px]">Owner</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger
                    className="mt-1"
                    data-testid="select-task-assignee"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {agents?.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12.5px]">Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as ProjectTask["priority"])
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-due" className="text-[12.5px]">
                  Target date
                </Label>
                <Input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-task-due"
                />
              </div>
            </div>

            {/* Labels (collapsed-feeling) */}
            <div>
              <Label className="text-[12.5px]">Labels</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                {labels.map((label, idx) => (
                  <span
                    key={`${label.name}-${idx}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                    <button
                      type="button"
                      onClick={() =>
                        setLabels(labels.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove label"
                      className="hover:bg-black/20 rounded"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add a label"
                  className="h-8 text-[12.5px]"
                  data-testid="input-new-label"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-md border flex items-center justify-center"
                      style={{ backgroundColor: newLabelColor }}
                      aria-label="Pick label color"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="grid grid-cols-4 gap-1.5">
                      {LABEL_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setNewLabelColor(c.value)}
                          className={cn(
                            "h-6 w-6 rounded ring-2 transition-all",
                            newLabelColor === c.value
                              ? "ring-foreground/40"
                              : "ring-transparent hover:ring-foreground/20",
                          )}
                          style={{ backgroundColor: c.value }}
                          aria-label={c.name}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLabel}
                  className="h-8"
                  data-testid="button-add-label"
                >
                  Add
                </Button>
              </div>
            </div>
          </section>

          {/* CHECKLIST (Point A → Z) */}
          <section className="rounded-md border border-border/60 p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Checklist (Point A → Z)
              </h4>
              {checklist.length > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {completedDone}/{checklist.length} ({checklistPct}%)
                </span>
              )}
            </div>
            <div className="space-y-1">
              {checklist.map((item, idx) => {
                const assigned =
                  item.assigneeId != null
                    ? (agents?.find((a) => a.id === item.assigneeId) ?? null)
                    : null;
                const assignedName = item.assigneeName ?? assigned?.name ?? null;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 group"
                    data-testid={`checklist-item-${idx}`}
                  >
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(v) => {
                        setChecklist(
                          checklist.map((c, i) =>
                            i === idx ? { ...c, done: !!v } : c,
                          ),
                        );
                      }}
                    />
                    <span
                      className={cn(
                        "flex-1 text-[13px]",
                        item.done && "line-through text-muted-foreground",
                      )}
                    >
                      {item.text}
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 inline-flex items-center gap-1.5 h-6 px-1.5 rounded-full border text-[11px] transition-colors",
                            assignedName
                              ? "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-200 hover:bg-blue-500/25"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                          aria-label={
                            assignedName
                              ? `Assigned to ${assignedName}, change owner`
                              : "Assign owner"
                          }
                          data-testid={`checklist-assignee-${idx}`}
                        >
                          {assignedName ? (
                            <>
                              <Avatar className="h-4 w-4">
                                <AvatarFallback className="bg-blue-500/30 text-[8px] font-semibold">
                                  {initials(assignedName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate max-w-[80px]">
                                {assignedName.split(" ")[0]}
                              </span>
                            </>
                          ) : (
                            <span>Assign</span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1" align="end">
                        <button
                          type="button"
                          onClick={() => {
                            setChecklist(
                              checklist.map((c, i) =>
                                i === idx
                                  ? {
                                      ...c,
                                      assigneeId: null,
                                      assigneeName: null,
                                    }
                                  : c,
                              ),
                            );
                          }}
                          className="w-full text-left text-[12.5px] px-2 py-1.5 rounded hover:bg-muted text-muted-foreground"
                          data-testid={`checklist-assignee-clear-${idx}`}
                        >
                          Unassigned
                        </button>
                        <div className="max-h-56 overflow-y-auto">
                          {agents?.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                setChecklist(
                                  checklist.map((c, i) =>
                                    i === idx
                                      ? {
                                          ...c,
                                          assigneeId: a.id,
                                          assigneeName: a.name,
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              className={cn(
                                "w-full text-left text-[12.5px] px-2 py-1.5 rounded hover:bg-muted inline-flex items-center gap-2",
                                item.assigneeId === a.id && "bg-muted",
                              )}
                              data-testid={`checklist-assignee-pick-${idx}-${a.id}`}
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="bg-foreground/10 text-[9px] font-semibold">
                                  {initials(a.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{a.name}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist(checklist.filter((_, i) => i !== idx))
                      }
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      aria-label="Remove item"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Add a step"
                className="h-8 text-[12.5px]"
                data-testid="input-new-checklist"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChecklistItem}
                className="h-8"
              >
                Add
              </Button>
            </div>
          </section>

          {/* ADDITIONAL COMMENTS */}
          <div>
            <Label htmlFor="task-additional" className="text-[12.5px]">
              Additional comments
            </Label>
            <Textarea
              id="task-additional"
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              placeholder="Anything else worth capturing..."
              className="mt-1 min-h-[70px]"
              data-testid="input-task-additional"
            />
          </div>

          {/* ACTIVITY LOG */}
          <ActivityLog taskId={task.id} />
        </div>

        <DialogFooter className="flex sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid="button-delete-task"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete initiative
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={updateMutation.isPending}
              data-testid="button-save-task"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Activity log / discussion thread on the initiative. Loaded lazily so
// the dialog body opens fast even when there's a long history.
function ActivityLog({ taskId }: { taskId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: comments, isLoading } = useListProjectTaskComments(taskId);
  const createMutation = useCreateProjectTaskComment();
  const deleteMutation = useDeleteProjectTaskComment();
  const [body, setBody] = useState("");

  const invalidateComments = () => {
    queryClient.invalidateQueries({
      queryKey: getListProjectTaskCommentsQueryKey(taskId),
    });
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    createMutation.mutate(
      { id: taskId, data: { body: trimmed } },
      {
        onSuccess: () => {
          setBody("");
          invalidateComments();
        },
        onError: () =>
          toast({ title: "Could not post comment", variant: "destructive" }),
      },
    );
  };

  const remove = (commentId: number) => {
    if (!window.confirm("Delete this comment?")) return;
    deleteMutation.mutate(
      { id: taskId, commentId },
      { onSuccess: invalidateComments },
    );
  };

  const sorted = useMemo(
    () =>
      (comments ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [comments],
  );

  return (
    <section className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
      <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> Activity log
      </h4>

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Log what was done, decisions made, blockers..."
          className="min-h-[60px] text-[13px]"
          data-testid="input-new-comment"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="button"
          onClick={submit}
          disabled={createMutation.isPending || !body.trim()}
          className="self-end"
          data-testid="button-post-comment"
        >
          <Send className="h-4 w-4 mr-1.5" />
          Post
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading activity...</p>
      ) : sorted.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No activity yet. Post the first update.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((c) => (
            <li
              key={c.id}
              className="rounded border border-border/50 bg-background/50 p-2.5 group"
              data-testid={`comment-${c.id}`}
            >
              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {c.authorName ?? "System"}
                </span>
                <div className="flex items-center gap-2">
                  <time>
                    {new Date(c.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                    aria-label="Delete comment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[13px] whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
