import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListInitiatives,
  useCreateInitiative,
  useUpdateInitiative,
  useGetSession,
  useListDepartments,
  getListInitiativesQueryKey,
  type Initiative,
  type InitiativeStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Lightbulb,
  Plus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// The four states, in display order. Approved + rejected_deferred are
// terminal — once an initiative lands there, the detail dialog locks
// down everything except the read-only banner.
const COLUMNS: Array<{
  status: InitiativeStatus;
  label: string;
  helper: string;
  accent: string;
}> = [
  {
    status: "backlog",
    label: "Backlog",
    helper: "Fresh ideas — no analysis yet",
    accent: "border-slate-300 bg-slate-50/60",
  },
  {
    status: "under_review",
    label: "Under Review",
    helper: "Light research — pros/cons, cost, risk",
    accent: "border-amber-300 bg-amber-50/50",
  },
  {
    status: "approved",
    label: "Approved",
    helper: "Approved → became a Project",
    accent: "border-emerald-300 bg-emerald-50/50",
  },
  {
    status: "rejected_deferred",
    label: "Rejected / Deferred",
    helper: "Decision recorded — no work proceeds",
    accent: "border-zinc-300 bg-zinc-50/60",
  },
];

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1mo ago";
  return `${months}mo ago`;
}

export default function InitiativesPage() {
  const { data: session } = useGetSession();
  const canEdit = session?.role === "admin" || session?.role === "agent";

  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: initiatives, isLoading } = useListInitiatives();
  const open = useMemo(
    () => initiatives?.find((i) => i.id === openId) ?? null,
    [initiatives, openId],
  );

  const grouped = useMemo(() => {
    const map = new Map<InitiativeStatus, Initiative[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const row of initiatives ?? []) {
      const list = map.get(row.status as InitiativeStatus);
      if (list) list.push(row);
    }
    return map;
  }, [initiatives]);

  return (
    <div
      className="p-8 max-w-[1600px] mx-auto"
      data-testid="initiatives-page"
    >
      <header className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-amber-100 p-2 text-amber-700">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[26px] font-display font-semibold tracking-tight">
              Initiatives
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
              Decide whether work should be done — no planning, no
              execution. Approved initiatives automatically become
              Projects in the Improvements section.
            </p>
          </div>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-initiative"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New initiative
          </Button>
        )}
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading initiatives…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.status) ?? [];
            return (
              <section
                key={col.status}
                className={cn(
                  "rounded-lg border bg-card/40 px-3 pt-3 pb-2",
                  col.accent,
                )}
                data-testid={`initiatives-column-${col.status}`}
              >
                <header className="flex items-baseline justify-between mb-1.5 px-1">
                  <h2 className="text-[12.5px] font-semibold tracking-wide uppercase text-foreground/80">
                    {col.label}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </header>
                <p className="text-[11px] text-muted-foreground/80 mb-2 px-1">
                  {col.helper}
                </p>
                <div className="space-y-2 min-h-[40px]">
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/70 italic px-1 py-3">
                      Nothing here yet.
                    </p>
                  ) : (
                    items.map((row) => (
                      <InitiativeCard
                        key={row.id}
                        row={row}
                        onClick={() => setOpenId(row.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
          }}
        />
      )}
      {open && (
        <DetailDialog
          row={open}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function InitiativeCard({
  row,
  onClick,
}: {
  row: Initiative;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border bg-background p-2.5 hover:shadow-sm hover:border-foreground/20 transition-all"
      data-testid={`initiative-card-${row.id}`}
    >
      <p className="text-[13px] font-medium leading-snug line-clamp-2">
        {row.title}
      </p>
      {row.description && (
        <p className="mt-1 text-[11.5px] text-muted-foreground line-clamp-2">
          {row.description}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {row.reporterName && (
            <Avatar className="h-5 w-5 ring-1 ring-border">
              <AvatarFallback className="text-[9px] bg-muted">
                {initials(row.reporterName)}
              </AvatarFallback>
            </Avatar>
          )}
          {row.assigneeName && row.assigneeName !== row.reporterName && (
            <Avatar className="h-5 w-5 ring-1 ring-border -ml-2">
              <AvatarFallback className="text-[9px] bg-muted">
                {initials(row.assigneeName)}
              </AvatarFallback>
            </Avatar>
          )}
          {row.departmentName && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal"
            >
              {row.departmentName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground tabular-nums shrink-0">
          <Clock className="h-3 w-3" />
          {ageLabel(row.createdAt)}
        </div>
      </div>
      {row.status === "approved" && row.createdProjectId && (
        <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center gap-1 text-[10.5px] text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          <span>Project P-{row.createdProjectId}</span>
        </div>
      )}
      {row.status === "rejected_deferred" && (
        <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center gap-1 text-[10.5px] text-zinc-600">
          <XCircle className="h-3 w-3" />
          <span>Decision recorded</span>
        </div>
      )}
    </button>
  );
}

// ---- Create dialog ----

function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const create = useCreateInitiative({
    mutation: {
      onSuccess: (created) => {
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
        toast({ title: "Initiative created" });
        onCreated(created.id);
      },
      onError: (e) => {
        toast({
          title: "Couldn't create initiative",
          description: String(e),
          variant: "destructive",
        });
      },
    },
  });

  const submit = () => {
    if (!title.trim()) return;
    create.mutate({
      data: {
        title: title.trim(),
        description: description.trim(),
        departmentId:
          departmentId === "none" ? null : Number(departmentId),
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New initiative</DialogTitle>
          <DialogDescription>
            Capture the idea. You can fill in pros/cons, cost, and risk
            during review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="init-title">Title</Label>
            <Input
              id="init-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Standardize new-hire laptop image"
              data-testid="input-initiative-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="init-desc">Description</Label>
            <Textarea
              id="init-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What's the idea? Why does it matter?"
              data-testid="input-initiative-description"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger data-testid="select-initiative-department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Cross-functional —</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!title.trim() || create.isPending}
            data-testid="button-create-initiative-submit"
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Detail / edit / decide dialog ----

function DetailDialog({
  row,
  canEdit,
  onClose,
}: {
  row: Initiative;
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isTerminal =
    row.status === "approved" || row.status === "rejected_deferred";
  const editable = canEdit && !isTerminal;

  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description);
  const [prosCons, setProsCons] = useState(row.prosCons);
  const [roughCost, setRoughCost] = useState(row.roughCost);
  const [expectedBenefit, setExpectedBenefit] = useState(row.expectedBenefit);
  const [riskNotes, setRiskNotes] = useState(row.riskNotes);
  const [decisionReason, setDecisionReason] = useState(row.decisionReason);

  const update = useUpdateInitiative({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
      },
      onError: (e) => {
        toast({
          title: "Update failed",
          description: String(e),
          variant: "destructive",
        });
      },
    },
  });

  const saveAnalysis = () => {
    update.mutate(
      {
        id: row.id,
        data: {
          title,
          description,
          prosCons,
          roughCost,
          expectedBenefit,
          riskNotes,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Saved" });
        },
      },
    );
  };

  const moveToReview = () => {
    update.mutate(
      { id: row.id, data: { status: "under_review" } },
      {
        onSuccess: () => toast({ title: "Moved to Under Review" }),
      },
    );
  };

  const approve = () => {
    update.mutate(
      {
        id: row.id,
        data: {
          status: "approved",
          decisionReason,
          // Persist any edits the user made before clicking Approve.
          title,
          description,
          prosCons,
          roughCost,
          expectedBenefit,
          riskNotes,
        },
      },
      {
        onSuccess: (updated) => {
          toast({
            title: "Approved",
            description: updated.createdProjectId
              ? `Created Project P-${updated.createdProjectId}.`
              : "Initiative approved.",
          });
          onClose();
        },
      },
    );
  };

  const reject = () => {
    if (!decisionReason.trim()) {
      toast({
        title: "Decision reason required",
        description: "Tell future readers why this was rejected or deferred.",
        variant: "destructive",
      });
      return;
    }
    update.mutate(
      {
        id: row.id,
        data: { status: "rejected_deferred", decisionReason },
      },
      {
        onSuccess: () => {
          toast({ title: "Marked Rejected / Deferred" });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="initiative-detail-dialog"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <StatusPill status={row.status as InitiativeStatus} />
            {row.departmentName && (
              <Badge variant="outline" className="text-[10.5px]">
                {row.departmentName}
              </Badge>
            )}
          </div>
          <DialogTitle className="mt-1">
            {editable ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold border-none px-0 focus-visible:ring-0"
              />
            ) : (
              row.title
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-[12px]">
            {row.reporterName && (
              <span className="flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                Reported by {row.reporterName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Created {ageLabel(row.createdAt)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {row.status === "approved" && (
          <div
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 flex items-start gap-2"
            data-testid="banner-approved"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-emerald-900">
                {row.createdProjectId
                  ? "Approved — became a Project"
                  : "Approved"}
              </p>
              <p className="text-[11.5px] text-emerald-800 mt-0.5">
                Decided{" "}
                {row.decidedAt
                  ? new Date(row.decidedAt).toLocaleString()
                  : ""}
                {row.decidedByName ? ` by ${row.decidedByName}` : ""}.
                {row.decisionReason && ` Notes: ${row.decisionReason}`}
              </p>
              {!row.createdProjectId && (
                <p className="text-[11px] text-amber-700 mt-1">
                  No linked project on record. (Possible data
                  inconsistency.)
                </p>
              )}
            </div>
            {row.createdProjectId && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-emerald-300"
              >
                <Link href={`/projects`}>
                  Project P-{row.createdProjectId}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        )}

        {row.status === "rejected_deferred" && (
          <div
            className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2"
            data-testid="banner-rejected"
          >
            <p className="text-[13px] font-medium text-zinc-800 flex items-center gap-1.5">
              <XCircle className="h-4 w-4" />
              Rejected / Deferred
            </p>
            <p className="text-[12px] text-zinc-700 mt-1 whitespace-pre-wrap">
              {row.decisionReason || "No reason recorded."}
            </p>
            <p className="text-[10.5px] text-zinc-500 mt-1">
              Decided{" "}
              {row.decidedAt
                ? new Date(row.decidedAt).toLocaleString()
                : ""}
              {row.decidedByName ? ` by ${row.decidedByName}` : ""}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Field
            label="Description"
            value={description}
            onChange={setDescription}
            editable={editable}
            rows={3}
            placeholder="What's the idea?"
          />
          <Field
            label="Pros / Cons"
            value={prosCons}
            onChange={setProsCons}
            editable={editable}
            rows={3}
            placeholder="Quick bullet list of upsides and downsides."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Rough cost"
              value={roughCost}
              onChange={setRoughCost}
              editable={editable}
              rows={2}
              placeholder="Ballpark $ / hours / vendor licenses"
            />
            <Field
              label="Expected benefit"
              value={expectedBenefit}
              onChange={setExpectedBenefit}
              editable={editable}
              rows={2}
              placeholder="What we'd gain if this works"
            />
          </div>
          <Field
            label="Risks"
            value={riskNotes}
            onChange={setRiskNotes}
            editable={editable}
            rows={2}
            placeholder="What could go wrong?"
          />
        </div>

        {editable && (
          <div className="space-y-3 rounded-md border border-dashed bg-muted/30 px-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="decision-reason">
                Decision notes{" "}
                <span className="text-muted-foreground font-normal">
                  (required for Reject / Defer)
                </span>
              </Label>
              <Textarea
                id="decision-reason"
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                rows={2}
                placeholder="Required to Reject / Defer; optional context for Approve."
                data-testid="input-decision-reason"
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={saveAnalysis}
                disabled={update.isPending}
                data-testid="button-save-analysis"
              >
                Save analysis
              </Button>
              {row.status === "backlog" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={moveToReview}
                  disabled={update.isPending}
                  data-testid="button-move-to-review"
                >
                  Move to Under Review
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                onClick={reject}
                disabled={update.isPending}
                data-testid="button-reject"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Reject / Defer
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={approve}
                disabled={update.isPending}
                data-testid="button-approve"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Approve & create Project
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  editable,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium">{label}</Label>
      {editable ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
        />
      ) : (
        <p className="text-[13px] text-foreground/80 whitespace-pre-wrap min-h-[1.5em] px-3 py-2 rounded-md bg-muted/40">
          {value || (
            <span className="text-muted-foreground italic">Not filled in</span>
          )}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: InitiativeStatus }) {
  const map: Record<InitiativeStatus, string> = {
    backlog: "bg-slate-100 text-slate-700 border-slate-200",
    under_review: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rejected_deferred: "bg-zinc-100 text-zinc-700 border-zinc-300",
  };
  const label: Record<InitiativeStatus, string> = {
    backlog: "Backlog",
    under_review: "Under Review",
    approved: "Approved",
    rejected_deferred: "Rejected / Deferred",
  };
  return (
    <Badge variant="outline" className={cn("text-[10.5px]", map[status])}>
      {label[status]}
    </Badge>
  );
}
