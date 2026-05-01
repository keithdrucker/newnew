import {
  useListDepartments,
  useGetDepartmentSettings,
  useUpdateDepartmentSettings,
  type BoardSection,
} from "@workspace/api-client-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  Layers,
  Lightbulb,
  Pencil,
  Ticket,
  Trash2,
} from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { EditBoardDialog } from "@/components/settings/edit-board-dialog";
import { DeleteBoardDialog } from "@/components/settings/delete-board-dialog";
import { SectionMembersCard } from "@/components/settings/board-members-card";
import { toBoardViewModel, type BoardViewModel } from "@/lib/board";

type Priority = "low" | "medium" | "high" | "urgent";

interface FormState {
  portalEnabled: boolean;
  portalTitle: string;
  portalWelcome: string;
  defaultPriority: Priority;
  slaResponseMinutes: number;
  slaResolutionMinutes: number;
  autoAssign: boolean;
  notifyOnNewTicket: boolean;
  notifyOnSlaBreach: boolean;
  allowEndUserAttachments: boolean;
  requireCategory: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  ticketCategories: string;
}

// One row per Workspace area. Tickets is the only area with a rich
// per-team configuration form today (portal/SLA/etc). The other three
// surface the agent-permissions table and a small placeholder note;
// real per-area configuration can be added here without touching the
// page shell.
type SectionDef = {
  section: BoardSection;
  title: string;
  description: string;
  Icon: typeof Ticket;
};

const SECTIONS: SectionDef[] = [
  {
    section: "tickets",
    title: "Tickets",
    description:
      "Reactive incidents and requests routed to this team's ticket board.",
    Icon: Ticket,
  },
  {
    section: "operational_tasks",
    title: "Operational Tasks",
    description:
      "Recurring day-to-day work items handled by this team.",
    Icon: ClipboardList,
  },
  {
    section: "initiatives",
    title: "Initiatives",
    description: "Ideas and proposals owned by this team.",
    Icon: Lightbulb,
  },
  {
    section: "projects",
    title: "Projects",
    description:
      "Approved improvement work assigned to this team's project board.",
    Icon: FolderKanban,
  },
];

export default function BoardSettings({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const { session } = useSession();
  const [, setLocation] = useLocation();
  const { data: departments, isLoading: deptsLoading } = useListDepartments();

  const department = useMemo(
    () => departments?.find((d) => d.slug === slug),
    [departments, slug],
  );

  if (session?.role !== "admin") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view team settings.
        </p>
      </div>
    );
  }

  if (deptsLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!department) {
    return (
      <div className="space-y-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover-elevate active-elevate-2 rounded px-1.5 py-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Team not found
        </h1>
        <p className="text-sm text-muted-foreground">
          No team with the slug "{slug}" exists. It may have been renamed or
          deleted.
        </p>
      </div>
    );
  }

  const Icon = DEPT_ICON_MAP[department.icon] ?? Layers;

  return (
    <div className="space-y-5">
      <Breadcrumb name={department.name} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
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
              data-testid="text-board-title"
            >
              {department.name}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {department.description ||
                `Team configuration for ${department.name}.`}
            </p>
          </div>
        </div>
        <BoardActions
          board={toBoardViewModel(department)}
          onAfterDelete={() => setLocation("/settings")}
          onAfterRename={(newSlug) =>
            setLocation(`/settings/boards/${newSlug}`)
          }
        />
      </div>

      <div className="space-y-6">
        {SECTIONS.map(({ section, title, description, Icon: SecIcon }) => (
          <AreaSection
            key={section}
            section={section}
            title={title}
            description={description}
            icon={<SecIcon className="h-4 w-4" />}
            departmentId={department.id}
          />
        ))}
      </div>
    </div>
  );
}

function AreaSection({
  section,
  title,
  description,
  icon,
  departmentId,
}: {
  section: BoardSection;
  title: string;
  description: string;
  icon: React.ReactNode;
  departmentId: number;
}) {
  return (
    <section
      className="space-y-3"
      data-testid={`area-section-${section}`}
    >
      <div className="flex items-center gap-2 border-b pb-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {section === "tickets" ? (
          <TicketsSetupForm departmentId={departmentId} />
        ) : (
          <PlaceholderSetupCard area={title} />
        )}
        <SectionMembersCard
          departmentId={departmentId}
          section={section}
          title="Agent permissions"
          description={`Who on this team can work in ${title}, and at what permission level.`}
        />
      </div>
    </section>
  );
}

function PlaceholderSetupCard({ area }: { area: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm">Setup</CardTitle>
        <CardDescription className="text-xs">
          {area} doesn't have any team-level settings yet — only agent
          permissions. Configuration options will live here once added.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        href="/settings"
        className="hover-elevate active-elevate-2 rounded px-1.5 py-1"
        data-testid="link-back-to-settings"
      >
        Settings
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span className="text-foreground font-medium">{name}</span>
    </nav>
  );
}

function BoardActions({
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
        data-testid="button-edit-board"
      >
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        Edit team
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
        data-testid="button-delete-board"
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

// Tickets-only setup form. Wraps both the Portal card and the SLA &
// assignment card so they stack inside the Tickets area's two-column
// grid (each card occupies one column on desktop). The "Save settings"
// button lives in the SLA card so it's adjacent to the editable fields
// without disturbing the parent area-section layout.
export function TicketsSetupForm({ departmentId }: { departmentId: number }) {
  const { data: settings, isLoading } = useGetDepartmentSettings(departmentId);
  const update = useUpdateDepartmentSettings();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        portalEnabled: settings.portalEnabled,
        portalTitle: settings.portalTitle,
        portalWelcome: settings.portalWelcome,
        defaultPriority: settings.defaultPriority,
        slaResponseMinutes: settings.slaResponseMinutes,
        slaResolutionMinutes: settings.slaResolutionMinutes,
        autoAssign: settings.autoAssign,
        notifyOnNewTicket: settings.notifyOnNewTicket,
        notifyOnSlaBreach: settings.notifyOnSlaBreach,
        allowEndUserAttachments: settings.allowEndUserAttachments,
        requireCategory: settings.requireCategory,
        businessHoursStart: settings.businessHoursStart,
        businessHoursEnd: settings.businessHoursEnd,
        ticketCategories: settings.ticketCategories.join(", "),
      });
    }
  }, [settings]);

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSave = () => {
    update.mutate(
      {
        id: departmentId,
        data: {
          portalEnabled: form.portalEnabled,
          portalTitle: form.portalTitle,
          portalWelcome: form.portalWelcome,
          defaultPriority: form.defaultPriority,
          slaResponseMinutes: Number(form.slaResponseMinutes),
          slaResolutionMinutes: Number(form.slaResolutionMinutes),
          autoAssign: form.autoAssign,
          notifyOnNewTicket: form.notifyOnNewTicket,
          notifyOnSlaBreach: form.notifyOnSlaBreach,
          allowEndUserAttachments: form.allowEndUserAttachments,
          requireCategory: form.requireCategory,
          businessHoursStart: form.businessHoursStart,
          businessHoursEnd: form.businessHoursEnd,
          ticketCategories: form.ticketCategories
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      },
      {
        onSuccess: () =>
          toast({
            title: "Settings saved",
            description: "Tickets configuration updated.",
          }),
        onError: () =>
          toast({
            title: "Save failed",
            description: "Unable to update settings.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Setup</CardTitle>
        <CardDescription className="text-xs">
          Portal, SLA, and routing for this team's tickets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Portal
          </p>
          <ToggleRow
            label="Portal enabled"
            description="Allow end users to submit tickets via the portal."
            value={form.portalEnabled}
            onChange={(v) => set("portalEnabled", v)}
            testId="switch-portal-enabled"
          />
          <Field label="Portal title">
            <Input
              value={form.portalTitle}
              onChange={(e) => set("portalTitle", e.target.value)}
              data-testid="input-portal-title"
            />
          </Field>
          <Field label="Welcome message">
            <Textarea
              rows={3}
              value={form.portalWelcome}
              onChange={(e) => set("portalWelcome", e.target.value)}
              data-testid="input-portal-welcome"
            />
          </Field>
          <ToggleRow
            label="Allow attachments"
            description="Let end users attach files to tickets."
            value={form.allowEndUserAttachments}
            onChange={(v) => set("allowEndUserAttachments", v)}
          />
          <ToggleRow
            label="Require category"
            description="Force ticket category selection on submit."
            value={form.requireCategory}
            onChange={(v) => set("requireCategory", v)}
          />
          <Field label="Ticket categories (comma-separated)">
            <Input
              value={form.ticketCategories}
              onChange={(e) => set("ticketCategories", e.target.value)}
              data-testid="input-categories"
            />
          </Field>
        </div>

        <div className="space-y-3 pt-3 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            SLA & assignment
          </p>
          <Field label="Default priority">
            <Select
              value={form.defaultPriority}
              onValueChange={(v) => set("defaultPriority", v as Priority)}
            >
              <SelectTrigger data-testid="select-default-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Response SLA (minutes)">
              <Input
                type="number"
                value={form.slaResponseMinutes}
                onChange={(e) =>
                  set("slaResponseMinutes", Number(e.target.value))
                }
                data-testid="input-sla-response"
              />
            </Field>
            <Field label="Resolution SLA (minutes)">
              <Input
                type="number"
                value={form.slaResolutionMinutes}
                onChange={(e) =>
                  set("slaResolutionMinutes", Number(e.target.value))
                }
                data-testid="input-sla-resolution"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business hours start">
              <Input
                type="time"
                value={form.businessHoursStart}
                onChange={(e) => set("businessHoursStart", e.target.value)}
              />
            </Field>
            <Field label="Business hours end">
              <Input
                type="time"
                value={form.businessHoursEnd}
                onChange={(e) => set("businessHoursEnd", e.target.value)}
              />
            </Field>
          </div>
          <ToggleRow
            label="Auto-assign tickets"
            description="Round-robin to available agents on this team."
            value={form.autoAssign}
            onChange={(v) => set("autoAssign", v)}
          />
          <ToggleRow
            label="Notify on new ticket"
            description="Email agents when a ticket is created."
            value={form.notifyOnNewTicket}
            onChange={(v) => set("notifyOnNewTicket", v)}
          />
          <ToggleRow
            label="Notify on SLA breach"
            description="Alert managers when SLA is breached."
            value={form.notifyOnSlaBreach}
            onChange={(v) => set("notifyOnSlaBreach", v)}
          />
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button
            onClick={onSave}
            disabled={update.isPending}
            data-testid="button-save-settings"
          >
            {update.isPending ? "Saving…" : "Save tickets settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}
