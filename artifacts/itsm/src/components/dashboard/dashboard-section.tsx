import type { ReactNode } from "react";
import { useDashboardVisibility } from "./use-dashboard-visibility";

interface DashboardSectionProps {
  sectionKey: string;
  children: ReactNode;
}

// Render gate for an individual dashboard section. Returns null when
// the org has hidden the section (locked sections always render).
//
// Layout note: gaps in the parent flex/grid container collapse
// naturally when this returns null, so callers don't need to do
// anything special — `space-y-*` walls and `grid` rows simply skip
// the missing child.
export function DashboardSection({
  sectionKey,
  children,
}: DashboardSectionProps) {
  const { isVisible } = useDashboardVisibility();
  if (!isVisible(sectionKey)) return null;
  return <>{children}</>;
}
