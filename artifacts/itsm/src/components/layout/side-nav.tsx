import { Link, useLocation } from "wouter";
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
  KanbanSquare,
  Clock,
  ListChecks,
  Lightbulb,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import sidekickLogo from "@assets/sidekick_logo_dark.png";
import {
  Session,
  useListAgents,
  useListPeople,
  useSwitchSession,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
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
import { TeamScopeSelector } from "@/components/team-scope-selector";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
  adminOnly?: boolean;
  endUserHidden?: boolean;
  testId?: string;
};

// Top of the Workspace section — Dashboard sits above the two thematic
// sub-groups (Day-to-Day Operations / Improvements). Timesheets sits
// directly below Dashboard as a personal time-tracking shortcut
// (hidden from end users, who don't log time).
const WORKSPACE_TOP: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  {
    href: "/timesheet",
    label: "Timesheets",
    icon: Clock,
    matchPrefix: "/timesheet",
    endUserHidden: true,
  },
];

// Reactive / operational work users do every day.
const DAY_TO_DAY: NavItem[] = [
  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    matchPrefix: "/tickets",
  },
  {
    href: "/operational-tasks",
    label: "Operational Tasks",
    icon: ListChecks,
    matchPrefix: "/operational-tasks",
    endUserHidden: true,
    testId: "nav-operational-tasks",
  },
];

// Proactive improvement work — ideas (Initiatives) graduate into execution
// (Projects). Both hidden from end users.
const IMPROVEMENTS: NavItem[] = [
  {
    href: "/initiatives",
    label: "Initiatives",
    icon: Lightbulb,
    matchPrefix: "/initiatives",
    endUserHidden: true,
    testId: "nav-initiatives",
  },
  {
    href: "/risks",
    label: "Risk Register",
    icon: ShieldAlert,
    matchPrefix: "/risks",
    endUserHidden: true,
    testId: "nav-risks",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: KanbanSquare,
    matchPrefix: "/projects",
    endUserHidden: true,
  },
];

// Bottom of the Workspace section — operational tools that don't belong
// inside either sub-group. Empty for now (Knowledge moved to
// Administration, Timesheets moved up under Dashboard).
const WORKSPACE_BOTTOM: NavItem[] = [];

// Cross-team / cross-department portfolio surfaces. Admin-only because
// the audience is executives and steering committees, not contributors.
const GOVERNANCE: NavItem[] = [
  {
    href: "/executive-dashboard",
    label: "Team Health",
    icon: BarChart3,
    matchPrefix: "/executive-dashboard",
    adminOnly: true,
    testId: "nav-executive-dashboard",
  },
];

const ADMIN: NavItem[] = [
  {
    href: "/knowledge-base",
    label: "Knowledge",
    icon: BookOpen,
    matchPrefix: "/knowledge-base",
    adminOnly: true,
  },
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

  return (
    <aside
      className="w-[244px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border/40"
      data-testid="side-nav"
    >
      <div className="px-4 pt-5 pb-4 border-b border-white/5">
        <Link
          href="/"
          className="flex flex-col items-start gap-2"
          data-testid="brand-mark"
        >
          <img
            src={sidekickLogo}
            alt="Sidekick"
            className="block w-full h-auto object-contain max-h-20"
          />
        </Link>
      </div>

      {/* Global team-scope selector — drives the active scope for
          every Workspace execution view. End-users (single-team
          access at most) see a static label rather than a popover. */}
      {session?.role !== "end_user" && (
        <div className="pt-3" data-testid="team-scope-section">
          <TeamScopeSelector />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        <NavSection title="Workspace">
          {WORKSPACE_TOP.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              location={location}
              session={session}
            />
          ))}

          <NavSubGroup
            title="Day-to-Day Operations"
            session={session}
            items={DAY_TO_DAY}
          >
            {DAY_TO_DAY.map((item) => {
              if (item.endUserHidden && session?.role === "end_user")
                return null;
              return (
                <NavRow
                  key={item.href}
                  item={item}
                  location={location}
                  session={session}
                />
              );
            })}
          </NavSubGroup>

          <NavSubGroup
            title="Improvements"
            session={session}
            items={IMPROVEMENTS}
          >
            {IMPROVEMENTS.map((item) => {
              if (item.endUserHidden && session?.role === "end_user")
                return null;
              return (
                <NavRow
                  key={item.href}
                  item={item}
                  location={location}
                  session={session}
                />
              );
            })}
          </NavSubGroup>

          {WORKSPACE_BOTTOM.map((item) => {
            if (item.endUserHidden && session?.role === "end_user") return null;
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

        {/* Governance — cross-team / cross-department portfolio
            views. Admin-only because executive surfaces aren't part
            of an agent's day-to-day execution work. */}
        {session?.role === "admin" && (
          <NavSection title="Governance">
            {GOVERNANCE.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                location={location}
                session={session}
              />
            ))}
          </NavSection>
        )}

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

// A thematic sub-group inside a NavSection (e.g. "Day-to-Day Operations"
// inside "Workspace"). Renders a small uppercase heading above its items
// and is suppressed entirely when no items are visible to the current
// session — that way an end-user session that can't see Initiatives or
// Operational Tasks doesn't get an empty "Improvements" header.
function NavSubGroup({
  title,
  session,
  items,
  children,
}: {
  title: string;
  session: Session | null;
  items: NavItem[];
  children: React.ReactNode;
}) {
  const visible = items.some((item) => {
    if (item.endUserHidden && session?.role === "end_user") return false;
    if (item.adminOnly && session?.role !== "admin") return false;
    return true;
  });
  if (!visible) return null;

  return (
    <div className="pt-2">
      <p
        className="px-3 mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/35"
        data-testid={`nav-subgroup-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      >
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
      data-testid={item.testId ?? `nav-${item.href.replace("/", "") || "home"}`}
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
                {(session.name ?? "").substring(0, 2).toUpperCase()}
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
