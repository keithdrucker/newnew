import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInitiatives,
  useCreateInitiative,
  useUpdateInitiative,
  useListDepartments,
  type Initiative,
  type InitiativeStatus,
  type InitiativeAuditEvent,
  getListInitiativesQueryKey,
  getGetInitiativeQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Lightbulb,
  Clock,
  Building2,
  CheckCircle2,
  CircleDashed,
  ChevronDown,
  ExternalLink,
  Plus,
  XCircle,
  PauseCircle,
  Undo2,
  RotateCcw,
  History,
} from "lucide-react";

// ---------- Constants ----------

const STATUS_ORDER: InitiativeStatus[] = [
  "backlog",
  "under_review",
  "approved",
  "rejected_deferred",
];

const STATUS_LABEL: Record<InitiativeStatus, string> = {
  backlog: "Backlog",
  under_review: "Under Review",
  approved: "Approved",
  rejected_deferred: "Rejected / Deferred",
};

const STATUS_HINT: Record<InitiativeStatus, string> = {
  backlog: "Fresh ideas — needs triage",
  under_review: "Light analysis — pros/cons, cost, risk",
  approved: "Approved → became a Project",
  rejected_deferred: "Decision recorded — no work proceeds",
};

const STATUS_COLORS: Record<
  InitiativeStatus,
  { header: string; ring: string; pill: string }
> = {
  backlog: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
    pill: "bg-zinc-100 text-zinc-800 border-zinc-300",
  },
  under_review: {
    header: "bg-amber-50 text-amber-800",
    ring: "ring-amber-200",
    pill: "bg-amber-50 text-amber-800 border-amber-200",
  },
  approved: {
    header: "bg-emerald-50 text-emerald-800",
    ring: "ring-emerald-200",
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  rejected_deferred: {
    header: "bg-zinc-100 text-zinc-700",
    ring: "ring-zinc-200",
    pill: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
};

const IMPACT_SCOPE_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "team", label: "Team" },
  { value: "department", label: "Department" },
  { value: "company_wide", label: "Company-wide" },
];

const CATEGORY_OPTIONS = [
  { value: "it", label: "IT" },
  { value: "security", label: "Security" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
  { value: "compliance", label: "Compliance" },
  { value: "customer_experience", label: "Customer Experience" },
  { value: "other", label: "Other" },
];

const LMH_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const LMHU_OPTIONS = [...LMH_OPTIONS, { value: "unknown", label: "Unknown" }];

const ALIGNMENT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" },
];

const INVESTIGATION_OPTIONS = [
  { value: "investigate_further", label: "Investigate Further" },
  { value: "do_not_investigate", label: "Do Not Investigate" },
];

const VALIDATION_OPTIONS = [
  { value: "not_reviewed", label: "Not Reviewed" },
  { value: "discussed", label: "Discussed" },
  { value: "demoed", label: "Demoed" },
  { value: "piloted", label: "Piloted" },
];

// ---------- Helpers ----------

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ageLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function levelTone(value: string) {
  const v = value.toLowerCase();
  if (v === "high")
    return "bg-rose-50 text-rose-700 border-rose-200";
  if (v === "medium")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (v === "low")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

function fmtOption(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value;
}

// ---------- Page ----------

export default function InitiativesPage() {
  const { data, isLoading } = useListInitiatives();
  const initiatives = (data ?? []) as Initiative[];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<InitiativeStatus, Initiative[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const i of initiatives)
      m.get(i.status as InitiativeStatus)?.push(i);
    return m;
  }, [initiatives]);

  const selected =
    selectedId != null
      ? initiatives.find((i) => i.id === selectedId) ?? null
      : null;

  return (
    <div
      className="p-6 space-y-6"
      data-testid="page-initiatives"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lightbulb className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Initiatives
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Decide whether work should be done — no planning, no execution.
            Approved initiatives automatically become Projects in the
            Improvements section.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-initiative"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New initiative
        </Button>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              items={grouped.get(status) ?? []}
              onPick={setSelectedId}
            />
          ))}
        </div>
      )}

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      {selected && (
        <DetailDialog
          row={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ---------- Column ----------

function Column({
  status,
  items,
  onPick,
}: {
  status: InitiativeStatus;
  items: Initiative[];
  onPick: (id: number) => void;
}) {
  const tone = STATUS_COLORS[status];
  return (
    <div
      className={`rounded-lg ring-1 ${tone.ring} bg-white flex flex-col`}
      data-testid={`column-${status}`}
    >
      <div
        className={`${tone.header} px-3 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide rounded-t-lg`}
      >
        <span>{STATUS_LABEL[status]}</span>
        <span data-testid={`count-${status}`}>{items.length}</span>
      </div>
      <div className="px-3 py-1 text-[11.5px] text-muted-foreground border-b border-zinc-100">
        {STATUS_HINT[status]}
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">
            Nothing here yet.
          </p>
        ) : (
          items.map((i) => (
            <InitiativeCard key={i.id} row={i} onPick={onPick} />
          ))
        )}
      </div>
    </div>
  );
}

function InitiativeCard({
  row,
  onPick,
}: {
  row: Initiative;
  onPick: (id: number) => void;
}) {
  const summary =
    row.problemOpportunity?.trim() ||
    row.description?.trim() ||
    "—";
  return (
    <button
      type="button"
      onClick={() => onPick(row.id)}
      className="w-full text-left rounded-md border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition p-3 space-y-2"
      data-testid={`card-initiative-${row.id}`}
    >
      <div className="text-[13.5px] font-medium leading-snug line-clamp-2">
        {row.title}
      </div>
      <div className="text-[12px] text-muted-foreground line-clamp-2">
        {summary}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Avatar className="h-5 w-5 text-[10px]">
          <AvatarFallback>{initials(row.reporterName)}</AvatarFallback>
        </Avatar>
        {row.departmentName && (
          <Badge
            variant="outline"
            className="text-[10.5px] py-0 h-5 font-normal"
          >
            {row.departmentName}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {ageLabel(row.createdAt)}
        </span>
      </div>
      {row.status === "approved" && row.createdProjectId && (
        <div className="text-[11.5px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Project P-{row.createdProjectId}
        </div>
      )}
      {row.status === "rejected_deferred" && (
        <div className="text-[11.5px] text-zinc-600 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Decision recorded
        </div>
      )}
    </button>
  );
}

// ---------- Create Dialog ----------

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const create = useCreateInitiative({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
        toast.success("Initiative created in Backlog.");
        onOpenChange(false);
      },
      onError: (e: Error) => toast.error(e.message),
    },
  });
  const { data: depts } = useListDepartments();

  const [title, setTitle] = useState("");
  const [problemOpportunity, setProblemOpportunity] = useState("");
  const [expectedBenefit, setExpectedBenefit] = useState("");
  const [impactScope, setImpactScope] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setTitle("");
      setProblemOpportunity("");
      setExpectedBenefit("");
      setImpactScope("");
      setDepartmentId("none");
      setAdditionalNotes("");
    }
  }, [open]);

  const canSubmit =
    title.trim().length > 0 &&
    problemOpportunity.trim().length > 0 &&
    expectedBenefit.trim().length > 0 &&
    impactScope.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate({
      data: {
        title: title.trim(),
        problemOpportunity: problemOpportunity.trim(),
        expectedBenefit: expectedBenefit.trim(),
        impactScope,
        additionalNotes: additionalNotes.trim(),
        departmentId:
          departmentId === "none" ? null : Number.parseInt(departmentId, 10),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New initiative</DialogTitle>
          <DialogDescription>
            Capture the idea. It will land in Backlog for triage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, descriptive name"
              data-testid="input-create-title"
            />
          </Field>
          <Field label="Problem / Opportunity" required>
            <Textarea
              rows={3}
              value={problemOpportunity}
              onChange={(e) => setProblemOpportunity(e.target.value)}
              placeholder="What problem are we solving or opportunity are we addressing?"
              data-testid="input-create-problem"
            />
          </Field>
          <Field label="Expected Benefit" required>
            <Textarea
              rows={2}
              value={expectedBenefit}
              onChange={(e) => setExpectedBenefit(e.target.value)}
              placeholder="What value could this create? Example: time savings, cost reduction, efficiency, risk reduction, compliance, or user experience."
              data-testid="input-create-benefit"
            />
          </Field>
          <Field label="Impact Scope" required>
            <Select value={impactScope} onValueChange={setImpactScope}>
              <SelectTrigger data-testid="select-create-scope">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {IMPACT_SCOPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Department">
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger data-testid="select-create-department">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(depts ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Additional Notes">
            <Textarea
              rows={2}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              data-testid="input-create-notes"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || create.isPending}
            data-testid="button-submit-create"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail Dialog ----------

function DetailDialog({
  row,
  onClose,
}: {
  row: Initiative;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateInitiative({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
        qc.invalidateQueries({
          queryKey: getGetInitiativeQueryKey(row.id),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    },
  });

  // ---- Local form state (so we can stage edits) ----
  // Backlog
  const [category, setCategory] = useState(row.category);
  const [initialPriority, setInitialPriority] = useState(row.initialPriority);
  const [initialEffort, setInitialEffort] = useState(row.initialEffort);
  const [businessAlignment, setBusinessAlignment] = useState(
    row.businessAlignment,
  );
  const [investigationDecision, setInvestigationDecision] = useState(
    row.investigationDecision,
  );
  const [backlogNotes, setBacklogNotes] = useState(row.backlogNotes);
  // Under review (with legacy fallbacks for first edit)
  const [benefits, setBenefits] = useState(row.benefits);
  const [tradeoffs, setTradeoffs] = useState(row.tradeoffs || row.prosCons);
  const [businessValueLevel, setBusinessValueLevel] = useState(
    row.businessValueLevel,
  );
  const [businessValueSummary, setBusinessValueSummary] = useState(
    row.businessValueSummary || row.expectedBenefit,
  );
  const [costLevel, setCostLevel] = useState(row.costLevel);
  const [estimatedCost, setEstimatedCost] = useState(
    row.estimatedCost || row.roughCost,
  );
  const [riskLevel, setRiskLevel] = useState(row.riskLevel);
  const [riskNotes, setRiskNotes] = useState(row.riskNotes);
  const [validationStatus, setValidationStatus] = useState(
    row.validationStatus,
  );
  const [impactedTeams, setImpactedTeams] = useState(row.impactedTeams);
  // Final decision
  const [finalDecision, setFinalDecision] = useState(row.finalDecision);
  const [decisionReason, setDecisionReason] = useState(row.decisionReason);
  const [revisitDate, setRevisitDate] = useState<string>(
    row.revisitDate ?? "",
  );
  // Reopen / move-back reason
  const [transitionReason, setTransitionReason] = useState("");

  // Sync when picking a different row.
  useEffect(() => {
    setCategory(row.category);
    setInitialPriority(row.initialPriority);
    setInitialEffort(row.initialEffort);
    setBusinessAlignment(row.businessAlignment);
    setInvestigationDecision(row.investigationDecision);
    setBacklogNotes(row.backlogNotes);
    setBenefits(row.benefits);
    setTradeoffs(row.tradeoffs || row.prosCons);
    setBusinessValueLevel(row.businessValueLevel);
    setBusinessValueSummary(
      row.businessValueSummary || row.expectedBenefit,
    );
    setCostLevel(row.costLevel);
    setEstimatedCost(row.estimatedCost || row.roughCost);
    setRiskLevel(row.riskLevel);
    setRiskNotes(row.riskNotes);
    setValidationStatus(row.validationStatus);
    setImpactedTeams(row.impactedTeams);
    setFinalDecision(row.finalDecision);
    setDecisionReason(row.decisionReason);
    setRevisitDate(row.revisitDate ?? "");
    setTransitionReason("");
  }, [row.id, row]);

  const status = row.status as InitiativeStatus;
  const tone = STATUS_COLORS[status];

  // ---- Field-only patch (no status change) ----
  const fieldPatch = () => ({
    category,
    initialPriority,
    initialEffort,
    businessAlignment,
    investigationDecision,
    backlogNotes,
    benefits,
    tradeoffs,
    businessValueLevel,
    businessValueSummary,
    costLevel,
    estimatedCost,
    riskLevel,
    riskNotes,
    validationStatus,
    impactedTeams,
  });

  const saveTriage = () => {
    update.mutate(
      { id: row.id, data: fieldPatch() },
      {
        onSuccess: () => toast.success("Backlog triage saved."),
      },
    );
  };

  const saveReview = () => {
    update.mutate(
      { id: row.id, data: fieldPatch() },
      {
        onSuccess: () => toast.success("Review saved."),
      },
    );
  };

  const moveToUnderReview = () => {
    if (investigationDecision !== "investigate_further") {
      toast.error('Set Investigation Decision to "Investigate Further".');
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: { ...fieldPatch(), status: "under_review" },
      },
      { onSuccess: () => toast.success("Moved to Under Review.") },
    );
  };

  const closeFromBacklog = () => {
    if (investigationDecision !== "do_not_investigate") {
      toast.error('Set Investigation Decision to "Do Not Investigate".');
      return;
    }
    if (backlogNotes.trim().length === 0) {
      toast.error("Add Backlog Notes explaining why we shouldn't pursue.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: { ...fieldPatch(), status: "rejected_deferred" },
      },
      { onSuccess: () => toast.success("Closed — decision recorded.") },
    );
  };

  const moveBackToBacklog = () => {
    if (transitionReason.trim().length === 0) {
      toast.error("Reason is required to move back to Backlog.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: {
          ...fieldPatch(),
          status: "backlog",
          transitionReason: transitionReason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Moved back to Backlog.");
          setTransitionReason("");
        },
      },
    );
  };

  const decide = (decision: "approve" | "defer" | "reject") => {
    if (decisionReason.trim().length === 0) {
      toast.error("Decision Rationale is required.");
      return;
    }
    const newStatus: InitiativeStatus =
      decision === "approve" ? "approved" : "rejected_deferred";
    update.mutate(
      {
        id: row.id,
        data: {
          ...fieldPatch(),
          status: newStatus,
          decisionReason: decisionReason.trim(),
          finalDecision: decision,
          revisitDate:
            decision === "defer" && revisitDate ? revisitDate : null,
        },
      },
      {
        onSuccess: () => {
          if (decision === "approve")
            toast.success("Approved — Project created.");
          else if (decision === "defer") toast.success("Deferred.");
          else toast.success("Rejected.");
        },
      },
    );
  };

  const reopen = (target: InitiativeStatus) => {
    if (transitionReason.trim().length === 0) {
      toast.error("Reason is required to reopen.");
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: {
          status: target,
          transitionReason: transitionReason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Reopened to ${STATUS_LABEL[target]}.`);
          setTransitionReason("");
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-initiative-detail"
      >
        <DialogHeader>
          <div className="space-y-3">
            <DialogTitle className="text-xl pr-8">{row.title}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge
                variant="outline"
                className={tone.pill}
                data-testid="badge-current-status"
              >
                {STATUS_LABEL[status]}
              </Badge>
              {row.departmentName && (
                <Badge variant="outline" className="font-normal">
                  <Building2 className="h-3 w-3 mr-1" />
                  {row.departmentName}
                </Badge>
              )}
              <span className="text-muted-foreground">
                Created by {row.reporterName ?? "Unknown"}
              </span>
              <span className="text-muted-foreground">
                · {new Date(row.createdAt).toLocaleDateString()}
              </span>
            </div>
            <PhaseProgress status={status} />
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Intake summary (always visible) */}
          <Section title="Intake" defaultOpen>
            <ReadField
              label="Problem / Opportunity"
              value={row.problemOpportunity || row.description}
            />
            <div className="grid grid-cols-2 gap-3">
              <ReadField
                label="Expected Benefit"
                value={
                  row.businessValueSummary ||
                  row.expectedBenefit ||
                  "—"
                }
              />
              <ReadField
                label="Impact Scope"
                value={fmtOption(row.impactScope, IMPACT_SCOPE_OPTIONS)}
              />
            </div>
            {row.additionalNotes && (
              <ReadField
                label="Additional Notes"
                value={row.additionalNotes}
              />
            )}
          </Section>

          {/* Backlog Triage */}
          <Section
            title="Backlog Triage"
            defaultOpen={status === "backlog"}
            badge={
              row.backlogReviewedAt ? (
                <Badge
                  variant="outline"
                  className="text-[10.5px] font-normal"
                >
                  Reviewed by {row.backlogReviewedByName ?? "Unknown"} ·{" "}
                  {new Date(row.backlogReviewedAt).toLocaleDateString()}
                </Badge>
              ) : null
            }
          >
            {status === "backlog" ? (
              <BacklogTriageEditor
                category={category}
                setCategory={setCategory}
                initialPriority={initialPriority}
                setInitialPriority={setInitialPriority}
                initialEffort={initialEffort}
                setInitialEffort={setInitialEffort}
                businessAlignment={businessAlignment}
                setBusinessAlignment={setBusinessAlignment}
                investigationDecision={investigationDecision}
                setInvestigationDecision={setInvestigationDecision}
                backlogNotes={backlogNotes}
                setBacklogNotes={setBacklogNotes}
              />
            ) : (
              <BacklogTriageView row={row} />
            )}
          </Section>

          {/* Under Review analysis */}
          <Section
            title="Under Review — Analysis"
            defaultOpen={status === "under_review"}
          >
            {status === "under_review" ? (
              <UnderReviewEditor
                benefits={benefits}
                setBenefits={setBenefits}
                tradeoffs={tradeoffs}
                setTradeoffs={setTradeoffs}
                businessValueLevel={businessValueLevel}
                setBusinessValueLevel={setBusinessValueLevel}
                businessValueSummary={businessValueSummary}
                setBusinessValueSummary={setBusinessValueSummary}
                costLevel={costLevel}
                setCostLevel={setCostLevel}
                estimatedCost={estimatedCost}
                setEstimatedCost={setEstimatedCost}
                riskLevel={riskLevel}
                setRiskLevel={setRiskLevel}
                riskNotes={riskNotes}
                setRiskNotes={setRiskNotes}
                validationStatus={validationStatus}
                setValidationStatus={setValidationStatus}
                impactedTeams={impactedTeams}
                setImpactedTeams={setImpactedTeams}
              />
            ) : (
              <UnderReviewView row={row} />
            )}
          </Section>

          {/* Final decision (only meaningful in Under Review or post-decision) */}
          {(status === "under_review" ||
            status === "approved" ||
            status === "rejected_deferred") && (
            <Section
              title="Final Decision"
              defaultOpen={status === "under_review"}
            >
              {status === "under_review" ? (
                <FinalDecisionEditor
                  decisionReason={decisionReason}
                  setDecisionReason={setDecisionReason}
                  revisitDate={revisitDate}
                  setRevisitDate={setRevisitDate}
                  finalDecision={finalDecision}
                  setFinalDecision={setFinalDecision}
                />
              ) : (
                <FinalDecisionView row={row} />
              )}
            </Section>
          )}

          {/* Approved → project link */}
          {status === "approved" && (
            <div
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 flex items-start gap-2"
              data-testid="banner-approved"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-medium text-emerald-900">
                  {row.createdProjectId
                    ? `Approved → Project P-${row.createdProjectId}`
                    : "Approved"}
                </p>
                <p className="text-[11.5px] text-emerald-800 mt-0.5">
                  Decided{" "}
                  {row.decidedAt
                    ? new Date(row.decidedAt).toLocaleString()
                    : ""}
                  {row.decidedByName ? ` by ${row.decidedByName}` : ""}.
                </p>
              </div>
              {row.createdProjectId && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-emerald-300"
                >
                  <Link href={`/projects`} data-testid="link-view-project">
                    View Project
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          )}
          {status === "rejected_deferred" && (
            <div
              className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-3 space-y-1"
              data-testid="banner-rejected"
            >
              <p className="text-[13px] font-medium text-zinc-800">
                {row.finalDecision === "defer"
                  ? "Deferred"
                  : "Rejected / Closed"}
              </p>
              <p className="text-[11.5px] text-zinc-600">
                Decided{" "}
                {row.decidedAt
                  ? new Date(row.decidedAt).toLocaleString()
                  : ""}
                {row.decidedByName ? ` by ${row.decidedByName}` : ""}.
              </p>
              {row.revisitDate && (
                <p className="text-[11.5px] text-zinc-600">
                  Revisit on{" "}
                  {new Date(row.revisitDate).toLocaleDateString()}.
                </p>
              )}
            </div>
          )}

          {/* Move-back / reopen reason input — shown when relevant */}
          {(status === "under_review" ||
            status === "approved" ||
            status === "rejected_deferred") && (
            <Section
              title={
                status === "under_review"
                  ? "Move Back"
                  : "Reopen"
              }
              defaultOpen={false}
            >
              <Field
                label={
                  status === "under_review"
                    ? "Why is this being moved back to Backlog?"
                    : "Why are we reopening this?"
                }
              >
                <Textarea
                  rows={2}
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  data-testid="input-transition-reason"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {status === "under_review" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={moveBackToBacklog}
                    disabled={update.isPending}
                    data-testid="button-move-back-backlog"
                  >
                    <Undo2 className="h-4 w-4 mr-1.5" />
                    Move back to Backlog
                  </Button>
                )}
                {status === "approved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reopen("under_review")}
                    disabled={update.isPending}
                    data-testid="button-reopen-under-review"
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Reopen to Under Review
                  </Button>
                )}
                {status === "rejected_deferred" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopen("backlog")}
                      disabled={update.isPending}
                      data-testid="button-reopen-backlog"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Reopen to Backlog
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopen("under_review")}
                      disabled={update.isPending}
                      data-testid="button-reopen-under-review"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Reopen to Under Review
                    </Button>
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Audit / history */}
          <Section
            title="Previous Review History"
            defaultOpen={false}
            badge={
              row.auditEvents && row.auditEvents.length > 0 ? (
                <Badge
                  variant="outline"
                  className="text-[10.5px] font-normal"
                >
                  {row.auditEvents.length}{" "}
                  {row.auditEvents.length === 1 ? "event" : "events"}
                </Badge>
              ) : null
            }
          >
            <AuditTimeline events={row.auditEvents ?? []} />
          </Section>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {status === "backlog" && (
              <>
                <Button
                  variant="outline"
                  onClick={saveTriage}
                  disabled={update.isPending}
                  data-testid="button-save-triage"
                >
                  Save Triage
                </Button>
                <Button
                  variant="outline"
                  onClick={closeFromBacklog}
                  disabled={update.isPending}
                  data-testid="button-close-not-pursue"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Close / Do Not Pursue
                </Button>
                <Button
                  onClick={moveToUnderReview}
                  disabled={update.isPending}
                  data-testid="button-move-to-review"
                >
                  Move to Under Review
                </Button>
              </>
            )}
            {status === "under_review" && (
              <>
                <Button
                  variant="outline"
                  onClick={saveReview}
                  disabled={update.isPending}
                  data-testid="button-save-review"
                >
                  Save Review
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide("reject")}
                  disabled={update.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide("defer")}
                  disabled={update.isPending}
                  data-testid="button-defer"
                >
                  <PauseCircle className="h-4 w-4 mr-1.5" />
                  Defer
                </Button>
                <Button
                  onClick={() => decide("approve")}
                  disabled={update.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Approve &amp; Create Project
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Phase progress indicator ----------

function PhaseProgress({ status }: { status: InitiativeStatus }) {
  const isFinalRejected = status === "rejected_deferred";
  const isFinalApproved = status === "approved";
  const stages: {
    key: string;
    label: string;
    state: "done" | "active" | "future";
  }[] = [
    {
      key: "backlog",
      label: "Backlog",
      state:
        status === "backlog"
          ? "active"
          : status === "under_review" ||
              isFinalApproved ||
              isFinalRejected
            ? "done"
            : "future",
    },
    {
      key: "under_review",
      label: "Under Review",
      state:
        status === "under_review"
          ? "active"
          : isFinalApproved || isFinalRejected
            ? "done"
            : "future",
    },
    {
      key: "decision",
      label: isFinalRejected
        ? "Rejected / Deferred"
        : isFinalApproved
          ? "Approved"
          : "Approved / Rejected",
      state:
        isFinalApproved || isFinalRejected ? "active" : "future",
    },
  ];
  return (
    <div
      className="flex items-center gap-2"
      data-testid="phase-progress"
    >
      {stages.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-2 flex-1">
          <div
            className={
              s.state === "active"
                ? "flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 flex-1 justify-center"
                : s.state === "done"
                  ? "flex items-center gap-1.5 text-[11.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 flex-1 justify-center"
                  : "flex items-center gap-1.5 text-[11.5px] text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-full px-2.5 py-1 flex-1 justify-center"
            }
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
      ))}
    </div>
  );
}

// ---------- Section / Field primitives ----------

function Section({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-zinc-200 bg-white">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-800">
              {title}
              {badge}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
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

function LevelBadge({ value }: { value: string }) {
  if (!value) return <span className="text-zinc-400 text-[12px]">—</span>;
  return (
    <Badge variant="outline" className={`${levelTone(value)} font-normal`}>
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </Badge>
  );
}

// ---------- Sub-editors ----------

function BacklogTriageEditor(props: {
  category: string;
  setCategory: (v: string) => void;
  initialPriority: string;
  setInitialPriority: (v: string) => void;
  initialEffort: string;
  setInitialEffort: (v: string) => void;
  businessAlignment: string;
  setBusinessAlignment: (v: string) => void;
  investigationDecision: string;
  setInvestigationDecision: (v: string) => void;
  backlogNotes: string;
  setBacklogNotes: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={props.category} onValueChange={props.setCategory}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Business Alignment">
          <Select
            value={props.businessAlignment}
            onValueChange={props.setBusinessAlignment}
          >
            <SelectTrigger data-testid="select-alignment">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {ALIGNMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Initial Priority">
          <Select
            value={props.initialPriority}
            onValueChange={props.setInitialPriority}
          >
            <SelectTrigger data-testid="select-initial-priority">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Initial Effort">
          <Select
            value={props.initialEffort}
            onValueChange={props.setInitialEffort}
          >
            <SelectTrigger data-testid="select-initial-effort">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Investigation Decision">
        <Select
          value={props.investigationDecision}
          onValueChange={props.setInvestigationDecision}
        >
          <SelectTrigger data-testid="select-investigation-decision">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {INVESTIGATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Backlog Notes">
        <Textarea
          rows={2}
          value={props.backlogNotes}
          onChange={(e) => props.setBacklogNotes(e.target.value)}
          placeholder="Why should this move forward for deeper review, or why should it stop here?"
          data-testid="input-backlog-notes"
        />
      </Field>
    </>
  );
}

function BacklogTriageView({ row }: { row: Initiative }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <ReadField
        label="Category"
        value={fmtOption(row.category, CATEGORY_OPTIONS)}
      />
      <ReadField
        label="Business Alignment"
        value={fmtOption(row.businessAlignment, ALIGNMENT_OPTIONS)}
      />
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Initial Priority
        </div>
        <LevelBadge value={row.initialPriority} />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Initial Effort
        </div>
        <LevelBadge value={row.initialEffort} />
      </div>
      <ReadField
        label="Investigation Decision"
        value={fmtOption(row.investigationDecision, INVESTIGATION_OPTIONS)}
      />
      <div />
      <div className="col-span-2">
        <ReadField label="Backlog Notes" value={row.backlogNotes} />
      </div>
    </div>
  );
}

function UnderReviewEditor(props: {
  benefits: string;
  setBenefits: (v: string) => void;
  tradeoffs: string;
  setTradeoffs: (v: string) => void;
  businessValueLevel: string;
  setBusinessValueLevel: (v: string) => void;
  businessValueSummary: string;
  setBusinessValueSummary: (v: string) => void;
  costLevel: string;
  setCostLevel: (v: string) => void;
  estimatedCost: string;
  setEstimatedCost: (v: string) => void;
  riskLevel: string;
  setRiskLevel: (v: string) => void;
  riskNotes: string;
  setRiskNotes: (v: string) => void;
  validationStatus: string;
  setValidationStatus: (v: string) => void;
  impactedTeams: string;
  setImpactedTeams: (v: string) => void;
}) {
  return (
    <>
      <Field label="Benefits">
        <Textarea
          rows={3}
          value={props.benefits}
          onChange={(e) => props.setBenefits(e.target.value)}
          placeholder="What are the key advantages or expected outcomes?"
          data-testid="input-benefits"
        />
      </Field>
      <Field label="Tradeoffs / Considerations">
        <Textarea
          rows={3}
          value={props.tradeoffs}
          onChange={(e) => props.setTradeoffs(e.target.value)}
          placeholder="What are the downsides, risks, dependencies, or concerns?"
          data-testid="input-tradeoffs"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Business Value Level">
          <Select
            value={props.businessValueLevel}
            onValueChange={props.setBusinessValueLevel}
          >
            <SelectTrigger data-testid="select-bv-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cost Level">
          <Select value={props.costLevel} onValueChange={props.setCostLevel}>
            <SelectTrigger data-testid="select-cost-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMHU_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Business Value Summary">
        <Textarea
          rows={2}
          value={props.businessValueSummary}
          onChange={(e) => props.setBusinessValueSummary(e.target.value)}
          placeholder="Summarize the expected business value in 1–2 sentences."
          data-testid="input-bv-summary"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Estimated Cost ($)">
          <Input
            value={props.estimatedCost}
            onChange={(e) => props.setEstimatedCost(e.target.value)}
            placeholder="Optional"
            data-testid="input-estimated-cost"
          />
        </Field>
        <Field label="Risk Level">
          <Select value={props.riskLevel} onValueChange={props.setRiskLevel}>
            <SelectTrigger data-testid="select-risk-level">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {LMH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Risk Notes">
        <Textarea
          rows={2}
          value={props.riskNotes}
          onChange={(e) => props.setRiskNotes(e.target.value)}
          data-testid="input-risk-notes"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Validation Status">
          <Select
            value={props.validationStatus}
            onValueChange={props.setValidationStatus}
          >
            <SelectTrigger data-testid="select-validation">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {VALIDATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Impacted Teams / Departments">
          <Input
            value={props.impactedTeams}
            onChange={(e) => props.setImpactedTeams(e.target.value)}
            placeholder="Optional"
            data-testid="input-impacted-teams"
          />
        </Field>
      </div>
    </>
  );
}

function UnderReviewView({ row }: { row: Initiative }) {
  const benefits = row.benefits || "";
  const tradeoffs = row.tradeoffs || row.prosCons || "";
  const summary = row.businessValueSummary || row.expectedBenefit || "";
  const cost = row.estimatedCost || row.roughCost || "";
  if (
    !benefits &&
    !tradeoffs &&
    !summary &&
    !cost &&
    !row.businessValueLevel &&
    !row.costLevel &&
    !row.riskLevel &&
    !row.validationStatus &&
    !row.impactedTeams &&
    !row.riskNotes
  ) {
    return (
      <p className="text-[12.5px] text-muted-foreground italic">
        No analysis recorded.
      </p>
    );
  }
  return (
    <>
      {benefits && <ReadField label="Benefits" value={benefits} />}
      {tradeoffs && (
        <ReadField label="Tradeoffs / Considerations" value={tradeoffs} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Business Value
          </div>
          <LevelBadge value={row.businessValueLevel} />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Cost
          </div>
          <LevelBadge value={row.costLevel} />
        </div>
      </div>
      {summary && (
        <ReadField label="Business Value Summary" value={summary} />
      )}
      <div className="grid grid-cols-2 gap-3">
        {cost && <ReadField label="Estimated Cost" value={cost} />}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Risk
          </div>
          <LevelBadge value={row.riskLevel} />
        </div>
      </div>
      {row.riskNotes && (
        <ReadField label="Risk Notes" value={row.riskNotes} />
      )}
      {row.validationStatus && (
        <ReadField
          label="Validation Status"
          value={fmtOption(row.validationStatus, VALIDATION_OPTIONS)}
        />
      )}
      {row.impactedTeams && (
        <ReadField label="Impacted Teams" value={row.impactedTeams} />
      )}
    </>
  );
}

function FinalDecisionEditor(props: {
  decisionReason: string;
  setDecisionReason: (v: string) => void;
  revisitDate: string;
  setRevisitDate: (v: string) => void;
  finalDecision: string;
  setFinalDecision: (v: string) => void;
}) {
  return (
    <>
      <Field
        label="Decision Rationale"
        required
      >
        <Textarea
          rows={3}
          value={props.decisionReason}
          onChange={(e) => props.setDecisionReason(e.target.value)}
          placeholder="Briefly explain why this was approved, deferred, or rejected. Consider business value, cost, risk, validation, timing, and missing information."
          data-testid="input-decision-rationale"
        />
      </Field>
      <Field label="Revisit Date (only meaningful for Defer)">
        <Input
          type="date"
          value={props.revisitDate}
          onChange={(e) => props.setRevisitDate(e.target.value)}
          data-testid="input-revisit-date"
        />
      </Field>
    </>
  );
}

function FinalDecisionView({ row }: { row: Initiative }) {
  return (
    <>
      <ReadField
        label="Final Decision"
        value={
          row.finalDecision === "approve"
            ? "Approve & Create Project"
            : row.finalDecision === "defer"
              ? "Defer"
              : row.finalDecision === "reject"
                ? "Reject"
                : row.finalDecision || "—"
        }
      />
      <ReadField label="Decision Rationale" value={row.decisionReason} />
      {row.revisitDate && (
        <ReadField
          label="Revisit Date"
          value={new Date(row.revisitDate).toLocaleDateString()}
        />
      )}
    </>
  );
}

// ---------- Audit timeline ----------

function AuditTimeline({ events }: { events: InitiativeAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground italic flex items-center gap-2">
        <History className="h-3.5 w-3.5" />
        No status changes yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2" data-testid="audit-timeline">
      {events.map((e) => (
        <li
          key={e.id}
          className="rounded-md border border-zinc-200 bg-zinc-50/40 px-3 py-2"
          data-testid={`audit-event-${e.id}`}
        >
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <div className="font-medium text-zinc-800">
              <span className="capitalize">{e.action.replace("_", " ")}</span>
              <span className="text-zinc-500 font-normal">
                {" · "}
                {STATUS_LABEL[e.oldStatus as InitiativeStatus]} →{" "}
                {STATUS_LABEL[e.newStatus as InitiativeStatus]}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(e.changedAt).toLocaleString()}
            </div>
          </div>
          <div className="text-[11.5px] text-zinc-600 mt-0.5">
            {e.changedByName ?? "Unknown"}
            {e.reason ? ` — ${e.reason}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
