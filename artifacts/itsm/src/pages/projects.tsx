import { useState, useMemo } from "react";
import { Link, useRoute } from "wouter";
import {
  useListProjects,
  useCreateProject,
  useListDepartments,
  useListAgents,
  getListProjectsQueryKey,
  type ProjectSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, KanbanSquare, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ProjectSummary["status"], string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_BADGE: Record<ProjectSummary["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  on_hold: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const COLOR_SWATCHES = [
  "#4B9CD3",
  "#5B5FC7",
  "#A4373A",
  "#107C10",
  "#8764B8",
  "#C239B3",
  "#F7630C",
  "#0078D4",
  "#498205",
];

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
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const [, deptRouteMatch] = useRoute("/projects/dept/:slug");
  const deptSlug = deptRouteMatch?.slug;
  const { data: departments } = useListDepartments();
  const activeDept = useMemo(
    () => departments?.find((d) => d.slug === deptSlug),
    [departments, deptSlug],
  );

  const { data: projects, isLoading } = useListProjects({
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as ProjectSummary["status"]),
    q: search || undefined,
    departmentId: activeDept?.id,
  });

  return (
    <div className="p-8 max-w-[1400px] mx-auto" data-testid="projects-page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-display font-semibold tracking-tight">
            {activeDept ? `${activeDept.name} projects` : "Projects"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {activeDept
              ? `Projects scoped to the ${activeDept.name} department.`
              : "Plan and track work across teams. Each project is a board of buckets and tasks."}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-project">
              <Plus className="h-4 w-4 mr-1.5" /> New project
            </Button>
          </DialogTrigger>
          <NewProjectDialog
            onCreated={() => {
              setOpen(false);
              queryClient.invalidateQueries({
                queryKey: getListProjectsQueryKey(),
              });
              toast({ title: "Project created" });
            }}
          />
        </Dialog>
      </div>

      <div className="flex gap-2 mb-5">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-[160px] h-9"
            data-testid="select-project-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      )}

      {!isLoading && projects && projects.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <KanbanSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">No projects yet</p>
          <p className="text-[13px] text-muted-foreground mt-1 mb-4">
            Create a project to start planning work in buckets.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New project
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => {
          const total = p.taskCount;
          const done = p.completedTaskCount;
          const pct = total === 0 ? 0 : Math.round((done / total) * 100);
          const due = formatDue(p.dueAt);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              data-testid={`card-project-${p.id}`}
              className="group rounded-xl border bg-card hover:shadow-md transition-all overflow-hidden block"
            >
              <div
                className="h-2"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-[15px] leading-tight truncate group-hover:text-primary transition-colors">
                      {p.name}
                    </p>
                    {p.departmentName && (
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">
                        {p.departmentName}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] shrink-0", STATUS_BADGE[p.status])}
                  >
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                {p.description && (
                  <p className="text-[12.5px] text-muted-foreground line-clamp-2 mb-3">
                    {p.description}
                  </p>
                )}

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                    <span>
                      {done} of {total} tasks
                    </span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: p.color,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11.5px]">
                  <div className="flex items-center gap-1.5">
                    {p.ownerName ? (
                      <>
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">
                            {initials(p.ownerName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground truncate">
                          {p.ownerName}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                  {due && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <CalendarDays className="h-3 w-3" /> {due}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NewProjectDialog({ onCreated }: { onCreated: () => void }) {
  const { data: departments } = useListDepartments();
  const { data: agents } = useListAgents({});
  const createMutation = useCreateProject();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [ownerId, setOwnerId] = useState<string>("none");

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        data: {
          name: name.trim(),
          description: description.trim(),
          color,
          status: "active",
          departmentId: departmentId === "none" ? null : Number(departmentId),
          ownerId: ownerId === "none" ? null : Number(ownerId),
        },
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setDepartmentId("none");
          setOwnerId("none");
          onCreated();
        },
      },
    );
  };

  return (
    <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
      </DialogHeader>
      <div className="space-y-3.5">
        <div>
          <Label htmlFor="proj-name" className="text-[12.5px]">
            Name
          </Label>
          <Input
            id="proj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. IT Initiatives"
            className="mt-1"
            data-testid="input-project-name"
          />
        </div>
        <div>
          <Label htmlFor="proj-desc" className="text-[12.5px]">
            Description
          </Label>
          <Textarea
            id="proj-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this board for?"
            className="mt-1 min-h-[70px]"
            data-testid="textarea-project-desc"
          />
        </div>
        <div>
          <Label className="text-[12.5px]">Color</Label>
          <div className="flex gap-1.5 mt-1.5">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 transition-all",
                  color === c
                    ? "ring-foreground/40 scale-110"
                    : "ring-transparent hover:ring-foreground/20",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                data-testid={`color-${c}`}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12.5px]">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12.5px]">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Me (default)</SelectItem>
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={submit}
          disabled={createMutation.isPending}
          data-testid="button-create-project"
        >
          {createMutation.isPending ? "Creating..." : "Create project"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
