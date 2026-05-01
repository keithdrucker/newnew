import { useMemo, type ReactNode } from "react";
import { useListDashboardVisibility } from "@workspace/api-client-react";
import {
  type DashboardKey,
  getSectionDef,
} from "@/lib/dashboard-sections";
import {
  DashboardVisibilityContext,
  type DashboardVisibilityContextValue,
} from "./dashboard-visibility-context";

interface ProviderProps {
  dashboardKey: DashboardKey;
  children: ReactNode;
}

// Wraps a dashboard with the resolved set of section visibility flags.
// Locked sections always evaluate visible regardless of any stored
// override — that lets us safely ignore obsolete rows from earlier
// installs where a section might have been optional.
export function DashboardVisibilityProvider({
  dashboardKey,
  children,
}: ProviderProps) {
  const { data, isLoading } = useListDashboardVisibility();

  const value = useMemo<DashboardVisibilityContextValue>(() => {
    // Build a lookup keyed by sectionKey for the current dashboard
    // only. Other dashboards' rows are intentionally ignored so a
    // collision on a shared key (e.g. "workload" appears in multiple
    // dashboards) cannot bleed across views.
    const lookup = new Map<string, boolean>();
    for (const row of data?.items ?? []) {
      if (row.dashboardKey === dashboardKey) {
        lookup.set(row.sectionKey, row.isVisible);
      }
    }
    return {
      dashboardKey,
      isLoading,
      isVisible: (sectionKey: string) => {
        const def = getSectionDef(dashboardKey, sectionKey);
        // Unknown keys default to visible — better to over-show than
        // hide content that no longer has a registry entry.
        if (!def) return true;
        if (def.isLocked) return true;
        const stored = lookup.get(sectionKey);
        return stored ?? true;
      },
    };
  }, [data, dashboardKey, isLoading]);

  return (
    <DashboardVisibilityContext.Provider value={value}>
      {children}
    </DashboardVisibilityContext.Provider>
  );
}
