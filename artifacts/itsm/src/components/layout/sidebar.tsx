import { Link, useLocation, useRoute } from "wouter";
import {
  LayoutDashboard,
  Ticket,
  Users,
  BookOpen,
  MonitorPlay,
  Settings,
  ChevronsUpDown,
  ChevronRight,
  Check,
  Laptop,
  ShieldCheck,
  HardHat,
  Banknote,
  Umbrella,
  Scale,
  Building2,
  Megaphone,
  ClipboardCheck,
  HardDrive,
  Lock,
  Briefcase,
  Layers,
} from "lucide-react";
import {
  Session,
  useListDepartments,
  useSwitchSession,
  useListAgents,
  useListPeople,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Laptop,
  ShieldCheck,
  HardHat,
  Banknote,
  Users,
  Umbrella,
  Scale,
  Building2,
  Megaphone,
  ClipboardCheck,
  HardDrive,
  Lock,
  Briefcase,
  Layers,
};

export function Sidebar({ session }: { session: Session | null }) {
  const [location] = useLocation();
  const [, deptParams] = useRoute("/tickets/dept/:slug");
  const activeDeptSlug = deptParams?.slug ?? null;

  const { data: departments } = useListDepartments();
  const switchSessionMutation = useSwitchSession();
  const { data: agents } = useListAgents({});
  const { data: people } = useListPeople({});

  const [boardOpen, setBoardOpen] = useState(true);

  const navItems: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    matchPrefix?: string;
  }> = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/agents", label: "Agents", icon: Users, adminOnly: true },
    { href: "/people", label: "People", icon: Users, adminOnly: true },
    {
      href: "/knowledge-base",
      label: "Knowledge Base",
      icon: BookOpen,
      matchPrefix: "/knowledge-base",
    },
    { href: "/assets", label: "Assets", icon: MonitorPlay, adminOnly: true },
    { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
  ];

  const isActive = (href: string, prefix?: string) =>
    prefix ? location.startsWith(prefix) : location === href;

  return (
    <div className="w-[260px] border-r bg-sidebar flex flex-col h-full shrink-0">
      <div className="p-4 flex flex-col gap-1 border-b">
        <h1 className="font-semibold text-base tracking-tight leading-none text-foreground">
          EW Howell
        </h1>
        <p className="text-[13px] text-muted-foreground leading-none mt-1">
          Service Hub
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 flex flex-col min-h-0">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-colors hover:bg-slate-100 hover:text-foreground",
            location === "/" ? "bg-slate-100 text-foreground" : "text-slate-600",
          )}
          data-testid="nav-dashboard"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        {navItems.slice(1).map((item) => {
          if (item.adminOnly && session?.role !== "admin") return null;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-colors hover:bg-slate-100 hover:text-foreground",
                isActive(item.href, item.matchPrefix)
                  ? "bg-slate-100 text-foreground"
                  : "text-slate-600",
              )}
              data-testid={`nav-${item.href.replace("/", "") || "home"}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-2 mt-1 border-t" />

        <Collapsible
          open={boardOpen}
          onOpenChange={setBoardOpen}
          className="flex flex-col min-h-0"
        >
          <CollapsibleTrigger
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-colors hover:bg-slate-100 hover:text-foreground",
              location === "/tickets" || location.startsWith("/tickets/dept/")
                ? "bg-slate-100 text-foreground"
                : "text-slate-600",
            )}
            data-testid="trigger-ticket-board"
          >
            <Ticket className="h-4 w-4" />
            <span>Ticket Board</span>
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 transition-transform",
                boardOpen && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 overflow-y-auto">
            <Link
              href="/tickets"
              className={cn(
                "flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-[13px] transition-colors hover:bg-slate-100",
                location === "/tickets"
                  ? "bg-slate-100 text-foreground font-medium"
                  : "text-slate-600",
              )}
              data-testid="link-tickets-all"
            >
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              All Tickets
            </Link>
            {departments?.map((dept) => {
              const Icon = ICON_MAP[dept.icon] ?? Layers;
              const active = activeDeptSlug === dept.slug;
              return (
                <Link
                  key={dept.id}
                  href={`/tickets/dept/${dept.slug}`}
                  className={cn(
                    "flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-[13px] transition-colors hover:bg-slate-100",
                    active
                      ? "bg-slate-100 text-foreground font-medium"
                      : "text-slate-600",
                  )}
                  data-testid={`link-dept-${dept.slug}`}
                >
                  <span
                    className="inline-flex items-center justify-center"
                    style={{ color: dept.color }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{dept.name}</span>
                  {dept.ticketCount > 0 && (
                    <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
                      {dept.ticketCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {session && (
        <div className="p-3 border-t">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-3 cursor-pointer hover:bg-slate-100 p-2 rounded-md transition-colors text-left"
                data-testid="button-role-switcher"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-medium">
                    {session.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden text-[13px]">
                  <p className="font-medium truncate text-foreground">
                    {session.name}
                  </p>
                  <p className="text-slate-500 truncate text-[11px] capitalize">
                    {session.role}
                    {session.departmentName ? ` · ${session.departmentName}` : ""}
                  </p>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0 ml-3 mb-2"
              side="top"
              align="start"
            >
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
                          switchSessionMutation.mutate(
                            { data: { userId: agent.id } },
                            { onSuccess: () => window.location.reload() },
                          );
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            session.userId === agent.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span>
                            {agent.name}{" "}
                            <span className="text-xs text-slate-500">
                              · {agent.role}
                            </span>
                          </span>
                          {agent.departmentName && (
                            <span className="text-[11px] text-slate-500">
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
                          switchSessionMutation.mutate(
                            { data: { userId: person.id } },
                            { onSuccess: () => window.location.reload() },
                          );
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            session.userId === person.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{person.name}</span>
                          {person.departmentName && (
                            <span className="text-[11px] text-slate-500">
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
      )}
    </div>
  );
}
