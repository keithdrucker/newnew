import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useListAgents,
  useListDepartments,
  useGetSession,
  getListProjectsQueryKey,
  getGetProjectQueryKey,
  type ProjectSummary,
  type ProjectDetail,
  type TaskLabel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Lightbulb,
  Target,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type Mode =
  | { mode: "create"; defaultDepartmentId?: number | null }
  | { mode: "edit"; project: ProjectSummary | ProjectDetail };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
} & Mode;

// One dialog for both creating a new initiative-project and editing an
// existing one. Mirrors the layout of the old per-card "Initiative
// detail" dialog: Title, IDEA, PLAN, WORKFLOW, Labels, Additional
// comments. The 7-phase board / work-step cards live inside the project
// itself, so there's no checklist or phase-picker here.
export function ProjectEditorDialog(props: Props) {
  const { open, onOpenChange } = props;
  const isEdit = props.mode === "edit";
  const existing = isEdit ? props.project : null;
  const defaultDeptId = !isEdit ? props.defaultDepartmentId ?? null : null;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: session } = useGetSession();
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const { data: agents } = useListAgents({});
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  // Form state
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? COLOR_SWATCHES[0]);
  const [departmentId, setDepartmentId] = useState<string>(
    existing?.departmentId != null
      ? String(existing.departmentId)
      : defaultDeptId != null
        ? String(defaultDeptId)
        : "none",
  );
  const [ownerId, setOwnerId] = useState<string>(
    existing?.ownerId != null ? String(existing.ownerId) : "none",
  );
  const [dueDate, setDueDate] = useState<string>(
    existing?.dueAt ? existing.dueAt.substring(0, 10) : "",
  );
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "urgent"
  >(
    (existing?.priority as "low" | "medium" | "high" | "urgent" | undefined) ??
      "medium",
  );
  const [suggestedById, setSuggestedById] = useState<string>(
    existing?.suggestedById != null ? String(existing.suggestedById) : "none",
  );
  const [goal, setGoal] = useState(existing?.goal ?? "");
  const [implementation, setImplementation] = useState(
    existing?.implementation ?? "",
  );
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [impactedDepartmentIds, setImpactedDepartmentIds] = useState<number[]>(
    existing?.impactedDepartmentIds ?? [],
  );
  const [additionalComments, setAdditionalComments] = useState(
    existing?.additionalComments ?? "",
  );
  const [labels, setLabels] = useState<TaskLabel[]>(existing?.labels ?? []);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].value);

  // Reset form when the dialog reopens (covers create-then-create-again
  // and edit-then-switch-project).
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setColor(existing?.color ?? COLOR_SWATCHES[0]);
    setDepartmentId(
      existing?.departmentId != null
        ? String(existing.departmentId)
        : defaultDeptId != null
          ? String(defaultDeptId)
          : "none",
    );
    setOwnerId(existing?.ownerId != null ? String(existing.ownerId) : "none");
    setDueDate(existing?.dueAt ? existing.dueAt.substring(0, 10) : "");
    setPriority(
      (existing?.priority as
        | "low"
        | "medium"
        | "high"
        | "urgent"
        | undefined) ?? "medium",
    );
    setSuggestedById(
      existing?.suggestedById != null ? String(existing.suggestedById) : "none",
    );
    setGoal(existing?.goal ?? "");
    setImplementation(existing?.implementation ?? "");
    setRationale(existing?.rationale ?? "");
    setImpactedDepartmentIds(existing?.impactedDepartmentIds ?? []);
    setAdditionalComments(existing?.additionalComments ?? "");
    setLabels(existing?.labels ?? []);
    setNewLabelName("");
    // Intentionally re-init each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    if (existing) {
      queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(existing.id),
      });
    }
  };

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    // Build the payload separately for create vs edit so we don't
    // accidentally reactivate a completed / on_hold / archived
    // initiative when an admin edits its details.
    const sharedFields = {
      name: name.trim(),
      description,
      color,
      departmentId: departmentId === "none" ? null : Number(departmentId),
      ownerId: ownerId === "none" ? null : Number(ownerId),
      dueAt: dueDate ? new Date(dueDate).toISOString() : null,
      suggestedById:
        suggestedById === "none" ? null : Number(suggestedById),
      goal,
      implementation,
      rationale,
      impactedDepartmentIds,
      additionalComments,
      labels,
      priority,
    };
    if (isEdit && existing) {
      updateMutation.mutate(
        { id: existing.id, data: sharedFields },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: "Initiative updated" });
            onOpenChange(false);
          },
          onError: () =>
            toast({
              title: "Could not save initiative",
              variant: "destructive",
            }),
        },
      );
    } else {
      createMutation.mutate(
        { data: { ...sharedFields, status: "active" as const } },
        {
          onSuccess: (created) => {
            invalidate();
            toast({ title: "Initiative created" });
            onOpenChange(false);
            // Land the user on their new board.
            navigate(`/projects/${created.id}`);
          },
          onError: () =>
            toast({
              title: "Could not create initiative",
              variant: "destructive",
            }),
        },
      );
    }
  };

  const remove = () => {
    if (!existing) return;
    if (
      !window.confirm(
        `Delete initiative "${existing.name}"? Its phase board and work-step cards will be removed.`,
      )
    )
      return;
    deleteMutation.mutate(
      { id: existing.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Initiative deleted" });
          onOpenChange(false);
          navigate("/projects");
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

  const toggleDept = (id: number) => {
    setImpactedDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const isAdmin = session?.role === "admin";
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[92vh] overflow-y-auto"
        aria-describedby={undefined}
        data-testid="project-editor-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{isEdit ? "Initiative detail" : "New initiative"}</span>
            {isEdit && existing && "completedYear" in existing && existing.completedYear && (
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
                Completed {existing.completedYear}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Title + accent color */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <Label htmlFor="proj-name" className="text-[12.5px]">
                Title
              </Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Microsoft Copilot enablement"
                className="mt-1 text-[15px]"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label className="text-[12.5px]">Color</Label>
              <div className="flex gap-1 mt-1">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full ring-2 transition-all",
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
                    data-testid="select-project-suggested-by"
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
                <Label
                  htmlFor="proj-goal"
                  className="text-[12.5px] inline-flex items-center gap-1"
                >
                  <Target className="h-3 w-3" /> Goal
                </Label>
                <Input
                  id="proj-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="What outcome are we after?"
                  className="mt-1"
                  data-testid="input-project-goal"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="proj-desc" className="text-[12.5px]">
                Brief description
              </Label>
              <Textarea
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is the idea, in a sentence or two?"
                className="mt-1 min-h-[70px]"
                data-testid="input-project-description"
              />
            </div>
          </section>

          {/* PLAN */}
          <section className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Plan
            </h4>
            <div>
              <Label htmlFor="proj-impl" className="text-[12.5px]">
                How should it be implemented?
              </Label>
              <Textarea
                id="proj-impl"
                value={implementation}
                onChange={(e) => setImplementation(e.target.value)}
                placeholder="Steps, tools, vendors, rollout approach..."
                className="mt-1 min-h-[80px]"
                data-testid="input-project-implementation"
              />
            </div>
            <div>
              <Label htmlFor="proj-rationale" className="text-[12.5px]">
                Why is there a need to implement this?
              </Label>
              <Textarea
                id="proj-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="The pain or opportunity this addresses..."
                className="mt-1 min-h-[70px]"
                data-testid="input-project-rationale"
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
                <Label className="text-[12.5px]">Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger
                    className="mt-1"
                    data-testid="select-project-dept"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cross-functional</SelectItem>
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
                  <SelectTrigger
                    className="mt-1"
                    data-testid="select-project-owner"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {isEdit ? "Unassigned" : "Me (default)"}
                    </SelectItem>
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
                    setPriority(v as "low" | "medium" | "high" | "urgent")
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
                <Label htmlFor="proj-due" className="text-[12.5px]">
                  Target date
                </Label>
                <Input
                  id="proj-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-project-due"
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
                  data-testid="input-new-project-label"
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
                  data-testid="button-add-project-label"
                >
                  Add
                </Button>
              </div>
            </div>
          </section>

          {/* ADDITIONAL COMMENTS */}
          <div>
            <Label htmlFor="proj-additional" className="text-[12.5px]">
              Additional comments
            </Label>
            <Textarea
              id="proj-additional"
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              placeholder="Anything else worth capturing..."
              className="mt-1 min-h-[70px]"
              data-testid="input-project-additional"
            />
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between">
          {isEdit && isAdmin ? (
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={deleteMutation.isPending}
              data-testid="button-delete-project"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete initiative
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={saving}
              data-testid="button-save-project"
            >
              {saving
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save"
                  : "Create initiative"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
