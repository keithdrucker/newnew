import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import {
  useListProjects,
  useListDepartments,
  useGetSession,
  useGetDepartmentBoard,
  type ProjectSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectEditorDialog } from "@/components/project-editor-dialog";
import {
  CalendarDays,
  CheckSquare,
  KanbanSquare,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
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
  const { data: session } = useGetSession();
  const canCreate = session?.role === "admin" || session?.role === "agent";
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] =
    useState<ProjectSummary | null>(null);

  const [, deptRouteMatch] = useRoute("/projects/dept/:slug");
  const deptSlug = deptRouteMatch?.slug;
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const activeDept = useMemo(
    () => departments?.find((d) => d.slug === deptSlug),
    [departments, deptSlug],
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto" data-testid="projects-page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-display font-semibold tracking-tight">
            {activeDept ? `${activeDept.name} initiatives` : "Projects"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {activeDept
              ? "Move initiatives across phases. Click a card to edit, manage its checklist, and post updates."
              : "Plan and track initiatives across teams."}
          </p>
        </div>
        {canCreate && (
          <>
            <Button
              data-testid="button-new-project"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" /> New initiative
            </Button>
            <ProjectEditorDialog
              mode="create"
              defaultDepartmentId={activeDept?.id ?? null}
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
          </>
        )}
      </div>

      {activeDept ? (
        <DepartmentBoard
          departmentId={activeDept.id}
          onCardClick={(p) => setEditingProject(p)}
        />
      ) : (
        <GlobalProjectsList onCardClick={(p) => setEditingProject(p)} />
      )}

      {editingProject ? (
        <ProjectEditorDialog
          mode="edit"
          project={editingProject}
          open={editingProject != null}
          onOpenChange={(v) => {
            if (!v) setEditingProject(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DepartmentBoard({
  departmentId,
  onCardClick,
}: {
  departmentId: number;
  onCardClick: (p: ProjectSummary) => void;
}) {
  const { data: board, isLoading } = useGetDepartmentBoard(departmentId);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading board...</p>
    );
  }
  if (!board) return null;

  const columns = board.columns;
  const unassigned = board.unassigned;

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4"
      data-testid="department-kanban"
    >
      {columns.map((col) => (
        <KanbanColumn
          key={col.id}
          name={col.name}
          color={col.color}
          projects={col.projects}
          onCardClick={onCardClick}
          testId={`column-${col.id}`}
        />
      ))}
      {unassigned.length > 0 ? (
        <KanbanColumn
          name="Unassigned"
          color="#CBD5E1"
          projects={unassigned}
          onCardClick={onCardClick}
          testId="column-unassigned"
        />
      ) : null}
    </div>
  );
}

function KanbanColumn({
  name,
  color,
  projects,
  onCardClick,
  testId,
}: {
  name: string;
  color: string;
  projects: ProjectSummary[];
  onCardClick: (p: ProjectSummary) => void;
  testId: string;
}) {
  return (
    <div
      className="w-[280px] shrink-0 rounded-xl bg-muted/40 border border-border/60 flex flex-col"
      data-testid={testId}
    >
      <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-foreground/80 truncate">
          {name}
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {projects.length}
        </span>
      </div>
      <div className="p-2 space-y-2 flex-1 min-h-[60px]">
        {projects.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/70 italic px-1 py-2">
            Empty
          </p>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => onCardClick(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project: p,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}) {
  const total = p.checklistTotal;
  const done = p.checklistDone;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const due = formatDue(p.dueAt);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-project-${p.id}`}
      className="w-full text-left rounded-md bg-card border border-border/70 hover:border-primary/60 hover:shadow-sm transition-all overflow-hidden block"
    >
      <div
        className="h-1"
        style={{ backgroundColor: p.color }}
        aria-hidden
      />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start gap-2">
          <p className="font-medium text-[12.5px] leading-snug flex-1 min-w-0">
            {p.name}
          </p>
          <Badge
            variant="outline"
            className={cn(
              "text-[9.5px] shrink-0 px-1 py-0",
              STATUS_BADGE[p.status],
            )}
          >
            {STATUS_LABEL[p.status]}
          </Badge>
        </div>

        {p.labels && p.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.labels.slice(0, 4).map((label, idx) => (
              <span
                key={`${label.name}-${idx}`}
                className="text-[9.5px] font-medium px-1 py-0 rounded text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : null}

        {total > 0 ? (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="h-2.5 w-2.5" />
                {done}/{total}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: p.color,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground pt-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {p.ownerName ? (
              <Avatar className="h-4 w-4">
                <AvatarFallback className="bg-primary/10 text-primary text-[8px] font-semibold">
                  {initials(p.ownerName)}
                </AvatarFallback>
              </Avatar>
            ) : null}
            {p.commentCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" />
                {p.commentCount}
              </span>
            ) : null}
          </div>
          {due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" /> {due}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function GlobalProjectsList({
  onCardClick,
}: {
  onCardClick: (p: ProjectSummary) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: projects, isLoading } = useListProjects({
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as ProjectSummary["status"]),
    q: search || undefined,
  });

  return (
    <>
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search initiatives..."
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
        <p className="text-sm text-muted-foreground">
          Loading initiatives...
        </p>
      )}

      {!isLoading && projects && projects.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <KanbanSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">No initiatives yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Pick a department from the sidebar to see its phase board.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onCardClick(p)}
            data-testid={`card-project-${p.id}`}
            className="group rounded-xl border bg-card hover:shadow-md transition-all overflow-hidden block text-left"
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
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    {p.departmentName ?? "Cross-functional"}
                    {p.bucketName ? ` • ${p.bucketName}` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] shrink-0",
                    STATUS_BADGE[p.status],
                  )}
                >
                  {STATUS_LABEL[p.status]}
                </Badge>
              </div>
              {p.description && (
                <p className="text-[12.5px] text-muted-foreground line-clamp-2 mb-3">
                  {p.description}
                </p>
              )}

              {p.checklistTotal > 0 ? (
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                    <span>
                      {p.checklistDone} of {p.checklistTotal} steps
                    </span>
                    <span className="tabular-nums">
                      {Math.round(
                        (p.checklistDone / p.checklistTotal) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(
                          (p.checklistDone / p.checklistTotal) * 100,
                        )}%`,
                        backgroundColor: p.color,
                      }}
                    />
                  </div>
                </div>
              ) : null}

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
                    <span className="text-muted-foreground">
                      Unassigned
                    </span>
                  )}
                </div>
                {p.dueAt ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {formatDue(p.dueAt)}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
