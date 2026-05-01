import { createContext } from "react";
import type { DashboardKey } from "@/lib/dashboard-sections";

export interface DashboardVisibilityContextValue {
  dashboardKey: DashboardKey;
  isVisible: (sectionKey: string) => boolean;
  isLoading: boolean;
}

export const DashboardVisibilityContext =
  createContext<DashboardVisibilityContextValue | null>(null);
