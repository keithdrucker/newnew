import { useState, useEffect, useMemo } from "react";
import {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useChangeProjectPhase,
  useAddProjectChecklistItem,
  useUpdateProjectChecklistItem,
  useDeleteProjectChecklistItem,
  useReorderProjectChecklist,
  useGetProject,
  useListAgents,
  useListDepartments,
  useGetSession,
  getListProjectsQueryKey,
  getGetProjectQueryKey,
  getGetDepartmentBoardQueryKey,
  type ProjectSummary,
  type ProjectDetail,
  type ProjectAuditEvent,
  type ProjectPhase,
  type ChecklistItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  CircleDashed,
  FileDown,
  GripVertical,
  History,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";
import { backlogSubStatus, startDateLabel } from "@/pages/projects";
import { downloadProjectReport } from "@/components/project-closeout-report";

// ----- Constants -----------------------------------------------------------

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PHASES: ProjectPhase[] = [
  "backlog_needs_assignment",
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "closed",
  "cancelled",
];

const PHASE_LABEL: Record<ProjectPhase, string> = {
  backlog_needs_assignment: "Backlog / Needs Assignment",
  planning: "Planning",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

const PHASE_BADGE: Record<ProjectPhase, string> = {
  backlog_needs_assignment:
    "bg-zinc-100 text-zinc-700 border-zinc-200",
  planning: "bg-sky-100 text-sky-800 border-sky-200",
  in_progress: "bg-emerald-100 text-emerald-800 border-emerald-200",
  on_hold: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-teal-100 text-teal-800 border-teal-200",
  closed: "bg-slate-200 text-slate-700 border-slate-300",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

// ----- Import dialog -------------------------------------------------------

// New projects always originate from approved Initiatives. This dialog
// is the one-shot escape hatch for backfilling in-flight work when a
// team first adopts the ITSM. Imported projects can land in any phase
// so existing planning notes, work-in-progress, or completed work
// don't have to walk through the whole funnel again.
export function ProjectImportDialog({
  open,
  onOpenChange,
  defaultDepartmentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDepartmentId?: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useGetSession();
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const { data: agents } = useListAgents({});
  const create = useCreateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
      onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
    },
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<number | null>(
    defaultDepartmentId ?? null,
  );
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [priority, setPriority] = useState("medium");
  const [phase, setPhase] = useState<ProjectPhase>("in_progress");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setDepartmentId(defaultDepartmentId ?? null);
      setOwnerId(session?.userId ?? null);
      setPriority("medium");
      setPhase("in_progress");
      setStartDate("");
      setEndDate("");
    }
  }, [open, defaultDepartmentId, session?.userId]);

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        data: {
          name: name.trim(),
          description: description.trim(),
          color: "#4B9CD3",
          // The lifecycle is now driven by `phase`; keep status=active so
          // the row passes legacy filters that still gate on it.
          status: "active",
          phase,
          departmentId,
          ownerId,
          priority: priority as "low" | "medium" | "high" | "urgent",
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Project imported" });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="dialog-project-import"
      >
        <DialogHeader>
          <DialogTitle>Import project</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground pt-1">
            Use this to backfill projects already in flight when first
            adopting the ITSM. New projects normally come from approved
            Initiatives.
          </p>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-project-name"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-project-description"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <Select
                value={departmentId ? String(departmentId) : "none"}
                onValueChange={(v) =>
                  setDepartmentId(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger data-testid="select-project-department">
                  <SelectValue placeholder="None" />
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
            </Field>
            <Field label="Owner">
              <Select
                value={ownerId ? String(ownerId) : "none"}
                onValueChange={(v) =>
                  setOwnerId(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger data-testid="select-project-owner">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents?.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current phase">
              <Select
                value={phase}
                onValueChange={(v) => setPhase(v as ProjectPhase)}
              >
                <SelectTrigger data-testid="select-project-phase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES
                    // Importing a project as `closed` requires
                    // closeout summary + takeaway, which this
                    // lightweight dialog doesn't capture; admins
                    // should import as `completed` and then close
                    // from the project view. `cancelled` is a side
                    // state and not a meaningful import target.
                    .filter((p) => p !== "closed" && p !== "cancelled")
                    .map((p) => (
                      <SelectItem key={p} value={p}>
                        {PHASE_LABEL[p]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-project-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-project-start"
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-project-end"
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-project-import-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending}
            data-testid="button-project-import-submit"
          >
            <Upload className="h-4 w-4 mr-1.5" /> Import project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Detail dialog -------------------------------------------------------

export function ProjectDetailDialog({
  projectId,
  onClose,
}: {
  projectId: number;
  onClose: () => void;
}) {
  // Fetch the full detail (with auditEvents) so the dialog has fresh
  // server data — the row passed in from the board may be stale after a
  // phase mutation invalidates the list query.
  const { data: row } = useGetProject(projectId);
  if (!row) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loading…</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }
  return <DetailInner row={row} onClose={onClose} />;
}

function DetailInner({
  row,
  onClose,
}: {
  row: ProjectDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: agents } = useListAgents({});
  const { data: departments } = useListDepartments({ scope: "accessible" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(row.id) });
    if (row.departmentId) {
      qc.invalidateQueries({
        queryKey: getGetDepartmentBoardQueryKey(row.departmentId),
      });
    }
  };

  const update = useUpdateProject({
    mutation: {
      onSuccess: invalidate,
      onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
    },
  });
  const changePhase = useChangeProjectPhase({
    mutation: {
      onSuccess: invalidate,
      onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
    },
  });
  const remove = useDeleteProject({
    mutation: {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
    },
  });

  const phase = row.phase as ProjectPhase;

  // ----- Header / top fields (always-editable basics) -----
  const [departmentId, setDepartmentId] = useState<number | null>(
    row.departmentId ?? null,
  );
  const [ownerId, setOwnerId] = useState<number | null>(row.ownerId ?? null);
  const [assignedTeam, setAssignedTeam] = useState(row.assignedTeam);
  const [priority, setPriority] = useState<string>(row.priority);
  const [startDate, setStartDate] = useState<string>(row.startDate ?? "");
  const [endDate, setEndDate] = useState<string>(row.endDate ?? "");
  const [planningNotes, setPlanningNotes] = useState(row.planningNotes);
  const [statusUpdate, setStatusUpdate] = useState(row.statusUpdate);
  // Editable closeout prompts (only writable while phase === "completed";
  // the server PATCH guard locks them once phase === "closed").
  const [completionSummary, setCompletionSummary] = useState(
    row.completionSummary,
  );
  const [keyTakeaway, setKeyTakeaway] = useState(row.keyTakeaway);

  useEffect(() => {
    setDepartmentId(row.departmentId ?? null);
    setOwnerId(row.ownerId ?? null);
    setAssignedTeam(row.assignedTeam);
    setPriority(row.priority);
    setStartDate(row.startDate ?? "");
    setEndDate(row.endDate ?? "");
    setPlanningNotes(row.planningNotes);
    setStatusUpdate(row.statusUpdate);
    setCompletionSummary(row.completionSummary);
    setKeyTakeaway(row.keyTakeaway);
  }, [row.id, row]);

  const saveBasics = async (msg: string) => {
    await update.mutateAsync({
      id: row.id,
      data: {
        departmentId,
        ownerId,
        assignedTeam,
        priority: priority as "low" | "medium" | "high" | "urgent",
        startDate: startDate || null,
        endDate: endDate || null,
        planningNotes,
        statusUpdate,
      },
    });
    toast({ title: msg });
  };

  // Persist the editable Completion Summary + Key Takeaway prompts
  // while the project is in the Completed (paperwork) phase. Saves go
  // through PATCH so they don't trigger a phase change.
  const saveCloseout = async (msg: string) => {
    await update.mutateAsync({
      id: row.id,
      data: { completionSummary, keyTakeaway },
    });
    toast({ title: msg });
  };

  // ---- Completed → Closed client-side gate. The server enforces the
  //      same rule; this just gives instant feedback before opening
  //      the phase modal (and saves any unsaved prompt edits first
  //      so the gate sees the freshly-persisted text). ----
  const tryMarkAsClosed = async () => {
    const sum = completionSummary.trim();
    const tak = keyTakeaway.trim();
    if (!sum) {
      toast({
        title: "Completion summary is required",
        description: "Fill in the closeout summary before marking as closed.",
        variant: "destructive",
      });
      return;
    }
    if (!tak) {
      toast({
        title: "Key takeaway / lesson learned is required",
        description: "Capture what to repeat or change next time.",
        variant: "destructive",
      });
      return;
    }
    // Persist any unsaved edits to the prompts so the server-side
    // gate (which falls back to row values when the body is empty)
    // sees the freshly-saved closeout text.
    if (
      completionSummary !== row.completionSummary ||
      keyTakeaway !== row.keyTakeaway
    ) {
      await saveCloseout("Closeout draft saved");
    }
    // The closeout fields are already on the row -- skip the
    // re-prompt modal and run the transition directly. The server
    // reads summary + takeaway from the row when the body omits
    // them, so this is the same gate, just one click instead of
    // re-typing what was just saved.
    changePhase.mutate(
      { id: row.id, data: { to: "closed" } },
      {
        onSuccess: () => {
          toast({ title: `Moved to ${PHASE_LABEL.closed}` });
        },
      },
    );
  };

  // ---- Backlog → Planning client-side gate. The server enforces the
  //      same rule; this just gives instant feedback before opening
  //      the phase modal. ----
  const tryMoveToPlanning = async () => {
    const start = startDate.trim();
    const end = endDate.trim();
    if (!start || !end) {
      toast({
        title: "Add a start and anticipated completion date first.",
        variant: "destructive",
      });
      return;
    }
    if (end <= start) {
      toast({
        title: "Anticipated completion date must be after start date.",
        variant: "destructive",
      });
      return;
    }
    // Persist the dates first so the server-side gate sees them.
    await saveBasics("Saved");
    openPhaseChange("planning");
  };

  // ----- Phase transition modal -----
  const [pendingPhase, setPendingPhase] = useState<ProjectPhase | null>(null);

  const openPhaseChange = (to: ProjectPhase) => setPendingPhase(to);

  // The "resume from on_hold" target depends on previousActivePhase.
  const resumeTarget: ProjectPhase =
    (row.previousActivePhase as ProjectPhase | null) ?? "planning";

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="dialog-project-detail"
        >
          <DialogHeader>
            <div className="space-y-3">
              <DialogTitle className="text-xl pr-8">{row.name}</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <Badge
                  variant="outline"
                  className={PHASE_BADGE[phase]}
                  data-testid="badge-current-phase"
                >
                  {PHASE_LABEL[phase]}
                </Badge>
                {phase === "backlog_needs_assignment" &&
                  (() => {
                    const sub = backlogSubStatus(row);
                    return (
                      <Badge
                        variant="outline"
                        className={
                          sub === "scheduled"
                            ? "bg-sky-50 text-sky-700 border-sky-200 font-medium"
                            : "bg-amber-50 text-amber-800 border-amber-200 font-medium"
                        }
                        data-testid="badge-backlog-substatus"
                        title="Sub-status is derived from owner + start + completion date"
                      >
                        {sub === "scheduled" ? "Scheduled" : "Needs Assignment"}
                      </Badge>
                    );
                  })()}
                {row.departmentName && (
                  <Badge variant="outline" className="font-normal">
                    <Building2 className="h-3 w-3 mr-1" />
                    {row.departmentName}
                  </Badge>
                )}
                {row.linkedInitiativeTitle && (
                  <Badge variant="outline" className="font-normal">
                    From initiative: {row.linkedInitiativeTitle}
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  Created {new Date(row.createdAt).toLocaleDateString()}
                </span>
              </div>
              {phase === "backlog_needs_assignment" &&
                backlogSubStatus(row) === "scheduled" &&
                row.startDate &&
                (() => {
                  const info = startDateLabel(row.startDate);
                  const startStr = new Date(row.startDate).toLocaleDateString(
                    undefined,
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    },
                  );
                  const isLate = info?.tone === "late";
                  return (
                    <div
                      className={
                        isLate
                          ? "flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800"
                          : "flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900"
                      }
                      data-testid="banner-backlog-scheduled"
                    >
                      {isLate ? (
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : (
                        <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                      )}
                      <div className="space-y-0.5">
                        <div>
                          Project is scheduled to start on{" "}
                          <span className="font-medium">{startStr}</span>.
                        </div>
                        {info && (
                          <div
                            className={
                              isLate ? "font-medium" : "text-sky-700"
                            }
                          >
                            {info.text}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              <PhaseProgress phase={phase} />
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {row.description && (
              <ReadField label="Description" value={row.description} />
            )}

            {/* ---- Backlog / Needs Assignment ---- */}
            <Section
              title="Backlog · Needs Assignment"
              defaultOpen={phase === "backlog_needs_assignment"}
              tone={
                phase === "backlog_needs_assignment"
                  ? "active"
                  : phase === "planning" ||
                      phase === "in_progress" ||
                      phase === "on_hold" ||
                      phase === "completed" ||
                      phase === "closed"
                    ? "done"
                    : "default"
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Department">
                  <Select
                    value={departmentId ? String(departmentId) : "none"}
                    onValueChange={(v) =>
                      setDepartmentId(v === "none" ? null : Number(v))
                    }
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="None" />
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
                </Field>
                <Field label="Owner">
                  <Select
                    value={ownerId ? String(ownerId) : "none"}
                    onValueChange={(v) =>
                      setOwnerId(v === "none" ? null : Number(v))
                    }
                  >
                    <SelectTrigger data-testid="select-owner">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {agents?.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Assigned team">
                <Input
                  value={assignedTeam}
                  onChange={(e) => setAssignedTeam(e.target.value)}
                  placeholder="e.g. Field Operations, IT, Project Controls"
                  data-testid="input-assigned-team"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Priority">
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-start-date"
                    disabled={phase !== "backlog_needs_assignment"}
                  />
                </Field>
                <Field label="Anticipated completion">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="input-end-date"
                    disabled={phase !== "backlog_needs_assignment"}
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveBasics("Saved")}
                  disabled={update.isPending}
                  data-testid="button-save-basics"
                >
                  Save changes
                </Button>
                {phase === "backlog_needs_assignment" && (
                  <Button
                    size="sm"
                    onClick={tryMoveToPlanning}
                    disabled={update.isPending}
                    data-testid="button-move-to-planning"
                  >
                    Move to Planning
                  </Button>
                )}
              </div>
            </Section>

            {/* ---- Planning ---- */}
            <Section
              title="Planning"
              defaultOpen={phase === "planning"}
              tone={
                phase === "planning"
                  ? "active"
                  : phase === "in_progress" ||
                      phase === "completed" ||
                      phase === "closed" ||
                      phase === "on_hold"
                    ? "done"
                    : "default"
              }
            >
              {/* Carry-forward dates from Backlog. Read-only here so
                  the assignment timeline can't be quietly rewritten
                  while the team is working out the plan. */}
              <div className="grid grid-cols-2 gap-3">
                <ReadField
                  label="Start date"
                  value={
                    row.startDate
                      ? new Date(row.startDate).toLocaleDateString()
                      : null
                  }
                />
                <ReadField
                  label="Anticipated completion date"
                  value={
                    row.endDate
                      ? new Date(row.endDate).toLocaleDateString()
                      : null
                  }
                />
              </div>
              <Field label="Planning notes">
                <Textarea
                  value={planningNotes}
                  onChange={(e) => setPlanningNotes(e.target.value)}
                  rows={4}
                  placeholder="Scope, approach, dependencies, success criteria…"
                  data-testid="textarea-planning-notes"
                />
              </Field>
              <ChecklistEditor
                projectId={row.id}
                items={row.checklist}
                defaultAssigneeId={row.ownerId ?? null}
              />
              {phase === "planning" && (
                <div className="flex justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("on_hold")}
                      data-testid="button-pause-from-planning"
                    >
                      <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("cancelled")}
                      data-testid="button-cancel-from-planning"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveBasics("Saved")}
                      disabled={update.isPending}
                      data-testid="button-save-planning"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={async () => {
                        // Persist any in-flight planning edits BEFORE
                        // changing phase so we never race the audit row.
                        await saveBasics("Saved");
                        openPhaseChange("in_progress");
                      }}
                      data-testid="button-start-project"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" /> Start
                    </Button>
                  </div>
                </div>
              )}
            </Section>

            {/* ---- In Progress ---- */}
            <Section
              title="In Progress"
              defaultOpen={phase === "in_progress"}
              tone={
                phase === "in_progress"
                  ? "active"
                  : phase === "completed" || phase === "closed"
                    ? "done"
                    : "default"
              }
            >
              {/* Read-only carryover of the original timeline from
                  Backlog. The actual completion date is captured
                  automatically when the user clicks Mark Completed
                  (stored as `completedAt`). */}
              <div className="grid grid-cols-2 gap-3">
                <ReadField
                  label="Start date"
                  value={
                    row.startDate
                      ? new Date(row.startDate).toLocaleDateString()
                      : null
                  }
                />
                <ReadField
                  label="Anticipated completion date"
                  value={
                    row.endDate
                      ? new Date(row.endDate).toLocaleDateString()
                      : null
                  }
                />
              </div>
              <Field label="Latest status update">
                <Textarea
                  value={statusUpdate}
                  onChange={(e) => setStatusUpdate(e.target.value)}
                  rows={3}
                  placeholder="Most recent progress, blockers, next steps…"
                  data-testid="textarea-status-update"
                />
              </Field>
              {phase !== "planning" && (
                <ChecklistEditor
                  projectId={row.id}
                  items={row.checklist}
                  readOnly={phase !== "in_progress"}
                  defaultAssigneeId={row.ownerId ?? null}
                />
              )}
              {phase === "in_progress" && (
                <div className="flex justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("on_hold")}
                      data-testid="button-pause-from-progress"
                    >
                      <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("planning")}
                      data-testid="button-back-to-planning"
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Back to
                      Planning
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("cancelled")}
                      data-testid="button-cancel-from-progress"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveBasics("Saved")}
                      disabled={update.isPending}
                      data-testid="button-save-progress"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openPhaseChange("completed")}
                      data-testid="button-mark-completed"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Mark Completed
                    </Button>
                  </div>
                </div>
              )}
            </Section>

            {/* ---- On Hold (only when applicable) ---- */}
            {phase === "on_hold" && (
              <Section title="On Hold" defaultOpen tone="active">
                <ReadField label="Hold reason" value={row.holdReason} />
                {row.holdNotes && (
                  <ReadField label="Notes" value={row.holdNotes} />
                )}
                {row.revisitDate && (
                  <ReadField
                    label="Revisit on"
                    value={new Date(row.revisitDate).toLocaleDateString()}
                  />
                )}
                {row.previousActivePhase && (
                  <p className="text-[12px] text-muted-foreground">
                    Will resume to{" "}
                    <span className="font-medium">
                      {PHASE_LABEL[
                        row.previousActivePhase as ProjectPhase
                      ] ?? row.previousActivePhase}
                    </span>
                    .
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPhaseChange("cancelled")}
                    data-testid="button-cancel-from-hold"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openPhaseChange(resumeTarget)}
                    data-testid="button-resume"
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
                  </Button>
                </div>
              </Section>
            )}

            {/* ---- Project Closeout (paperwork phase: editable) ---- */}
            {phase === "completed" && (
              <>
                <Section title="Project Closeout" defaultOpen tone="active">
                  <p className="text-[12px] text-muted-foreground">
                    The work is done. Capture the closeout below, then
                    click <strong>Mark as Closed</strong> to move this
                    project to the Closed lane.
                  </p>
                  <Field label="Completion summary" required>
                    <Textarea
                      value={completionSummary}
                      onChange={(e) => setCompletionSummary(e.target.value)}
                      rows={3}
                      placeholder="What was delivered or completed?"
                      data-testid="textarea-completion-summary"
                    />
                  </Field>
                  <Field label="Key takeaway / lesson learned" required>
                    <Textarea
                      value={keyTakeaway}
                      onChange={(e) => setKeyTakeaway(e.target.value)}
                      rows={3}
                      placeholder="What should we repeat or do differently next time?"
                      data-testid="textarea-key-takeaway"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <ReadField
                      label="Completed by"
                      value={row.completedByName}
                    />
                    <ReadField
                      label="Completed on"
                      value={
                        row.completedAt
                          ? new Date(row.completedAt).toLocaleString()
                          : null
                      }
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveCloseout("Closeout draft saved")}
                      disabled={
                        update.isPending ||
                        (completionSummary === row.completionSummary &&
                          keyTakeaway === row.keyTakeaway)
                      }
                      data-testid="button-save-closeout"
                    >
                      Save draft
                    </Button>
                    <Button
                      size="sm"
                      onClick={tryMarkAsClosed}
                      disabled={update.isPending}
                      data-testid="button-mark-as-closed"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Mark as Closed
                    </Button>
                  </div>
                </Section>

                <Section title="Actions" defaultOpen tone="default">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">
                      Reopening sends this project back to In Progress and
                      clears the active Completed By &amp; Completed On.
                      The current values remain in the History below.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPhaseChange("in_progress")}
                      data-testid="button-reopen-completed"
                      className="shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
                      Project
                    </Button>
                  </div>
                </Section>
              </>
            )}

            {/* ---- Closed (locked, archived) ---- */}
            {phase === "closed" && (
              <>
                <Section title="Project Closeout" defaultOpen tone="done">
                  <ReadField
                    label="Completion summary"
                    value={row.completionSummary}
                  />
                  <ReadField
                    label="Key takeaway / lesson learned"
                    value={row.keyTakeaway}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ReadField
                      label="Completed by"
                      value={row.completedByName}
                    />
                    <ReadField
                      label="Completed on"
                      value={
                        row.completedAt
                          ? new Date(row.completedAt).toLocaleString()
                          : null
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ReadField
                      label="Closed by"
                      value={row.closedByName}
                    />
                    <ReadField
                      label="Closed on"
                      value={
                        row.closedAt
                          ? new Date(row.closedAt).toLocaleString()
                          : null
                      }
                    />
                  </div>
                  <p className="text-[11.5px] text-muted-foreground italic pt-1">
                    This project is closed. Each completion, closure,
                    and reopen is preserved in the History section below.
                  </p>
                </Section>

                <Section title="Actions" defaultOpen tone="default">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">
                      Export the closeout as a PDF report for archives or
                      stakeholder review. Reopening sends this project back
                      to In Progress and clears the active Completed and
                      Closed signatures; the current values remain in the
                      History below.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={async () => {
                          try {
                            await downloadProjectReport(row);
                            toast({ title: "Project report downloaded" });
                          } catch (e) {
                            toast({
                              title: "Could not generate PDF",
                              description: (e as Error).message,
                              variant: "destructive",
                            });
                          }
                        }}
                        data-testid="button-export-closeout-pdf"
                      >
                        <FileDown className="h-3.5 w-3.5 mr-1.5" /> Export PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPhaseChange("in_progress")}
                        data-testid="button-reopen-closed"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
                        Project
                      </Button>
                    </div>
                  </div>
                </Section>
              </>
            )}

            {/* ---- Cancelled (only when applicable) ---- */}
            {phase === "cancelled" && (
              <Section title="Cancelled" defaultOpen tone="active">
                <ReadField
                  label="Cancellation reason"
                  value={row.cancellationReason}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openPhaseChange("backlog_needs_assignment")
                    }
                    data-testid="button-reopen-cancelled"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen to
                    Backlog
                  </Button>
                </div>
              </Section>
            )}

            {/* ---- History ---- */}
            <Section title="History" defaultOpen={false} tone="default">
              <AuditTimeline events={row.auditEvents} />
            </Section>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this project? This cannot be undone.",
                  )
                ) {
                  remove.mutate({ id: row.id });
                }
              }}
              className="mr-auto text-rose-600 hover:text-rose-700"
              data-testid="button-delete-project"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-close-detail"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingPhase && (
        <PhaseChangeDialog
          projectId={row.id}
          from={phase}
          to={pendingPhase}
          mutation={changePhase}
          onClose={() => setPendingPhase(null)}
        />
      )}
    </>
  );
}

// ----- Phase change dialog -------------------------------------------------

function PhaseChangeDialog({
  projectId,
  from,
  to,
  mutation,
  onClose,
}: {
  projectId: number;
  from: ProjectPhase;
  to: ProjectPhase;
  mutation: ReturnType<typeof useChangeProjectPhase>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [holdNotes, setHoldNotes] = useState("");
  const [revisitDate, setRevisitDate] = useState("");
  const [completionSummary, setCompletionSummary] = useState("");
  const [keyTakeaway, setKeyTakeaway] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const submit = () => {
    if (to === "on_hold" && !holdReason.trim()) {
      toast({ title: "Hold reason is required", variant: "destructive" });
      return;
    }
    if (to === "closed") {
      if (!completionSummary.trim()) {
        toast({
          title: "Completion summary is required",
          variant: "destructive",
        });
        return;
      }
      if (!keyTakeaway.trim()) {
        toast({
          title: "Key takeaway / lesson learned is required",
          variant: "destructive",
        });
        return;
      }
    }
    if (to === "cancelled" && !cancellationReason.trim()) {
      toast({
        title: "Cancellation reason is required",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate(
      {
        id: projectId,
        data: {
          to,
          reason: reason.trim() || undefined,
          holdReason: holdReason.trim() || undefined,
          holdNotes: holdNotes.trim() || undefined,
          revisitDate: revisitDate || undefined,
          completionSummary: completionSummary.trim() || undefined,
          keyTakeaway: keyTakeaway.trim() || undefined,
          cancellationReason: cancellationReason.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `Moved to ${PHASE_LABEL[to]}` });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-phase-change"
      >
        <DialogHeader>
          <DialogTitle>
            Move from {PHASE_LABEL[from]} → {PHASE_LABEL[to]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {to === "on_hold" && (
            <>
              <Field label="Hold reason" required>
                <Input
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  data-testid="input-hold-reason"
                />
              </Field>
              <Field label="Notes">
                <Textarea
                  value={holdNotes}
                  onChange={(e) => setHoldNotes(e.target.value)}
                  rows={3}
                  data-testid="input-hold-notes"
                />
              </Field>
              <Field label="Revisit on">
                <Input
                  type="date"
                  value={revisitDate}
                  onChange={(e) => setRevisitDate(e.target.value)}
                  data-testid="input-revisit-date"
                />
              </Field>
            </>
          )}
          {to === "closed" && (
            <>
              <p className="text-[12px] text-muted-foreground">
                Closing locks this project. Confirm the closeout fields
                you captured on the Completed view.
              </p>
              <Field label="Completion summary" required>
                <Textarea
                  value={completionSummary}
                  onChange={(e) => setCompletionSummary(e.target.value)}
                  rows={3}
                  placeholder="What was delivered or completed?"
                  data-testid="input-completion-summary"
                />
              </Field>
              <Field label="Key takeaway / lesson learned" required>
                <Textarea
                  value={keyTakeaway}
                  onChange={(e) => setKeyTakeaway(e.target.value)}
                  rows={3}
                  placeholder="What should we repeat or do differently next time?"
                  data-testid="input-key-takeaway"
                />
              </Field>
            </>
          )}
          {to === "cancelled" && (
            <Field label="Cancellation reason" required>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={3}
                data-testid="input-cancellation-reason"
              />
            </Field>
          )}
          {to !== "on_hold" &&
            to !== "closed" &&
            to !== "cancelled" && (
              <Field label="Reason (optional)">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  data-testid="input-transition-reason"
                />
              </Field>
            )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-phase-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={mutation.isPending}
            data-testid="button-phase-confirm"
          >
            Confirm move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Checklist editor ----------------------------------------------------

function ChecklistEditor({
  projectId,
  items,
  readOnly,
  defaultAssigneeId,
}: {
  projectId: number;
  items: ChecklistItem[];
  readOnly?: boolean;
  defaultAssigneeId?: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: agents } = useListAgents({});
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
  };
  const onError = (e: Error) =>
    toast({ title: e.message, variant: "destructive" });

  const add = useAddProjectChecklistItem({
    mutation: { onSuccess: invalidate, onError },
  });
  const upd = useUpdateProjectChecklistItem({
    mutation: { onSuccess: invalidate, onError },
  });
  const del = useDeleteProjectChecklistItem({
    mutation: { onSuccess: invalidate, onError },
  });
  const reorder = useReorderProjectChecklist({
    mutation: { onSuccess: invalidate, onError },
  });

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [items],
  );

  const [newText, setNewText] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState<number | null>(
    defaultAssigneeId ?? null,
  );
  const [newDueDate, setNewDueDate] = useState<string>("");

  // Keep the new-item assignee in sync if the project owner changes while
  // the dialog is open. Only updates the *new-item* picker default; existing
  // checklist rows are not touched.
  useEffect(() => {
    setNewAssigneeId(defaultAssigneeId ?? null);
  }, [defaultAssigneeId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const submitNew = () => {
    if (!newText.trim()) return;
    add.mutate(
      {
        id: projectId,
        data: {
          text: newText.trim(),
          assigneeId: newAssigneeId,
          dueDate: newDueDate ? newDueDate : null,
        },
      },
      {
        onSuccess: () => {
          setNewText("");
          setNewAssigneeId(defaultAssigneeId ?? null);
          setNewDueDate("");
        },
      },
    );
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = sorted.map((i) => i.id ?? "").filter(Boolean) as string[];
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    setDragId(null);
    reorder.mutate({ id: projectId, data: { itemIds: next } });
  };

  return (
    <div className="space-y-2" data-testid="checklist-editor">
      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-700">
        <CheckSquare className="h-3.5 w-3.5" />
        Steps to complete the Project
        <span className="text-muted-foreground font-normal">
          {sorted.filter((i) => i.done).length} / {sorted.length} done
        </span>
      </div>
      <ul className="space-y-1">
        {sorted.map((item) => {
          const id = item.id ?? "";
          const isEditing = editingId === id;
          const assigneeValue = item.assigneeId
            ? String(item.assigneeId)
            : "none";
          const dueValue = item.dueDate ?? "";
          return (
            <li
              key={id}
              draggable={!readOnly && !isEditing}
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-start gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 ${
                dragId === id ? "opacity-50" : ""
              }`}
              data-testid={`checklist-item-${id}`}
            >
              {!readOnly && (
                <GripVertical className="h-3.5 w-3.5 text-zinc-400 cursor-grab shrink-0 mt-1.5" />
              )}
              <Checkbox
                checked={item.done}
                disabled={readOnly}
                className="mt-1.5 shrink-0"
                onCheckedChange={(v) =>
                  upd.mutate({
                    id: projectId,
                    itemId: id,
                    data: { done: !!v },
                  })
                }
                data-testid={`checkbox-checklist-${id}`}
              />
              {isEditing ? (
                <Textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={1}
                  className="text-[13px] flex-1 min-w-0 min-h-[28px] max-h-[160px] overflow-y-auto resize-none py-1 px-2"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className={`flex-1 min-w-0 text-left text-[13px] whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto py-1 ${
                    item.done
                      ? "line-through text-muted-foreground"
                      : "text-zinc-800"
                  }`}
                  onClick={() => {
                    if (readOnly) return;
                    setEditingId(id);
                    setEditingText(item.text);
                  }}
                  title={readOnly ? undefined : "Click to edit"}
                >
                  {item.text}
                </button>
              )}
              {isEditing ? (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => {
                      upd.mutate(
                        {
                          id: projectId,
                          itemId: id,
                          data: { text: editingText },
                        },
                        { onSuccess: () => setEditingId(null) },
                      );
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Select
                    value={assigneeValue}
                    disabled={readOnly}
                    onValueChange={(v) =>
                      upd.mutate({
                        id: projectId,
                        itemId: id,
                        data: { assigneeId: v === "none" ? null : Number(v) },
                      })
                    }
                  >
                    <SelectTrigger
                      className="h-7 w-[140px] text-[12px] shrink-0 mt-0.5"
                      data-testid={`select-assignee-checklist-${id}`}
                    >
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {agents?.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={dueValue}
                    disabled={readOnly}
                    onChange={(e) =>
                      upd.mutate({
                        id: projectId,
                        itemId: id,
                        data: {
                          dueDate: e.target.value ? e.target.value : null,
                        },
                      })
                    }
                    className="h-7 w-[140px] text-[12px] shrink-0 mt-0.5"
                    data-testid={`input-due-checklist-${id}`}
                  />
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 mt-0.5"
                      onClick={() =>
                        del.mutate({ id: projectId, itemId: id })
                      }
                      data-testid={`button-delete-checklist-${id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="text-[12px] text-muted-foreground italic px-1 py-2">
            No items yet.
          </li>
        )}
      </ul>
      {!readOnly && (
        <div className="flex items-start gap-2 pt-1">
          <Textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitNew();
              }
            }}
            placeholder="Add a checklist item…"
            rows={1}
            className="text-[13px] flex-1 min-w-0 min-h-[32px] max-h-[160px] overflow-y-auto resize-none py-1 px-2"
            data-testid="input-new-checklist"
          />
          <Select
            value={newAssigneeId ? String(newAssigneeId) : "none"}
            onValueChange={(v) =>
              setNewAssigneeId(v === "none" ? null : Number(v))
            }
          >
            <SelectTrigger
              className="h-8 w-[140px] text-[12px] shrink-0"
              data-testid="select-assignee-new-checklist"
            >
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {agents?.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="h-8 w-[140px] text-[12px] shrink-0"
            data-testid="input-due-new-checklist"
          />
          <Button
            size="sm"
            onClick={submitNew}
            disabled={add.isPending || !newText.trim()}
            data-testid="button-add-checklist"
            className="h-8 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ----- Audit timeline ------------------------------------------------------

function AuditTimeline({ events }: { events: ProjectAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground italic">
        No history yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2" data-testid="audit-timeline">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-start gap-2 text-[12px]"
          data-testid={`audit-event-${ev.id}`}
        >
          <History className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-zinc-800">
              <span className="font-medium">{prettyAction(ev.action)}</span>
              {ev.oldPhase && ev.newPhase && (
                <span className="text-muted-foreground">
                  {" "}
                  · {labelPhase(ev.oldPhase)} → {labelPhase(ev.newPhase)}
                </span>
              )}
            </div>
            <div className="text-muted-foreground">
              {ev.changedByName ?? "System"} ·{" "}
              {new Date(ev.changedAt).toLocaleString()}
            </div>
            {ev.reason && (
              <div className="text-zinc-600 italic mt-0.5">
                "{ev.reason}"
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function prettyAction(a: string) {
  switch (a) {
    case "created":
      return "Created";
    case "created_from_initiative":
      return "Created from initiative";
    case "phase_changed":
      return "Phase changed";
    case "hold_started":
      return "Put on hold";
    case "hold_resumed":
      return "Resumed from hold";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "reopened":
      return "Reopened";
    case "checklist_added":
      return "Checklist item added";
    case "checklist_edited":
      return "Checklist item edited";
    case "checklist_removed":
      return "Checklist item removed";
    case "checklist_checked":
      return "Checklist item checked";
    case "checklist_unchecked":
      return "Checklist item unchecked";
    case "checklist_reordered":
      return "Checklist reordered";
    default:
      return a.replace(/_/g, " ");
  }
}

function labelPhase(p: string) {
  return PHASE_LABEL[p as ProjectPhase] ?? p.replace(/_/g, " ");
}

// ----- Phase progress bar --------------------------------------------------

function PhaseProgress({ phase }: { phase: ProjectPhase }) {
  // Off-track phases don't fit the linear flow — show a banner instead.
  const isOnHold = phase === "on_hold";
  const isCancelled = phase === "cancelled";
  const stages: {
    key: ProjectPhase;
    label: string;
    state: "done" | "active" | "future";
  }[] = [
    {
      key: "backlog_needs_assignment",
      label: "Backlog",
      state:
        phase === "backlog_needs_assignment"
          ? "active"
          : "done",
    },
    {
      key: "planning",
      label: "Planning",
      state:
        phase === "backlog_needs_assignment"
          ? "future"
          : phase === "planning"
            ? "active"
            : "done",
    },
    {
      key: "in_progress",
      label: "In Progress",
      state:
        phase === "in_progress"
          ? "active"
          : phase === "completed" || phase === "closed"
            ? "done"
            : "future",
    },
    {
      key: "completed",
      label: "Completed",
      state:
        phase === "completed"
          ? "active"
          : phase === "closed"
            ? "done"
            : "future",
    },
    {
      key: "closed",
      label: "Closed",
      state: phase === "closed" ? "active" : "future",
    },
  ];

  return (
    <div className="space-y-2">
      {(isOnHold || isCancelled) && (
        <div
          className={
            isOnHold
              ? "rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 inline-flex items-center gap-1.5"
              : "rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-900 inline-flex items-center gap-1.5"
          }
          data-testid="phase-banner"
        >
          {isOnHold ? (
            <>
              <Pause className="h-3 w-3" /> On hold
            </>
          ) : (
            <>
              <Square className="h-3 w-3" /> Cancelled
            </>
          )}
        </div>
      )}
      <div
        className="flex items-center gap-2"
        data-testid="phase-progress"
      >
        {stages.map((s, idx) => {
          const baseChip =
            s.state === "active"
              ? "flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 flex-1 justify-center"
              : s.state === "done"
                ? "flex items-center gap-1.5 text-[11.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 flex-1 justify-center"
                : "flex items-center gap-1.5 text-[11.5px] text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-full px-2.5 py-1 flex-1 justify-center";
          return (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div
                className={baseChip}
                data-testid={`phase-${s.key}-${s.state}`}
              >
                {s.state === "done" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : s.state === "active" ? (
                  <CircleDashed className="h-3 w-3" />
                ) : null}
                {s.label}
              </div>
              {idx < stages.length - 1 && (
                <div
                  className={
                    s.state === "done"
                      ? "h-px flex-1 bg-emerald-300"
                      : "h-px flex-1 bg-zinc-200"
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- Section / Field / ReadField primitives -----------------------------
// Mirrored from initiatives.tsx so the project dialog has the same
// "current step / done / default" tone vocabulary without coupling.

function Section({
  title,
  defaultOpen,
  tone = "default",
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  tone?: "active" | "done" | "default";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const wrapClass =
    tone === "active"
      ? "rounded-md border-2 border-amber-300 bg-amber-50/60 ring-1 ring-amber-200/60 shadow-sm"
      : tone === "done"
        ? "rounded-md border border-zinc-200 bg-zinc-50"
        : "rounded-md border border-zinc-200 bg-white";
  const titleClass =
    tone === "active"
      ? "flex items-center gap-2 text-[13px] font-semibold text-amber-900"
      : tone === "done"
        ? "flex items-center gap-2 text-[13px] font-medium text-zinc-500"
        : "flex items-center gap-2 text-[13px] font-medium text-zinc-800";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={wrapClass}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <div className={titleClass}>
              {tone === "active" && (
                <span className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                  Current step
                </span>
              )}
              {tone === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
              )}
              {title}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="p-3 space-y-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-zinc-700">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-[13px] text-zinc-800 whitespace-pre-wrap">
        {value && value.trim() ? value : "—"}
      </div>
    </div>
  );
}
