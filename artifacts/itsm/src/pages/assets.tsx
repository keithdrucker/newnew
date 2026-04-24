import { useListAssets, useListDepartments } from "@workspace/api-client-react";
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
import { Search } from "lucide-react";

export default function Assets() {
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: departments } = useListDepartments();
  const { data: assets, isLoading } = useListAssets({
    departmentId: departmentId === "all" ? undefined : Number(departmentId),
    status:
      status === "all"
        ? undefined
        : (status as "in_use" | "in_storage" | "retired" | "repair"),
    q: search || undefined,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hardware, vehicles, tools, and licenses across the firm.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-[180px] h-9" data-testid="select-department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
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
            <SelectItem value="in_use">In use</SelectItem>
            <SelectItem value="in_storage">In storage</SelectItem>
            <SelectItem value="repair">Repair</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow>
              <TableHead className="w-[140px]">Tag</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : assets?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              assets?.map((a) => (
                <TableRow key={a.id} data-testid={`row-asset-${a.id}`}>
                  <TableCell className="font-mono text-xs">
                    {a.assetTag}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.manufacturer} {a.model ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{a.type}</TableCell>
                  <TableCell className="text-sm">
                    {a.departmentName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.assignedToName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{a.location ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={statusColor(a.status)}
                    >
                      {a.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "in_use":
      return "bg-emerald-100 text-emerald-700 capitalize";
    case "in_storage":
      return "bg-blue-100 text-blue-700 capitalize";
    case "repair":
      return "bg-amber-100 text-amber-800 capitalize";
    case "retired":
      return "bg-slate-200 text-slate-700 capitalize";
    default:
      return "bg-slate-100 text-slate-700 capitalize";
  }
}
