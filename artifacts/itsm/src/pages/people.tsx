import { useListPeople, useListDepartments } from "@workspace/api-client-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { AddPersonDialog } from "@/components/people/add-person-dialog";

export default function People() {
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: departments } = useListDepartments();
  const { data: people, isLoading } = useListPeople({
    departmentId: departmentId === "all" ? undefined : Number(departmentId),
    q: search || undefined,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground mt-1">
            End users across &lt;Client Name&gt; who can submit tickets.
          </p>
        </div>
        <AddPersonDialog />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger
            className="w-[200px] h-9"
            data-testid="select-department"
          >
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
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right w-[120px]">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : people?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No people found.
                </TableCell>
              </TableRow>
            ) : (
              people?.map((p) => (
                <TableRow key={p.id} data-testid={`row-person-${p.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {p.name
                            .split(" ")
                            .slice(0, 2)
                            .map((s) => s[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.title ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {p.departmentName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.location ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.ticketsOpen > 0 ? (
                      <Badge variant="secondary">{p.ticketsOpen}</Badge>
                    ) : (
                      <span className="text-muted-foreground/70 text-sm">0</span>
                    )}
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
