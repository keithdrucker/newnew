import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import {
  useListProjects,
  useListDepartments,
  useGetSession,
  type ProjectSummary,
  type ProjectPhase,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ProjectImportDialog,
  ProjectDetailDialog,
} from "@/components/project-detail-dialog";
import {
  CalendarDays,
  CheckSquare,
  KanbanSquare,
  Pause,
  Upload,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Phase board columns, in canonical order. The board is global — every
// project is shown in exactly one column based on its `phase`.
const PHASE_COLUMNS: { key: ProjectPhase; label: string; color: string }[] = [
  {
    key: "backlog_needs_assignment",
    label: "Backlog · Needs Assignment",
    color: "#94A3B8",
  },
  { key: "planning", label: "Planning", color: "#0EA5E9" },
  { key: "in_progress", label: "In Progress", color: "#10B981" },
  { key: "on_hold", label: "On Hold", color: "#F59E0B" },
  { key: "completed", label: "Completed", color: "#0D9488" },
  { key: "closed", label: "Closed", color: "#64748B" },
  { key: "cancelled", label: "Cancelled", color: "#F43F5E" },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
  medium: "bg-sky-100 text-sky-700 border-sky-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  urgent: "bg-rose-100 text-rose-800 border-rose-200",
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
  });
}

// Backlog sub-status is purely derived — there is no `subStatus` column. A
// project sits in Backlog as "Scheduled" once it has an owner AND both a
// start and an anticipated completion date; otherwise it's "Needs Assignment".
// Removing any of those three reverts the badge automatically. Sub-status is
// for clarity only — the project never leaves the Backlog phase column.
export type BacklogSubStatus = "needs_assignment" | "scheduled";

export function backlogSubStatus(p: {
  ownerId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): BacklogSubStatus {
  return p.ownerId != null && p.startDate != null && p.endDate != null
    ? "scheduled"
    : "needs_assignment";
}

// Days between today (UTC date-only) and an ISO `YYYY-MM-DD` date string.
// Positive = future, 0 = today, negative = past. Returns null if no date.
export function daysFromTodayTo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const today = Date.UTC(
    Number(todayISO.slice(0, 4)),
    Number(todayISO.slice(5, 7)) - 1,
    Number(todayISO.slice(8, 10)),
  );
  const target = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Dynamic, human-friendly label for a Backlog start date.
// `tone` indicates whether the schedule is healthy ("ok") or has slipped
// ("late"); the caller styles accordingly (rose for "late").
export function startDateLabel(
  iso: string | null | undefined,
): { text: string; tone: "ok" | "late" } | null {
  const days = daysFromTodayTo(iso);
  if (days === null) return null;
  if (days < 0) {
    return {
      text: `Start date missed by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
      tone: "late",
    };
  }
  if (days === 0) return { text: "Starts today", tone: "ok" };
  if (days === 1) return { text: "Starts tomorrow", tone: "ok" };
  return { text: `Starts in ${days} days`, tone: "ok" };
}

export default function ProjectsPage() {
  const { data: session } = useGetSession();
  const canCreate = session?.role === "admin" || session?.role === "agent";
  const [createOpen, setCreateOpen] = useState(false);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [, deptRouteMatch] = useRoute("/projects/dept/:slug");
  const deptSlug = deptRouteMatch?.slug;
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const activeDept = useMemo(
    () => departments?.find((d) => d.slug === deptSlug),
    [departments, deptSlug],
  );

  // We always render the same fixed 6-column phase board; if a department
  // is selected via URL we just narrow the result set to that dept.
  const { data: projects, isLoading } = useListProjects({
    q: search || undefined,
  });

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!activeDept) return projects;
    return projects.filter((p) => p.departmentId === activeDept.id);
  }, [projects, activeDept]);

  const byPhase = useMemo(() => {
    const map: Record<ProjectPhase, ProjectSummary[]> = {
      backlog_needs_assignment: [],
      planning: [],
      in_progress: [],
      on_hold: [],
      completed: [],
      closed: [],
      cancelled: [],
    };
    for (const p of filtered) {
      const phase = (p.phase ?? "backlog_needs_assignment") as ProjectPhase;
      (map[phase] ?? map.backlog_needs_assignment).push(p);
    }
    return map;
  }, [filtered]);

  return (
    <div className="p-8 max-w-[1800px] mx-auto" data-testid="projects-page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-display font-semibold tracking-tight">
            {activeDept ? `${activeDept.name} projects` : "Projects"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Move projects through Backlog → Planning → In Progress →
            Completed. Click a card to assign owners, manage the
            checklist, and post status updates.
          </p>
        </div>
        {canCreate && (
          <Button
            variant="outline"
            data-testid="button-import-project"
            onClick={() => setCreateOpen(true)}
            title="Backfill an existing in-flight project"
          >
            <Upload className="h-4 w-4 mr-1.5" /> Import project
          </Button>
        )}
      </div>

      <ProjectImportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDepartmentId={activeDept?.id ?? null}
      />

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
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <KanbanSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">No projects yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Approved initiatives appear here as projects.
            {canCreate &&
              " Use \u201CImport project\u201D to backfill any work that\u2019s already in flight."}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          data-testid="phase-board"
        >
          {PHASE_COLUMNS.map((col) => (
            <PhaseColumn
              key={col.key}
              label={col.label}
              color={col.color}
              projects={byPhase[col.key]}
              onCardClick={(p) => setOpenProjectId(p.id)}
              testId={`column-${col.key}`}
            />
          ))}
        </div>
      )}

      {openProjectId != null && (
        <ProjectDetailDialog
          projectId={openProjectId}
          onClose={() => setOpenProjectId(null)}
        />
      )}
    </div>
  );
}

function PhaseColumn({
  label,
  color,
  projects,
  onCardClick,
  testId,
}: {
  label: string;
  color: string;
  projects: ProjectSummary[];
  onCardClick: (p: ProjectSummary) => void;
  testId: string;
}) {
  return (
    <div
      className="w-[300px] shrink-0 rounded-xl bg-muted/40 border border-border/60 flex flex-col"
      data-testid={testId}
    >
      <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-foreground/80 truncate">
          {label}
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {projects.length}
        </span>
      </div>
      <div className="p-2 space-y-2 flex-1 min-h-[120px]">
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
  const due = formatDue(p.endDate ?? p.dueAt);
  const start = formatDue(p.startDate);
  const isBacklog = p.phase === "backlog_needs_assignment";
  const subStatus = isBacklog ? backlogSubStatus(p) : null;
  const startInfo = isBacklog ? startDateLabel(p.startDate) : null;
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
              PRIORITY_BADGE[p.priority] ?? PRIORITY_BADGE.medium,
            )}
          >
            {p.priority}
          </Badge>
        </div>

        {isBacklog && subStatus && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[9.5px] px-1 py-0 font-medium",
                subStatus === "scheduled"
                  ? "bg-sky-50 text-sky-700 border-sky-200"
                  : "bg-amber-50 text-amber-800 border-amber-200",
              )}
              data-testid={`badge-substatus-${p.id}`}
            >
              {subStatus === "scheduled" ? "Scheduled" : "Needs Assignment"}
            </Badge>
            {startInfo && (
              <span
                className={cn(
                  "text-[10px]",
                  startInfo.tone === "late"
                    ? "text-rose-700 font-medium"
                    : "text-muted-foreground",
                )}
                data-testid={`text-start-label-${p.id}`}
              >
                {startInfo.text}
              </span>
            )}
          </div>
        )}

        {p.linkedInitiativeTitle && (
          <p className="text-[10.5px] text-muted-foreground italic truncate">
            ↳ {p.linkedInitiativeTitle}
          </p>
        )}

        {p.assignedTeam && (
          <p className="text-[10.5px] text-muted-foreground truncate">
            Team: {p.assignedTeam}
          </p>
        )}

        {p.phase === "on_hold" && p.holdReason && (
          <p className="text-[10.5px] text-amber-800 inline-flex items-center gap-1">
            <Pause className="h-2.5 w-2.5" /> {p.holdReason}
          </p>
        )}

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
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </div>
          {due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" />
              {start ? `${start} – ${due}` : due}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
