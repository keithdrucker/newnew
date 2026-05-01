import { Link } from "wouter";
import { Bot, GitBranch, ShieldAlert, ArrowRight } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Automation Rules landing page. Today this is a hub that points at
// the two existing automation surfaces — Global Workflows and Risk
// Rules — so they keep working under their existing routes while
// living in the right place in the IA. New rule types (e.g. ticket
// routing, intake auto-tagging) will be added here over time.
export default function SettingsAutomationPage() {
  return (
    <SettingsLayout activeCategorySlug="service" activePageSlug="automation">
      <div
        className="p-6 max-w-4xl space-y-4"
        data-testid="settings-automation"
      >
        <header className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-muted text-foreground/80 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Automation Rules
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Trigger-based rules that classify, route, and act on work as it
              moves through the system. Defines what is possible — teams opt
              in by configuring their own work types.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AutomationCard
            href="/settings/service/workflows"
            icon={GitBranch}
            title="Global Workflows"
            description="Multi-step approval workflows reusable across teams and modules."
            testId="automation-card-workflows"
          />
          <AutomationCard
            href="/settings/risk-rules"
            icon={ShieldAlert}
            title="Risk Rules"
            description="Map ticket categories to a default risk level when tickets are created."
            testId="automation-card-risk-rules"
          />
        </div>
      </div>
    </SettingsLayout>
  );
}

function AutomationCard({
  href,
  icon: Icon,
  title,
  description,
  testId,
}: {
  href: string;
  icon: typeof GitBranch;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <Link href={href}>
      <Card
        className="hover:border-primary/40 hover:bg-muted/40 transition-colors cursor-pointer"
        data-testid={testId}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="inline-flex items-center text-xs text-muted-foreground gap-1">
            Open <ArrowRight className="h-3 w-3" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
