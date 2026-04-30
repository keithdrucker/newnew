import { useState } from "react";
import { Link } from "wouter";
import { useListDepartments } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/components/providers/theme-provider";
import {
  Sun,
  Moon,
  Monitor,
  Layers,
  ChevronRight,
  Pencil,
  Trash2,
  Users,
  ShieldAlert,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/session-provider";
import { AddBoardDialog } from "@/components/settings/add-board-dialog";
import { EditBoardDialog } from "@/components/settings/edit-board-dialog";
import { DeleteBoardDialog } from "@/components/settings/delete-board-dialog";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { toBoardViewModel, type BoardViewModel } from "@/lib/board";

export default function Settings() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Appearance preferences and teams. Click into a team to edit its
          portal, SLA, and notification settings.
        </p>
      </div>
      <AppearanceCard />
      <AgentsCard />
      <AutomationCard />
      <TeamsCard />
    </div>
  );
}

function AutomationCard() {
  const { session } = useSession();
  if (session?.role !== "admin") return null;

  return (
    <Card data-testid="card-automation">
      <CardHeader>
        <CardTitle className="text-base">Automation</CardTitle>
        <CardDescription>
          Defaults applied to new tickets and AI categorization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Link
          href="/settings/risk-rules"
          className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2"
          data-testid="link-settings-risk-rules"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 shrink-0 text-amber-600">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Risk rules</p>
            <p className="text-xs text-muted-foreground">
              Map ticket categories to a default risk level
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        </Link>
        <Link
          href="/settings/workflows"
          className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2"
          data-testid="link-settings-workflows"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 shrink-0 text-sky-600">
            <WorkflowIcon className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Workflows</p>
            <p className="text-xs text-muted-foreground">
              Define WHEN / IF / THEN rules and approval chains across modules
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        </Link>
      </CardContent>
    </Card>
  );
}

function AgentsCard() {
  const { session } = useSession();
  if (session?.role !== "admin") return null;

  return (
    <Card data-testid="card-agents">
      <CardHeader>
        <CardTitle className="text-base">Agents</CardTitle>
        <CardDescription>
          Browse all admins and agents, and add new teammates. To grant access
          to specific teams (Full Control, Modify, or Read only), open a team's
          settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/settings/agents"
          className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2"
          data-testid="link-settings-agents"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 shrink-0 text-indigo-600">
            <Users className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Agents</p>
            <p className="text-xs text-muted-foreground">
              Manage admins and service desk agents
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        </Link>
      </CardContent>
    </Card>
  );
}

function TeamsCard() {
  const { session } = useSession();
  const { data: departments } = useListDepartments();
  const [editing, setEditing] = useState<BoardViewModel | null>(null);
  const [deleting, setDeleting] = useState<BoardViewModel | null>(null);

  if (session?.role !== "admin") return null;

  return (
    <Card data-testid="card-teams">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Teams</CardTitle>
          <CardDescription>
            A team owns its own slice of work — its own Tickets, Projects,
            Initiatives, and Operational Tasks, plus its own SLA, portal, and
            members. Click a team to configure it, or use the actions on the
            right to edit or delete.
          </CardDescription>
        </div>
        <AddBoardDialog />
      </CardHeader>
      <CardContent>
        {!departments || departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <ul
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="list-boards"
          >
            {departments.map((d) => {
              const board = toBoardViewModel(d);
              return (
                <BoardRow
                  key={d.id}
                  board={board}
                  onEdit={() => setEditing(board)}
                  onDelete={() => setDeleting(board)}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing && (
        <EditBoardDialog
          board={editing}
          open={editing != null}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteBoardDialog
          board={deleting}
          open={deleting != null}
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </Card>
  );
}

function BoardRow({
  board,
  onEdit,
  onDelete,
}: {
  board: BoardViewModel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = DEPT_ICON_MAP[board.icon] ?? Layers;

  return (
    <li
      className="group relative flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2"
      data-testid={`board-row-${board.slug}`}
    >
      <Link
        href={`/settings/boards/${board.slug}`}
        className="absolute inset-0"
        aria-label={`Open ${board.name} settings`}
        data-testid={`link-board-${board.slug}`}
      />
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 shrink-0"
        style={{ color: board.color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0 pr-1">
        <p className="font-medium truncate">{board.name}</p>
        <p className="text-xs text-muted-foreground truncate">/{board.slug}</p>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {board.ticketCount}
      </span>
      <div className="relative z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${board.name}`}
          data-testid={`button-edit-board-${board.slug}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${board.name}`}
          data-testid={`button-delete-board-${board.slug}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:opacity-0 transition-opacity" />
    </li>
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
