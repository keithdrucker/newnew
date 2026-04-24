import { useState } from "react";
import {
  useCreateAgent,
  useListDepartments,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface FormState {
  name: string;
  email: string;
  title: string;
  role: "agent" | "admin";
  departmentId: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  title: "",
  role: "agent",
  departmentId: "none",
};

export function AddAgentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const { data: departments } = useListDepartments();
  const create = useCreateAgent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.name.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    !create.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      {
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          title: form.title.trim() || null,
          departmentId:
            form.departmentId === "none" ? null : Number(form.departmentId),
        },
      },
      {
        onSuccess: (created) => {
          toast({
            title: "Agent added",
            description: `${created.name} (${created.role}) has been added.`,
          });
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
          setForm(EMPTY);
          setOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Could not add agent",
            description: err instanceof Error ? err.message : "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5" data-testid="button-add-agent">
          <Plus className="h-4 w-4" />
          Add agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add agent</DialogTitle>
          <DialogDescription>
            Create a new agent or admin who can resolve tickets.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="agent-name">Full name</Label>
              <Input
                id="agent-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Sasha Nguyen"
                data-testid="input-agent-name"
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="agent-email">Email</Label>
              <Input
                id="agent-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="sasha.nguyen@ewhowell.com"
                data-testid="input-agent-email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-title">Title</Label>
              <Input
                id="agent-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Service Desk Analyst"
                data-testid="input-agent-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => set("role", v as "agent" | "admin")}
              >
                <SelectTrigger id="agent-role" data-testid="select-agent-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="agent-department">Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(v) => set("departmentId", v)}
              >
                <SelectTrigger id="agent-department" data-testid="select-agent-department">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="button-submit-agent"
            >
              {create.isPending ? "Adding…" : "Add agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
