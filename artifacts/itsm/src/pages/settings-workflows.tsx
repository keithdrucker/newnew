import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListWorkflows,
  useDeleteWorkflow,
  getListWorkflowsQueryKey,
  type Workflow,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Plus, Trash2, Pencil } from "lucide-react";
import {
  MODULE_LABELS,
  TRIGGER_LABELS,
  WORKFLOW_TYPE_LABELS,
  type ModuleKey,
} from "@/lib/workflow-options";

export default function SettingsWorkflows() {
  const { session } = useSession();
  const [moduleFilter, setModuleFilter] = useState<"all" | ModuleKey>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "active" | "inactive"
  >("all");
  const { data: workflows, isLoading } = useListWorkflows({
    ...(moduleFilter !== "all" ? { module: moduleFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteWorkflow = useDeleteWorkflow();

  const sorted = useMemo(
    () =>
      (workflows ?? []).slice().sort((a, b) => {
        const sa = a.status === "active" ? 0 : a.status === "draft" ? 1 : 2;
        const sb = b.status === "active" ? 0 : b.status === "draft" ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [workflows],
  );

  if (session && session.role !== "admin") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can manage workflows.
        </p>
      </div>
    );
  }

  async function handleDelete(wf: Workflow) {
    if (!confirm(`Delete the workflow "${wf.name}"? This cannot be undone.`))
      return;
    try {
      await deleteWorkflow.mutateAsync({ id: wf.id });
      await queryClient.invalidateQueries({
        queryKey: getListWorkflowsQueryKey(),
      });
      toast({ title: "Workflow deleted", description: wf.name });
    } catch (err) {
      toast({
        title: "Couldn't delete workflow",
        description:
          err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 hover:text-foreground"
          data-testid="link-back-settings"
        >
          <ChevronLeft className="h-4 w-4" /> Settings
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Workflows</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define the WHEN / IF / THEN automations and approval chains that run
          across modules. Workflows can be drafted, activated, or paused at any
          time.
        </p>
      </div>

      <Card data-testid="card-workflows">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">All workflows</CardTitle>
            <CardDescription>
              Filter by module or status. Click a row to edit the rule.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={moduleFilter}
              onValueChange={(v) => setModuleFilter(v as typeof moduleFilter)}
            >
              <SelectTrigger
                className="w-[150px]"
                data-testid="select-filter-module"
              >
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {MODULE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger
                className="w-[140px]"
                data-testid="select-filter-status"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild data-testid="button-new-workflow">
              <Link href="/settings/workflows/new">
                <Plus className="h-4 w-4 mr-1.5" />
                New workflow
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workflows match the current filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px]">Module</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[200px]">Trigger</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[150px]">Updated</TableHead>
                  <TableHead className="w-[100px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((wf) => (
                  <TableRow
                    key={wf.id}
                    className="cursor-pointer"
                    data-testid={`row-workflow-${wf.id}`}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/settings/workflows/${wf.id}`}
                        className="hover:underline"
                        data-testid={`link-workflow-${wf.id}`}
                      >
                        {wf.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {MODULE_LABELS[wf.module as ModuleKey] ?? wf.module}
                    </TableCell>
                    <TableCell className="capitalize">
                      {WORKFLOW_TYPE_LABELS[wf.workflowType] ??
                        wf.workflowType.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {TRIGGER_LABELS[wf.trigger] ?? wf.trigger}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={wf.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(wf.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-edit-workflow-${wf.id}`}
                      >
                        <Link href={`/settings/workflows/${wf.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(wf)}
                        data-testid={`button-delete-workflow-${wf.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Active
      </Badge>
    );
  }
  if (status === "inactive") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Inactive
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300">
      Draft
    </Badge>
  );
}
