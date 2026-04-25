import {
  useListDepartments,
  useGetDepartmentSettings,
  useUpdateDepartmentSettings,
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
import { ArrowLeft, ChevronRight, Layers, Pencil, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { EditBoardDialog } from "@/components/settings/edit-board-dialog";
import { DeleteBoardDialog } from "@/components/settings/delete-board-dialog";
import { BoardMembersCard } from "@/components/settings/board-members-card";

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
          You don't have permission to view board settings.
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
          Board not found
        </h1>
        <p className="text-sm text-muted-foreground">
          No board with the slug "{slug}" exists. It may have been renamed or
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
                `Board configuration for ${department.name}.`}
            </p>
          </div>
        </div>
        <BoardActions
          department={{
            id: department.id,
            name: department.name,
            slug: department.slug,
            color: department.color,
            icon: department.icon,
            description: department.description ?? null,
            ticketCount: department.ticketCount,
          }}
          onAfterDelete={() => setLocation("/settings")}
          onAfterRename={(newSlug) =>
            setLocation(`/settings/boards/${newSlug}`)
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BoardMembersCard departmentId={department.id} />
      </div>
      <DepartmentSettingsForm
        key={department.id}
        departmentId={department.id}
      />
    </div>
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
  department,
  onAfterDelete,
  onAfterRename,
}: {
  department: {
    id: number;
    name: string;
    slug: string;
    color: string;
    icon: string;
    description: string | null;
    ticketCount: number;
  };
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
        Edit board
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
        board={department}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSlugChanged={onAfterRename}
      />
      <DeleteBoardDialog
        boardId={department.id}
        boardName={department.name}
        ticketCount={department.ticketCount}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onAfterDelete}
      />
    </div>
  );
}

function DepartmentSettingsForm({ departmentId }: { departmentId: number }) {
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
    return <p className="text-sm text-muted-foreground">Loading…</p>;
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
            description: "Board configuration updated.",
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portal</CardTitle>
          <CardDescription>End-user self-service portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SLA & assignment</CardTitle>
          <CardDescription>Response targets and routing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button
          onClick={onSave}
          disabled={update.isPending}
          data-testid="button-save-settings"
        >
          {update.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
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
