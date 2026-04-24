import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Ticket,
  BookOpen,
  MonitorPlay,
  UserRound,
  Settings,
  ChevronsUpDown,
  Search,
} from "lucide-react";
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

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    matchPrefix: "/tickets",
  },
  {
    href: "/knowledge-base",
    label: "Knowledge",
    icon: BookOpen,
    matchPrefix: "/knowledge-base",
  },
  { href: "/assets", label: "Assets", icon: MonitorPlay, adminOnly: true },
  { href: "/people", label: "People", icon: UserRound, adminOnly: true },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    adminOnly: true,
    matchPrefix: "/settings",
  },
];

export function TopBar({ session }: { session: Session | null }) {
  const [location] = useLocation();
  const isActive = (href: string, prefix?: string) =>
    prefix ? location.startsWith(prefix) : location === href;

  return (
    <header
      className="h-16 shrink-0 bg-sidebar text-sidebar-foreground border-b border-sidebar-border/40 flex items-center px-5 gap-6"
      data-testid="top-bar"
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 shrink-0"
        data-testid="brand-mark"
      >
        <div className="h-9 w-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-[13px] shadow-md ring-1 ring-white/10">
          EW
        </div>
        <div className="leading-tight">
          <p className="font-display font-semibold text-[15px] tracking-tight text-white">
            Service Hub
          </p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/60">
            EW Howell
          </p>
        </div>
      </Link>

      <nav
        className="flex items-center gap-0.5 ml-2"
        data-testid="primary-nav"
      >
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && session?.role !== "admin") return null;
          const Icon = item.icon;
          const active = isActive(item.href, item.matchPrefix);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href.replace("/", "") || "home"}`}
              className={cn(
                "relative flex items-center gap-2 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-sidebar-foreground/75 hover:text-white hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {active && (
                <span className="absolute -bottom-[17px] left-3 right-3 h-0.5 bg-sidebar-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-md border border-white/10 bg-white/5 text-[12px] text-sidebar-foreground/70 hover:bg-white/10 hover:text-white transition-colors"
          data-testid="button-search"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <span className="ml-2 text-[10px] text-sidebar-foreground/50 border border-white/10 rounded px-1 py-0.5 font-mono">
            ⌘K
          </span>
        </button>
        {session && <UserSwitcher session={session} />}
      </div>
    </header>
  );
}

function UserSwitcher({ session }: { session: Session }) {
  const { data: agents } = useListAgents({});
  const { data: people } = useListPeople({});
  const switchSession = useSwitchSession();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-white/10 transition-colors"
          data-testid="button-role-switcher"
          aria-label="Switch user"
        >
          <Avatar className="h-7 w-7 ring-1 ring-white/15">
            <AvatarFallback className="bg-sidebar-accent text-white text-[10px] font-semibold">
              {session.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block text-left leading-tight">
            <p className="text-[12px] font-medium text-white">{session.name}</p>
            <p className="text-[10px] text-sidebar-foreground/60 capitalize">
              {session.role}
              {session.departmentName ? ` · ${session.departmentName}` : ""}
            </p>
          </div>
          <ChevronsUpDown className="h-3 w-3 text-sidebar-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 mr-2 mt-1" align="end">
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
  );
}
