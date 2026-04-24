import {
  useListDepartments,
  useGetDepartmentSettings,
  useUpdateDepartmentSettings,
} from "@workspace/api-client-react";
import { useEffect, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTheme, type Theme } from "@/components/providers/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function Settings() {
  const { data: departments } = useListDepartments();
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (departments && activeId == null && departments.length > 0) {
      setActiveId(departments[0].id);
    }
  }, [departments, activeId]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Appearance preferences and per-department portal, SLA, and
          notification configuration.
        </p>
      </div>
      <AppearanceCard />
      {departments && departments.length > 0 && (
        <Tabs
          value={activeId ? String(activeId) : ""}
          onValueChange={(v) => setActiveId(Number(v))}
        >
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
            {departments.map((d) => (
              <TabsTrigger
                key={d.id}
                value={String(d.id)}
                className="text-xs"
                data-testid={`tab-dept-${d.slug}`}
              >
                {d.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {activeId != null && (
        <DepartmentSettingsForm key={activeId} departmentId={activeId} />
      )}
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
          toast({ title: "Settings saved", description: "Department configuration updated." }),
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

function AppearanceCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <Card data-testid="card-appearance">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Choose how Service Hub looks to you. System matches your device
          preference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-3 max-w-xl"
        >
          {options.map((opt) => {
            const active = theme === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.value)}
                data-testid={`button-theme-${opt.value}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border p-4 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  active
                    ? "border-primary ring-2 ring-primary/40 bg-accent text-accent-foreground"
                    : "border-border",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Currently using <span className="font-medium">{resolvedTheme}</span>{" "}
          mode.
        </p>
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
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
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
      <Switch
        checked={value}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}
