import { Link } from "wouter";
import {
  MessageSquarePlus,
  Inbox,
  AlertCircle,
  ChevronRight,
  Clock,
} from "lucide-react";
import {
  useListTickets,
  getListTicketsQueryKey,
  type Ticket,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalSession } from "@/components/providers/portal-session-provider";
import { relativeTime, statusLabel } from "@/lib/format";

function statusVariant(s: string): {
  label: string;
  className: string;
} {
  switch (s) {
    case "open":
      return {
        label: statusLabel(s),
        className:
          "bg-chart-2/15 text-chart-2 border border-chart-2/30 dark:bg-chart-2/20",
      };
    case "pending":
      return {
        label: statusLabel(s),
        className:
          "bg-chart-4/15 text-chart-4 border border-chart-4/30 dark:bg-chart-4/20",
      };
    case "resolved":
      return {
        label: statusLabel(s),
        className:
          "bg-chart-1/15 text-chart-1 border border-chart-1/30 dark:bg-chart-1/20",
      };
    case "closed":
      return {
        label: statusLabel(s),
        className: "bg-muted text-muted-foreground border",
      };
    default:
      return {
        label: s,
        className: "bg-muted text-muted-foreground border",
      };
  }
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const status = statusVariant(ticket.status);
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="flex items-center gap-3 px-4 py-3.5 hover-elevate active-elevate-2 group no-underline text-foreground"
      data-testid={`row-ticket-${ticket.id}`}
    >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono text-muted-foreground tracking-tight">
              {ticket.ticketKey}
            </span>
            <Badge
              variant="outline"
              className={`px-1.5 py-0 h-4 text-[10px] font-medium rounded-sm ${status.className}`}
            >
              {status.label}
            </Badge>
            {ticket.slaBreached ? (
              <Badge
                variant="outline"
                className="px-1.5 py-0 h-4 text-[10px] font-medium rounded-sm bg-destructive/10 text-destructive border-destructive/30"
              >
                SLA breached
              </Badge>
            ) : null}
          </div>
          <div className="text-sm font-medium leading-snug truncate">
            {ticket.title}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Updated {relativeTime(ticket.updatedAt)}</span>
            <span>·</span>
            <span className="truncate">{ticket.departmentName}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

export default function TicketsListPage() {
  const { session } = usePortalSession();
  // The API filters tickets to the reporter automatically when the
  // current session is an end_user, so no extra filter is required here.
  const ticketsQuery = useListTickets(undefined, {
    query: {
      queryKey: getListTicketsQueryKey(),
      enabled: !!session,
      refetchInterval: 15000,
    },
  });

  return (
    <div className="py-6 sm:py-8">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Hi {session?.name.split(/\s+/)[0] ?? "there"}, what can we help with?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new conversation or pick up where you left off.
          </p>
        </div>
      </div>

      <Link
        href="/new"
        className="block mb-6 rounded-lg border border-primary/30 bg-primary/5 hover-elevate active-elevate-2 p-4 sm:p-5 group no-underline text-foreground"
        data-testid="link-start-conversation"
      >
        <div className="flex items-center gap-3.5">
          <span className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-primary text-primary-foreground shrink-0">
            <MessageSquarePlus className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Start a new request</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Describe your issue in a chat — we&apos;ll route it to the right team.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </Link>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Your conversations
        </h2>
        <Card className="overflow-hidden">
          {ticketsQuery.isLoading ? (
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <Skeleton className="h-3.5 w-3/4 mb-1.5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : ticketsQuery.isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
              <div className="text-sm font-medium">
                Couldn&apos;t load your conversations
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Refresh the page or try again in a moment.
              </p>
            </div>
          ) : (ticketsQuery.data?.length ?? 0) === 0 ? (
            <div className="p-10 text-center">
              <Inbox className="h-7 w-7 text-muted-foreground mx-auto mb-2.5" />
              <div className="text-sm font-medium">No conversations yet</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Start a new request and it&apos;ll show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {ticketsQuery.data!.map((t) => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </div>
          )}
        </Card>
      </section>

      <div className="mt-8 sm:hidden">
        <Button
          asChild
          className="w-full"
          size="lg"
          data-testid="button-start-conversation-mobile"
        >
          <Link href="/new">
            <MessageSquarePlus className="h-4 w-4 mr-1.5" />
            Start a new request
          </Link>
        </Button>
      </div>
    </div>
  );
}
