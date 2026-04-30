import { useMemo } from "react";
import { Redirect, useRoute } from "wouter";
import { ListChecks } from "lucide-react";
import { useGetSession, useListDepartments } from "@workspace/api-client-react";

// Placeholder for the Operational Tasks feature. The Initiatives /
// Projects work is being built first; this page exists so the side-nav
// item resolves to a real route instead of 404'ing. Replace this with
// the real list / board view when Operational Tasks gets built.
//
// The page now also accepts a `/operational-tasks/dept/:slug` route so
// the team-board sidebar tree resolves to a real URL — when the real
// view ships, it should filter its task list by `activeDept.id`.
export default function OperationalTasks() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const { data: departments } = useListDepartments({ scope: "accessible" });
  const [, deptParams] = useRoute("/operational-tasks/dept/:slug");
  const deptSlug = deptParams?.slug ?? null;
  const activeDept = useMemo(
    () =>
      deptSlug && Array.isArray(departments)
        ? departments.find((d) => d.slug === deptSlug) ?? null
        : null,
    [departments, deptSlug],
  );

  // Operational Tasks is hidden from end users in the sidebar; also
  // block direct navigation so the route can't be reached by URL.
  if (sessionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!session || session.role === "end_user") {
    return <Redirect to="/" />;
  }

  return (
    <div className="px-2 py-2">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-[22px] font-semibold tracking-tight"
            data-testid="text-operational-tasks-title"
          >
            Operational Tasks
            {activeDept && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {activeDept.name}
              </span>
            )}
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
