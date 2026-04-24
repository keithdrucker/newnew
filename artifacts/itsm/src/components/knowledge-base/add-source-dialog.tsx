import { useState } from "react";
import {
  useCreateKbArticle,
  useListDepartments,
  getListKbArticlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  title: string;
  body: string;
  departmentId: string;
}

const EMPTY: FormState = {
  title: "",
  body: "",
  departmentId: "",
};

export function AddSourceDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateKbArticle();
  const { data: departments } = useListDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    form.departmentId.length > 0 &&
    !create.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      {
        data: {
          title: form.title.trim(),
          body: form.body.trim(),
          departmentId: Number(form.departmentId),
          source: "manual",
        },
      },
      {
        onSuccess: (created) => {
          toast({
            title: "Article added",
            description: `"${created.title}" is now in the knowledge base.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListKbArticlesQueryKey(),
          });
          setForm(EMPTY);
          setOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Could not create article",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setForm(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5" data-testid="button-add-source">
          <Plus className="h-4 w-4" />
          Add source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add manual source</DialogTitle>
          <DialogDescription>
            Add a knowledge article by hand. To pull in articles from
            Confluence, Notion, Freshservice, or SharePoint, configure those
            integrations from the Sources tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-title">Title</Label>
            <Input
              id="kb-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="VPN setup for new hires"
              data-testid="input-kb-title"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-department">Department</Label>
            <Select
              value={form.departmentId}
              onValueChange={(v) => set("departmentId", v)}
            >
              <SelectTrigger id="kb-department" data-testid="select-kb-department">
                <SelectValue placeholder="Pick a department…" />
              </SelectTrigger>
              <SelectContent>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-body">Body</Label>
            <Textarea
              id="kb-body"
              rows={6}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Step-by-step instructions, links, screenshots…"
              data-testid="input-kb-body"
              required
            />
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
              data-testid="button-submit-source"
            >
              {create.isPending ? "Adding…" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
