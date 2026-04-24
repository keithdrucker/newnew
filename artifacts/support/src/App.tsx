import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import {
  PortalSessionProvider,
  usePortalSession,
} from "@/components/providers/portal-session-provider";
import { PortalShell } from "@/components/portal-shell";
import SignInPage from "@/pages/sign-in";
import TicketsListPage from "@/pages/tickets-list";
import ChatThreadPage from "@/pages/chat-thread";
import NewConversationPage from "@/pages/new-conversation";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 10,
      retry: 1,
    },
  },
});

function PortalLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Signing you in…
      </div>
    </div>
  );
}

function ChatThreadRoute({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const id = Number(params.id);
  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) navigate("/", { replace: true });
  }, [id, navigate]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return <ChatThreadPage ticketId={id} />;
}

function AuthedRoutes() {
  return (
    <PortalShell>
      <Switch>
        <Route path="/" component={TicketsListPage} />
        <Route path="/new" component={NewConversationPage} />
        <Route path="/tickets/:id">
          {(params) => <ChatThreadRoute params={params} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </PortalShell>
  );
}

function PortalGate() {
  const { session, isLoading } = usePortalSession();
  if (isLoading) return <PortalLoader />;
  if (!session) return <SignInPage />;
  return <AuthedRoutes />;
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PortalSessionProvider>
          <TooltipProvider>
            <WouterRouter base={base}>
              <PortalGate />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </PortalSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
