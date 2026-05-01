import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRisks,
  useGetRisk,
  useCreateRisk,
  useUpdateRisk,
  useDeleteRisk,
  useListAgents,
  getListRisksQueryKey,
  getGetRiskQueryKey,
  type Risk,
  type RiskAuditEvent,
  type Agent,
} from "@workspace/api-client-react";
import { useTeamScope } from "@/lib/team-scope";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ShieldAlert,
  Plus,
  Trash2,
  ArrowRight,
  ExternalLink,
  History as HistoryIcon,
} from "lucide-react";
import { RiskWorkflowApproval } from "@/components/risk-workflow-approval";

// ---------- Constants ----------

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "identified", label: "Identified" },
  { value: "under_analysis", label: "Under Analysis" },
  { value: "under_treatment", label: "Under Treatment" },
  { value: "mitigation", label: "Mitigation" },
  { value: "accepted", label: "Accepted" },
  { value: "transferred", label: "Transferred" },
  { value: "avoided", label: "Avoided" },
  { value: "closed", label: "Closed" },
];

const RISK_TYPES = [
  "Security",
  "Operational",
  "Compliance",
  "Financial",
  "Other",
];

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TREATMENT_DECISIONS = [
  { value: "mitigation", label: "Mitigation (creates Project)" },
  { value: "acceptance", label: "Acceptance" },
  { value: "transfer", label: "Transfer" },
  { value: "avoidance", label: "Avoidance" },
];

function statusLabel(s: string): string {
  return (
    STATUS_TABS.find((t) => t.value === s)?.label ??
    s.replace(/_/g, " ")
  );
}

function ratingBadgeClass(rating: string): string {
  if (rating === "critical") return "bg-rose-100 text-rose-700 border-rose-200";
  if (rating === "high") return "bg-orange-100 text-orange-700 border-orange-200";
  if (rating === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  if (rating === "low") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-muted text-muted-foreground";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "identified":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "under_analysis":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "under_treatment":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "mitigation":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "accepted":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "transferred":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "avoided":
      return "bg-teal-100 text-teal-700 border-teal-200";
    case "closed":
      return "bg-muted text-muted-foreground";
    default:
      return "";
  }
}

// ---------- Page ----------

export default function RisksPage() {
  const { session } = useSession();
  const isAgentOrAdmin =
    session?.role === "admin" || session?.role === "agent";
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: risks = [], isLoading } = useListRisks(undefined);

  const filtered = useMemo(() => {
    if (tab === "all") return risks;
    return risks.filter((r) => r.status === tab);
  }, [risks, tab]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: risks.length };
    for (const r of risks) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [risks]);

  if (!isAgentOrAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Risk Register is available to agents and admins.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-risks">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-rose-600" />
          <div>
            <h1 className="text-2xl font-semibold">Risk Register</h1>
            <p className="text-sm text-muted-foreground">
              Track risks through identification, analysis, treatment, and
              closure. Treatment decisions go through the approval workflow.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-risk"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Risk
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start">
          {STATUS_TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="gap-1.5"
              data-testid={`tab-${t.value}`}
            >
              {t.label}
              <span className="text-[11px] rounded bg-muted px-1.5 py-0.5">
                {counts[t.value] ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading risks…</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No risks in this view yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map((r) => (
                <RiskCard
                  key={r.id}
                  risk={r}
                  onOpen={() => setSelectedId(r.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {createOpen && (
        <CreateRiskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            setCreateOpen(false);
            setSelectedId(id);
          }}
        />
      )}

      {selectedId !== null && (
        <RiskDetailDialog
          riskId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ---------- Risk card ----------

function RiskCard({ risk, onOpen }: { risk: Risk; onOpen: () => void }) {
  return (
    <Card
      className="hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onOpen}
      data-testid={`card-risk-${risk.id}`}
    >
      <CardContent className="py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium truncate" data-testid="risk-title">
              {risk.title}
            </p>
            <Badge variant="outline" className="text-xs">
              {risk.riskType}
            </Badge>
            {risk.createdProjectId && (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                Project P-{risk.createdProjectId}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {risk.owningDepartmentName ?? "—"} · Owner:{" "}
            {risk.riskOwnerName ?? "Unassigned"}
          </p>
        </div>
        {risk.riskRating && (
          <Badge className={`${ratingBadgeClass(risk.riskRating)} text-xs`}>
            {risk.riskRating.toUpperCase()}
          </Badge>
        )}
        <Badge variant="outline" className={statusBadgeClass(risk.status)}>
          {statusLabel(risk.status)}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ---------- Create dialog ----------

function CreateRiskDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const scope = useTeamScope();
  const { data: agents = [] } = useListAgents({});
  const createRisk = useCreateRisk();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [riskType, setRiskType] = useState(RISK_TYPES[1]);
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [ownerUserId, setOwnerUserId] = useState<string>("none");

  const teams = scope.accessible;

  async function handleSubmit() {
    if (!title.trim() || !departmentId) {
      toast.error("Title and owning team are required.");
      return;
    }
    try {
      const created = await createRisk.mutateAsync({
        data: {
          title: title.trim(),
          riskType,
          description: description.trim(),
          owningDepartmentId: Number(departmentId),
          riskOwnerUserId:
            ownerUserId === "none" ? null : Number(ownerUserId),
        },
      });
      qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
      toast.success("Risk created.");
      onCreated(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create risk.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-create-risk">
        <DialogHeader>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>
            Capture the risk now; analysis and treatment happen later in the
            lifecycle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="risk-title">Title</Label>
            <Input
              id="risk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g. Outdated TLS on customer portal"
              data-testid="input-risk-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Risk type</Label>
              <Select value={riskType} onValueChange={setRiskType}>
                <SelectTrigger data-testid="select-risk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owning team</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger data-testid="select-risk-department">
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Risk owner (optional)</Label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger data-testid="select-risk-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {agents.map((a: Agent) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="risk-desc">Description</Label>
            <Textarea
              id="risk-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the risk? Where does it apply?"
              data-testid="input-risk-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createRisk.isPending}
            data-testid="button-submit-create-risk"
          >
            Create Risk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail dialog ----------

function RiskDetailDialog({
  riskId,
  onClose,
}: {
  riskId: number;
  onClose: () => void;
}) {
  const { data: risk, isLoading } = useGetRisk(riskId);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl p-0 max-h-[90vh] flex flex-col"
        data-testid="dialog-risk-detail"
      >
        {isLoading || !risk ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <RiskDetailContent risk={risk} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RiskDetailContent({
  risk,
  onClose,
}: {
  risk: Risk;
  onClose: () => void;
}) {
  const { session } = useSession();
  const isAdmin = session?.role === "admin";
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  function refresh() {
    qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRiskQueryKey(risk.id) });
  }

  async function transition(
    newStatus: string,
    extra: Record<string, unknown> = {},
  ) {
    let transitionReason: string | undefined;
    if (newStatus === "closed") {
      const r = window.prompt("Reason for closing this risk:");
      if (r === null) return;
      if (!r.trim()) {
        toast.error("Closing reason is required.");
        return;
      }
      transitionReason = r.trim();
    }
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          status: newStatus as Risk["status"],
          ...(transitionReason !== undefined ? { transitionReason } : {}),
          ...extra,
        },
      });
      refresh();
      toast.success(`Risk moved to ${statusLabel(newStatus)}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update the risk.",
      );
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this risk and all its history? This cannot be undone.",
      )
    )
      return;
    try {
      await deleteRisk.mutateAsync({ id: risk.id });
      qc.invalidateQueries({ queryKey: getListRisksQueryKey() });
      toast.success("Risk deleted.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't delete the risk.",
      );
    }
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate">{risk.title}</DialogTitle>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {risk.riskType}
              </Badge>
              <Badge variant="outline" className={statusBadgeClass(risk.status)}>
                {statusLabel(risk.status)}
              </Badge>
              {risk.riskRating && (
                <Badge className={ratingBadgeClass(risk.riskRating)}>
                  Rating: {risk.riskRating.toUpperCase()}
                </Badge>
              )}
              {risk.createdProjectId && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Project P-{risk.createdProjectId}
                </Badge>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-destructive"
              data-testid="button-delete-risk"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </DialogHeader>

      <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="mx-6 mt-3 self-start">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">
            Analysis
          </TabsTrigger>
          <TabsTrigger value="treatment" data-testid="tab-treatment">
            Treatment
          </TabsTrigger>
          <TabsTrigger value="linked" data-testid="tab-linked">
            Linked Work
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            History
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <OverviewTab risk={risk} onTransition={transition} />
            </TabsContent>
            <TabsContent value="analysis" className="mt-0 space-y-4">
              <AnalysisTab risk={risk} onTransition={transition} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="treatment" className="mt-0 space-y-4">
              <TreatmentTab risk={risk} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="linked" className="mt-0 space-y-4">
              <LinkedWorkTab risk={risk} onNavigate={(p) => navigate(p)} />
            </TabsContent>
            <TabsContent value="history" className="mt-0 space-y-4">
              <HistoryTab events={risk.auditEvents} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </>
  );
}

// ---------- Tabs ----------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function OverviewTab({
  risk,
  onTransition,
}: {
  risk: Risk;
  onTransition: (s: string, extra?: Record<string, unknown>) => void;
}) {
  const canStartAnalysis = risk.status === "identified";
  const canClose =
    risk.status !== "closed" && risk.status !== "under_treatment";

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Risk Type">{risk.riskType}</Field>
        <Field label="Status">{statusLabel(risk.status)}</Field>
        <Field label="Owning Team">{risk.owningDepartmentName ?? "—"}</Field>
        <Field label="Risk Owner">{risk.riskOwnerName ?? "Unassigned"}</Field>
        <Field label="Reporter">{risk.reporterName ?? "—"}</Field>
        <Field label="Created">
          {new Date(risk.createdAt).toLocaleString()}
        </Field>
      </div>
      <Field label="Description">
        <p className="whitespace-pre-wrap">{risk.description || "—"}</p>
      </Field>
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {canStartAnalysis && (
          <Button
            size="sm"
            onClick={() => onTransition("under_analysis")}
            data-testid="button-start-analysis"
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            Start Analysis
          </Button>
        )}
        {canClose && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTransition("closed")}
            data-testid="button-close-risk"
          >
            Close Risk
          </Button>
        )}
      </div>
    </>
  );
}

function AnalysisTab({
  risk,
  onTransition,
  onSaved,
}: {
  risk: Risk;
  onTransition: (s: string, extra?: Record<string, unknown>) => void;
  onSaved: () => void;
}) {
  const updateRisk = useUpdateRisk();
  const [likelihood, setLikelihood] = useState(risk.likelihood || "");
  const [impact, setImpact] = useState(risk.impact || "");
  const [impactScope, setImpactScope] = useState(risk.impactScope || "");
  const [businessImpact, setBusinessImpact] = useState(
    risk.businessImpact || "",
  );
  const [analysisNotes, setAnalysisNotes] = useState(risk.analysisNotes || "");

  // Visible Under Analysis and beyond.
  const editable =
    risk.status === "under_analysis" || risk.status === "identified";
  const canMoveToTreatment =
    risk.status === "under_analysis" &&
    !!likelihood &&
    !!impact &&
    !!impactScope.trim() &&
    !!businessImpact.trim();

  // Cheap client-side rating preview mirroring the server formula.
  const previewRating = useMemo(() => {
    const lvl: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    const a = lvl[likelihood] ?? 0;
    const b = lvl[impact] ?? 0;
    if (!a || !b) return "";
    const score = a * b;
    if (score >= 12) return "critical";
    if (score >= 8) return "high";
    if (score >= 4) return "medium";
    return "low";
  }, [likelihood, impact]);

  async function save() {
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          likelihood,
          impact,
          impactScope,
          businessImpact,
          analysisNotes,
        },
      });
      onSaved();
      toast.success("Analysis saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save analysis.",
      );
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Likelihood</Label>
          <Select
            value={likelihood}
            onValueChange={setLikelihood}
            disabled={!editable}
          >
            <SelectTrigger data-testid="select-likelihood">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Impact</Label>
          <Select
            value={impact}
            onValueChange={setImpact}
            disabled={!editable}
          >
            <SelectTrigger data-testid="select-impact">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {previewRating && (
        <Badge className={ratingBadgeClass(previewRating)}>
          Computed Rating: {previewRating.toUpperCase()}
        </Badge>
      )}
      <div className="space-y-1.5">
        <Label>Impact Scope</Label>
        <Input
          value={impactScope}
          onChange={(e) => setImpactScope(e.target.value)}
          placeholder="What systems / users / processes are affected?"
          disabled={!editable}
          data-testid="input-impact-scope"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Business Impact</Label>
        <Textarea
          rows={3}
          value={businessImpact}
          onChange={(e) => setBusinessImpact(e.target.value)}
          placeholder="What happens to the business if this risk materializes?"
          disabled={!editable}
          data-testid="input-business-impact"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Analysis Notes</Label>
        <Textarea
          rows={4}
          value={analysisNotes}
          onChange={(e) => setAnalysisNotes(e.target.value)}
          placeholder="Add references, root cause, dependencies, etc."
          disabled={!editable}
          data-testid="input-analysis-notes"
        />
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={save}
            disabled={updateRisk.isPending}
            data-testid="button-save-analysis"
          >
            Save Analysis
          </Button>
          {canMoveToTreatment && (
            <Button
              size="sm"
              onClick={async () => {
                await updateRisk.mutateAsync({
                  id: risk.id,
                  data: {
                    likelihood,
                    impact,
                    impactScope,
                    businessImpact,
                    analysisNotes,
                  },
                });
                onTransition("under_treatment");
              }}
              data-testid="button-move-to-treatment"
            >
              <ArrowRight className="h-4 w-4 mr-1.5" />
              Move to Treatment
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function TreatmentTab({ risk, onSaved }: { risk: Risk; onSaved: () => void }) {
  const updateRisk = useUpdateRisk();
  const [decision, setDecision] = useState(risk.treatmentDecision || "");
  const [acceptanceJustification, setAcceptanceJustification] = useState(
    risk.acceptanceJustification || "",
  );
  const [transferMethod, setTransferMethod] = useState(
    risk.transferMethod || "",
  );
  const [transferResponsibleParty, setTransferResponsibleParty] = useState(
    risk.transferResponsibleParty || "",
  );
  const [avoidanceActionNotes, setAvoidanceActionNotes] = useState(
    risk.avoidanceActionNotes || "",
  );

  // Decision is editable only while still Under Treatment.
  const editable = risk.status === "under_treatment";
  const visible =
    risk.status === "under_treatment" ||
    risk.status === "mitigation" ||
    risk.status === "accepted" ||
    risk.status === "transferred" ||
    risk.status === "avoided";

  if (!visible) {
    return (
      <p className="text-sm text-muted-foreground">
        Treatment is available once the risk reaches Under Treatment. Complete
        the Analysis tab to move it forward.
      </p>
    );
  }

  async function saveDecision() {
    try {
      await updateRisk.mutateAsync({
        id: risk.id,
        data: {
          treatmentDecision: decision || undefined,
          acceptanceJustification,
          transferMethod,
          transferResponsibleParty,
          avoidanceActionNotes,
        },
      });
      onSaved();
      toast.success("Treatment proposal saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save treatment.",
      );
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label>Treatment Decision</Label>
        <Select
          value={decision}
          onValueChange={setDecision}
          disabled={!editable}
        >
          <SelectTrigger data-testid="select-treatment-decision">
            <SelectValue placeholder="Pick a decision…" />
          </SelectTrigger>
          <SelectContent>
            {TREATMENT_DECISIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {decision === "mitigation" && (
        <p className="text-sm text-muted-foreground">
          On approval, a Project will be auto-created for the mitigation work
          (named “Risk Mitigation: {risk.title}”), inheriting team and owner.
        </p>
      )}
      {decision === "acceptance" && (
        <div className="space-y-1.5">
          <Label>Acceptance Justification</Label>
          <Textarea
            rows={3}
            value={acceptanceJustification}
            onChange={(e) => setAcceptanceJustification(e.target.value)}
            placeholder="Why are we accepting this risk?"
            disabled={!editable}
            data-testid="input-acceptance-justification"
          />
        </div>
      )}
      {decision === "transfer" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Transfer Method</Label>
            <Input
              value={transferMethod}
              onChange={(e) => setTransferMethod(e.target.value)}
              placeholder="E.g. Cyber-insurance policy, vendor contract"
              disabled={!editable}
              data-testid="input-transfer-method"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsible Party</Label>
            <Input
              value={transferResponsibleParty}
              onChange={(e) => setTransferResponsibleParty(e.target.value)}
              placeholder="Name of party assuming the risk"
              disabled={!editable}
              data-testid="input-transfer-party"
            />
          </div>
        </div>
      )}
      {decision === "avoidance" && (
        <div className="space-y-1.5">
          <Label>Avoidance Action Notes</Label>
          <Textarea
            rows={3}
            value={avoidanceActionNotes}
            onChange={(e) => setAvoidanceActionNotes(e.target.value)}
            placeholder="What activity is being stopped or replaced?"
            disabled={!editable}
            data-testid="input-avoidance-notes"
          />
        </div>
      )}

      {editable && (
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={saveDecision}
            disabled={updateRisk.isPending || !decision}
            data-testid="button-save-treatment"
          >
            Save Treatment Proposal
          </Button>
        </div>
      )}

      <div className="pt-4 border-t space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Approval
        </p>
        <RiskWorkflowApproval row={risk} />
      </div>
    </>
  );
}

function LinkedWorkTab({
  risk,
  onNavigate,
}: {
  risk: Risk;
  onNavigate: (path: string) => void;
}) {
  if (risk.createdProjectId == null) {
    return (
      <p className="text-sm text-muted-foreground">
        No linked Project yet. Approving a Mitigation treatment will
        automatically create one.
      </p>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            P-{risk.createdProjectId}
          </Badge>
          Linked Mitigation Project
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onNavigate(`/projects?selected=${risk.createdProjectId}`)
          }
          data-testid="button-view-project"
        >
          <ExternalLink className="h-4 w-4 mr-1.5" />
          View Project
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryTab({ events }: { events: RiskAuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex gap-3 text-sm border rounded-md p-3"
          data-testid={`history-event-${e.id}`}
        >
          <HistoryIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {e.oldStatus === e.newStatus
                ? statusLabel(e.newStatus)
                : `${statusLabel(e.oldStatus)} → ${statusLabel(e.newStatus)}`}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                · {e.action}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {e.changedByName ?? "—"} · {new Date(e.changedAt).toLocaleString()}
            </p>
            {e.reason && (
              <p className="text-xs mt-1 text-muted-foreground italic">
                “{e.reason}”
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
