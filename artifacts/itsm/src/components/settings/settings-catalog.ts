import {
  Settings as SettingsIcon,
  Users,
  Sliders,
  Smile,
  Database,
  Shield,
  Bell,
  Palette,
  Globe,
  Cog,
  UserCheck,
  Lock,
  Users as Group,
  Building2,
  FileText,
  GitBranch,
  Timer,
  Bot,
  Globe2,
  Image as ImageIcon,
  BookOpen,
  ClipboardList,
  Box,
  AppWindow,
  Plug,
  Webhook,
  ScrollText,
  Trash2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type SettingsPageDef = {
  slug: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  // If false, show a "Coming soon" stub. Real pages set this to true.
  implemented?: boolean;
};

export type SettingsCategoryDef = {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  // Restrict visibility. Default: visible to admins (Settings is
  // already admin-gated at the route layer).
  adminOnly?: boolean;
  pages: SettingsPageDef[];
};

// Single source of truth for the Settings IA. Drives the left rail in
// SettingsLayout, the per-category landing page cards, and the route
// table in App.tsx.
export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    slug: "system-defaults",
    label: "System & Defaults",
    description: "Global system behavior and foundational defaults.",
    icon: SettingsIcon,
    pages: [
      {
        slug: "general",
        href: "/settings/system-defaults/general",
        label: "General",
        description: "Workspace name, contact info, and base behavior.",
        icon: Cog,
      },
      {
        slug: "notifications",
        href: "/settings/system-defaults/notifications",
        label: "Notifications",
        description: "System-wide notification channels and templates.",
        icon: Bell,
      },
      {
        slug: "appearance",
        href: "/settings/system-defaults/appearance",
        label: "Appearance & Theme",
        description: "Light, dark, and system theme defaults.",
        icon: Palette,
        implemented: true,
      },
      {
        slug: "localization",
        href: "/settings/system-defaults/localization",
        label: "Timezone & Localization",
        description: "Default timezone, language, date and number formats.",
        icon: Globe,
      },
      {
        slug: "system-defaults",
        href: "/settings/system-defaults/system-defaults",
        label: "System Defaults",
        description: "Default values applied to new records system-wide.",
        icon: Sliders,
      },
    ],
  },
  {
    slug: "people-access",
    label: "People & Access",
    description: "Who exists in the system and how access is managed.",
    icon: Users,
    pages: [
      {
        slug: "agents",
        href: "/settings/people-access/agents",
        label: "Agents",
        description: "Manage the people who staff your service teams.",
        icon: UserCheck,
        implemented: true,
      },
      {
        slug: "roles",
        href: "/settings/people-access/roles",
        label: "Roles & Permissions",
        description: "Define what each role can see and do.",
        icon: Lock,
      },
      {
        slug: "groups",
        href: "/settings/people-access/groups",
        label: "Groups",
        description: "Logical groupings of agents that span teams.",
        icon: Group,
      },
      {
        slug: "teams",
        href: "/settings/people-access/teams",
        label: "Teams",
        description:
          "Operational unit. Each team owns its own work types and rules.",
        icon: Building2,
        implemented: true,
      },
    ],
  },
  {
    slug: "service",
    label: "Service Configuration",
    description:
      "Global capabilities that teams can opt into. These define what is possible — teams decide how and whether they apply.",
    icon: Sliders,
    pages: [
      {
        slug: "forms",
        href: "/settings/service/forms",
        label: "Forms",
        description: "Reusable forms attached to work items and intake.",
        icon: FileText,
      },
      {
        slug: "workflows",
        href: "/settings/service/workflows",
        label: "Global Workflows",
        description: "Approval workflows reusable across teams.",
        icon: GitBranch,
        implemented: true,
      },
      {
        slug: "sla-frameworks",
        href: "/settings/service/sla-frameworks",
        label: "SLA Frameworks",
        description: "Reusable SLA targets that teams can apply to tickets.",
        icon: Timer,
      },
      {
        slug: "automation",
        href: "/settings/service/automation",
        label: "Automation Rules",
        description:
          "Trigger-based rules including risk classification and ticket routing.",
        icon: Bot,
      },
    ],
  },
  {
    slug: "customer-experience",
    label: "Customer Experience",
    description: "Everything end users interact with.",
    icon: Smile,
    pages: [
      {
        slug: "self-service-portal",
        href: "/settings/customer-experience/self-service-portal",
        label: "Self-Service Portal",
        description: "Configure the end-user portal where requests are filed.",
        icon: Globe2,
      },
      {
        slug: "branding",
        href: "/settings/customer-experience/branding",
        label: "Branding",
        description: "Logos, colors, and copy shown to end users.",
        icon: ImageIcon,
      },
      {
        slug: "knowledge-base-visibility",
        href: "/settings/customer-experience/knowledge-base-visibility",
        label: "Knowledge Base Visibility",
        description: "Choose which articles end users can see.",
        icon: BookOpen,
      },
      {
        slug: "end-user-forms",
        href: "/settings/customer-experience/end-user-forms",
        label: "End-User Forms",
        description: "Forms surfaced to end users when filing a request.",
        icon: ClipboardList,
      },
    ],
  },
  {
    slug: "technology-data",
    label: "Technology & Data",
    description: "Systems, data, and integrations.",
    icon: Database,
    pages: [
      {
        slug: "asset-management",
        href: "/settings/technology-data/asset-management",
        label: "Asset Management",
        description: "Configure the asset inventory and lifecycle.",
        icon: Box,
      },
      {
        slug: "applications",
        href: "/settings/technology-data/applications",
        label: "Applications",
        description: "Catalog of business applications and ownership.",
        icon: AppWindow,
      },
      {
        slug: "integrations",
        href: "/settings/technology-data/integrations",
        label: "Integrations",
        description: "Connect external systems to push and pull data.",
        icon: Plug,
      },
      {
        slug: "api-webhooks",
        href: "/settings/technology-data/api-webhooks",
        label: "API & Webhooks",
        description: "API keys and outbound event delivery.",
        icon: Webhook,
      },
    ],
  },
  {
    slug: "security-governance",
    label: "Security & Governance",
    description: "Control, audit, and compliance.",
    icon: Shield,
    adminOnly: true,
    pages: [
      {
        slug: "audit-logs",
        href: "/settings/security-governance/audit-logs",
        label: "Audit Logs",
        description: "Read-only system activity record.",
        icon: ScrollText,
      },
      {
        slug: "data-retention",
        href: "/settings/security-governance/data-retention",
        label: "Data Retention",
        description: "Retention policies for tickets, logs, and events.",
        icon: Trash2,
      },
      {
        slug: "security-controls",
        href: "/settings/security-governance/security-controls",
        label: "Security Controls",
        description: "Authentication, session, and access controls.",
        icon: ShieldCheck,
      },
    ],
  },
];

export function findCategory(slug: string) {
  return SETTINGS_CATEGORIES.find((c) => c.slug === slug);
}

export function findPage(categorySlug: string, pageSlug: string) {
  const cat = findCategory(categorySlug);
  if (!cat) return null;
  const page = cat.pages.find((p) => p.slug === pageSlug);
  if (!page) return null;
  return { category: cat, page };
}
