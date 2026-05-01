import { useContext } from "react";
import {
  DashboardVisibilityContext,
  type DashboardVisibilityContextValue,
} from "./dashboard-visibility-context";
import { getDashboardSections } from "@/lib/dashboard-sections";

export function useDashboardVisibility(): DashboardVisibilityContextValue {
  const ctx = useContext(DashboardVisibilityContext);
  if (!ctx) {
    throw new Error(
      "useDashboardVisibility must be used inside DashboardVisibilityProvider",
    );
  }
  return ctx;
}

export function useDashboardSections() {
  const { dashboardKey } = useDashboardVisibility();
  return getDashboardSections(dashboardKey);
}
