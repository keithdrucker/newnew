import { useEffect, useMemo, useState } from "react";
import {
  useUpdateDepartment,
  getListDepartmentsQueryKey,
  getGetDepartmentQueryKey,
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layers } from "lucide-react";
import {
  DEPT_ICON_MAP,
  DEPT_ICON_OPTIONS,
  DEPT_COLOR_PRESETS,
  slugify,
} from "@/lib/dept-icons";
import { cn } from "@/lib/utils";

interface BoardForEdit {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon: string;
  description: string | null;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
}

export function EditBoardDialog({
  board,
  open,
  onOpenChange,
  onSlugChanged,
}: {
  board: BoardForEdit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSlugChanged?: (newSlug: string) => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: board.name,
    slug: board.slug,
    description: board.description ?? "",
    icon: board.icon,
    color: board.color,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: board.name,
        slug: board.slug,
        description: board.description ?? "",
        icon: board.icon,
        color: board.color,
      });
    }
  }, [open, board]);

  const update = useUpdateDepartment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const slugValid = useMemo(
    () => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug),
    [form.slug],
  );

  const canSubmit =
    form.name.trim().length > 0 &&
    form.slug.length > 0 &&
    slugValid &&
    !update.isPending;

  const PreviewIcon = DEPT_ICON_MAP[form.icon] ?? Layers;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const newSlug = form.slug;
    update.mutate(
      {
        id: board.id,
        data: {
          name: form.name.trim(),
          slug: newSlug,
          color: form.color,
          icon: form.icon,
          description: form.description.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          toast({
            title: "Board updated",
            description: `${updated.name} has been saved.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListDepartmentsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDepartmentQueryKey(board.id),
          });
          onOpenChange(false);
          if (newSlug !== board.slug && onSlugChanged) {
            onSlugChanged(newSlug);
          }
        },
        onError: (err) => {
          toast({
            title: "Could not update board",
            description:
              err instanceof Error
                ? err.message
                : "A board with this slug may already exist.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit ticket board</DialogTitle>
          <DialogDescription>
            Update the board name, URL slug, icon, color, or description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="edit-board-name">Board name</Label>
              <Input
                id="edit-board-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                data-testid="input-edit-board-name"
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="edit-board-slug">URL slug</Label>
              <Input
                id="edit-board-slug"
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                data-testid="input-edit-board-slug"
                aria-invalid={form.slug.length > 0 && !slugValid}
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in the URL: <code>/tickets/dept/{form.slug || "…"}</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-board-icon">Icon</Label>
              <Select value={form.icon} onValueChange={(v) => set("icon", v)}>
                <SelectTrigger
                  id="edit-board-icon"
                  data-testid="select-edit-board-icon"
                >
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
              <Label htmlFor="edit-board-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-board-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
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
              <Label htmlFor="edit-board-description">
                Description (optional)
              </Label>
              <Textarea
                id="edit-board-description"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
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
                  {form.name.trim() || "Board"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="button-submit-edit-board"
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
