import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TeamScopeProvider } from "@/lib/team-scope";
import { AppLayout } from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import ProjectsDashboard from "@/pages/projects-dashboard";
import Tickets from "@/pages/tickets";
import TicketDetail from "@/pages/ticket-detail";
import People from "@/pages/people";
import Assets from "@/pages/assets";
import Applications from "@/pages/applications";
import Vendors from "@/pages/vendors";
import Projects from "@/pages/projects";
import SettingsCategoryPage from "@/pages/settings/category-page";
import SettingsLeafPage from "@/pages/settings/leaf-page";
import SettingsAgentsPage from "@/pages/settings/agents-page";
import SettingsTeamsPage from "@/pages/settings/teams-page";
import SettingsWorkflowsPage from "@/pages/settings/workflows-page";
import SettingsWorkflowEditPage from "@/pages/settings/workflow-edit-page";
import SettingsAutomationPage from "@/pages/settings/automation-page";
import SettingsRiskRulesPage from "@/pages/settings/risk-rules-page";
import TeamPage from "@/pages/settings/team-page";
import TeamWorkTypePage from "@/pages/settings/team-work-type-page";
import {
  KnowledgeBaseList,
  KnowledgeBaseDetail,
} from "@/pages/knowledge-base";
import Timesheet from "@/pages/timesheet";
import OperationalTasks from "@/pages/operational-tasks";
import Initiatives from "@/pages/initiatives";
import Risks from "@/pages/risks";
import ExecutiveDashboard from "@/pages/executive-dashboard";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tickets/dashboard" component={Dashboard} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/dept/:slug" component={Tickets} />
        <Route path="/tickets/:id" component={TicketDetail} />
        <Route path="/people" component={People} />
        <Route path="/agents">
          <Redirect to="/settings/people-access/agents" />
        </Route>
        <Route path="/knowledge-base" component={KnowledgeBaseList} />
        <Route path="/knowledge-base/:id" component={KnowledgeBaseDetail} />
        <Route path="/timesheet" component={Timesheet} />
        <Route path="/assets" component={Assets} />
        <Route path="/applications" component={Applications} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/projects/dashboard" component={ProjectsDashboard} />
        <Route path="/projects/dept/:slug" component={Projects} />
        <Route path="/projects" component={Projects} />
        <Route path="/operational-tasks/dept/:slug" component={OperationalTasks} />
        <Route path="/operational-tasks" component={OperationalTasks} />
        <Route path="/initiatives/dept/:slug" component={Initiatives} />
        <Route path="/initiatives" component={Initiatives} />
        <Route path="/risks" component={Risks} />
        <Route path="/executive-dashboard" component={ExecutiveDashboard} />
        {/* Settings — IA shell. Top-level /settings redirects into the
            first category landing. Specific wired pages have their own
            dedicated routes; everything else falls through to the
            generic leaf-page dispatcher which renders a stub. */}
        <Route path="/settings">
          <Redirect to="/settings/system-defaults" />
        </Route>
        {/* Legacy redirects for routes that moved into the new IA. */}
        <Route path="/settings/agents">
          <Redirect to="/settings/people-access/agents" />
        </Route>
        <Route path="/settings/workflows" component={SettingsWorkflowsPage} />
        <Route path="/settings/workflows/new" component={SettingsWorkflowEditPage} />
        <Route path="/settings/workflows/:id" component={SettingsWorkflowEditPage} />
        <Route path="/settings/risk-rules" component={SettingsRiskRulesPage} />
        <Route path="/settings/boards/:slug">
          {(params) => (
            <Redirect
              to={`/settings/people-access/teams/${(params as { slug: string }).slug}`}
            />
          )}
        </Route>

        {/* People & Access — Teams */}
        <Route
          path="/settings/people-access/teams"
          component={SettingsTeamsPage}
        />
        <Route
          path="/settings/people-access/teams/:slug"
          component={TeamPage}
        />
        <Route
          path="/settings/people-access/teams/:slug/work-types/:workType"
          component={TeamWorkTypePage}
        />

        {/* People & Access — Agents (existing wired page) */}
        <Route
          path="/settings/people-access/agents"
          component={SettingsAgentsPage}
        />

        {/* Service Configuration — wired pages */}
        <Route
          path="/settings/service/workflows"
          component={SettingsWorkflowsPage}
        />
        <Route
          path="/settings/service/workflows/new"
          component={SettingsWorkflowEditPage}
        />
        <Route
          path="/settings/service/workflows/:id"
          component={SettingsWorkflowEditPage}
        />
        <Route
          path="/settings/service/automation"
          component={SettingsAutomationPage}
        />

        {/* Generic leaf-page + category-page dispatchers */}
        <Route
          path="/settings/:category/:page"
          component={SettingsLeafPage}
        />
        <Route
          path="/settings/:category"
          component={SettingsCategoryPage}
        />

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
            <TeamScopeProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </TeamScopeProvider>
          </SessionProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
