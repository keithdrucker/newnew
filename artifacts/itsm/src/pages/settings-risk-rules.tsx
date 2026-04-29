import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useListRiskRules,
  useCreateRiskRule,
  useUpdateRiskRule,
  useDeleteRiskRule,
  getListRiskRulesQueryKey,
  type RiskRule,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/components/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { RiskLevelBadge } from "@/pages/ticket-detail";

type RiskLevel = "low" | "medium" | "high" | "critical";

export default function SettingsRiskRules() {
  const { session } = useSession();
  const { data: rules, isLoading } = useListRiskRules();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createRule = useCreateRiskRule();
  const updateRule = useUpdateRiskRule();
  const deleteRule = useDeleteRiskRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RiskRule | null>(null);
  const [category, setCategory] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");

  useEffect(() => {
    if (!dialogOpen) {
      setEditing(null);
      setCategory("");
      setRiskLevel("medium");
    }
  }, [dialogOpen]);

  if (session && session.role !== "admin") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Risk rules</h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can manage risk rules.
        </p>
      </div>
    );
  }

  function openAdd() {
    setEditing(null);
    setCategory("");
    setRiskLevel("medium");
    setDialogOpen(true);
  }

  function openEdit(rule: RiskRule) {
    setEditing(rule);
    setCategory(rule.category);
    setRiskLevel(rule.riskLevel as RiskLevel);
    setDialogOpen(true);
  }

  async function handleSave() {
    const cat = category.trim();
    if (!cat) return;
    try {
      if (editing) {
        await updateRule.mutateAsync({
          id: editing.id,
          data: { category: cat, riskLevel },
        });
      } else {
        await createRule.mutateAsync({ data: { category: cat, riskLevel } });
      }
      await queryClient.invalidateQueries({
        queryKey: getListRiskRulesQueryKey(),
      });
      setDialogOpen(false);
      toast({
        title: editing ? "Rule updated" : "Rule added",
        description: `${cat} → ${riskLevel}`,
      });
    } catch (err) {
      toast({
        title: "Couldn't save rule",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(rule: RiskRule) {
    if (!confirm(`Delete the risk rule for "${rule.category}"?`)) return;
    try {
      await deleteRule.mutateAsync({ id: rule.id });
      await queryClient.invalidateQueries({
        queryKey: getListRiskRulesQueryKey(),
      });
      toast({ title: "Rule deleted", description: rule.category });
    } catch (err) {
      toast({
        title: "Couldn't delete rule",
        description: err instanceof Error ? err.message : "Something went wrong.",
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
        <span className="text-foreground font-medium">Risk rules</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Risk rules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Map ticket categories to a default risk level. New tickets created
          with a matching category will start at this risk level unless an
          agent overrides it.
        </p>
      </div>

      <Card data-testid="card-risk-rules">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Category → Risk level</CardTitle>
            <CardDescription>
              Used by automation and the create-ticket flow.
            </CardDescription>
          </div>
          <Button onClick={openAdd} data-testid="button-add-risk-rule">
            <Plus className="h-4 w-4 mr-1.5" />
            Add rule
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !rules || rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No risk rules yet. Add one to set defaults for new tickets.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[160px]">Risk level</TableHead>
                  <TableHead className="w-[120px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow
                    key={rule.id}
                    data-testid={`row-risk-rule-${rule.id}`}
                  >
                    <TableCell className="font-medium">
                      {rule.category}
                    </TableCell>
                    <TableCell>
                      <RiskLevelBadge level={rule.riskLevel} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(rule)}
                        data-testid={`button-edit-risk-rule-${rule.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(rule)}
                        data-testid={`button-delete-risk-rule-${rule.id}`}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit risk rule" : "Add risk rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-category">Category</Label>
              <Input
                id="rule-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Security Incident"
                data-testid="input-rule-category"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default risk level</Label>
              <Select
                value={riskLevel}
                onValueChange={(v) => setRiskLevel(v as RiskLevel)}
              >
                <SelectTrigger data-testid="select-rule-risk-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !category.trim() ||
                createRule.isPending ||
                updateRule.isPending
              }
              data-testid="button-save-risk-rule"
            >
              {editing ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
