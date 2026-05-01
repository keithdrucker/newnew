import { useState } from "react";
import { Link } from "wouter";
import { useListDepartments } from "@workspace/api-client-react";
import { Building2, Layers, Pencil, Trash2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { AddBoardDialog } from "@/components/settings/add-board-dialog";
import { EditBoardDialog } from "@/components/settings/edit-board-dialog";
import { DeleteBoardDialog } from "@/components/settings/delete-board-dialog";
import { DEPT_ICON_MAP } from "@/lib/dept-icons";
import { toBoardViewModel, type BoardViewModel } from "@/lib/board";

// People & Access → Teams index. Lists every team and links into
// the per-team configuration page where Members and Work Types live.
export default function SettingsTeamsPage() {
  const { data: departments } = useListDepartments();
  const [editing, setEditing] = useState<BoardViewModel | null>(null);
  const [deleting, setDeleting] = useState<BoardViewModel | null>(null);

  return (
    <SettingsLayout activeCategorySlug="people-access" activePageSlug="teams">
      <div className="p-6 space-y-5" data-testid="settings-teams">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-md bg-muted text-foreground/80 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                A team is an operational unit. Each team owns its own work
                types — Tickets, Operational Tasks, Initiatives, Projects,
                and Timesheets — plus its own SLA, portal, and members.
              </p>
            </div>
          </div>
          <AddBoardDialog />
        </header>

        {!departments || departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <ul
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="list-teams"
          >
            {departments.map((d) => {
              const board = toBoardViewModel(d);
              return (
                <TeamRow
                  key={d.id}
                  board={board}
                  onEdit={() => setEditing(board)}
                  onDelete={() => setDeleting(board)}
                />
              );
            })}
          </ul>
        )}

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
      </div>
    </SettingsLayout>
  );
}

function TeamRow({
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
      data-testid={`team-row-${board.slug}`}
    >
      <Link
        href={`/settings/people-access/teams/${board.slug}`}
        className="absolute inset-0"
        aria-label={`Open ${board.name} settings`}
        data-testid={`link-team-${board.slug}`}
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
          data-testid={`button-edit-team-${board.slug}`}
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
          data-testid={`button-delete-team-${board.slug}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}
