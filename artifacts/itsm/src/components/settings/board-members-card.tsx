import { useMemo, useState } from "react";
import {
  useListBoardMembers,
  useAddBoardMember,
  useUpdateBoardMember,
  useRemoveBoardMember,
  useListAgents,
  getListBoardMembersQueryKey,
  type BoardMember,
  type BoardRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";

const ROLE_OPTIONS: { value: BoardRole; label: string; description: string }[] =
  [
    {
      value: "owner",
      label: "Full Control",
      description: "Edit, comment, and delete tickets",
    },
    {
      value: "manager",
      label: "Manager",
      description: "Modify + can view team timesheets",
    },
    {
      value: "modify",
      label: "Modify",
      description: "Edit and comment, cannot delete",
    },
    {
      value: "read_only",
      label: "Read only",
      description: "View tickets and dashboard only",
    },
  ];

function RoleBadge({ role }: { role: BoardRole }) {
  if (role === "owner") {
    return (
      <Badge className="bg-primary/10 text-primary hover:bg-primary/15 gap-1 border-primary/20">
        <ShieldCheck className="h-3 w-3" />
        Full Control
      </Badge>
    );
  }
  if (role === "manager") {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 gap-1 border-amber-200">
        <Star className="h-3 w-3" />
        Manager
      </Badge>
    );
  }
  if (role === "modify") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Pencil className="h-3 w-3" />
        Modify
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Eye className="h-3 w-3" />
      Read only
    </Badge>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function BoardMembersCard({ departmentId }: { departmentId: number }) {
  const { data: members, isLoading } = useListBoardMembers(departmentId);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Agents on this board</CardTitle>
          <CardDescription>
            Control who can see and work tickets in this board. Admins always
            have full access everywhere.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          data-testid="button-add-board-member"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Add agent
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !members || members.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No agents have been added yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add agents to give them access to this board's tickets.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} departmentId={departmentId} />
            ))}
          </ul>
        )}
      </CardContent>
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        departmentId={departmentId}
        existingUserIds={new Set((members ?? []).map((m) => m.userId))}
      />
    </Card>
  );
}

function MemberRow({
  member,
  departmentId,
}: {
  member: BoardMember;
  departmentId: number;
}) {
  const update = useUpdateBoardMember();
  const remove = useRemoveBoardMember();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListBoardMembersQueryKey(departmentId),
    });

  const onRoleChange = (next: BoardRole) => {
    if (next === member.role) return;
    update.mutate(
      {
        id: departmentId,
        userId: member.userId,
        data: { role: next },
      },
      {
        onSuccess: () => {
          invalidate();
          toast({
            title: "Role updated",
            description: `${member.userName} is now ${roleLabel(next)} on this board.`,
          });
        },
        onError: () =>
          toast({
            title: "Could not update role",
            variant: "destructive",
          }),
      },
    );
  };

  const onRemove = () => {
    remove.mutate(
      { id: departmentId, userId: member.userId },
      {
        onSuccess: () => {
          invalidate();
          toast({
            title: "Removed from board",
            description: `${member.userName} no longer has access.`,
          });
        },
        onError: () =>
          toast({
            title: "Could not remove",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <li className="flex items-center gap-3 py-3" data-testid={`member-row-${member.userId}`}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
        {initials(member.userName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{member.userName}</p>
          {member.userGlobalRole === "admin" && (
            <Badge
              variant="outline"
              className="h-5 text-[10px] uppercase tracking-wide border-primary/30 text-primary"
            >
              Admin
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {member.userTitle ? `${member.userTitle} · ` : ""}
          {member.userEmail}
        </p>
      </div>
      <Select
        value={member.role}
        onValueChange={(v) => onRoleChange(v as BoardRole)}
        disabled={update.isPending || member.userGlobalRole === "admin"}
      >
        <SelectTrigger
          className="h-8 w-[140px]"
          data-testid={`select-role-${member.userId}`}
        >
          <SelectValue>
            <RoleBadge role={member.role} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex flex-col">
                <span className="text-sm">{opt.label}</span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={remove.isPending}
        data-testid={`button-remove-member-${member.userId}`}
        aria-label={`Remove ${member.userName}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function roleLabel(r: BoardRole): string {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

function AddMemberDialog({
  open,
  onOpenChange,
  departmentId,
  existingUserIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departmentId: number;
  existingUserIds: Set<number>;
}) {
  const { data: agents, isLoading } = useListAgents();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [role, setRole] = useState<BoardRole>("modify");
  const [search, setSearch] = useState("");
  const add = useAddBoardMember();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const list = (agents ?? []).filter(
      (a) => a.role !== "end_user" && !existingUserIds.has(a.id),
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q),
    );
  }, [agents, existingUserIds, search]);

  const reset = () => {
    setSelectedUserId(null);
    setRole("modify");
    setSearch("");
  };

  const onSubmit = () => {
    if (selectedUserId == null) return;
    add.mutate(
      {
        id: departmentId,
        data: { userId: selectedUserId, role },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListBoardMembersQueryKey(departmentId),
          });
          toast({
            title: "Added to board",
            description: "Access granted.",
          });
          reset();
          onOpenChange(false);
        },
        onError: () =>
          toast({
            title: "Could not add member",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add agent to board</DialogTitle>
          <DialogDescription>
            Pick an agent and choose what they can do on this board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-search" className="text-xs">
              Find an agent
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="member-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className="pl-8"
                data-testid="input-member-search"
              />
            </div>
          </div>
          <div className="rounded-md border max-h-56 overflow-y-auto">
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No matching agents.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((a) => {
                  const selected = selectedUserId === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(a.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left hover-elevate ${
                          selected ? "bg-primary/5" : ""
                        }`}
                        data-testid={`option-agent-${a.id}`}
                      >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {initials(a.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {a.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.email}
                          </p>
                        </div>
                        {a.role === "admin" && (
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px] uppercase tracking-wide border-primary/30 text-primary"
                          >
                            Admin
                          </Badge>
                        )}
                        {selected && (
                          <span className="text-xs text-primary font-medium">
                            Selected
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role on this board</Label>
            <Select value={role} onValueChange={(v) => setRole(v as BoardRole)}>
              <SelectTrigger data-testid="select-new-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={add.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={selectedUserId == null || add.isPending}
            data-testid="button-confirm-add-member"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {add.isPending ? "Adding…" : "Add to board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
