import { Link } from "wouter";
import { LifeBuoy, LogOut, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/components/providers/theme-provider";
import { usePortalSession } from "@/components/providers/portal-session-provider";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, signOut } = usePortalSession();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 sm:px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 group no-underline text-foreground"
            data-testid="link-portal-home"
          >
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground">
              <LifeBuoy className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight">
                Harmony Support
              </span>
              <span className="text-[11px] text-muted-foreground -mt-0.5">
                We&apos;re here to help
              </span>
            </span>
          </Link>
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 px-2"
                  data-testid="button-account-menu"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[11px] bg-secondary text-secondary-foreground">
                      {initials(session.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium">
                    {session.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{session.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {session.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground uppercase tracking-wide">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setTheme("light")}
                  data-testid="menu-theme-light"
                >
                  <Sun className="h-4 w-4 mr-2" />
                  Light
                  {theme === "light" ? (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      ✓
                    </span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("dark")}
                  data-testid="menu-theme-dark"
                >
                  <Moon className="h-4 w-4 mr-2" />
                  Dark
                  {theme === "dark" ? (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      ✓
                    </span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("system")}
                  data-testid="menu-theme-system"
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  System
                  {theme === "system" ? (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      ✓
                    </span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  data-testid="menu-sign-out"
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6">
        {children}
      </main>
    </div>
  );
}
