import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Ticket,
  BookOpen,
  MonitorPlay,
  Users,
  UserRound,
  Settings,
  ChevronsUpDown,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
  adminOnly?: boolean;
};

const ITEMS: Item[] = [
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

export function IconRail({ session }: { session: Session | null }) {
  const [location] = useLocation();
  const isActive = (href: string, prefix?: string) =>
    prefix ? location.startsWith(prefix) : location === href;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="w-[68px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col items-center py-3 gap-1"
        data-testid="icon-rail"
      >
        <Link href="/" data-testid="brand-mark">
          <div className="h-11 w-11 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-[15px] shadow-md ring-1 ring-white/10 mb-3">
            EW
          </div>
        </Link>

        <nav className="flex-1 flex flex-col items-center gap-1">
          {ITEMS.map((item) => {
            if (item.adminOnly && session?.role !== "admin") return null;
            const Icon = item.icon;
            const active = isActive(item.href, item.matchPrefix);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    data-testid={`rail-${item.href.replace("/", "") || "home"}`}
                    className={cn(
                      "relative h-11 w-11 rounded-lg flex items-center justify-center transition-colors group",
                      active
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                    )}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-sidebar-primary" />
                    )}
                    <Icon className="h-[18px] w-[18px]" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {session && <UserSwitcher session={session} />}
      </aside>
    </TooltipProvider>
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
          className="mt-2 h-11 w-11 rounded-lg flex items-center justify-center hover:bg-sidebar-accent/60 transition-colors"
          data-testid="button-role-switcher"
          aria-label="Switch user"
        >
          <Avatar className="h-8 w-8 ring-1 ring-white/15">
            <AvatarFallback className="bg-sidebar-accent text-white text-[11px] font-semibold">
              {session.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 ml-2 mb-2"
        side="right"
        align="end"
      >
        <div className="px-3 py-2 border-b">
          <p className="text-[13px] font-medium leading-tight">{session.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5 inline-flex items-center gap-1">
            {session.role}
            {session.departmentName ? ` · ${session.departmentName}` : ""}
            <ChevronsUpDown className="h-3 w-3" />
          </p>
        </div>
        <Command>
          <CommandInput placeholder="Switch demo user..." className="h-9 text-sm" />
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
