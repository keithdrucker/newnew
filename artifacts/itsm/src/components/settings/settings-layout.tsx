import { Link, useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";
import { SETTINGS_CATEGORIES } from "./settings-catalog";

// Shared shell for every page under /settings/*. Renders a left rail
// with the 6 IA categories (each expandable to its leaf pages) and
// puts the page content on the right. Role-aware: Security &
// Governance is admin-only, but the entire Settings area is admin-only
// today so this is mostly forward-looking.
type SettingsLayoutProps = {
  children: React.ReactNode;
  // Used to highlight the active item even on routes whose URL doesn't
  // exactly match a leaf — e.g. team subpages under People & Access.
  activeCategorySlug?: string;
  activePageSlug?: string;
};

export function SettingsLayout({
  children,
  activeCategorySlug,
  activePageSlug,
}: SettingsLayoutProps) {
  const [location] = useLocation();
  const { session } = useSession();
  const isAdmin = session?.role === "admin";

  const categories = SETTINGS_CATEGORIES.filter(
    (c) => !c.adminOnly || isAdmin,
  );

  // Auto-expand the active category — others stay collapsed so the
  // rail doesn't dwarf the page content.
  function inferActiveCategory(): string | null {
    if (activeCategorySlug) return activeCategorySlug;
    for (const cat of categories) {
      if (location.startsWith(`/settings/${cat.slug}`)) return cat.slug;
      if (cat.pages.some((p) => location === p.href)) return cat.slug;
    }
    return null;
  }
  const activeCat = inferActiveCategory();

  function isPageActive(href: string, slug: string): boolean {
    if (activePageSlug && slug === activePageSlug) return true;
    return location === href || location.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-[calc(100vh-1px)]" data-testid="settings-layout">
      <aside
        className="w-64 shrink-0 border-r bg-muted/20"
        data-testid="settings-left-rail"
      >
        <div className="px-4 pt-5 pb-3">
          <Link
            href="/settings"
            className="text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Settings
          </Link>
          <div className="text-base font-semibold mt-0.5">Configure</div>
        </div>
        <nav className="px-2 pb-6 space-y-1.5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isOpen = activeCat === cat.slug;
            return (
              <div key={cat.slug}>
                <Link
                  href={`/settings/${cat.slug}`}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/60",
                    isOpen
                      ? "bg-muted/70 text-foreground font-medium"
                      : "text-foreground/80",
                  )}
                  data-testid={`settings-cat-${cat.slug}`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="flex-1">{cat.label}</span>
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform",
                      isOpen ? "rotate-90" : "",
                    )}
                  />
                </Link>
                {isOpen && (
                  <div
                    className="mt-0.5 ml-4 border-l pl-2 space-y-0.5"
                    data-testid={`settings-cat-pages-${cat.slug}`}
                  >
                    {cat.pages.map((p) => {
                      const active = isPageActive(p.href, p.slug);
                      return (
                        <Link
                          key={p.slug}
                          href={p.href}
                          className={cn(
                            "block px-2 py-1 rounded text-[13px] hover:bg-muted/60",
                            active
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground/75",
                          )}
                          data-testid={`settings-page-${cat.slug}-${p.slug}`}
                        >
                          {p.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
