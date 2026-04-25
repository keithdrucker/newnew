import {
  useGetTicket,
  useUpdateTicket,
  useAddTicketComment,
  useGetSession,
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function TicketDetail() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = Number(params?.id);
  const [commentBody, setCommentBody] = useState("");

  const { data: ticket, isLoading } = useGetTicket(ticketId);
  const { data: session } = useGetSession();
  const canTriage = session?.role === "admin" || session?.role === "agent";

  const updateTicket = useUpdateTicket();
  const addComment = useAddTicketComment();

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-8 w-[300px]" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  if (!ticket) return <div>Ticket not found</div>;

  return (
    <div className="h-full flex gap-6">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-lg border shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{ticket.departmentName}</span>
            <span>/</span>
            <span>{ticket.ticketKey}</span>
          </div>
          <h1 className="text-2xl font-semibold mb-4">{ticket.title}</h1>
          <div className="prose dark:prose-invert max-w-none text-sm text-muted-foreground">
            {ticket.description}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <h3 className="font-medium text-sm">Activity</h3>
          <div className="space-y-4">
            {ticket.comments?.map((comment) => (
              <div key={comment.id} className="flex gap-4">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{comment.authorName.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{comment.authorName}</span>
                      <span className="text-xs text-muted-foreground">{comment.authorRole}</span>
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
                  addComment.mutate({
                    id: ticketId,
                    data: { body: commentBody }
                  }, {
                    onSuccess: () => setCommentBody("")
                  });
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              {canTriage ? (
                <Select
                  value={ticket.status}
                  onValueChange={(val: any) => updateTicket.mutate({ id: ticketId, data: { status: val } })}
                >
                  <SelectTrigger className="h-8" data-testid="select-ticket-status">
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
                  {STATUS_LABEL[ticket.status as keyof typeof STATUS_LABEL] ?? ticket.status}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              {canTriage ? (
                <Select
                  value={ticket.priority}
                  onValueChange={(val: any) => updateTicket.mutate({ id: ticketId, data: { priority: val } })}
                >
                  <SelectTrigger className="h-8" data-testid="select-ticket-priority">
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
                  {PRIORITY_LABEL[ticket.priority as keyof typeof PRIORITY_LABEL] ?? ticket.priority}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Assignee</label>
              <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border text-sm">
                {ticket.assigneeName ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">{ticket.assigneeName.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>{ticket.assigneeName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reporter</label>
              <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border text-sm">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[10px]">{ticket.reporterName.substring(0, 2).toUpperCase()}</AvatarFallback>
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
              <span className="font-medium">{format(new Date(ticket.createdAt), "MMM d, h:mm a")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium">{format(new Date(ticket.updatedAt), "MMM d, h:mm a")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
