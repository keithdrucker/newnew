import { ReactNode } from "react";
import { useLocation } from "wouter";
import { TopBar } from "./top-bar";
import { TicketsStrip } from "./tickets-strip";
import { useSession } from "@/components/providers/session-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLayout({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  const [location] = useLocation();
  const showTicketsStrip =
    location === "/tickets" || location.startsWith("/tickets/dept/");

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar session={session} />
      {showTicketsStrip && <TicketsStrip />}
      <main className="flex-1 overflow-auto p-6 bg-muted/40">{children}</main>
    </div>
  );
}
