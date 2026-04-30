import { useState, useMemo } from "react";
import {
  useCreateDepartment,
  getListDepartmentsQueryKey,
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
import { Plus, Layers } from "lucide-react";
import {
  DEPT_ICON_MAP,
  DEPT_ICON_OPTIONS,
  DEPT_COLOR_PRESETS,
  slugify,
} from "@/lib/dept-icons";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  icon: string;
  color: string;
}

const EMPTY: FormState = {
  name: "",
  slug: "",
  slugTouched: false,
  description: "",
  icon: "Layers",
  color: DEPT_COLOR_PRESETS[0].value,
};

export function AddBoardDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateDepartment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      name: value,
      slug: f.slugTouched ? f.slug : slugify(value),
    }));
  };

  const slugValid = useMemo(
    () => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug),
    [form.slug],
  );

  const canSubmit =
    form.name.trim().length > 0 &&
    form.slug.length > 0 &&
    slugValid &&
    !create.isPending;

  const PreviewIcon = DEPT_ICON_MAP[form.icon] ?? Layers;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      {
        data: {
          name: form.name.trim(),
          slug: form.slug,
          color: form.color,
          icon: form.icon,
          description: form.description.trim() || null,
        },
      },
      {
        onSuccess: (created) => {
          toast({
            title: "Team created",
            description: `${created.name} is now available in Tickets, Projects, Initiatives, and Operational Tasks.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListDepartmentsQueryKey(),
          });
          setForm(EMPTY);
          setOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Could not create team",
            description:
              err instanceof Error
                ? err.message
                : "A team with this slug may already exist.",
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
        <Button
          size="sm"
          className="h-9 gap-1.5"
          data-testid="button-add-board"
        >
          <Plus className="h-4 w-4" />
          New team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>
            Create a new team. It will appear in the sidebar under Tickets,
            Projects, Initiatives, and Operational Tasks, and can receive its
            own work, settings, and SLAs.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="board-name">Team name</Label>
              <Input
                id="board-name"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Operations"
                data-testid="input-board-name"
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="board-slug">URL slug</Label>
              <Input
                id="board-slug"
                value={form.slug}
                onChange={(e) => {
                  set("slug", slugify(e.target.value));
                  set("slugTouched", true);
                }}
                placeholder="operations"
                data-testid="input-board-slug"
                aria-invalid={form.slug.length > 0 && !slugValid}
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in the URL: <code>/tickets/dept/{form.slug || "…"}</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="board-icon">Icon</Label>
              <Select
                value={form.icon}
                onValueChange={(v) => set("icon", v)}
              >
                <SelectTrigger id="board-icon" data-testid="select-board-icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPT_ICON_OPTIONS.map((opt) => {
                    const Icon = DEPT_ICON_MAP[opt.value] ?? Layers;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="board-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="board-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                  data-testid="input-board-color"
                />
                <div className="flex flex-wrap gap-1">
                  {DEPT_COLOR_PRESETS.slice(0, 8).map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => set("color", preset.value)}
                      className={cn(
                        "h-5 w-5 rounded-full border transition-transform hover:scale-110",
                        form.color === preset.value &&
                          "ring-2 ring-offset-1 ring-primary",
                      )}
                      style={{ backgroundColor: preset.value }}
                      aria-label={preset.label}
                      title={preset.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="board-description">Description (optional)</Label>
              <Textarea
                id="board-description"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What kinds of requests does this team handle?"
                data-testid="input-board-description"
              />
            </div>
            <div className="col-span-2 rounded-md border p-3 bg-muted/40">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Preview
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: form.color }}>
                  <PreviewIcon className="h-4 w-4" />
                </span>
                <span className="font-medium">
                  {form.name.trim() || "New team"}
                </span>
              </div>
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
              data-testid="button-submit-board"
            >
              {create.isPending ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
