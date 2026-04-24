import { Link, useLocation, useRoute } from "wouter";
import { ChevronRight, Layers } from "lucide-react";
import { Session, useListDepartments } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

const SECTION_META: Record<
  string,
  { eyebrow: string; title: string; tagline: string }
> = {
  "/": {
    eyebrow: "Overview",
    title: "Dashboard",
    tagline: "Service desk pulse, SLAs, and top performers.",
  },
  "/tickets": {
    eyebrow: "Workspace",
    title: "Ticket Board",
    tagline: "Triage requests across every department.",
  },
  "/knowledge-base": {
    eyebrow: "Library",
    title: "Knowledge",
    tagline: "Articles, runbooks, and connected sources.",
  },
  "/people": {
    eyebrow: "Roster",
    title: "People",
    tagline: "End users who can submit tickets to the hub.",
  },
  "/assets": {
    eyebrow: "Inventory",
    title: "Assets",
    tagline: "Hardware, software, and licenses tracked by IT.",
  },
  "/settings": {
    eyebrow: "Configure",
    title: "Settings",
    tagline: "Boards, SLAs, portals, and workspace preferences.",
  },
};

function resolveMeta(location: string) {
  if (location === "/") return SECTION_META["/"];
  for (const key of Object.keys(SECTION_META)) {
    if (key !== "/" && location.startsWith(key)) return SECTION_META[key];
  }
  return SECTION_META["/"];
}

export function ContextPanel({ session }: { session: Session | null }) {
  const [location] = useLocation();
  const meta = resolveMeta(location);
  const showTickets = location === "/tickets" || location.startsWith("/tickets/");

  return (
    <aside
      className="w-[248px] shrink-0 border-r border-border bg-card flex flex-col"
      data-testid="context-panel"
    >
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          EW Howell · Service Hub
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {meta.eyebrow}
        </p>
        <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight text-foreground tracking-tight">
          {meta.title}
        </h2>
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          {meta.tagline}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {showTickets ? (
          <TicketsSubnav />
        ) : (
          <SectionLinks location={location} session={session} />
        )}
      </div>
    </aside>
  );
}

function TicketsSubnav() {
  const [location] = useLocation();
  const [, deptParams] = useRoute("/tickets/dept/:slug");
  const activeDeptSlug = deptParams?.slug ?? null;
  const { data: departments } = useListDepartments();
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-1">
      <Link
        href="/tickets"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
          location === "/tickets"
            ? "bg-secondary text-secondary-foreground font-medium"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
        data-testid="link-tickets-all"
      >
        <span className="h-2 w-2 rounded-full bg-accent" />
        All Tickets
      </Link>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          data-testid="trigger-departments"
        >
          <span>Departments</span>
          <ChevronRight
            className={cn(
              "ml-auto h-3.5 w-3.5 transition-transform",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-0.5 space-y-0.5">
          {departments?.map((dept) => {
            const Icon = DEPT_ICON_MAP[dept.icon] ?? Layers;
            const active = activeDeptSlug === dept.slug;
            return (
              <Link
                key={dept.id}
                href={`/tickets/dept/${dept.slug}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
                data-testid={`link-dept-${dept.slug}`}
              >
                <span style={{ color: dept.color }} className="inline-flex">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{dept.name}</span>
                {dept.ticketCount > 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {dept.ticketCount}
                  </span>
                )}
              </Link>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SectionLinks({
  location,
  session,
}: {
  location: string;
  session: Session | null;
}) {
  type Quick = { label: string; href: string };

  let quick: Quick[] = [];
  if (location === "/") {
    quick = [
      { label: "Open ticket board", href: "/tickets" },
      { label: "Browse knowledge", href: "/knowledge-base" },
    ];
  } else if (location.startsWith("/knowledge-base")) {
    quick = [{ label: "Back to dashboard", href: "/" }];
  } else if (location.startsWith("/settings")) {
    quick = [
      { label: "Back to dashboard", href: "/" },
      { label: "Open ticket board", href: "/tickets" },
    ];
  } else if (
    location.startsWith("/agents") ||
    location.startsWith("/people") ||
    location.startsWith("/assets")
  ) {
    quick = [{ label: "Back to dashboard", href: "/" }];
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="px-3 mb-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Quick links
        </p>
        <div className="space-y-0.5">
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-[13px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
            >
              <span>{q.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-40" />
            </Link>
          ))}
        </div>
      </div>

      {session && (
        <div className="mx-3 rounded-lg border border-border bg-secondary/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Signed in
          </p>
          <p className="mt-1 text-[13px] font-medium text-foreground leading-tight">
            {session.name}
          </p>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
            {session.role}
            {session.departmentName ? ` · ${session.departmentName}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
