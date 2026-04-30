import { useState } from "react";
import { Check, ChevronDown, Users, Layers } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { useTeamScope } from "@/lib/team-scope";

// Sidebar-mounted global team selector. Sets the active scope for
// every Workspace execution view (Dashboard, Tickets, Operational
// Tasks, Initiatives, Projects). The Executive Dashboard ignores
// this selection and always reads org-wide.
//
// Trigger label rules:
//   - 0 accessible teams (or still loading) → "No teams"
//   - "All Teams" selected and >1 accessible → "All Teams"
//   - exactly 1 selected → that team's name
//   - N selected → "{N} teams"
export function TeamScopeSelector() {
  const {
    accessible,
    selectedIds,
    isAll,
    setSelectedIds,
    setAll,
    loading,
  } = useTeamScope();
  const [open, setOpen] = useState(false);

  const triggerLabel = (() => {
    if (loading) return "Loading…";
    if (accessible.length === 0) return "No teams";
    if (isAll && accessible.length > 1) return "All Teams";
    if (selectedIds.length === 1) {
      const dept = accessible.find((d) => d.id === selectedIds[0]);
      return dept?.name ?? "1 team";
    }
    return `${selectedIds.length} teams`;
  })();

  // Single-team users have no real choice — render a static label so
  // they aren't tempted to click a no-op button.
  if (!loading && accessible.length <= 1) {
    return (
      <div
        className="mx-2 mb-3 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 h-9 text-[12.5px] text-sidebar-foreground/80"
        data-testid="team-scope-static"
      >
        <Users className="h-3.5 w-3.5 text-sidebar-foreground/55" />
        <span className="truncate">{triggerLabel}</span>
      </div>
    );
  }

  function toggle(id: number) {
    // In "All Teams" mode the underlying selectedIds already contains
    // every accessible team, but the UI shows each row as unchecked.
    // Clicking a row in that state should mean "narrow to just this
    // team", not "remove this team from the implicit-all set".
    if (isAll) {
      setSelectedIds([id]);
      return;
    }
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((x) => x !== id);
      // Don't let the user end up with zero — that would hide every
      // execution view. Snap back to "All Teams" instead.
      if (next.length === 0) {
        setAll();
      } else {
        setSelectedIds(next);
      }
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  return (
    <div className="mx-2 mb-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 h-9",
              "text-[12.5px] text-left text-sidebar-foreground/85 hover:bg-white/10 transition-colors",
            )}
            data-testid="button-team-scope"
          >
            <Users className="h-3.5 w-3.5 text-sidebar-foreground/55 shrink-0" />
            <span className="truncate flex-1">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-2"
          data-testid="popover-team-scope"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active Teams
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between h-8"
            onClick={() => {
              setAll();
              setOpen(false);
            }}
            data-testid="team-scope-all"
          >
            <span className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              All Teams
            </span>
            {isAll && <Check className="h-4 w-4 text-emerald-500" />}
          </Button>
          <Separator className="my-1" />
          <div className="max-h-[300px] overflow-y-auto space-y-0.5">
            {accessible.map((dept) => {
              const Icon = DEPT_ICON_MAP[dept.icon] ?? Layers;
              const checked = !isAll && selectedIds.includes(dept.id);
              return (
                <label
                  key={dept.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 h-8 text-sm cursor-pointer transition-colors",
                    "hover:bg-muted",
                  )}
                  data-testid={`team-scope-option-${dept.slug}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(dept.id)}
                  />
                  <span style={{ color: dept.color }} className="inline-flex">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate flex-1">{dept.name}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
