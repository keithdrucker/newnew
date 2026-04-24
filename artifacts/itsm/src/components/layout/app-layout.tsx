import { ReactNode } from "react";
import { IconRail } from "./icon-rail";
import { ContextPanel } from "./context-panel";
import { useSession } from "@/components/providers/session-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLayout({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <IconRail session={session} />
      <ContextPanel session={session} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6 bg-muted/40">
          {children}
        </main>
      </div>
    </div>
  );
}
