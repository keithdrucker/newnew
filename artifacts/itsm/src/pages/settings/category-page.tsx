import { Link, useParams } from "wouter";
import { ArrowRight, Construction } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsLayout } from "@/components/settings/settings-layout";
import {
  findCategory,
  type SettingsPageDef,
} from "@/components/settings/settings-catalog";

// Per-category landing page. Renders the category description and a
// card for every leaf page underneath it. Cards link directly to the
// leaf and visually flag pages that are stubs vs. fully wired.
export default function SettingsCategoryPage() {
  const params = useParams<{ category: string }>();
  const cat = findCategory(params.category);

  if (!cat) {
    return (
      <SettingsLayout>
        <div className="p-6">
          <h1 className="text-xl font-semibold">Section not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The settings section{" "}
            <span className="font-mono">{params.category}</span> does not exist.
          </p>
        </div>
      </SettingsLayout>
    );
  }
  const Icon = cat.icon;

  return (
    <SettingsLayout activeCategorySlug={cat.slug}>
      <div className="p-6 max-w-5xl space-y-5" data-testid="settings-category">
        <header className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-muted text-foreground/80 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {cat.label}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {cat.description}
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cat.pages.map((p) => (
            <PageCard key={p.slug} page={p} />
          ))}
        </div>
      </div>
    </SettingsLayout>
  );
}

function PageCard({ page }: { page: SettingsPageDef }) {
  const Icon = page.icon;
  return (
    <Link href={page.href}>
      <Card
        className="hover:border-primary/40 hover:bg-muted/40 transition-colors cursor-pointer"
        data-testid={`settings-card-${page.slug}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{page.label}</CardTitle>
            {!page.implemented && (
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Construction className="h-3 w-3" />
                Soon
              </span>
            )}
          </div>
          <CardDescription>{page.description}</CardDescription>
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
