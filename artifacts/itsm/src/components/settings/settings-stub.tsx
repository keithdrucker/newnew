import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

// Reusable "scaffold-only, not implemented yet" page used wherever the
// IA defines a Settings leaf that doesn't have a backing feature today.
// Renders a clean header + an honest "Coming soon" body so users
// understand the structure without being misled into thinking the
// feature works.
type SettingsStubProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  testId?: string;
  body?: React.ReactNode;
};

export function SettingsStub({
  title,
  description,
  icon: Icon,
  testId,
  body,
}: SettingsStubProps) {
  return (
    <div className="p-6 space-y-4 max-w-4xl" data-testid={testId}>
      <header className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-muted text-foreground/80 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {description}
          </p>
        </div>
      </header>
      {body ?? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <Construction className="h-10 w-10 opacity-60" />
            <div className="text-sm font-medium">Coming soon</div>
            <div className="text-xs max-w-md">
              This section's location in the Settings hierarchy is reserved.
              Configuration options will appear here as the feature is
              implemented.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
