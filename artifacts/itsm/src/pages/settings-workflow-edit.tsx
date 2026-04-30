import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  useGetWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  useListAgents,
  getListWorkflowsQueryKey,
  getGetWorkflowQueryKey,
  type CreateWorkflowInput,
  type CreateWorkflowInputWorkflowType,
  type CreateWorkflowInputModule,
  type CreateWorkflowInputApprovalRequiredFromKind,
  type CreateWorkflowInputApprovalType,
  type CreateWorkflowInputStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import {
  MODULE_LABELS,
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
  TRIGGERS_BY_MODULE,
  CONDITION_FIELDS_BY_MODULE,
  CONDITION_OPS,
  ACTIONS_BY_MODULE,
  APPROVER_KIND_OPTIONS,
  type ModuleKey,
} from "@/lib/workflow-options";

type Condition = { field: string; op: string; value: unknown };
type Action = { kind: string; config: Record<string, unknown> };
type Notifications = {
  requester?: boolean;
  owner?: boolean;
  approvers?: boolean;
  departmentHead?: boolean;
  admins?: boolean;
};

export default function SettingsWorkflowEdit() {
  const { session } = useSession();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [matchEdit, paramsEdit] = useRoute("/settings/workflows/:id");
  const editingId =
    matchEdit && paramsEdit?.id !== "new" ? Number(paramsEdit.id) : null;

  // useGetWorkflow has a built-in `enabled: !!id` guard, so passing 0
  // when there's no editing target keeps the query disabled.
  const { data: existing, isLoading } = useGetWorkflow(editingId ?? 0);
  const { data: agents } = useListAgents();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  // ---- Form state ----
  const [name, setName] = useState("");
  const [moduleKey, setModuleKey] = useState<ModuleKey>("initiatives");
  const [workflowType, setWorkflowType] = useState<string>("approval");
  const [trigger, setTrigger] = useState<string>("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [approvalRequiredFromKind, setApprovalRequiredFromKind] =
    useState<string>("");
  const [approverUserIds, setApproverUserIds] = useState<number[]>([]);
  const [approverRoles, setApproverRoles] = useState<string[]>([]);
  const [approvalType, setApprovalType] = useState<"single" | "all" | "any">(
    "single",
  );
  const [requireDecisionRationale, setRequireDecisionRationale] =
    useState(false);
  const [notifications, setNotifications] = useState<Notifications>({
    requester: true,
    owner: true,
    approvers: true,
    departmentHead: false,
    admins: false,
  });
  const [status, setStatus] = useState<"draft" | "active" | "inactive">(
    "draft",
  );

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setModuleKey(existing.module as ModuleKey);
    setWorkflowType(existing.workflowType);
    setTrigger(existing.trigger);
    setConditions((existing.conditions as Condition[]) ?? []);
    setActions((existing.actions as Action[]) ?? []);
    setApprovalRequiredFromKind(existing.approvalRequiredFromKind ?? "");
    const targets = (existing.approvalRequiredFromTargets as Array<
      Record<string, unknown>
    >) ?? [];
    setApproverUserIds(
      targets
        .map((t) => Number(t.userId))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    setApproverRoles(
      targets
        .map((t) => String(t.role ?? ""))
        .filter((r) => r === "admin" || r === "agent" || r === "end_user"),
    );
    setApprovalType((existing.approvalType as "single" | "all" | "any") ?? "single");
    setRequireDecisionRationale(!!existing.requireDecisionRationale);
    setNotifications(existing.notifications as Notifications);
    setStatus(existing.status as "draft" | "active" | "inactive");
  }, [existing]);

  // Reset trigger when module changes if current trigger doesn't fit.
  useEffect(() => {
    const triggers = TRIGGERS_BY_MODULE[moduleKey];
    if (!triggers.find((t) => t.value === trigger)) {
      setTrigger(triggers[0]?.value ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  const triggers = TRIGGERS_BY_MODULE[moduleKey];
  const conditionFields = CONDITION_FIELDS_BY_MODULE[moduleKey];
  const moduleActions = ACTIONS_BY_MODULE[moduleKey];

  const isApproval = workflowType === "approval";

  const buildTargets = useMemo(() => {
    if (approvalRequiredFromKind === "specific_users") {
      return approverUserIds.map((userId) => ({ userId }));
    }
    if (approvalRequiredFromKind === "roles") {
      return approverRoles.map((role) => ({ role }));
    }
    return [];
  }, [approvalRequiredFromKind, approverUserIds, approverRoles]);

  if (session && session.role !== "admin") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Workflow editor</h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can manage workflows.
        </p>
      </div>
    );
  }

  function addCondition() {
    const first = conditionFields[0];
    setConditions((prev) => [
      ...prev,
      { field: first?.value ?? "", op: "eq", value: "" },
    ]);
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }
  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addAction() {
    const first = moduleActions[0];
    setActions((prev) => [
      ...prev,
      { kind: first?.value ?? "send_notification", config: {} },
    ]);
  }
  function updateAction(i: number, patch: Partial<Action>) {
    setActions((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );
  }
  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave(nextStatus?: "draft" | "active" | "inactive") {
    const finalStatus = nextStatus ?? status;
    const cleanName = name.trim();
    if (!cleanName) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!trigger) {
      toast({ title: "Pick a trigger", variant: "destructive" });
      return;
    }
    if (
      isApproval &&
      finalStatus === "active" &&
      !approvalRequiredFromKind
    ) {
      toast({
        title: "Pick approvers",
        description: "Approval workflows need at least one approver source before activation.",
        variant: "destructive",
      });
      return;
    }
    const payload: CreateWorkflowInput = {
      name: cleanName,
      module: moduleKey as CreateWorkflowInputModule,
      workflowType: workflowType as CreateWorkflowInputWorkflowType,
      trigger,
      conditions: conditions as CreateWorkflowInput["conditions"],
      actions: actions as CreateWorkflowInput["actions"],
      approvalRequiredFromKind:
        approvalRequiredFromKind as CreateWorkflowInputApprovalRequiredFromKind,
      approvalRequiredFromTargets: buildTargets,
      approvalType: approvalType as CreateWorkflowInputApprovalType,
      requireDecisionRationale,
      notifications,
      status: finalStatus as CreateWorkflowInputStatus,
    };
    try {
      if (editingId != null) {
        await updateWorkflow.mutateAsync({ id: editingId, data: payload });
        await queryClient.invalidateQueries({
          queryKey: getGetWorkflowQueryKey(editingId),
        });
      } else {
        const created = await createWorkflow.mutateAsync({ data: payload });
        navigate(`/settings/workflows/${created.id}`);
      }
      await queryClient.invalidateQueries({
        queryKey: getListWorkflowsQueryKey(),
      });
      setStatus(finalStatus);
      toast({
        title: editingId ? "Workflow saved" : "Workflow created",
        description: cleanName,
      });
    } catch (err) {
      toast({
        title: "Couldn't save workflow",
        description:
          err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  }

  if (editingId != null && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Settings
        </Link>
        <span>/</span>
        <Link href="/settings/workflows" className="hover:text-foreground">
          Workflows
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
          {editingId ? name || "Edit workflow" : "New workflow"}
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {editingId ? "Edit workflow" : "New workflow"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure WHEN the workflow runs, IF the conditions match, and
            THEN what should happen — including who has to approve.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === "active" ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Active
            </Badge>
          ) : status === "inactive" ? (
            <Badge variant="outline">Inactive</Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-amber-700 border-amber-300"
            >
              Draft
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
          <CardDescription>
            Name your workflow and pick the module it belongs to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Initiative Approval"
                data-testid="input-workflow-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Module</Label>
              <Select
                value={moduleKey}
                onValueChange={(v) => setModuleKey(v as ModuleKey)}
              >
                <SelectTrigger data-testid="select-workflow-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {MODULE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={workflowType}
                onValueChange={(v) => setWorkflowType(v)}
              >
                <SelectTrigger data-testid="select-workflow-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {WORKFLOW_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as "draft" | "active" | "inactive")
                }
              >
                <SelectTrigger data-testid="select-workflow-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">When (trigger)</CardTitle>
          <CardDescription>
            What event in {MODULE_LABELS[moduleKey]} starts this workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger
              className="max-w-md"
              data-testid="select-workflow-trigger"
            >
              <SelectValue placeholder="Pick a trigger" />
            </SelectTrigger>
            <SelectContent>
              {triggers.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">If (conditions)</CardTitle>
            <CardDescription>
              Optional filters. The workflow only runs when ALL listed
              conditions match.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addCondition}
            data-testid="button-add-condition"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add condition
          </Button>
        </CardHeader>
        <CardContent>
          {conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No conditions — the workflow runs on every trigger.
            </p>
          ) : (
            <div className="space-y-2">
              {conditions.map((c, i) => {
                const fieldDef =
                  conditionFields.find((f) => f.value === c.field) ??
                  conditionFields[0];
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2"
                    data-testid={`row-condition-${i}`}
                  >
                    <Select
                      value={c.field}
                      onValueChange={(v) => updateCondition(i, { field: v })}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionFields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.op}
                      onValueChange={(v) => updateCondition(i, { op: v })}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_OPS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {c.op === "is_empty" || c.op === "is_not_empty" ? (
                      <span className="text-xs text-muted-foreground">
                        — no value
                      </span>
                    ) : fieldDef?.kind === "select" && fieldDef.choices ? (
                      <Select
                        value={String(c.value ?? "")}
                        onValueChange={(v) => updateCondition(i, { value: v })}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Pick value" />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldDef.choices.map((ch) => (
                            <SelectItem key={ch.value} value={ch.value}>
                              {ch.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="w-[200px]"
                        placeholder="Value"
                        value={String(c.value ?? "")}
                        onChange={(e) =>
                          updateCondition(i, {
                            value:
                              fieldDef?.kind === "number"
                                ? Number(e.target.value) || 0
                                : e.target.value,
                          })
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeCondition(i)}
                      data-testid={`button-remove-condition-${i}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Then (actions)</CardTitle>
            <CardDescription>
              The actions to run when the workflow fires. They run in the
              order listed.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addAction}
            data-testid="button-add-action"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add action
          </Button>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions yet. Add one to describe what should happen.
            </p>
          ) : (
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  data-testid={`row-action-${i}`}
                >
                  <Select
                    value={a.kind}
                    onValueChange={(v) =>
                      updateAction(i, { kind: v, config: {} })
                    }
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moduleActions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder="Optional configuration note"
                    value={String(a.config?.note ?? "")}
                    onChange={(e) =>
                      updateAction(i, {
                        config: { ...a.config, note: e.target.value },
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeAction(i)}
                    data-testid={`button-remove-action-${i}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isApproval && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approvals</CardTitle>
            <CardDescription>
              Who has to approve, how the quorum works, and whether reviewers
              must justify each decision.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Approver source</Label>
                <Select
                  value={approvalRequiredFromKind}
                  onValueChange={setApprovalRequiredFromKind}
                >
                  <SelectTrigger data-testid="select-approver-kind">
                    <SelectValue placeholder="Pick approver source" />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVER_KIND_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Approval type</Label>
                <Select
                  value={approvalType}
                  onValueChange={(v) =>
                    setApprovalType(v as "single" | "all" | "any")
                  }
                >
                  <SelectTrigger data-testid="select-approval-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">
                      Single approver — first decision wins
                    </SelectItem>
                    <SelectItem value="any">
                      Any approver — first approve resolves
                    </SelectItem>
                    <SelectItem value="all">
                      All approvers — every approver must respond
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {approvalRequiredFromKind === "specific_users" && (
              <div className="space-y-2">
                <Label>Specific approvers</Label>
                <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
                  {(agents ?? []).map((u) => {
                    const checked = approverUserIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (v) {
                              setApproverUserIds((prev) => [...prev, u.id]);
                            } else {
                              setApproverUserIds((prev) =>
                                prev.filter((id) => id !== u.id),
                              );
                            }
                          }}
                          data-testid={`checkbox-approver-${u.id}`}
                        />
                        <span>{u.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({u.role})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {approvalRequiredFromKind === "roles" && (
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-3">
                  {["admin", "agent"].map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={approverRoles.includes(r)}
                        onCheckedChange={(v) => {
                          if (v) {
                            setApproverRoles((prev) => [...prev, r]);
                          } else {
                            setApproverRoles((prev) =>
                              prev.filter((x) => x !== r),
                            );
                          }
                        }}
                      />
                      <span className="capitalize">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="require-rationale"
                checked={requireDecisionRationale}
                onCheckedChange={setRequireDecisionRationale}
                data-testid="switch-require-rationale"
              />
              <Label htmlFor="require-rationale" className="cursor-pointer">
                Require decision rationale
              </Label>
              <p className="text-xs text-muted-foreground">
                Approvers must type a reason when they approve, reject, or
                defer.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>
            Who gets pinged when the workflow fires.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["requester", "Requester / submitter"],
              ["owner", "Owner / assignee"],
              ["approvers", "Approvers"],
              ["departmentHead", "Department head"],
              ["admins", "All admins"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={notifications[key] ?? false}
                onCheckedChange={(v) =>
                  setNotifications((prev) => ({ ...prev, [key]: !!v }))
                }
                data-testid={`checkbox-notify-${key}`}
              />
              {label}
            </label>
          ))}
        </CardContent>
      </Card>

      {existing && (existing.auditEvents?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit trail</CardTitle>
            <CardDescription>
              Every change to this workflow definition.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {existing.auditEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <Badge variant="outline" className="capitalize shrink-0">
                    {e.action.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground">
                      {e.changedByName ?? "Unknown"} ·{" "}
                      {new Date(e.changedAt).toLocaleString()}
                    </p>
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <pre className="text-xs text-muted-foreground/80 mt-0.5 whitespace-pre-wrap">
                        {JSON.stringify(e.detail, null, 0)}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={() => handleSave()}
          data-testid="button-save-workflow"
        >
          {editingId ? "Save changes" : "Create workflow"}
        </Button>
        {status !== "active" ? (
          <Button
            variant="outline"
            onClick={() => handleSave("active")}
            data-testid="button-activate-workflow"
          >
            Save & activate
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => handleSave("inactive")}
            data-testid="button-deactivate-workflow"
          >
            Save & deactivate
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/settings/workflows">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
