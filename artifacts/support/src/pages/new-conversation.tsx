import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  MessageSquarePlus,
  Building2,
} from "lucide-react";
import {
  useListDepartments,
  useCreateTicket,
  getListTicketsQueryKey,
  CreateTicketInputType,
  CreateTicketInputPriority,
  CreateTicketInputSource,
} from "@workspace/api-client-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePortalSession } from "@/components/providers/portal-session-provider";

export default function NewConversationPage() {
  const { session } = usePortalSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const departmentsQuery = useListDepartments();
  const createTicket = useCreateTicket();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");

  const departments = departmentsQuery.data ?? [];

  // Default to the user's own department when available, otherwise the first.
  useEffect(() => {
    if (departmentId) return;
    if (departments.length === 0) return;
    const ownDeptId = session?.departmentId ?? null;
    const own = ownDeptId
      ? departments.find((d) => d.id === ownDeptId)
      : undefined;
    setDepartmentId(String(own?.id ?? departments[0].id));
  }, [departments, departmentId, session?.departmentId]);

  const canSubmit = useMemo(() => {
    return (
      body.trim().length > 0 &&
      departmentId !== "" &&
      !createTicket.isPending &&
      !!session
    );
  }, [body, departmentId, createTicket.isPending, session]);

  // Derive a one-line title from the first line / first sentence of the
  // message when the user didn't enter one. Keeps the chat-first feel
  // (one big "what's happening?" box) while still giving the agent a
  // readable title in their queue.
  const deriveTitle = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return "New support request";
    const firstLine = trimmed.split(/\r?\n/, 1)[0]!.trim();
    const firstSentence = firstLine.split(/(?<=[.!?])\s/, 1)[0]!.trim();
    const candidate = (firstSentence || firstLine).replace(/\s+/g, " ");
    if (candidate.length <= 80) return candidate;
    return candidate.slice(0, 77).trimEnd() + "…";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !session) return;
    try {
      const finalTitle = title.trim() || deriveTitle(body);
      const result = await createTicket.mutateAsync({
        data: {
          title: finalTitle,
          description: body.trim(),
          type: CreateTicketInputType.request,
          priority: CreateTicketInputPriority.medium,
          source: CreateTicketInputSource.chat,
          departmentId: Number(departmentId),
          reporterId: session.userId,
        },
      });
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === getListTicketsQueryKey()[0],
      });
      toast({
        title: "Conversation started",
        description: `${result.ticketKey} · ${result.title}`,
      });
      navigate(`/tickets/${result.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start the conversation",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    }
  };

  return (
    <div className="py-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3 no-underline"
        data-testid="link-back-to-list-from-new"
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
        Your conversations
      </Link>

      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary text-primary-foreground shrink-0">
          <MessageSquarePlus className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Start a new request
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what&apos;s going on. We&apos;ll route it to the right team and reply in this thread.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="department">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Who can help?
                </span>
              </Label>
              {departmentsQuery.isLoading ? (
                <div className="h-10 rounded-md border bg-muted/40 animate-pulse" />
              ) : departmentsQuery.isError ? (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Couldn&apos;t load departments.
                </div>
              ) : (
                <Select
                  value={departmentId}
                  onValueChange={setDepartmentId}
                  disabled={createTicket.isPending}
                >
                  <SelectTrigger
                    id="department"
                    data-testid="select-department"
                  >
                    <SelectValue placeholder="Choose a department…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">What&apos;s happening?</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe your issue. Include any error messages or steps to reproduce…"
                rows={6}
                disabled={createTicket.isPending}
                data-testid="input-new-body"
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                You can keep going in the conversation once it&apos;s started.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="title"
                className="flex items-center gap-1.5"
              >
                Short summary
                <span className="text-[10px] font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Can't connect to the office Wi-Fi"
                maxLength={140}
                disabled={createTicket.isPending}
                data-testid="input-new-title"
              />
              <p className="text-[11px] text-muted-foreground">
                We&apos;ll pull one from your message if you leave this blank.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                asChild
                type="button"
                variant="ghost"
                disabled={createTicket.isPending}
                data-testid="button-cancel-new"
              >
                <Link href="/">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                data-testid="button-submit-new"
              >
                {createTicket.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>Start conversation</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
