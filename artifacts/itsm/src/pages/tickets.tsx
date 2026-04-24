import {
  useListTickets,
  useGetSession,
  useListDepartments,
} from "@workspace/api-client-react";
import { Link, useRoute } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Inbox,
  Search,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Tickets() {
  useGetSession();
  const [, params] = useRoute("/tickets/dept/:slug");
  const deptSlug = params?.slug ?? null;

  const { data: departments } = useListDepartments();
  const dept = deptSlug
    ? (departments?.find((d) => d.slug === deptSlug) ?? null)
    : null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: tickets, isLoading } = useListTickets({
    departmentId: dept?.id,
    q: search || undefined,
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as "open" | "pending" | "resolved" | "closed"),
    priority:
      priorityFilter === "all"
        ? undefined
        : (priorityFilter as "low" | "medium" | "high" | "urgent"),
  });

  const summary = useMemo(() => {
    const t = tickets ?? [];
    return {
      total: t.length,
      open: t.filter((x) => x.status === "open").length,
      pending: t.filter((x) => x.status === "pending").length,
      breached: t.filter((x) => x.slaBreached).length,
    };
  }, [tickets]);

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>Ticket Board</span>
            <span>›</span>
            <span>{dept ? dept.name : "All Tickets"}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {dept ? dept.name : "All Tickets"}
            <Badge variant="secondary" className="text-[11px]">
              {summary.total}
            </Badge>
          </h1>
          {dept?.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {dept.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">
            {summary.open} open
          </span>
          <span className="px-2 py-1 rounded bg-orange-50 text-orange-700">
            {summary.pending} pending
          </span>
          {summary.breached > 0 && (
            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">
              {summary.breached} breached
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger
            className="w-[140px] h-9"
            data-testid="select-priority"
          >
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[110px]">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-[140px]">Department</TableHead>
                <TableHead className="w-[110px]">Priority</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[160px]">Assignee</TableHead>
                <TableHead className="w-[120px]">SLA</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading tickets…
                  </TableCell>
                </TableRow>
              ) : tickets?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                tickets?.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="group cursor-pointer"
                    data-testid={`row-ticket-${ticket.id}`}
                  >
                    <TableCell>
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-600 hover:underline tabular-nums"
                      >
                        {ticket.ticketKey}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/tickets/${ticket.id}`} className="block">
                        <div className="font-medium text-foreground truncate max-w-[420px]">
                          {ticket.title}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {ticket.type}
                          {ticket.location ? ` · ${ticket.location}` : ""}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.departmentName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={priorityColor(ticket.priority)}
                      >
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 capitalize">
                        {statusIcon(ticket.status)}
                        <span className="text-sm font-medium">
                          {ticket.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.assigneeName ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(ticket.assigneeName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[120px]">
                            {ticket.assigneeName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground/70">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ticket.slaBreached ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Breached
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">On track</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ticket.createdAt), "MMM d")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-blue-100 text-blue-700";
    case "low":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "open":
      return <Inbox className="h-4 w-4 text-blue-500" />;
    case "pending":
      return <Clock className="h-4 w-4 text-orange-500" />;
    case "resolved":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "closed":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Inbox className="h-4 w-4" />;
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
