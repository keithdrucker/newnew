import { useParams } from "wouter";
import { Sun, Moon, Monitor } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { SettingsStub } from "@/components/settings/settings-stub";
import { findPage } from "@/components/settings/settings-catalog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme, type Theme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

// Generic leaf-page dispatcher. For pages that don't have a custom
// implementation yet, render a SettingsStub. For the small handful of
// leaves that DO have wired content (currently only Appearance), match
// on (category, slug) and render the real component.
//
// Wired leaves get their own dedicated routes in App.tsx (Agents,
// Workflows, Teams, Risk Rules under Automation) so they're not
// dispatched here — only the ones that have a small inline body live
// in this file.
export default function SettingsLeafPage() {
  const params = useParams<{ category: string; page: string }>();
  const found = findPage(params.category, params.page);

  if (!found) {
    return (
      <SettingsLayout>
        <div className="p-6">
          <h1 className="text-xl font-semibold">Settings page not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono">
              /settings/{params.category}/{params.page}
            </span>{" "}
            does not exist.
          </p>
        </div>
      </SettingsLayout>
    );
  }
  const { category, page } = found;

  // Inline-wired leaves
  if (category.slug === "system-defaults" && page.slug === "appearance") {
    return (
      <SettingsLayout
        activeCategorySlug={category.slug}
        activePageSlug={page.slug}
      >
        <div className="p-6 max-w-3xl space-y-4" data-testid="settings-appearance">
          <header className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-md bg-muted text-foreground/80 flex items-center justify-center shrink-0">
              <page.icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {page.label}
              </h1>
              <p className="text-sm text-muted-foreground">
                {page.description}
              </p>
            </div>
          </header>
          <AppearanceCard />
        </div>
      </SettingsLayout>
    );
  }

  // Default: stub
  return (
    <SettingsLayout
      activeCategorySlug={category.slug}
      activePageSlug={page.slug}
    >
      <SettingsStub
        title={page.label}
        description={page.description}
        icon={page.icon}
        testId={`settings-stub-${category.slug}-${page.slug}`}
      />
    </SettingsLayout>
  );
}

function AppearanceCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <Card data-testid="card-appearance">
      <CardHeader>
        <CardTitle className="text-base">Theme</CardTitle>
        <CardDescription>
          Choose how Sidekick looks to you. System matches your device
          preference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-3 max-w-xl"
        >
          {options.map((opt) => {
            const active = theme === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.value)}
                data-testid={`button-theme-${opt.value}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border p-4 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  active
                    ? "border-primary ring-2 ring-primary/40 bg-accent text-accent-foreground"
                    : "border-border",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Currently using <span className="font-medium">{resolvedTheme}</span>{" "}
          mode.
        </p>
      </CardContent>
    </Card>
  );
}
