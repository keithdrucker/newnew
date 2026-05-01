import {
  Ticket,
  ClipboardList,
  Lightbulb,
  FolderKanban,
  Timer,
  type LucideIcon,
} from "lucide-react";

// Five canonical work types a team can opt into. Order here drives
// the order they're rendered in the per-team Work Types page and the
// per-team-work-type management page sub-nav.
//
// The string key is what the database/API persists, so keep these in
// sync with TeamWorkTypeKey on the API side.
export type WorkTypeKey =
  | "tickets"
  | "operational_tasks"
  | "initiatives"
  | "projects"
  | "timesheets";

export type WorkTypeDef = {
  key: WorkTypeKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const WORK_TYPES: WorkTypeDef[] = [
  {
    key: "tickets",
    label: "Tickets",
    description:
      "Reactive incidents and requests routed to this team's ticket board.",
    icon: Ticket,
  },
  {
    key: "operational_tasks",
    label: "Operational Tasks",
    description: "Recurring day-to-day work items handled by this team.",
    icon: ClipboardList,
  },
  {
    key: "initiatives",
    label: "Initiatives",
    description: "Ideas and proposals owned by this team.",
    icon: Lightbulb,
  },
  {
    key: "projects",
    label: "Projects",
    description:
      "Approved improvement work assigned to this team's project board.",
    icon: FolderKanban,
  },
  {
    key: "timesheets",
    label: "Timesheets",
    description:
      "Per-agent time entries logged against the team's other work types.",
    icon: Timer,
  },
];

export function findWorkType(key: string): WorkTypeDef | undefined {
  return WORK_TYPES.find((w) => w.key === key);
}

// Per-work-type management section list. Used by the Manage {WorkType}
// page's left sub-nav. Each section either has a real wired body
// (Tickets currently) or renders a section-level "Coming soon" stub.
export type SectionDef = {
  slug: string;
  label: string;
  // Optional helper line shown under the section title.
  hint?: string;
};

export const WORK_TYPE_SECTIONS: Record<WorkTypeKey, SectionDef[]> = {
  tickets: [
    { slug: "overview", label: "Overview" },
    { slug: "members", label: "Members & Teams" },
    { slug: "slas", label: "SLAs & Targets" },
    { slug: "notifications", label: "Notifications" },
    { slug: "automation", label: "Automation" },
    { slug: "categories", label: "Categories & Tags" },
    { slug: "requirements", label: "Requirements" },
    { slug: "visibility", label: "Visibility & Reporting" },
  ],
  operational_tasks: [
    { slug: "overview", label: "Overview" },
    { slug: "members", label: "Members & Teams" },
    { slug: "notifications", label: "Notifications" },
    { slug: "automation", label: "Automation" },
    { slug: "categories", label: "Categories & Tags" },
    { slug: "requirements", label: "Requirements" },
    { slug: "reporting", label: "Reporting" },
  ],
  initiatives: [
    { slug: "overview", label: "Overview" },
    { slug: "members", label: "Members & Teams" },
    {
      slug: "approvals",
      label: "Approval Rules",
      hint: "Uses the team's manager(s) by default.",
    },
    { slug: "notifications", label: "Notifications" },
    { slug: "automation", label: "Automation" },
    { slug: "categories", label: "Categories & Tags" },
    { slug: "requirements", label: "Requirements" },
    { slug: "reporting", label: "Reporting" },
  ],
  projects: [
    { slug: "overview", label: "Overview" },
    { slug: "members", label: "Members & Teams" },
    { slug: "milestones", label: "Milestones & Status Rules" },
    {
      slug: "approvals",
      label: "Approval Rules",
      hint: "Uses the team's manager(s) by default.",
    },
    { slug: "notifications", label: "Notifications" },
    { slug: "automation", label: "Automation" },
    { slug: "categories", label: "Categories & Tags" },
    { slug: "requirements", label: "Requirements" },
    { slug: "reporting", label: "Reporting" },
  ],
  timesheets: [
    { slug: "overview", label: "Overview" },
    { slug: "who-logs", label: "Who Logs Time" },
    { slug: "entry-rules", label: "Time Entry Rules" },
    {
      slug: "where",
      label: "Where Time Can Be Logged",
      hint: "Tickets, Operational Tasks, Projects, and Initiatives.",
    },
    { slug: "visibility", label: "Visibility & Reporting" },
  ],
};
