import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  AppWindow,
  Building2,
  LayoutDashboard,
  Ticket,
  BookOpen,
  MonitorPlay,
  UserRound,
  Settings,
  ChevronsUpDown,
  ChevronRight,
  Layers,
  KanbanSquare,
} from "lucide-react";
import {
  Session,
  useListAgents,
  useListDepartments,
  useListPeople,
  useSwitchSession,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
  adminOnly?: boolean;
  endUserHidden?: boolean;
};

const WORKSPACE: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    matchPrefix: "/tickets",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: KanbanSquare,
    matchPrefix: "/projects",
    endUserHidden: true,
  },
  {
    href: "/knowledge-base",
    label: "Knowledge",
    icon: BookOpen,
    matchPrefix: "/knowledge-base",
  },
];

const ADMIN: NavItem[] = [
  { href: "/assets", label: "Assets", icon: MonitorPlay, adminOnly: true },
  {
    href: "/applications",
    label: "Applications",
    icon: AppWindow,
    adminOnly: true,
  },
  {
    href: "/vendors",
    label: "Vendors",
    icon: Building2,
    adminOnly: true,
  },
  { href: "/people", label: "People", icon: UserRound, adminOnly: true },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    adminOnly: true,
    matchPrefix: "/settings",
  },
];

export function SideNav({ session }: { session: Session | null }) {
  const [location] = useLocation();

  const showTicketsTree =
    location === "/tickets" || location.startsWith("/tickets/");
  const showProjectsTree =
    location === "/projects" || location.startsWith("/projects");
  const showDashboardTree =
    location === "/" ||
    location === "/tickets/dashboard" ||
    location === "/projects/dashboard";

  return (
    <aside
      className="w-[244px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border/40"
      data-testid="side-nav"
    >
      <div className="px-4 pt-5 pb-4 border-b border-white/5">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          data-testid="brand-mark"
        >
          <div className="h-10 w-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-[14px] shadow-md ring-1 ring-white/10">
            EW
          </div>
          <div className="leading-tight min-w-0">
            <p className="font-display font-semibold text-[15px] tracking-tight text-white truncate">
              Service Hub
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
              EW Howell
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        <NavSection title="Workspace">
          {WORKSPACE.map((item) => {
            if (item.endUserHidden && session?.role === "end_user") return null;
            if (item.href === "/") {
              return (
                <DashboardNavItem
                  key={item.href}
                  item={item}
                  location={location}
                  expanded={showDashboardTree}
                  session={session}
                />
              );
            }
            if (item.href === "/tickets") {
              return (
                <TicketsNavItem
                  key={item.href}
                  item={item}
                  location={location}
                  expanded={showTicketsTree}
                />
              );
            }
            if (item.href === "/projects") {
              return (
                <ProjectsNavItem
                  key={item.href}
                  item={item}
                  location={location}
                  expanded={showProjectsTree}
                />
              );
            }
            return (
              <NavRow
                key={item.href}
                item={item}
                location={location}
                session={session}
              />
            );
          })}
        </NavSection>

        {session?.role === "admin" && (
          <NavSection title="Administration">
            {ADMIN.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                location={location}
                session={session}
              />
            ))}
          </NavSection>
        )}
      </nav>

      {session && <SessionFooter session={session} />}
    </aside>
  );
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavRow({
  item,
  location,
  session,
}: {
  item: NavItem;
  location: string;
  session: Session | null;
}) {
  if (item.adminOnly && session?.role !== "admin") return null;
  const Icon = item.icon;
  const active = item.matchPrefix
    ? location.startsWith(item.matchPrefix)
    : location === item.href;

  return (
    <Link
      href={item.href}
      data-testid={`nav-${item.href.replace("/", "") || "home"}`}
      className={cn(
        "relative group flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
        active
          ? "bg-white/10 text-white"
          : "text-sidebar-foreground/75 hover:text-white hover:bg-white/5",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function DashboardNavItem({
  item,
  location,
  expanded: defaultExpanded,
  session,
}: {
  item: NavItem;
  location: string;
  expanded: boolean;
  session: Session | null;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const Icon = item.icon;
  const sectionActive =
    location === "/" ||
    location === "/tickets/dashboard" ||
    location === "/projects/dashboard";
  const overviewActive = location === "/";
  const ticketsActive = location === "/tickets/dashboard";
  const projectsActive = location === "/projects/dashboard";
  const showProjects = session?.role !== "end_user";

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Link
          href={item.href}
          data-testid="nav-dashboard"
          className={cn(
            "relative flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors pr-8",
            sectionActive
              ? "bg-white/10 text-white"
              : "text-sidebar-foreground/75 hover:text-white hover:bg-white/5",
          )}
        >
          {sectionActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <CollapsibleTrigger
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
            "text-sidebar-foreground/55 hover:bg-white/5 hover:text-white",
          )}
          aria-label={open ? "Collapse dashboards" : "Expand dashboards"}
          data-testid="trigger-dashboard-tree"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
        <Link
          href="/"
          data-testid="nav-dashboard-overview"
          className={cn(
            "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
            overviewActive
              ? "bg-white/10 text-white font-medium"
              : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span>Overview</span>
        </Link>
        <Link
          href="/tickets/dashboard"
          data-testid="nav-dashboard-tickets"
          className={cn(
            "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
            ticketsActive
              ? "bg-white/10 text-white font-medium"
              : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
          )}
        >
          <Ticket className="h-3.5 w-3.5 text-sidebar-foreground/70" />
          <span>Tickets</span>
        </Link>
        {showProjects && (
          <Link
            href="/projects/dashboard"
            data-testid="nav-dashboard-projects"
            className={cn(
              "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
              projectsActive
                ? "bg-white/10 text-white font-medium"
                : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
            )}
          >
            <KanbanSquare className="h-3.5 w-3.5 text-sidebar-foreground/70" />
            <span>Projects</span>
          </Link>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TicketsNavItem({
  item,
  location,
  expanded: defaultExpanded,
}: {
  item: NavItem;
  location: string;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const Icon = item.icon;
  const sectionActive =
    location === "/tickets" || location.startsWith("/tickets/");
  const allActive = location === "/tickets";
  const [, deptMatch] = useRoute("/tickets/dept/:slug");
  const activeDeptSlug = deptMatch?.slug;
  const { data: departments } = useListDepartments({ scope: "accessible" });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Link
          href={item.href}
          data-testid="nav-tickets"
          className={cn(
            "relative flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors pr-8",
            sectionActive
              ? "bg-white/10 text-white"
              : "text-sidebar-foreground/75 hover:text-white hover:bg-white/5",
          )}
        >
          {sectionActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <CollapsibleTrigger
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
            "text-sidebar-foreground/55 hover:bg-white/5 hover:text-white",
          )}
          aria-label={open ? "Collapse departments" : "Expand departments"}
          data-testid="trigger-tickets-tree"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
        <Link
          href="/tickets"
          data-testid="nav-tickets-all"
          className={cn(
            "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
            allActive
              ? "bg-white/10 text-white font-medium"
              : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span>All Tickets</span>
        </Link>
        {departments?.map((dept) => {
          const DeptIcon = DEPT_ICON_MAP[dept.icon] ?? Layers;
          const active = activeDeptSlug === dept.slug;
          return (
            <Link
              key={dept.id}
              href={`/tickets/dept/${dept.slug}`}
              className={cn(
                "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
              )}
              data-testid={`nav-dept-${dept.slug}`}
            >
              <span style={{ color: dept.color }} className="inline-flex">
                <DeptIcon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate flex-1">{dept.name}</span>
              {dept.ticketCount > 0 && (
                <span className="text-[10.5px] tabular-nums text-sidebar-foreground/55">
                  {dept.ticketCount}
                </span>
              )}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProjectsNavItem({
  item,
  location,
  expanded: defaultExpanded,
}: {
  item: NavItem;
  location: string;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const Icon = item.icon;
  const sectionActive =
    location === "/projects" || location.startsWith("/projects");
  const allActive = location === "/projects";
  const [, deptMatch] = useRoute("/projects/dept/:slug");
  const activeDeptSlug = deptMatch?.slug;
  const { data: departments } = useListDepartments({ scope: "accessible" });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Link
          href={item.href}
          data-testid="nav-projects"
          className={cn(
            "relative flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors pr-8",
            sectionActive
              ? "bg-white/10 text-white"
              : "text-sidebar-foreground/75 hover:text-white hover:bg-white/5",
          )}
        >
          {sectionActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <CollapsibleTrigger
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
            "text-sidebar-foreground/55 hover:bg-white/5 hover:text-white",
          )}
          aria-label={open ? "Collapse departments" : "Expand departments"}
          data-testid="trigger-projects-tree"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
        <Link
          href="/projects"
          data-testid="nav-projects-all"
          className={cn(
            "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
            allActive
              ? "bg-white/10 text-white font-medium"
              : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span>All Projects</span>
        </Link>
        {departments?.map((dept) => {
          const DeptIcon = DEPT_ICON_MAP[dept.icon] ?? Layers;
          const active = activeDeptSlug === dept.slug;
          return (
            <Link
              key={dept.id}
              href={`/projects/dept/${dept.slug}`}
              className={cn(
                "flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-sidebar-foreground/65 hover:text-white hover:bg-white/5",
              )}
              data-testid={`nav-projects-dept-${dept.slug}`}
            >
              <span style={{ color: dept.color }} className="inline-flex">
                <DeptIcon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate flex-1">{dept.name}</span>
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SessionFooter({ session }: { session: Session }) {
  const { data: agents } = useListAgents({});
  const { data: people } = useListPeople({});
  const switchSession = useSwitchSession();

  return (
    <div className="border-t border-white/5 p-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/5 transition-colors text-left"
            data-testid="button-role-switcher"
            aria-label="Switch user"
          >
            <Avatar className="h-8 w-8 ring-1 ring-white/15">
              <AvatarFallback className="bg-sidebar-accent text-white text-[11px] font-semibold">
                {session.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[12.5px] font-medium text-white truncate">
                {session.name}
              </p>
              <p className="text-[10.5px] text-sidebar-foreground/60 capitalize truncate">
                {session.role}
                {session.departmentName ? ` · ${session.departmentName}` : ""}
              </p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-foreground/55 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 ml-2" side="right" align="end">
          <div className="px-3 py-2 border-b">
            <p className="text-[13px] font-medium leading-tight">
              {session.name}
            </p>
            <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
              {session.role}
              {session.departmentName ? ` · ${session.departmentName}` : ""}
            </p>
          </div>
          <Command>
            <CommandInput
              placeholder="Switch demo user..."
              className="h-9 text-sm"
            />
            <CommandList className="max-h-[320px]">
              <CommandEmpty>No user found.</CommandEmpty>
              <CommandGroup heading="Admins & Agents">
                {agents?.map((agent) => (
                  <CommandItem
                    key={`agent-${agent.id}`}
                    value={`${agent.name} ${agent.role} ${agent.departmentName ?? ""}`}
                    onSelect={() => {
                      switchSession.mutate(
                        { data: { userId: agent.id } },
                        { onSuccess: () => window.location.reload() },
                      );
                    }}
                  >
                    <div className="flex flex-col">
                      <span>
                        {agent.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {agent.role}
                        </span>
                      </span>
                      {agent.departmentName && (
                        <span className="text-[11px] text-muted-foreground">
                          {agent.departmentName}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="End Users">
                {people?.map((person) => (
                  <CommandItem
                    key={`person-${person.id}`}
                    value={`${person.name} ${person.departmentName ?? ""}`}
                    onSelect={() => {
                      switchSession.mutate(
                        { data: { userId: person.id } },
                        { onSuccess: () => window.location.reload() },
                      );
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{person.name}</span>
                      {person.departmentName && (
                        <span className="text-[11px] text-muted-foreground">
                          {person.departmentName}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
