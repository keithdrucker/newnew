import { useState } from "react";
import {
  useCreatePerson,
  useListDepartments,
  getListPeopleQueryKey,
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
  location: string;
  phone: string;
  departmentId: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  title: "",
  location: "",
  phone: "",
  departmentId: "none",
};

export function AddPersonDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const { data: departments } = useListDepartments();
  const create = useCreatePerson();
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
          title: form.title.trim() || null,
          location: form.location.trim() || null,
          phone: form.phone.trim() || null,
          departmentId:
            form.departmentId === "none" ? null : Number(form.departmentId),
        },
      },
      {
        onSuccess: (created) => {
          toast({
            title: "Person added",
            description: `${created.name} has been added.`,
          });
          queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
          setForm(EMPTY);
          setOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Could not add person",
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
        <Button size="sm" className="h-9 gap-1.5" data-testid="button-add-person">
          <Plus className="h-4 w-4" />
          Add person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>
            Create a new end-user who can submit tickets.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="person-name">Full name</Label>
              <Input
                id="person-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Jordan Castillo"
                data-testid="input-person-name"
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="person-email">Email</Label>
              <Input
                id="person-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jordan.castillo@ewhowell.com"
                data-testid="input-person-email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-title">Title</Label>
              <Input
                id="person-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Project Manager"
                data-testid="input-person-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-department">Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(v) => set("departmentId", v)}
              >
                <SelectTrigger id="person-department" data-testid="select-person-department">
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
            <div className="space-y-1.5">
              <Label htmlFor="person-location">Location</Label>
              <Input
                id="person-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Plainview, NY (HQ)"
                data-testid="input-person-location"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-phone">Phone</Label>
              <Input
                id="person-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 (555) 123-4567"
                data-testid="input-person-phone"
              />
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
              data-testid="button-submit-person"
            >
              {create.isPending ? "Adding…" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
