// Workflow option lists. Centralised here so the list page, the edit
// page, and the initiative integration can all share the same labels.

export type ModuleKey =
  | "tickets"
  | "initiatives"
  | "projects"
  | "changes"
  | "risks";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  tickets: "Tickets",
  initiatives: "Initiatives",
  projects: "Projects",
  changes: "Changes",
  risks: "Risks",
};

export const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  approval: "Approval",
  routing: "Routing",
  escalation: "Escalation",
  notification: "Notification",
  status_change: "Status change",
  auto_assignment: "Auto-assignment",
};

export const WORKFLOW_TYPES = Object.keys(
  WORKFLOW_TYPE_LABELS,
) as (keyof typeof WORKFLOW_TYPE_LABELS)[];

// Module-specific triggers.
export const TRIGGERS_BY_MODULE: Record<
  ModuleKey,
  { value: string; label: string }[]
> = {
  tickets: [
    { value: "ticket_created", label: "Ticket is created" },
    { value: "ticket_status_changed", label: "Ticket status changes" },
    { value: "ticket_priority_changed", label: "Ticket priority changes" },
    { value: "ticket_assigned", label: "Ticket is assigned" },
    { value: "ticket_sla_breached", label: "SLA is breached" },
    { value: "ticket_comment_added", label: "Comment is added" },
  ],
  initiatives: [
    { value: "initiative_submitted", label: "Initiative is submitted" },
    { value: "initiative_under_review", label: "Initiative moves to Under Review" },
    { value: "initiative_status_changed", label: "Initiative status changes" },
    { value: "initiative_approval_started", label: "Approval workflow started manually" },
  ],
  projects: [
    { value: "project_created", label: "Project is created" },
    { value: "project_status_changed", label: "Project status changes" },
    { value: "project_overdue", label: "Project is overdue" },
  ],
  changes: [
    { value: "change_submitted", label: "Change request submitted" },
    { value: "change_status_changed", label: "Change status changes" },
  ],
  risks: [
    { value: "risk_logged", label: "Risk is logged" },
    { value: "risk_level_changed", label: "Risk level changes" },
  ],
};

// Flatten triggers so the list page can label any trigger by value.
export const TRIGGER_LABELS: Record<string, string> = Object.values(
  TRIGGERS_BY_MODULE,
).reduce<Record<string, string>>((acc, list) => {
  for (const t of list) acc[t.value] = t.label;
  return acc;
}, {});

// Module-specific condition fields. Each field describes the operand
// type so the edit UI can render the right input control.
export type ConditionFieldDef = {
  value: string;
  label: string;
  // Drives the value editor. "select" expects a `choices` list.
  kind: "string" | "number" | "select";
  choices?: { value: string; label: string }[];
};

const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"];
const TICKET_STATUSES = [
  "new",
  "in_progress",
  "with_user",
  "with_vendor",
  "on_hold",
  "scheduled",
  "resolved",
  "closed",
];
const INITIATIVE_LOW_MED_HIGH = ["low", "medium", "high"];

export const CONDITION_FIELDS_BY_MODULE: Record<
  ModuleKey,
  ConditionFieldDef[]
> = {
  tickets: [
    {
      value: "priority",
      label: "Priority",
      kind: "select",
      choices: TICKET_PRIORITIES.map((p) => ({ value: p, label: p })),
    },
    {
      value: "status",
      label: "Status",
      kind: "select",
      choices: TICKET_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    },
    { value: "category", label: "Category", kind: "string" },
    { value: "departmentId", label: "Department", kind: "number" },
    { value: "isVip", label: "VIP requester", kind: "select", choices: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ] },
  ],
  initiatives: [
    { value: "category", label: "Category", kind: "string" },
    {
      value: "initialPriority",
      label: "Initial priority",
      kind: "select",
      choices: INITIATIVE_LOW_MED_HIGH.map((v) => ({ value: v, label: v })),
    },
    {
      value: "businessAlignment",
      label: "Business alignment",
      kind: "select",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unsure", label: "Unsure" },
      ],
    },
    {
      value: "businessValueLevel",
      label: "Business value",
      kind: "select",
      choices: INITIATIVE_LOW_MED_HIGH.map((v) => ({ value: v, label: v })),
    },
    {
      value: "costLevel",
      label: "Cost level",
      kind: "select",
      choices: [...INITIATIVE_LOW_MED_HIGH, "unknown"].map((v) => ({
        value: v,
        label: v,
      })),
    },
    {
      value: "riskLevel",
      label: "Risk level",
      kind: "select",
      choices: INITIATIVE_LOW_MED_HIGH.map((v) => ({ value: v, label: v })),
    },
  ],
  projects: [
    { value: "status", label: "Status", kind: "string" },
    { value: "departmentId", label: "Department", kind: "number" },
  ],
  changes: [
    { value: "riskLevel", label: "Risk level", kind: "string" },
  ],
  risks: [
    { value: "level", label: "Risk level", kind: "string" },
  ],
};

export const CONDITION_OPS: { value: string; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is not one of" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

export type ActionDef = {
  value: string;
  label: string;
  description: string;
};

export const ACTIONS_BY_MODULE: Record<ModuleKey, ActionDef[]> = {
  tickets: [
    { value: "assign_user", label: "Assign to user", description: "Set the ticket assignee." },
    { value: "assign_role", label: "Assign to role", description: "Round-robin to anyone with the role." },
    { value: "set_priority", label: "Set priority", description: "Override the ticket priority." },
    { value: "set_status", label: "Set status", description: "Move the ticket to a new status." },
    { value: "send_notification", label: "Send notification", description: "Email or in-app notify." },
    { value: "require_approval", label: "Require approval", description: "Pause until approved." },
    { value: "add_comment", label: "Add internal comment", description: "Append a templated comment." },
    { value: "escalate", label: "Escalate", description: "Bump severity / route to leadership." },
  ],
  initiatives: [
    { value: "require_approval", label: "Require approval", description: "Hold the initiative for an approval run." },
    { value: "send_notification", label: "Send notification", description: "Notify reporter / owner / approvers." },
    { value: "add_comment", label: "Add internal comment", description: "Append a templated note." },
  ],
  projects: [
    { value: "send_notification", label: "Send notification", description: "Notify owner / sponsor." },
    { value: "set_status", label: "Set status", description: "Change project status." },
  ],
  changes: [
    { value: "require_approval", label: "Require approval", description: "Hold change for CAB approval." },
    { value: "send_notification", label: "Send notification", description: "Notify CAB / owner." },
  ],
  risks: [
    { value: "send_notification", label: "Send notification", description: "Notify risk owner." },
    { value: "escalate", label: "Escalate", description: "Bump risk owner to leadership." },
  ],
};

export const ACTION_LABELS: Record<string, string> = Object.values(
  ACTIONS_BY_MODULE,
).reduce<Record<string, string>>((acc, list) => {
  for (const a of list) acc[a.value] = a.label;
  return acc;
}, {});

export const APPROVER_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "specific_users", label: "Specific users" },
  { value: "roles", label: "By role" },
  { value: "department_heads", label: "Department heads" },
  { value: "finance", label: "Finance team" },
  { value: "security", label: "Security team" },
  { value: "it_leadership", label: "IT leadership" },
  { value: "executive_sponsor", label: "Executive sponsor" },
];
