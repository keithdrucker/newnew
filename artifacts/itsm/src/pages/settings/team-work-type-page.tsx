import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  useListDepartments,
  useListTeamWorkTypes,
  getListTeamWorkTypesQueryKey,
  type TeamWorkType,
} from "@workspace/api-client-react";
import { ChevronRight, Layers } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useSession } from "@/components/providers/session-provider";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  WORK_TYPE_SECTIONS,
  findWorkType,
  type WorkTypeKey,
  type SectionDef,
} from "@/components/settings/work-types-catalog";
import { SectionMembersCard } from "@/components/settings/board-members-card";
import { TicketsSetupForm } from "@/pages/board-settings";

// Manage page for a single (team, workType). Renders a left sub-nav of
// the work-type-specific sections from WORK_TYPE_SECTIONS, and a
// right-hand body that either embeds a real wired component (Tickets
// section bodies) or a section-level "Coming soon" stub.
export default function TeamWorkTypePage() {
  const params = useParams<{ slug: string; workType: string }>();
  const slug = params.slug;
  const workTypeKey = params.workType as WorkTypeKey;
  const { session } = useSession();
  const [, setLocation] = useLocation();

  const { data: departments, isLoading: deptsLoading } = useListDepartments();
  const department = useMemo(
    () => departments?.find((d) => d.slug === slug),
    [departments, slug],
  );
  const deptId = department?.id ?? 0;
  const { data: rows, isLoading: rowsLoading } = useListTeamWorkTypes(deptId, {
    query: {
      enabled: !!department,
      queryKey: getListTeamWorkTypesQueryKey(deptId),
    },
  });

  const wt = findWorkType(workTypeKey);
  const sections: SectionDef[] = wt ? WORK_TYPE_SECTIONS[wt.key] : [];
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.slug ?? "overview",
  );

  // Once the row loads, redirect back to the team page if this work type
  // isn't enabled. Manage is only meaningful when the work type is on.
  const row: TeamWorkType | undefined = rows?.find(
    (r) => r.workType === workTypeKey,
  );
  useEffect(() => {
    if (!row) return;
    if (!row.isEnabled) {
      setLocation(`/settings/people-access/teams/${slug}`);
    }
  }, [row, slug, setLocation]);

  if (session?.role !== "admin") {
    return (
      <SettingsLayout
        activeCategorySlug="people-access"
        activePageSlug="teams"
      >
        <div className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You don't have permission to view team settings.
          </p>
        </div>
      </SettingsLayout>
    );
  }

  if (deptsLoading || rowsLoading) {
    return (
      <SettingsLayout
        activeCategorySlug="people-access"
        activePageSlug="teams"
      >
        <div className="p-6">
          <Skeleton className="h-7 w-60" />
        </div>
      </SettingsLayout>
    );
  }

  if (!department || !wt) {
    return (
      <SettingsLayout
        activeCategorySlug="people-access"
        activePageSlug="teams"
      >
        <div className="p-6 space-y-3" data-testid="work-type-not-found">
          <Link
            href="/settings/people-access/teams"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover-elevate active-elevate-2 rounded px-1.5 py-1"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Back to Teams
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {wt ? "Team not found" : "Work type not found"}
          </h1>
        </div>
      </SettingsLayout>
    );
  }

  const TeamIcon = DEPT_ICON_MAP[department.icon] ?? Layers;
  const WorkTypeIcon = wt.icon;
  const activeSectionDef =
    sections.find((s) => s.slug === activeSection) ?? sections[0];

  return (
    <SettingsLayout activeCategorySlug="people-access" activePageSlug="teams">
      <div
        className="p-6 space-y-5"
        data-testid={`team-work-type-${wt.key}`}
      >
        <Breadcrumb teamName={department.name} teamSlug={slug} workTypeLabel={wt.label} />
        <header className="flex items-start gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted/60 shrink-0"
            style={{ color: department.color }}
          >
            <TeamIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-semibold tracking-tight truncate"
                data-testid="text-team-work-type-title"
              >
                {department.name}
              </h1>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="inline-flex items-center gap-1.5 text-base font-medium">
                <WorkTypeIcon className="h-4 w-4 text-muted-foreground" />
                {wt.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{wt.description}</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          <nav
            className="lg:border-r lg:pr-3 -mx-2 lg:mx-0"
            aria-label={`${wt.label} sections`}
          >
            <ul className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible px-2 lg:px-0">
              {sections.map((s) => {
                const active = s.slug === activeSection;
                return (
                  <li key={s.slug} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveSection(s.slug)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                      aria-current={active ? "page" : undefined}
                      data-testid={`section-nav-${s.slug}`}
                    >
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0">
            {activeSectionDef && (
              <SectionBody
                workTypeKey={wt.key}
                workTypeLabel={wt.label}
                section={activeSectionDef}
                departmentId={department.id}
              />
            )}
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}

// Maps a (workType, sectionSlug) pair to either a real wired body or
// a section-level stub. Tickets has the existing fully-wired form for
// its SLA/Notifications/Automation sections; everything else is a
// stub today and will get its own component as features are built.
function SectionBody({
  workTypeKey,
  workTypeLabel,
  section,
  departmentId,
}: {
  workTypeKey: WorkTypeKey;
  workTypeLabel: string;
  section: SectionDef;
  departmentId: number;
}) {
  // Members section — wired for the four BoardSection-backed work
  // types via SectionMembersCard. Timesheets gets a dedicated note
  // since it doesn't have its own permission table.
  if (section.slug === "members") {
    if (workTypeKey === "timesheets") {
      return (
        <SectionStub
          title="Time loggers"
          hint={section.hint}
          body="Anyone permitted on Tickets, Operational Tasks, Projects, or Initiatives can log time against records of those types. There is no separate Timesheets permission row."
        />
      );
    }
    return (
      <SectionMembersCard
        departmentId={departmentId}
        section={workTypeKey}
        title={`${workTypeLabel} agents`}
        description={`Who can work in ${workTypeLabel} for this team, and at what permission level.`}
      />
    );
  }

  // Tickets has the existing fully-wired team configuration form. We
  // surface it inside the SLAs, Notifications, Requirements, and
  // Categories sections — the form covers all of them in one card.
  if (workTypeKey === "tickets") {
    if (
      section.slug === "slas" ||
      section.slug === "notifications" ||
      section.slug === "requirements" ||
      section.slug === "categories" ||
      section.slug === "automation"
    ) {
      return (
        <div className="space-y-3" data-testid={`section-body-${section.slug}`}>
          <SectionHeader title={section.label} hint={section.hint} />
          <TicketsSetupForm departmentId={departmentId} />
        </div>
      );
    }
  }

  // Timesheets — explicit "no approvals / no submission" note in the
  // Overview body so the model is clear.
  if (workTypeKey === "timesheets" && section.slug === "overview") {
    return (
      <SectionStub
        title="Timesheets overview"
        hint={section.hint}
        body="Timesheets capture time entries logged against tickets, operational tasks, projects, and initiatives. There is no submission or approval flow — entries are saved as agents log them."
      />
    );
  }

  // Default: stub
  return (
    <SectionStub
      title={section.label}
      hint={section.hint}
      body="This section will get a real configuration UI as the feature is built. The page shell, routing, and persistence are in place — this is a placeholder for the form that will live here."
    />
  );
}

function SectionHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionStub({
  title,
  hint,
  body,
}: {
  title: string;
  hint?: string;
  body: string;
}) {
  return (
    <Card className="border-dashed" data-testid={`section-stub-${title}`}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {hint && (
          <CardDescription className="text-xs">{hint}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function Breadcrumb({
  teamName,
  teamSlug,
  workTypeLabel,
}: {
  teamName: string;
  teamSlug: string;
  workTypeLabel: string;
}) {
  return (
    <nav
      className="flex items-center gap-1 text-xs text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        href="/settings/people-access/teams"
        className="hover-elevate active-elevate-2 rounded px-1.5 py-1"
      >
        Teams
      </Link>
      <ChevronRight className="h-3 w-3" />
      <Link
        href={`/settings/people-access/teams/${teamSlug}`}
        className="hover-elevate active-elevate-2 rounded px-1.5 py-1"
      >
        {teamName}
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span className="text-foreground font-medium">{workTypeLabel}</span>
    </nav>
  );
}
