import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  CheckCircle2,
  CircleDot,
  CircleDashed,
} from "lucide-react";
import {
  useGetTicket,
  getGetTicketQueryKey,
  getListTicketsQueryKey,
  useAddTicketComment,
  type TicketDetail,
  type TicketComment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessageBubble, type ChatMessage } from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { usePortalSession } from "@/components/providers/portal-session-provider";
import { dayLabel, statusLabel } from "@/lib/format";

interface Props {
  ticketId: number;
}

interface OptimisticReply {
  tempId: string;
  body: string;
  createdAt: string;
  authorName: string;
}

function statusBadge(s: string) {
  const base =
    "px-1.5 py-0 h-5 text-[11px] font-medium rounded-sm border inline-flex items-center gap-1";
  switch (s) {
    case "open":
      return (
        <span className={`${base} bg-chart-2/15 text-chart-2 border-chart-2/30`}>
          <CircleDot className="h-3 w-3" />
          {statusLabel(s)}
        </span>
      );
    case "pending":
      return (
        <span className={`${base} bg-chart-4/15 text-chart-4 border-chart-4/30`}>
          <CircleDashed className="h-3 w-3" />
          {statusLabel(s)}
        </span>
      );
    case "resolved":
      return (
        <span className={`${base} bg-chart-1/15 text-chart-1 border-chart-1/30`}>
          <CheckCircle2 className="h-3 w-3" />
          {statusLabel(s)}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-muted text-muted-foreground`}>
          {statusLabel(s)}
        </span>
      );
  }
}

function buildMessageStream(
  ticket: TicketDetail,
  optimistic: OptimisticReply[],
  currentUserId: number | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // First message: the ticket description, authored by the reporter.
  messages.push({
    id: `ticket-${ticket.id}`,
    role: ticket.reporterId === currentUserId ? "user" : "agent",
    authorName: ticket.reporterName,
    body: ticket.description,
    createdAt: ticket.createdAt,
  });

  // Subsequent messages: the ticket comments.
  for (const c of ticket.comments) {
    messages.push({
      id: `comment-${c.id}`,
      role: roleForComment(c, currentUserId, ticket.reporterId),
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
    });
  }

  // Optimistic replies authored by the current end user that haven't been
  // confirmed by the server yet.
  for (const o of optimistic) {
    messages.push({
      id: `pending-${o.tempId}`,
      role: "user",
      authorName: o.authorName,
      body: o.body,
      createdAt: o.createdAt,
      pending: true,
    });
  }

  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function roleForComment(
  c: TicketComment,
  currentUserId: number | null,
  reporterId: number,
): ChatMessage["role"] {
  // The signed-in end user is always the reporter of the tickets they can
  // see (the server scopes /api/tickets to reporterId = self for end_users),
  // so any end_user comment on this thread is "their" message.
  if (c.authorRole === "end_user") {
    // Defensive: if the viewer somehow isn't the reporter, still render
    // end_user comments on the agent side so attribution stays correct.
    if (currentUserId != null && reporterId === currentUserId) return "user";
    return "agent";
  }
  // admin and agent roles both speak as the support team.
  return "agent";
}

function MessageGroup({ messages }: { messages: ChatMessage[] }) {
  const grouped = useMemo(() => {
    const groups: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) {
        last.items.push(m);
      } else {
        groups.push({ day, items: [m] });
      }
    }
    return groups;
  }, [messages]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {grouped.map((g) => (
        <div key={g.day} className="space-y-3">
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 border-t" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {g.day}
            </span>
            <div className="flex-1 border-t" />
          </div>
          {g.items.map((m) => (
            <ChatMessageBubble key={m.id} message={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ChatThreadPage({ ticketId }: Props) {
  const { session } = usePortalSession();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const ticketQuery = useGetTicket(ticketId, {
    query: {
      queryKey: getGetTicketQueryKey(ticketId),
      refetchInterval: 5000,
    },
  });
  const addComment = useAddTicketComment();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<OptimisticReply[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  const ticket = ticketQuery.data;
  const messages = useMemo(
    () =>
      ticket ? buildMessageStream(ticket, optimistic, session?.userId ?? null) : [],
    [ticket, optimistic, session?.userId],
  );

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (!ticket) return;
    const el = scrollRef.current;
    if (!el) return;
    const isFirstLoad = lastCountRef.current === 0;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (isFirstLoad || grew) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: isFirstLoad ? "auto" : "smooth" });
      });
    }
  }, [messages, ticket]);

  // Reconcile optimistic replies once the server has them.
  useEffect(() => {
    if (!ticket || optimistic.length === 0) return;
    const serverBodies = new Set(ticket.comments.map((c) => `${c.body}::${c.authorName}`));
    setOptimistic((prev) =>
      prev.filter(
        (o) => !serverBodies.has(`${o.body}::${o.authorName}`),
      ),
    );
  }, [ticket, optimistic.length]);

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !session) return;
    const tempId = Math.random().toString(36).slice(2);
    setOptimistic((prev) => [
      ...prev,
      {
        tempId,
        body,
        createdAt: new Date().toISOString(),
        authorName: session.name,
      },
    ]);
    setDraft("");
    addComment.mutate(
      { id: ticketId, data: { body } },
      {
        onSuccess: async () => {
          await qc.invalidateQueries({
            queryKey: getGetTicketQueryKey(ticketId),
          });
          // Bump the conversations list so the row's "Updated <relative>"
          // and any preview reflect the new comment when the user goes back.
          await qc.invalidateQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) && q.queryKey[0] === getListTicketsQueryKey()[0],
          });
        },
        onError: () => {
          setOptimistic((prev) => prev.filter((o) => o.tempId !== tempId));
          // Restore the draft so the user doesn't lose their text.
          setDraft((d) => (d ? d : body));
        },
      },
    );
  };

  if (ticketQuery.isLoading) {
    return (
      <div className="py-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => navigate("/")}
          data-testid="button-back-to-list"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Skeleton className="h-6 w-2/3 mb-3" />
        <Skeleton className="h-4 w-1/3 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-16 w-3/4 rounded-lg" />
          <Skeleton className="h-12 w-2/3 rounded-lg ml-auto" />
          <Skeleton className="h-20 w-3/4 rounded-lg" />
        </div>
      </div>
    );
  }

  if (ticketQuery.isError || !ticket) {
    return (
      <div className="py-10 text-center">
        <AlertCircle className="h-7 w-7 text-destructive mx-auto mb-2" />
        <h2 className="text-base font-semibold">Couldn&apos;t open this conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You may not have access, or the link is no longer valid.
        </p>
        <Button asChild variant="outline" className="mt-4" data-testid="button-back-error">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to your conversations
          </Link>
        </Button>
      </div>
    );
  }

  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="flex flex-col h-[calc(100vh-65px)]">
      <div className="border-b bg-card/50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3">
        <Link
          href="/"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-2 no-underline"
          data-testid="link-back-to-list"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Your conversations
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-base sm:text-lg font-semibold leading-snug truncate"
              data-testid="text-ticket-title"
            >
              {ticket.title}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{ticket.ticketKey}</span>
              <span>·</span>
              <span>{ticket.departmentName}</span>
              {ticket.assigneeName ? (
                <>
                  <span>·</span>
                  <span>Assigned to {ticket.assigneeName}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">{statusBadge(ticket.status)}</div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-5 sm:py-6"
        data-testid="chat-scroll-area"
      >
        <MessageGroup messages={messages} />
        {/*
          Future LLM extension point: an `assistant` ChatMessage produced by
          the (not-yet-built) support assistant can be appended to `messages`
          here — the bubble already supports the `assistant` role.
        */}
      </div>

      {isClosed ? (
        <div className="border-t bg-muted/40 px-4 py-4 text-center">
          <Badge variant="outline" className="mb-1">
            {statusLabel(ticket.status)}
          </Badge>
          <p className="text-xs text-muted-foreground">
            This conversation is {ticket.status}. Start a new request if you need more help.
          </p>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="mt-2.5"
            data-testid="button-start-new-from-closed"
          >
            <Link href="/new">Start a new request</Link>
          </Button>
        </div>
      ) : (
        <div className="-mx-4 sm:-mx-6">
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={handleSend}
            pending={addComment.isPending}
            disabled={!session}
            placeholder="Type your reply…"
            submitLabel="Send"
          />
        </div>
      )}
    </div>
  );
}
