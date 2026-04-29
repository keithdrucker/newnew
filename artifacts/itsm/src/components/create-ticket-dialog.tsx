import { useEffect, useMemo, useState } from "react";
import {
  useCreateTicket,
  useListAgents,
  useListDepartments,
  useGetSession,
  getListTicketsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type TicketType = "incident" | "request";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketRiskLevel = "low" | "medium" | "high" | "critical";
type TicketSource = "portal" | "email" | "phone" | "chat" | "walk_in";
type SupportLevel = 1 | 2 | 3;

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Department slug currently selected in the board picker, or null for "All Tickets". */
  defaultDepartmentSlug: string | null;
}

export function CreateTicketDialog({
  open,
  onOpenChange,
  defaultDepartmentSlug,
}: CreateTicketDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useGetSession();
  const { data: departments } = useListDepartments();
  const { data: agents } = useListAgents();
  const createTicket = useCreateTicket();

  const departmentOptions = departments ?? [];

  const defaultDeptId = useMemo(() => {
    if (defaultDepartmentSlug) {
      const match = departmentOptions.find(
        (d) => d.slug === defaultDepartmentSlug,
      );
      if (match) return match.id;
    }
    if (session?.departmentId) return session.departmentId;
    return departmentOptions[0]?.id ?? 0;
  }, [defaultDepartmentSlug, departmentOptions, session?.departmentId]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("incident");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  // Risk level is the security/impact dimension (separate from business priority).
  // The "auto" sentinel means: don't send a value, so the backend will look up
  // the matching risk-rule for the chosen category. If no rule matches, the
  // backend stores `null` (which renders as Low).
  const [riskLevel, setRiskLevel] = useState<TicketRiskLevel | "auto">("auto");
  const [source, setSource] = useState<TicketSource>("portal");
  const [supportLevel, setSupportLevel] = useState<SupportLevel>(1);
  const [departmentId, setDepartmentId] = useState<number>(defaultDeptId);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  // Restrict the assignee dropdown to agents that can actually work
  // the chosen board. The server uses the same membership rule
  // (`boardDepartmentIds` mirrors `getBoardRole`) and rejects POSTs
  // with an out-of-board assignee, so showing all agents would just
  // expose options that 400 on submit.
  const agentOptions = useMemo(() => {
    const list = agents ?? [];
    if (!departmentId) return list;
    return list.filter((a) => a.boardDepartmentIds.includes(departmentId));
  }, [agents, departmentId]);

  // If the chosen assignee no longer has access after the user picks a
  // different board, drop the selection so the form doesn't silently
  // submit a now-invalid id.
  useEffect(() => {
    if (assigneeId == null) return;
    if (!agentOptions.some((a) => a.id === assigneeId)) {
      setAssigneeId(null);
    }
  }, [agentOptions, assigneeId]);
  const [location, setLocation] = useState("");
  const [team, setTeam] = useState("");
  const [category, setCategory] = useState("");

  // When the dialog opens or defaults change, sync the department selection.
  useEffect(() => {
    if (open) {
      setDepartmentId(defaultDeptId);
    }
  }, [open, defaultDeptId]);

  // Reset the form whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setType("incident");
      setPriority("medium");
      setRiskLevel("auto");
      setSource("portal");
      setSupportLevel(1);
      setAssigneeId(null);
      setLocation("");
      setTeam("");
      setCategory("");
    }
  }, [open]);

  const reporterId = session?.userId ?? 0;
  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    departmentId > 0 &&
    reporterId > 0 &&
    !createTicket.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const created = await createTicket.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          source,
          supportLevel,
          departmentId,
          reporterId,
          assigneeId: assigneeId ?? null,
          location: location.trim() ? location.trim() : null,
          team: team.trim() ? team.trim() : null,
          category: category.trim() ? category.trim() : null,
          ...(riskLevel === "auto" ? {} : { riskLevel }),
        },
      });

      await queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].includes("/tickets"),
      });

      toast({
        title: "Ticket created",
        description: `${created.ticketKey} — ${created.title}`,
      });

      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't create ticket",
        description:
          err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create ticket</DialogTitle>
          <DialogDescription>
            Open a new request or incident. You'll be set as the reporter.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="form-create-ticket"
        >
          <div className="space-y-2">
            <Label htmlFor="ct-title">Title</Label>
            <Input
              id="ct-title"
              placeholder="Brief summary of the issue or request"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              data-testid="input-create-ticket-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ct-description">Description</Label>
            <Textarea
              id="ct-description"
              placeholder="What's happening? Include steps to reproduce, error messages, or relevant context."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              required
              data-testid="input-create-ticket-description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as TicketType)}
              >
                <SelectTrigger data-testid="select-create-ticket-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="request">Request</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TicketPriority)}
              >
                <SelectTrigger data-testid="select-create-ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={String(departmentId || "")}
                onValueChange={(v) => setDepartmentId(Number(v))}
              >
                <SelectTrigger data-testid="select-create-ticket-department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Support level</Label>
              <Select
                value={String(supportLevel)}
                onValueChange={(v) =>
                  setSupportLevel(Number(v) as SupportLevel)
                }
              >
                <SelectTrigger data-testid="select-create-ticket-support-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">L1</SelectItem>
                  <SelectItem value="2">L2</SelectItem>
                  <SelectItem value="3">L3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={source}
                onValueChange={(v) => setSource(v as TicketSource)}
              >
                <SelectTrigger data-testid="select-create-ticket-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                value={assigneeId === null ? "unassigned" : String(assigneeId)}
                onValueChange={(v) =>
                  setAssigneeId(v === "unassigned" ? null : Number(v))
                }
              >
                <SelectTrigger data-testid="select-create-ticket-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                      {a.departmentName ? ` · ${a.departmentName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ct-location">Location</Label>
              <Input
                id="ct-location"
                placeholder="Optional"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                data-testid="input-create-ticket-location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ct-team">Team</Label>
              <Input
                id="ct-team"
                placeholder="Optional"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                data-testid="input-create-ticket-team"
              />
            </div>

            <div className="space-y-2">
              <Label>Risk level</Label>
              <Select
                value={riskLevel}
                onValueChange={(v) =>
                  setRiskLevel(v as TicketRiskLevel | "auto")
                }
              >
                <SelectTrigger data-testid="select-create-ticket-risk-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto from category</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ct-category">Category</Label>
              <Input
                id="ct-category"
                placeholder="e.g. Security Incident, Access Request"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                data-testid="input-create-ticket-category"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createTicket.isPending}
              data-testid="button-cancel-create-ticket"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="button-submit-create-ticket"
            >
              {createTicket.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// `getListTicketsQueryKey` is referenced for type-only consumers; eslint sees it
// otherwise unused. We re-export so tree-shaking can drop it cleanly.
export { getListTicketsQueryKey };
