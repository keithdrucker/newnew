import { ListChecks } from "lucide-react";

// Placeholder for the Operational Tasks feature. The Initiatives /
// Projects work is being built first; this page exists so the side-nav
// item resolves to a real route instead of 404'ing. Replace this with
// the real list / board view when Operational Tasks gets built.
export default function OperationalTasks() {
  return (
    <div className="px-2 py-2">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            Operational Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Recurring or routine work that keeps the lights on — not a
            ticket from a user, not a one-off improvement project.
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
