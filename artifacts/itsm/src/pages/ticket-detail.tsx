import {
  useGetTicket,
  useUpdateTicket,
  useAddTicketComment,
  useGetSession,
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { SlaCountdown } from "@/components/sla-countdown";

const STATUS_LABEL = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
} as const;

const PRIORITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const;

const RISK_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
} as const;

export default function TicketDetail() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = Number(params?.id);
  const [commentBody, setCommentBody] = useState("");

  const { data: ticket, isLoading } = useGetTicket(ticketId);
  const { data: session } = useGetSession();
  const canTriage = session?.role === "admin" || session?.role === "agent";

  const updateTicket = useUpdateTicket();
  const addComment = useAddTicketComment();

  // Local editable state for fields that save on blur. Reset whenever the
  // ticket payload changes (e.g. after another agent edits the same ticket).
  const [rootCauseDraft, setRootCauseDraft] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");

  useEffect(() => {
    if (!ticket) return;
    setRootCauseDraft(ticket.rootCause ?? "");
    setResolutionDraft(ticket.resolution ?? "");
    setCategoryDraft(ticket.category ?? "");
  }, [ticket?.id, ticket?.rootCause, ticket?.resolution, ticket?.category]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!ticket) return <div>Ticket not found</div>;

  function commitField(
    field: "rootCause" | "resolution" | "category",
    value: string,
  ) {
    if (!ticket) return;
    const trimmed = value.trim();
    const current = (ticket[field] as string | null | undefined) ?? "";
    if (trimmed === current) return;
    updateTicket.mutate({
      id: ticketId,
      data: { [field]: trimmed.length === 0 ? null : trimmed } as never,
    });
  }

  return (
    <div className="h-full flex gap-6">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-lg border shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{ticket.departmentName}</span>
            <span>/</span>
            <span>{ticket.ticketKey}</span>
            {ticket.category && (
              <>
                <span>/</span>
                <span>{ticket.category}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h1 className="text-2xl font-semibold m-0">{ticket.title}</h1>
            <RiskLevelBadge level={ticket.riskLevel} />
          </div>
          <div className="prose dark:prose-invert max-w-none text-sm text-muted-foreground">
            {ticket.description}
          </div>
        </div>

        {/* Root Cause + Resolution panel — visible to everyone, editable by triage */}
        <div className="border-b grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
          <div className="bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Root cause
            </div>
            {canTriage ? (
              <Textarea
                value={rootCauseDraft}
                onChange={(e) => setRootCauseDraft(e.target.value)}
                onBlur={() => commitField("rootCause", rootCauseDraft)}
                placeholder="What caused this issue? (Saves when you click away.)"
                className="min-h-[90px] bg-background"
                data-testid="textarea-ticket-root-cause"
              />
            ) : (
              <div
                className="min-h-[60px] text-sm text-foreground whitespace-pre-wrap"
                data-testid="text-ticket-root-cause"
              >
                {ticket.rootCause || (
                  <span className="text-muted-foreground/70">
                    No root cause recorded yet.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Resolution
            </div>
            {canTriage ? (
              <Textarea
                value={resolutionDraft}
                onChange={(e) => setResolutionDraft(e.target.value)}
                onBlur={() => commitField("resolution", resolutionDraft)}
                placeholder="How was it resolved? (Saves when you click away.)"
                className="min-h-[90px] bg-background"
                data-testid="textarea-ticket-resolution"
              />
            ) : (
              <div
                className="min-h-[60px] text-sm text-foreground whitespace-pre-wrap"
                data-testid="text-ticket-resolution"
              >
                {ticket.resolution || (
                  <span className="text-muted-foreground/70">
                    No resolution recorded yet.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <h3 className="font-medium text-sm">Activity</h3>
          <div className="space-y-4">
            {ticket.comments?.map((comment) => (
              <div key={comment.id} className="flex gap-4">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {comment.authorName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {comment.authorName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {comment.authorRole}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground/70">
                      {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <div className="text-sm bg-muted/60 p-3 rounded-md border text-foreground">
                    {comment.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-muted/40">
          <div className="space-y-3">
            <Textarea
              placeholder="Type your reply here..."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="min-h-[100px] bg-card"
              data-testid="input-ticket-reply"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (!commentBody.trim()) return;
                  addComment.mutate(
                    {
                      id: ticketId,
                      data: { body: commentBody },
                    },
                    {
                      onSuccess: () => setCommentBody(""),
                    },
                  );
                }}
                disabled={!commentBody.trim() || addComment.isPending}
              >
                Send Reply
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[320px] shrink-0 space-y-6">
        <div className="bg-card rounded-lg border shadow-sm p-5 space-y-5">
          <h3 className="font-medium text-sm pb-2 border-b">Details</h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              {canTriage ? (
                <Select
                  value={ticket.status}
                  onValueChange={(val: string) =>
                    updateTicket.mutate({
                      id: ticketId,
                      data: { status: val as never },
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8"
                    data-testid="select-ticket-status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className="h-8 px-3 flex items-center bg-muted/40 rounded border text-sm"
                  data-testid="text-ticket-status"
                >
                  {STATUS_LABEL[ticket.status as keyof typeof STATUS_LABEL] ??
                    ticket.status}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Priority
              </label>
              {canTriage ? (
                <Select
                  value={ticket.priority}
                  onValueChange={(val: string) =>
                    updateTicket.mutate({
                      id: ticketId,
                      data: { priority: val as never },
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8"
                    data-testid="select-ticket-priority"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className="h-8 px-3 flex items-center bg-muted/40 rounded border text-sm"
                  data-testid="text-ticket-priority"
                >
                  {PRIORITY_LABEL[
                    ticket.priority as keyof typeof PRIORITY_LABEL
                  ] ?? ticket.priority}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Risk level
              </label>
              {canTriage ? (
                <Select
                  value={ticket.riskLevel}
                  onValueChange={(val: string) =>
                    updateTicket.mutate({
                      id: ticketId,
                      data: { riskLevel: val as never },
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8"
                    data-testid="select-ticket-risk-level"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className="h-8 px-3 flex items-center bg-muted/40 rounded border text-sm"
                  data-testid="text-ticket-risk-level"
                >
                  {RISK_LABEL[ticket.riskLevel as keyof typeof RISK_LABEL] ??
                    ticket.riskLevel}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Category
              </label>
              {canTriage ? (
                <Input
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  onBlur={() => commitField("category", categoryDraft)}
                  placeholder="Uncategorized"
                  className="h-8"
                  data-testid="input-ticket-category"
                />
              ) : (
                <div
                  className="h-8 px-3 flex items-center bg-muted/40 rounded border text-sm"
                  data-testid="text-ticket-category"
                >
                  {ticket.category ?? (
                    <span className="text-muted-foreground/70">
                      Uncategorized
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                SLA
              </label>
              <div
                className="h-8 px-3 flex items-center bg-muted/40 rounded border text-sm"
                data-testid="text-ticket-sla"
              >
                <SlaCountdown
                  slaStatus={ticket.slaStatus}
                  resolutionDueAt={ticket.resolutionDueAt}
                  resolvedAt={ticket.resolvedAt}
                  size="md"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Assignee
              </label>
              <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border text-sm">
                {ticket.assigneeName ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">
                        {ticket.assigneeName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{ticket.assigneeName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Reporter
              </label>
              <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border text-sm">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[10px]">
                    {ticket.reporterName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{ticket.reporterName}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border shadow-sm p-5 space-y-4">
          <h3 className="font-medium text-sm pb-2 border-b">Dates</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {format(new Date(ticket.createdAt), "MMM d, h:mm a")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium">
                {format(new Date(ticket.updatedAt), "MMM d, h:mm a")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RiskLevelBadge({ level }: { level: string | null | undefined }) {
  const v = (level ?? "low").toLowerCase();
  const tone =
    v === "critical"
      ? "bg-red-100 text-red-800 border-red-200"
      : v === "high"
        ? "bg-orange-100 text-orange-800 border-orange-200"
        : v === "medium"
          ? "bg-yellow-100 text-yellow-800 border-yellow-200"
          : "bg-muted text-muted-foreground";
  const label =
    RISK_LABEL[v as keyof typeof RISK_LABEL] ?? v.charAt(0).toUpperCase() + v.slice(1);
  return (
    <Badge
      variant="secondary"
      className={`${tone} font-medium border`}
      data-testid={`badge-risk-${v}`}
    >
      {label} risk
    </Badge>
  );
}
