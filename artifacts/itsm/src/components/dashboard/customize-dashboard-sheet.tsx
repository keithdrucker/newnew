import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSetDashboardSectionVisibility,
  useResetDashboardVisibility,
  getListDashboardVisibilityQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lock, Settings2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useDashboardSections,
  useDashboardVisibility,
} from "./dashboard-visibility-provider";
import {
  type DashboardKey,
  getDashboardLabel,
} from "@/lib/dashboard-sections";

interface CustomizeDashboardSheetProps {
  // Optional override for the trigger label, e.g. compact buttons in
  // dense headers can pass "Customize" instead of the default. The
  // component otherwise uses the icon + "Customize Dashboard" label.
  triggerLabel?: string;
}

export function CustomizeDashboardSheet({
  triggerLabel,
}: CustomizeDashboardSheetProps) {
  const { dashboardKey, isVisible } = useDashboardVisibility();
  const sections = useDashboardSections();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-customize-dashboard"
        >
          <Settings2 className="h-4 w-4 mr-2" />
          {triggerLabel ?? "Customize Dashboard"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>
            Customize {getDashboardLabel(dashboardKey)}
          </SheetTitle>
          <SheetDescription>
            Toggle optional sections on or off. Required sections always
            stay visible. Changes apply organization-wide.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-4 space-y-3">
          {sections.map((s) => (
            <SectionToggleRow
              key={s.key}
              dashboardKey={dashboardKey}
              sectionKey={s.key}
              label={s.label}
              description={s.description}
              isLocked={s.isLocked}
              currentlyVisible={isVisible(s.key)}
            />
          ))}
        </div>
        <SheetFooter className="mt-4 flex-row justify-between gap-2 sm:justify-between">
          <ResetButton dashboardKey={dashboardKey} />
          <SheetClose asChild>
            <Button variant="default">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface SectionToggleRowProps {
  dashboardKey: DashboardKey;
  sectionKey: string;
  label: string;
  description: string;
  isLocked: boolean;
  currentlyVisible: boolean;
}

function SectionToggleRow({
  dashboardKey,
  sectionKey,
  label,
  description,
  isLocked,
  currentlyVisible,
}: SectionToggleRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setMutation = useSetDashboardSectionVisibility({
    mutation: {
      onSuccess: () => {
        // Refresh the visibility cache so every dashboard mounted in
        // this session sees the new value within one tick.
        queryClient.invalidateQueries({
          queryKey: getListDashboardVisibilityQueryKey(),
        });
      },
      onError: (err: Error) => {
        toast({
          title: "Couldn't update visibility",
          description: err?.message ?? "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const onToggle = (next: boolean) => {
    if (isLocked) return;
    setMutation.mutate({
      dashboardKey,
      sectionKey,
      data: { isVisible: next },
    });
  };

  return (
    <div
      className="flex items-start justify-between gap-4 rounded-md border p-3"
      data-testid={`section-toggle-${sectionKey}`}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isLocked && (
            <Lock
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Required section"
            />
          )}
          <span>{label}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {isLocked ? "Required section" : description}
        </p>
      </div>
      <Switch
        checked={isLocked ? true : currentlyVisible}
        disabled={isLocked || setMutation.isPending}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${label}`}
        data-testid={`switch-${sectionKey}`}
      />
    </div>
  );
}

function ResetButton({ dashboardKey }: { dashboardKey: DashboardKey }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const resetMutation = useResetDashboardVisibility({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDashboardVisibilityQueryKey(),
        });
        toast({ title: "Reset to default" });
      },
      onError: (err: Error) => {
        toast({
          title: "Couldn't reset visibility",
          description: err?.message ?? "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={resetMutation.isPending}
      onClick={() => resetMutation.mutate({ dashboardKey })}
      data-testid="button-reset-dashboard"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Reset to Default
    </Button>
  );
}
