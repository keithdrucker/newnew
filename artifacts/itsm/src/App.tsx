import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppLayout } from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Tickets from "@/pages/tickets";
import TicketDetail from "@/pages/ticket-detail";
import People from "@/pages/people";
import Agents from "@/pages/agents";
import Assets from "@/pages/assets";
import Settings from "@/pages/settings";
import BoardSettings from "@/pages/board-settings";
import {
  KnowledgeBaseList,
  KnowledgeBaseDetail,
} from "@/pages/knowledge-base";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/dept/:slug" component={Tickets} />
        <Route path="/tickets/:id" component={TicketDetail} />
        <Route path="/people" component={People} />
        <Route path="/agents" component={Agents} />
        <Route path="/knowledge-base" component={KnowledgeBaseList} />
        <Route path="/knowledge-base/:id" component={KnowledgeBaseDetail} />
        <Route path="/assets" component={Assets} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings/boards/:slug" component={BoardSettings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SessionProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </SessionProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
