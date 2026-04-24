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
  getGetProjectQueryKey,
  getListProjectsQueryKey,
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
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Filter,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Trash2,
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
              onEditTask={setEditingTask}
            />
          ))}
          <AddBucketColumn projectId={project.id} />
        </div>
      </div>

      {editingTask && (
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
}: {
  projectId: number;
  bucket: ProjectBucketWithTasks;
  onEditTask: (task: ProjectTask) => void;
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
        {renaming ? (
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
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-[13px] font-semibold text-white hover:bg-white/5 rounded px-1.5 py-0.5 transition-colors"
            data-testid={`bucket-name-${bucket.id}`}
          >
            {bucket.name}
          </button>
        )}
        <span className="text-[11.5px] text-white/45 tabular-nums">
          {bucket.tasks.length}
        </span>
        <div className="flex-1" />
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
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pr-1 pb-2">
        {adding ? (
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
        )}
        {bucket.tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onEditTask(task)} />
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
}: {
  task: ProjectTask;
  onClick: () => void;
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="text-left rounded-md bg-[#2a2a3d] hover:bg-[#33334a] border border-white/5 hover:border-white/10 transition-all overflow-hidden p-2.5 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
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
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? "Mark as incomplete" : "Mark as complete"}
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

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/55">
        <div className="flex items-center gap-2">
          {task.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {checklistDone}/
              {task.checklist.length}
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
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Task updated" });
          onClose();
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm("Delete this task?")) return;
    deleteMutation.mutate(
      { id: task.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Task deleted" });
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="task-title" className="text-[12.5px]">
              Title
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
              data-testid="input-task-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12.5px]">Bucket</Label>
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
              <Label className="text-[12.5px]">Assignee</Label>
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
                Due date
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

          <div>
            <Label className="text-[12.5px]">Checklist</Label>
            <div className="space-y-1 mt-1.5 mb-2">
              {checklist.map((item, idx) => (
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
              ))}
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
                placeholder="Add an item"
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
          </div>

          <div>
            <Label htmlFor="task-desc" className="text-[12.5px]">
              Notes
            </Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="More details about this task..."
              className="mt-1 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid="button-delete-task"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete task
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
