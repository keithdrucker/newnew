import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  useListDepartments,
  useListTeamWorkTypes,
  useUpdateTeamWorkType,
  getListTeamWorkTypesQueryKey,
  type TeamWorkType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Layers, Pencil, Trash2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useSession } from "@/components/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { toBoardViewModel, type BoardViewModel } from "@/lib/board";
import { EditBoardDialog } from "@/components/settings/edit-board-dialog";
import { DeleteBoardDialog } from "@/components/settings/delete-board-dialog";
import { SectionMembersCard } from "@/components/settings/board-members-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WORK_TYPES, type WorkTypeDef } from "@/components/settings/work-types-catalog";

type TeamTab = "overview" | "members" | "work-types";

const TEAM_TABS: { value: TeamTab; label: string }[] = [
  { value: "overview", label: "Team Overview" },
  { value: "members", label: "Members" },
  { value: "work-types", label: "Work Types" },
];

// Per-team configuration page. Replaces the legacy board-settings.tsx
// surface with a top-level tab nav (Team Overview / Members / Work
// Types) and delegates per-work-type configuration to the dedicated
// Manage page reachable from each Work Type card.
export default function TeamPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { session } = useSession();
  const [, setLocation] = useLocation();
  const { data: departments, isLoading: deptsLoading } = useListDepartments();
  const [tab, setTab] = useState<TeamTab>("overview");

  const department = useMemo(
    () => departments?.find((d) => d.slug === slug),
    [departments, slug],
  );

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

  if (deptsLoading) {
    return (
      <SettingsLayout
        activeCategorySlug="people-access"
        activePageSlug="teams"
      >
        <div className="p-6">
          <Skeleton className="h-7 w-40" />
        </div>
      </SettingsLayout>
    );
  }

  if (!department) {
    return (
      <SettingsLayout
        activeCategorySlug="people-access"
        activePageSlug="teams"
      >
        <div className="p-6 space-y-3" data-testid="team-not-found">
          <Link
            href="/settings/people-access/teams"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover-elevate active-elevate-2 rounded px-1.5 py-1"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Back to Teams
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Team not found
          </h1>
          <p className="text-sm text-muted-foreground">
            No team with the slug "{slug}" exists.
          </p>
        </div>
      </SettingsLayout>
    );
  }

  const Icon = DEPT_ICON_MAP[department.icon] ?? Layers;

  return (
    <SettingsLayout activeCategorySlug="people-access" activePageSlug="teams">
      <div className="p-6 space-y-5" data-testid="team-page">
        <Breadcrumb name={department.name} />
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted/60 shrink-0"
              style={{ color: department.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1
                className="text-2xl font-semibold tracking-tight truncate"
                data-testid="text-team-title"
              >
                {department.name}
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {department.description ||
                  `Team configuration for ${department.name}.`}
              </p>
            </div>
          </div>
          <TeamActions
            board={toBoardViewModel(department)}
            onAfterDelete={() => setLocation("/settings/people-access/teams")}
            onAfterRename={(newSlug) =>
              setLocation(`/settings/people-access/teams/${newSlug}`)
            }
          />
        </header>

        <nav
          className="border-b -mb-px flex items-center gap-1 overflow-x-auto"
          aria-label="Team sections"
        >
          {TEAM_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              data-testid={`tab-${t.value}`}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t.value
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={tab === t.value ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewTab departmentName={department.name} />}
        {tab === "members" && <MembersTab departmentId={department.id} />}
        {tab === "work-types" && (
          <WorkTypesTab
            departmentId={department.id}
            teamSlug={department.slug}
          />
        )}
      </div>
    </SettingsLayout>
  );
}

function OverviewTab({ departmentName }: { departmentName: string }) {
  return (
    <Card data-testid="tab-content-overview">
      <CardHeader>
        <CardTitle className="text-base">Team overview</CardTitle>
        <CardDescription>
          High-level information about {departmentName} will live here —
          owners, manager, working hours, and a summary of which work types
          this team is opted into. Detailed configuration happens inside
          Members and each enabled Work Type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Coming soon.
        </p>
      </CardContent>
    </Card>
  );
}

function MembersTab({ departmentId }: { departmentId: number }) {
  // Members across the team — we show the existing per-section permission
  // tables for the four BoardSection-backed work types. Per-section
  // overrides are how this team's tickets/projects/etc. agents are set
  // today, so this is the right surface for "who is on this team".
  const sections: Array<{ section: "tickets" | "operational_tasks" | "initiatives" | "projects"; title: string }> = [
    { section: "tickets", title: "Tickets agents" },
    { section: "operational_tasks", title: "Operational Tasks agents" },
    { section: "initiatives", title: "Initiatives agents" },
    { section: "projects", title: "Projects agents" },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="tab-content-members">
      {sections.map((s) => (
        <SectionMembersCard
          key={s.section}
          departmentId={departmentId}
          section={s.section}
          title={s.title}
          description={`Who can work in ${s.title.replace(" agents", "")} for this team, and at what permission level.`}
        />
      ))}
    </div>
  );
}

function WorkTypesTab({
  departmentId,
  teamSlug,
}: {
  departmentId: number;
  teamSlug: string;
}) {
  const { data: rows, isLoading } = useListTeamWorkTypes(departmentId);

  return (
    <div className="space-y-3" data-testid="tab-content-work-types">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Work this team handles
        </h2>
        <p className="text-xs text-muted-foreground max-w-2xl">
          Enable the work types this team is responsible for. Toggle Time
          Tracking on if agents should log time against records of that type.
          Disabling a work type also turns time tracking off.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {WORK_TYPES.map((wt) => {
            const row = rows?.find((r) => r.workType === wt.key);
            return (
              <WorkTypeCard
                key={wt.key}
                wt={wt}
                row={row}
                departmentId={departmentId}
                teamSlug={teamSlug}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkTypeCard({
  wt,
  row,
  departmentId,
  teamSlug,
}: {
  wt: WorkTypeDef;
  row: TeamWorkType | undefined;
  departmentId: number;
  teamSlug: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const update = useUpdateTeamWorkType();
  const Icon = wt.icon;

  const enabled = row?.isEnabled ?? false;
  const requiresTimeTracking = row?.requiresTimeTracking ?? false;

  const isPending = update.isPending;

  function applyUpdate(patch: {
    isEnabled?: boolean;
    requiresTimeTracking?: boolean;
  }) {
    update.mutate(
      { id: departmentId, workType: wt.key, data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListTeamWorkTypesQueryKey(departmentId),
          });
        },
        onError: (err) => {
          toast({
            title: "Couldn't update work type",
            description: err instanceof Error ? err.message : "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <Card data-testid={`work-type-card-${wt.key}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground/80 shrink-0">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base">{wt.label}</CardTitle>
            <CardDescription className="text-xs">
              {wt.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
          <Label
            htmlFor={`enable-${wt.key}`}
            className="text-sm font-medium cursor-pointer"
          >
            Enable
          </Label>
          <Switch
            id={`enable-${wt.key}`}
            checked={enabled}
            disabled={isPending || !row}
            onCheckedChange={(v) => applyUpdate({ isEnabled: v })}
            data-testid={`switch-enable-${wt.key}`}
          />
        </div>
        <div
          className={cn(
            "flex items-center justify-between rounded-md border bg-card px-3 py-2 transition-opacity",
            !enabled && "opacity-50",
          )}
        >
          <div className="min-w-0">
            <Label
              htmlFor={`time-${wt.key}`}
              className={cn(
                "text-sm font-medium",
                enabled && "cursor-pointer",
              )}
            >
              Require Time Tracking
            </Label>
            <p className="text-xs text-muted-foreground">
              Agents must log time against {wt.label.toLowerCase()}.
            </p>
          </div>
          <Switch
            id={`time-${wt.key}`}
            checked={requiresTimeTracking}
            disabled={isPending || !enabled || !row}
            onCheckedChange={(v) =>
              applyUpdate({ requiresTimeTracking: v })
            }
            data-testid={`switch-time-${wt.key}`}
          />
        </div>
        {enabled && (
          <Link
            href={`/settings/people-access/teams/${teamSlug}/work-types/${wt.key}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              data-testid={`button-manage-${wt.key}`}
            >
              Manage {wt.label}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav
      className="flex items-center gap-1 text-xs text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        href="/settings/people-access/teams"
        className="hover-elevate active-elevate-2 rounded px-1.5 py-1"
        data-testid="link-back-to-teams"
      >
        Teams
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span className="text-foreground font-medium">{name}</span>
    </nav>
  );
}

function TeamActions({
  board,
  onAfterDelete,
  onAfterRename,
}: {
  board: BoardViewModel;
  onAfterDelete: () => void;
  onAfterRename: (newSlug: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
        data-testid="button-edit-team"
      >
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        Edit team
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
        data-testid="button-delete-team"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete
      </Button>
      <EditBoardDialog
        board={board}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSlugChanged={onAfterRename}
      />
      <DeleteBoardDialog
        board={board}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onAfterDelete}
      />
    </div>
  );
}
