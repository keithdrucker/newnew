import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ListChecks,
  Star,
} from "lucide-react";
import {
  useGetSession,
  useListDepartments,
  useUpdateMePreferences,
  getGetSessionQueryKey,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Placeholder for the Operational Tasks feature. The Initiatives /
// Projects work is being built first; this page exists so the side-nav
// item resolves to a real route instead of 404'ing. Replace this with
// the real list / board view when Operational Tasks gets built.
//
// The page now also accepts a `/operational-tasks/dept/:slug` route so
// the team-board sidebar tree resolves to a real URL — when the real
// view ships, it should filter its task list by `activeDept.id`.
//
// Saved views aren't included here yet — the page has nothing
// filterable to save. The default-team selector is in, so users can
// pin "Operational Tasks" to their preferred team and have the bare
// /operational-tasks route auto-redirect there.
export default function OperationalTasks() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const queryClient = useQueryClient();
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const [, deptParams] = useRoute("/operational-tasks/dept/:slug");
  const [, setLocation] = useLocation();
  const deptSlug = deptParams?.slug ?? null;
  const activeDept = useMemo(
    () =>
      deptSlug && Array.isArray(departments)
        ? departments.find((d) => d.slug === deptSlug) ?? null
        : null,
    [departments, deptSlug],
  );

  const updatePreferences = useUpdateMePreferences();
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);

  // Same redirect pattern as Tickets / Initiatives / Projects: if the
  // user has a default team set and lands on the bare URL, jump to
  // that team's view. `?all=1` is the explicit-all override.
  const explicitlyAll =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("all") === "1";
  useEffect(() => {
    if (deptSlug) return;
    if (explicitlyAll) return;
    if (!session || !departments) return;
    const slug = session.defaultOperationalTaskBoard;
    if (!slug) return;
    if (departments.some((d) => d.slug === slug)) {
      setLocation(`/operational-tasks/dept/${slug}`, { replace: true });
    }
  }, [deptSlug, explicitlyAll, session, departments, setLocation]);

  async function handleChangeBoard(value: string) {
    setBoardMenuOpen(false);
    if (value === "all") {
      setLocation("/operational-tasks?all=1");
    } else {
      setLocation(`/operational-tasks/dept/${value}`);
    }
  }

  async function handleSetDefaultBoard(value: string) {
    const next = value === "all" ? null : value;
    await updatePreferences.mutateAsync({
      data: { defaultOperationalTaskBoard: next },
    });
    await queryClient.invalidateQueries({
      queryKey: getGetSessionQueryKey(),
    });
  }

  // Operational Tasks is hidden from end users in the sidebar; also
  // block direct navigation so the route can't be reached by URL.
  if (sessionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!session || session.role === "end_user") {
    return <Redirect to="/" />;
  }

  const boardLabel = activeDept ? activeDept.name : "All Operational Tasks";
  const currentBoardIsDefault =
    (session.defaultOperationalTaskBoard ?? null) === (deptSlug ?? null);

  return (
    <div className="px-2 py-2">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="flex items-center gap-1 text-[22px] font-semibold tracking-tight m-0"
            data-testid="text-operational-tasks-title"
          >
            <span>Operational Tasks</span>
            <span className="text-muted-foreground font-normal mx-1.5">
              ·
            </span>
            <DropdownMenu
              open={boardMenuOpen}
              onOpenChange={setBoardMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 text-[22px] font-semibold"
                  data-testid="button-operational-board-picker"
                >
                  <span>{boardLabel}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Teams
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleChangeBoard("all");
                  }}
                  className="flex items-center justify-between"
                  data-testid="operational-board-option-all"
                >
                  <span>All Operational Tasks</span>
                  {!deptSlug && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </DropdownMenuItem>
                {(departments ?? []).map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      handleChangeBoard(d.slug);
                    }}
                    className="flex items-center justify-between"
                    data-testid={`operational-board-option-${d.slug}`}
                  >
                    <span>{d.name}</span>
                    {deptSlug === d.slug && (
                      <Check className="h-4 w-4 text-emerald-500" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleSetDefaultBoard(deptSlug ?? "all");
                  }}
                  disabled={currentBoardIsDefault}
                  data-testid="button-set-default-operational-board"
                >
                  <Star className="h-3.5 w-3.5 mr-2 text-amber-500" />
                  {currentBoardIsDefault
                    ? `${boardLabel} is your default team`
                    : `Set ${boardLabel} as default team`}
                </DropdownMenuItem>
                <div className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
                  Opening Operational Tasks from the sidebar lands here.
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            {activeDept
              ? `Recurring or routine work for the ${activeDept.name} team — not a ticket from a user, not a one-off improvement project.`
              : "Recurring or routine work that keeps the lights on — not a ticket from a user, not a one-off improvement project."}
          </p>
        </div>
      </header>

      <div
        className="rounded-lg border border-dashed bg-card/40 px-8 py-12 text-center"
        data-testid="operational-tasks-coming-soon"
      >
        <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          This is where day-to-day operational tasks will live alongside
          Tickets. We're building Initiatives first; this view will fill
          in next.
        </p>
      </div>
    </div>
  );
}
