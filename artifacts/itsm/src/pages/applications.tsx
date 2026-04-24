import {
  useListApplications,
  useCreateApplication,
  useDeleteApplication,
  useListDepartments,
  useListAgents,
  getListApplicationsQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Trash2, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { v: "productivity", label: "Productivity" },
  { v: "design", label: "Design & Engineering" },
  { v: "ops", label: "Operations" },
  { v: "finance", label: "Finance" },
  { v: "dev", label: "Development" },
  { v: "security", label: "Security" },
  { v: "other", label: "Other" },
] as const;

export default function Applications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: departments } = useListDepartments();
  const { data: agents } = useListAgents();
  const { data: apps, isLoading } = useListApplications({
    status:
      status === "all"
        ? undefined
        : (status as "active" | "piloting" | "deprecated"),
    category:
      category === "all"
        ? undefined
        : (category as
            | "productivity"
            | "design"
            | "ops"
            | "finance"
            | "dev"
            | "security"
            | "other"),
    departmentId: departmentId === "all" ? undefined : Number(departmentId),
    q: search || undefined,
  });

  const createMutation = useCreateApplication();
  const deleteMutation = useDeleteApplication();

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Remove "${name}" from the application catalog?`))
      return;
    try {
      await deleteMutation.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListApplicationsQueryKey(),
      });
      toast({ title: "Application removed", description: name });
    } catch (e) {
      toast({
        title: "Could not remove application",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Software the firm runs on — owners, license usage, and lifecycle
            status.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9" data-testid="button-add-app">
              <Plus className="h-4 w-4 mr-1.5" />
              Add application
            </Button>
          </DialogTrigger>
          <AddApplicationDialog
            departments={departments ?? []}
            agents={agents ?? []}
            onSubmit={async (input) => {
              await createMutation.mutateAsync({ data: input });
              await queryClient.invalidateQueries({
                queryKey: getListApplicationsQueryKey(),
              });
              setOpen(false);
              toast({ title: "Application added", description: input.name });
            }}
            submitting={createMutation.isPending}
          />
        </Dialog>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search applications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px] h-9" data-testid="select-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.v} value={c.v}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-[180px] h-9" data-testid="select-department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(departments ?? []).map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px] h-9" data-testid="select-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="piloting">Piloting</SelectItem>
            <SelectItem value="deprecated">Deprecated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[140px]">Vendor</TableHead>
              <TableHead className="w-[160px]">Category</TableHead>
              <TableHead className="w-[160px]">Owner</TableHead>
              <TableHead className="w-[140px]">Department</TableHead>
              <TableHead className="w-[120px]">Licenses</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : apps?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No applications yet. Click "Add application" to get started.
                </TableCell>
              </TableRow>
            ) : (
              apps?.map((app) => {
                const cat = CATEGORIES.find((c) => c.v === app.category);
                return (
                  <TableRow
                    key={app.id}
                    data-testid={`row-app-${app.id}`}
                  >
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {app.name}
                      </div>
                      {app.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[420px]">
                          {app.description}
                        </div>
                      )}
                      {app.website && (
                        <a
                          href={app.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {prettyHost(app.website)}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.vendor || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={categoryColor(app.category)}>
                        {cat?.label ?? app.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.ownerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.departmentName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {app.licenseSeats != null ? (
                        <LicenseBar
                          used={app.licenseUsed ?? 0}
                          seats={app.licenseSeats}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground/70">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(app.status)}>
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDelete(app.id, app.name)}
                        data-testid={`button-delete-app-${app.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type CreateInput = {
  name: string;
  vendor: string;
  category:
    | "productivity"
    | "design"
    | "ops"
    | "finance"
    | "dev"
    | "security"
    | "other";
  status: "active" | "piloting" | "deprecated";
  description: string;
  website: string | null;
  ownerId: number | null;
  departmentId: number | null;
  licenseSeats: number | null;
  licenseUsed: number | null;
};

function AddApplicationDialog({
  departments,
  agents,
  onSubmit,
  submitting,
}: {
  departments: { id: number; name: string }[];
  agents: { id: number; name: string }[];
  onSubmit: (input: CreateInput) => Promise<void>;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<CreateInput["category"]>("productivity");
  const [status, setStatus] = useState<CreateInput["status"]>("active");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [ownerId, setOwnerId] = useState<string>("none");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [seats, setSeats] = useState<string>("");
  const [used, setUsed] = useState<string>("");

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add application</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="app-name">Name</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Procore"
              data-testid="input-app-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-vendor">Vendor</Label>
            <Input
              id="app-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Procore Technologies"
              data-testid="input-app-vendor"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CreateInput["category"])}
            >
              <SelectTrigger data-testid="select-app-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.v} value={c.v}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CreateInput["status"])}
            >
              <SelectTrigger data-testid="select-app-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="piloting">Piloting</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger data-testid="select-app-owner">
                <SelectValue placeholder="No owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No owner</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger data-testid="select-app-department">
                <SelectValue placeholder="Firm-wide" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Firm-wide</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-website">Website</Label>
          <Input
            id="app-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            data-testid="input-app-website"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="app-seats">License seats</Label>
            <Input
              id="app-seats"
              type="number"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              placeholder="e.g. 50"
              data-testid="input-app-seats"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-used">Seats in use</Label>
            <Input
              id="app-used"
              type="number"
              value={used}
              onChange={(e) => setUsed(e.target.value)}
              placeholder="e.g. 32"
              data-testid="input-app-used"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-desc">Description</Label>
          <Textarea
            id="app-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this app used for?"
            data-testid="input-app-description"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              name: name.trim(),
              vendor: vendor.trim(),
              category,
              status,
              description: description.trim(),
              website: website.trim() || null,
              ownerId: ownerId === "none" ? null : Number(ownerId),
              departmentId:
                departmentId === "none" ? null : Number(departmentId),
              licenseSeats: seats ? Number(seats) : null,
              licenseUsed: used ? Number(used) : null,
            })
          }
          disabled={!name.trim() || submitting}
          data-testid="button-confirm-add-app"
        >
          {submitting ? "Saving…" : "Add application"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function LicenseBar({ used, seats }: { used: number; seats: number }) {
  const pct = seats > 0 ? Math.min(100, Math.round((used / seats) * 100)) : 0;
  const tone =
    pct >= 95
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="text-xs tabular-nums text-muted-foreground">
        {used}/{seats}
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function categoryColor(c: string) {
  switch (c) {
    case "productivity":
      return "bg-blue-100 text-blue-700";
    case "design":
      return "bg-violet-100 text-violet-700";
    case "ops":
      return "bg-amber-100 text-amber-800";
    case "finance":
      return "bg-emerald-100 text-emerald-700";
    case "dev":
      return "bg-indigo-100 text-indigo-700";
    case "security":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusColor(s: string) {
  switch (s) {
    case "active":
      return "bg-emerald-100 text-emerald-700";
    case "piloting":
      return "bg-blue-100 text-blue-700";
    case "deprecated":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function prettyHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
