import { Link, useLocation, useRoute } from "wouter";
import { Layers } from "lucide-react";
import { useListDepartments } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";

export function TicketsStrip() {
  const { data: departments } = useListDepartments();
  const [location] = useLocation();
  const [, deptParams] = useRoute("/tickets/dept/:slug");
  const activeDeptSlug = deptParams?.slug;
  const allActive = location === "/tickets";

  return (
    <div
      className="border-b border-border bg-card"
      data-testid="tickets-strip"
    >
      <div className="px-5 py-2 flex items-center gap-1.5 overflow-x-auto">
        <Link
          href="/tickets"
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors",
            allActive
              ? "bg-foreground text-background"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          data-testid="strip-tickets-all"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          All Tickets
        </Link>

        <span className="mx-1 h-5 w-px bg-border shrink-0" />

        {departments?.map((dept) => {
          const Icon = DEPT_ICON_MAP[dept.icon] ?? Layers;
          const active = activeDeptSlug === dept.slug;
          return (
            <Link
              key={dept.id}
              href={`/tickets/dept/${dept.slug}`}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              data-testid={`strip-dept-${dept.slug}`}
            >
              <span style={{ color: active ? undefined : dept.color }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{dept.name}</span>
              {dept.ticketCount > 0 && (
                <span
                  className={cn(
                    "ml-0.5 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
                    active
                      ? "bg-background/15 text-background"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {dept.ticketCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
