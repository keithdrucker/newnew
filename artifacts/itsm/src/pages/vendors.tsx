import {
  useListVendors,
  useCreateVendor,
  useDeleteVendor,
  getListVendorsQueryKey,
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
import {
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { v: "software", label: "Software" },
  { v: "hardware", label: "Hardware" },
  { v: "services", label: "Services" },
  { v: "telecom", label: "Telecom" },
  { v: "consulting", label: "Consulting" },
  { v: "other", label: "Other" },
] as const;

export default function Vendors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: vendors, isLoading } = useListVendors({
    status: status === "all" ? undefined : (status as "active" | "inactive"),
    category:
      category === "all"
        ? undefined
        : (category as
            | "software"
            | "hardware"
            | "services"
            | "telecom"
            | "consulting"
            | "other"),
    q: search || undefined,
  });

  const createMutation = useCreateVendor();
  const deleteMutation = useDeleteVendor();

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Remove vendor "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListVendorsQueryKey(),
      });
      toast({ title: "Vendor removed", description: name });
    } catch (e) {
      toast({
        title: "Could not remove vendor",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            External suppliers and partners — software vendors, hardware
            resellers, MSPs, telecom carriers, and consultants.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9" data-testid="button-add-vendor">
              <Plus className="h-4 w-4 mr-1.5" />
              Add vendor
            </Button>
          </DialogTrigger>
          <AddVendorDialog
            onSubmit={async (input) => {
              await createMutation.mutateAsync({ data: input });
              await queryClient.invalidateQueries({
                queryKey: getListVendorsQueryKey(),
              });
              setOpen(false);
              toast({ title: "Vendor added", description: input.name });
            }}
            submitting={createMutation.isPending}
          />
        </Dialog>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[170px] h-9" data-testid="select-category">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead>Primary contact</TableHead>
              <TableHead className="w-[110px]">Apps linked</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : vendors?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No vendors yet. Click "Add vendor" to create one.
                </TableCell>
              </TableRow>
            ) : (
              vendors?.map((v) => {
                const cat = CATEGORIES.find((c) => c.v === v.category);
                return (
                  <TableRow key={v.id} data-testid={`row-vendor-${v.id}`}>
                    <TableCell>
                      <div className="font-medium text-foreground">{v.name}</div>
                      {v.notes && (
                        <div className="text-xs text-muted-foreground truncate max-w-[420px]">
                          {v.notes}
                        </div>
                      )}
                      {v.website && (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {prettyHost(v.website)}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={categoryColor(v.category)}
                      >
                        {cat?.label ?? v.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {v.contactName ? (
                        <div className="text-sm font-medium">{v.contactName}</div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">
                          —
                        </span>
                      )}
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {v.contactEmail && (
                          <a
                            href={`mailto:${v.contactEmail}`}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {v.contactEmail}
                          </a>
                        )}
                        {v.contactPhone && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {v.contactPhone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {v.appCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="bg-indigo-100 text-indigo-700 tabular-nums"
                        >
                          {v.appCount}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">
                          0
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(v.status)}>
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDelete(v.id, v.name)}
                        data-testid={`button-delete-vendor-${v.id}`}
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
  category:
    | "software"
    | "hardware"
    | "services"
    | "telecom"
    | "consulting"
    | "other";
  status: "active" | "inactive";
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  notes: string;
};

function AddVendorDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: CreateInput) => Promise<void>;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CreateInput["category"]>("software");
  const [status, setStatus] = useState<CreateInput["status"]>("active");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add vendor</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name">Name</Label>
            <Input
              id="vendor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Microsoft"
              data-testid="input-vendor-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CreateInput["category"])}
            >
              <SelectTrigger data-testid="select-vendor-category">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-contact-name">Contact name</Label>
            <Input
              id="vendor-contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Maria Chen"
              data-testid="input-vendor-contact-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CreateInput["status"])}
            >
              <SelectTrigger data-testid="select-vendor-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-email">Email</Label>
            <Input
              id="vendor-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="rep@vendor.com"
              data-testid="input-vendor-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-phone">Phone</Label>
            <Input
              id="vendor-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+1 555 555 0100"
              data-testid="input-vendor-phone"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-website">Website</Label>
          <Input
            id="vendor-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            data-testid="input-vendor-website"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-notes">Notes</Label>
          <Textarea
            id="vendor-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Account number, renewal date, contract terms…"
            data-testid="input-vendor-notes"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              name: name.trim(),
              category,
              status,
              contactName: contactName.trim() || null,
              contactEmail: contactEmail.trim() || null,
              contactPhone: contactPhone.trim() || null,
              website: website.trim() || null,
              notes: notes.trim(),
            })
          }
          disabled={!name.trim() || submitting}
          data-testid="button-confirm-add-vendor"
        >
          {submitting ? "Saving…" : "Add vendor"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function categoryColor(c: string) {
  switch (c) {
    case "software":
      return "bg-indigo-100 text-indigo-700";
    case "hardware":
      return "bg-blue-100 text-blue-700";
    case "services":
      return "bg-emerald-100 text-emerald-700";
    case "telecom":
      return "bg-cyan-100 text-cyan-700";
    case "consulting":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusColor(s: string) {
  switch (s) {
    case "active":
      return "bg-emerald-100 text-emerald-700";
    case "inactive":
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
