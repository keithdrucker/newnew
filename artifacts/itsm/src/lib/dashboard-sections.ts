// Section registry for the Customize Dashboard feature. Keys are
// stable identifiers persisted to the database — never change a key
// without writing a migration that rewrites the existing rows.
//
// Locked sections always render and cannot be hidden, even if a stale
// row in the database says otherwise. Optional sections render by
// default and only hide when the org has explicitly opted them out.
//
// Optional sections that exist in the spec but aren't yet rendered by
// any dashboard (e.g. Team Health "AI Impact", Project Execution
// "Time in Phases") are intentionally omitted from this registry —
// they'll be added once their content lands.

export type DashboardKey =
  | "support_performance"
  | "team_health"
  | "operations_overview"
  | "initiative_pipeline"
  | "project_execution";

export interface DashboardSectionDef {
  key: string;
  label: string;
  description: string;
  isLocked: boolean;
}

export interface DashboardDef {
  key: DashboardKey;
  label: string;
  sections: DashboardSectionDef[];
}

const LOCKED_DESC = "Required section — always visible.";

export const DASHBOARDS: Record<DashboardKey, DashboardDef> = {
  support_performance: {
    key: "support_performance",
    label: "Support Performance",
    sections: [
      {
        key: "performance_metrics",
        label: "Performance Metrics",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "workload",
        label: "Workload",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "risk_sla",
        label: "Risk & SLA",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "ticket_analysis",
        label: "Ticket Analysis",
        description:
          "Tickets by priority, opened-vs-resolved trend and top agents.",
        isLocked: false,
      },
      {
        key: "risk_categories",
        label: "Risk & Category Analysis",
        description: "Risk-level bar and category donut.",
        isLocked: false,
      },
      {
        key: "root_cause_resolution",
        label: "Root Cause & Resolution Analysis",
        description: "Distribution of root cause and resolution buckets.",
        isLocked: false,
      },
      {
        key: "ai_impact",
        label: "AI Impact",
        description: "AI-handled volume, deflection and time saved.",
        isLocked: false,
      },
      {
        key: "time_intelligence",
        label: "Time Intelligence",
        description: "Time spent and saved across human + AI handling.",
        isLocked: false,
      },
    ],
  },
  team_health: {
    key: "team_health",
    label: "Team Health",
    sections: [
      {
        key: "executive_summary",
        label: "Executive Summary",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "workload",
        label: "Workload",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "risk",
        label: "Risk",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "delivery",
        label: "Delivery Attention",
        description:
          "Workload-by-team table and the needs-attention queues for overdue ops, at-risk projects and initiatives in review.",
        isLocked: false,
      },
    ],
  },
  operations_overview: {
    key: "operations_overview",
    label: "Operations Overview",
    sections: [
      {
        key: "operations_summary",
        label: "Operations Summary",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "task_workload",
        label: "Task Workload",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "risk_overdue",
        label: "Risk / Overdue Work",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "team_performance",
        label: "Team Performance",
        description: "Completed vs overdue tasks broken down by team.",
        isLocked: false,
      },
    ],
  },
  initiative_pipeline: {
    key: "initiative_pipeline",
    label: "Initiative Pipeline",
    sections: [
      {
        key: "pipeline_summary",
        label: "Pipeline Summary",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "approval_status",
        label: "Approval Status",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "team_breakdown",
        label: "Team Breakdown",
        description: "Initiatives by team and top categories.",
        isLocked: false,
      },
      {
        key: "queue",
        label: "Queue",
        description: "Needs-review queue and recently-decided lists.",
        isLocked: false,
      },
    ],
  },
  project_execution: {
    key: "project_execution",
    label: "Project Execution",
    sections: [
      {
        key: "project_summary",
        label: "Project Summary",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "delivery_status",
        label: "Delivery Status",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "risk_blockers",
        label: "Risk / Blockers",
        description: LOCKED_DESC,
        isLocked: true,
      },
      {
        key: "completion_trend",
        label: "Completion Trend",
        description: "Project completions per week.",
        isLocked: false,
      },
      {
        key: "progress_chart",
        label: "Project Progress",
        description: "Top 8 projects by progress.",
        isLocked: false,
      },
      {
        key: "top_owners",
        label: "Top Owners",
        description: "Active project owners and their workload.",
        isLocked: false,
      },
      {
        key: "team_breakdown",
        label: "Team Breakdown",
        description: "Projects grouped by team and overdue list.",
        isLocked: false,
      },
    ],
  },
};

export function getDashboardSections(
  dashboardKey: DashboardKey,
): DashboardSectionDef[] {
  return DASHBOARDS[dashboardKey].sections;
}

export function getDashboardLabel(dashboardKey: DashboardKey): string {
  return DASHBOARDS[dashboardKey].label;
}

export function getSectionDef(
  dashboardKey: DashboardKey,
  sectionKey: string,
): DashboardSectionDef | undefined {
  return DASHBOARDS[dashboardKey].sections.find((s) => s.key === sectionKey);
}
