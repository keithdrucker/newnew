import { useListAgents, useListDepartments } from "@workspace/api-client-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function Agents() {
  const [departmentId, setDepartmentId] = useState<string>("all");
  const { data: departments } = useListDepartments();
  const { data: agents, isLoading } = useListAgents({
    departmentId: departmentId === "all" ? undefined : Number(departmentId),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Service desk agents and admins.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right w-[140px]">Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : agents?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No agents found.
                </TableCell>
              </TableRow>
            ) : (
              agents?.map((a) => (
                <TableRow key={a.id} data-testid={`row-agent-${a.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">
                          {a.name
                            .split(" ")
                            .slice(0, 2)
                            .map((s) => s[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{a.name}</div>
                        <div className="text-xs text-slate-500">{a.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{a.title ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {a.departmentName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        a.role === "admin"
                          ? "bg-violet-100 text-violet-700 capitalize"
                          : "bg-blue-100 text-blue-700 capitalize"
                      }
                    >
                      {a.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {a.ticketsAssigned > 0 ? (
                      <Badge variant="secondary">{a.ticketsAssigned}</Badge>
                    ) : (
                      <span className="text-slate-400 text-sm">0</span>
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
