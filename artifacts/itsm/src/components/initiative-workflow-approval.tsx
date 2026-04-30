import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWorkflows,
  useStartInitiativeWorkflowRun,
  useSubmitWorkflowRunDecision,
  useCancelWorkflowRun,
  getListInitiativesQueryKey,
  getGetInitiativeQueryKey,
  type Initiative,
  type WorkflowRun,
  type WorkflowRunApprover,
  type Workflow,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/providers/session-provider";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Ban,
} from "lucide-react";

export function InitiativeWorkflowApproval({ row }: { row: Initiative }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const runs: WorkflowRun[] = row.workflowRuns ?? [];
  const activeRun = useMemo(
    () => runs.find((r) => r.status === "pending"),
    [runs],
  );
  const pastRuns = useMemo(
    () => runs.filter((r) => r.status !== "pending"),
    [runs],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [decisionFor, setDecisionFor] = useState<
    null | "approve" | "reject" | "defer"
  >(null);
  const [rationale, setRationale] = useState("");

  const submitDecision = useSubmitWorkflowRunDecision();
  const cancelRun = useCancelWorkflowRun();

  function refresh() {
    qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetInitiativeQueryKey(row.id) });
  }

  async function handleSubmitDecision() {
    if (!activeRun || !decisionFor) return;
    if (activeRun.requireDecisionRationale && !rationale.trim()) {
      toast.error("A rationale is required for this decision.");
      return;
    }
    try {
      await submitDecision.mutateAsync({
        id: activeRun.id,
        data: { decision: decisionFor, rationale: rationale.trim() },
      });
      setDecisionFor(null);
      setRationale("");
      refresh();
      toast.success(`Recorded ${decisionFor} on the workflow.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't record decision.",
      );
    }
  }

  async function handleCancelRun() {
    if (!activeRun) return;
    if (!confirm("Cancel this approval workflow run?")) return;
    try {
      await cancelRun.mutateAsync({ id: activeRun.id, data: {} });
      refresh();
      toast.success("Approval workflow cancelled.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't cancel run.",
      );
    }
  }

  const myUserId = session?.userId ?? null;
  const myApproverRow = activeRun?.approvers.find(
    (a) => a.userId === myUserId,
  );
  const canDecide =
    !!activeRun &&
    !!myApproverRow &&
    !myApproverRow.decision &&
    activeRun.status === "pending";

  return (
    <div className="space-y-4">
      {!activeRun && (
        <div className="rounded-md border border-dashed p-3 flex items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">
            No active approval workflow on this initiative.
          </p>
          {session?.role === "admin" && row.status === "under_review" && (
            <Button
              size="sm"
              onClick={() => setPickerOpen(true)}
              data-testid="button-start-approval-workflow"
            >
              <PlayCircle className="h-4 w-4 mr-1.5" />
              Start Approval Workflow
            </Button>
          )}
        </div>
      )}

      {activeRun && (
        <ActiveRunCard
          run={activeRun}
          canDecide={canDecide}
          onDecide={(d) => {
            setDecisionFor(d);
            setRationale("");
          }}
          onCancel={
            session?.role === "admin" ? () => handleCancelRun() : undefined
          }
        />
      )}

      {pastRuns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Past runs
          </p>
          {pastRuns.map((r) => (
            <PastRunCard key={r.id} run={r} />
          ))}
        </div>
      )}

      {pickerOpen && (
        <WorkflowPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          initiativeId={row.id}
          onStarted={() => {
            setPickerOpen(false);
            refresh();
          }}
        />
      )}

      <Dialog
        open={decisionFor !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDecisionFor(null);
            setRationale("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionFor === "approve"
                ? "Approve this initiative"
                : decisionFor === "reject"
                  ? "Reject this initiative"
                  : "Defer this initiative"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rationale">
              Rationale
              {activeRun?.requireDecisionRationale ? (
                <span className="text-destructive"> *</span>
              ) : (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id="rationale"
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why are you making this decision?"
              data-testid="input-decision-rationale"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecisionFor(null);
                setRationale("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDecision}
              disabled={submitDecision.isPending}
              data-testid="button-submit-decision"
            >
              Submit {decisionFor}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActiveRunCard({
  run,
  canDecide,
  onDecide,
  onCancel,
}: {
  run: WorkflowRun;
  canDecide: boolean;
  onDecide: (d: "approve" | "reject" | "defer") => void;
  onCancel?: () => void;
}) {
  const approvalLabel =
    run.approvalType === "single"
      ? "Single approver — first decision wins"
      : run.approvalType === "any"
        ? "Any approver — first approve resolves"
        : "All approvers must respond";

  return (
    <div className="rounded-md border p-3 space-y-3" data-testid="card-active-run">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">
            {run.workflowName ?? `Workflow #${run.workflowId}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Started {new Date(run.startedAt).toLocaleString()} ·{" "}
            {run.startedByName ?? "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {approvalLabel}
            {run.requireDecisionRationale ? " · rationale required" : ""}
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-amber-700 border-amber-300 shrink-0"
        >
          Pending
        </Badge>
      </div>

      <ul className="space-y-1.5">
        {run.approvers.map((a) => (
          <ApproverRow key={a.id} approver={a} />
        ))}
      </ul>

      {canDecide && (
        <div className="flex flex-wrap gap-2 pt-1 border-t">
          <Button
            size="sm"
            onClick={() => onDecide("approve")}
            data-testid="button-decide-approve"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide("reject")}
            data-testid="button-decide-reject"
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide("defer")}
            data-testid="button-decide-defer"
          >
            <PauseCircle className="h-4 w-4 mr-1.5" />
            Defer
          </Button>
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={onCancel}
              data-testid="button-cancel-run"
            >
              <Ban className="h-4 w-4 mr-1.5" />
              Cancel run
            </Button>
          )}
        </div>
      )}
      {!canDecide && onCancel && (
        <div className="pt-1 border-t">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onCancel}
            data-testid="button-cancel-run"
          >
            <Ban className="h-4 w-4 mr-1.5" />
            Cancel run
          </Button>
        </div>
      )}
    </div>
  );
}

function ApproverRow({ approver }: { approver: WorkflowRunApprover }) {
  const decision = approver.decision;
  return (
    <li
      className="flex items-start justify-between gap-3 text-sm"
      data-testid={`row-approver-${approver.userId}`}
    >
      <div className="min-w-0">
        <p className="truncate">
          {approver.userName ?? `User #${approver.userId}`}
        </p>
        {decision && approver.rationale && (
          <p className="text-xs text-muted-foreground mt-0.5">
            “{approver.rationale}”
          </p>
        )}
        {decision && approver.decidedAt && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {new Date(approver.decidedAt).toLocaleString()}
          </p>
        )}
      </div>
      <DecisionBadge decision={decision ?? null} />
    </li>
  );
}

function DecisionBadge({
  decision,
}: {
  decision: "approve" | "reject" | "defer" | null;
}) {
  if (decision === "approve") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Approved
      </Badge>
    );
  }
  if (decision === "reject") {
    return (
      <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">
        Rejected
      </Badge>
    );
  }
  if (decision === "defer") {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        Deferred
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Pending
    </Badge>
  );
}

function PastRunCard({ run }: { run: WorkflowRun }) {
  return (
    <div className="rounded-md border p-2.5 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium truncate">
          {run.workflowName ?? `Workflow #${run.workflowId}`}
        </p>
        <RunStatusBadge status={run.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(run.startedAt).toLocaleDateString()} →{" "}
        {run.resolvedAt
          ? new Date(run.resolvedAt).toLocaleDateString()
          : "—"}
      </p>
      {run.outcomeReason && (
        <p className="text-xs text-muted-foreground">
          “{run.outcomeReason}”
        </p>
      )}
      {run.approvers.length > 0 && (
        <ul className="space-y-1 pt-1">
          {run.approvers.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-xs gap-2"
            >
              <span className="truncate text-muted-foreground">
                {a.userName ?? `User #${a.userId}`}
              </span>
              <DecisionBadge decision={a.decision ?? null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Approved
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">
        Rejected
      </Badge>
    );
  }
  if (status === "deferred") {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        Deferred
      </Badge>
    );
  }
  if (status === "cancelled") {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300">
      Pending
    </Badge>
  );
}

function WorkflowPicker({
  open,
  onOpenChange,
  initiativeId,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initiativeId: number;
  onStarted: () => void;
}) {
  // Component is only mounted when `open` is true (parent guards),
  // so we can fetch unconditionally.
  const { data: workflows, isLoading } = useListWorkflows({
    module: "initiatives",
    status: "active",
  });
  const startRun = useStartInitiativeWorkflowRun();
  const [chosenId, setChosenId] = useState<string>("");

  const eligible = useMemo(
    () =>
      (workflows ?? []).filter(
        (w: Workflow) => w.workflowType === "approval",
      ),
    [workflows],
  );

  async function handleStart() {
    const wfId = Number(chosenId);
    if (!wfId) {
      toast.error("Pick a workflow first.");
      return;
    }
    try {
      await startRun.mutateAsync({
        id: initiativeId,
        data: { workflowId: wfId },
      });
      setChosenId("");
      onStarted();
      toast.success("Approval workflow started.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't start workflow.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Approval Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active initiative-approval workflows. Create one in
              Settings → Workflows first.
            </p>
          ) : (
            <>
              <Label>Workflow</Label>
              <Select value={chosenId} onValueChange={setChosenId}>
                <SelectTrigger data-testid="select-workflow-to-start">
                  <SelectValue placeholder="Pick a workflow" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={
              !chosenId || startRun.isPending || eligible.length === 0
            }
            data-testid="button-confirm-start-workflow"
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
