import {
  useDeleteDepartment,
  getListDepartmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { BoardViewModel } from "@/lib/board";

export function DeleteBoardDialog({
  board,
  open,
  onOpenChange,
  onDeleted,
}: {
  board: Pick<BoardViewModel, "id" | "name" | "ticketCount">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteDepartment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { id: boardId, name: boardName, ticketCount } = board;

  const onConfirm = () => {
    del.mutate(
      { id: boardId },
      {
        onSuccess: () => {
          toast({
            title: "Board deleted",
            description: `${boardName} has been removed.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListDepartmentsQueryKey(),
          });
          onOpenChange(false);
          onDeleted?.();
        },
        onError: (err) => {
          toast({
            title: "Could not delete board",
            description:
              err instanceof Error
                ? err.message
                : "The board may still have tickets, agents, or other data attached.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this board?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                You're about to delete{" "}
                <span className="font-medium text-foreground">{boardName}</span>
                . This will remove the board from the sidebar and from the
                department picker everywhere in the app.
              </p>
              {ticketCount > 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                  This board still has {ticketCount} ticket
                  {ticketCount === 1 ? "" : "s"}. Deletion will fail until those
                  tickets are reassigned or removed.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={del.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={del.isPending}
            data-testid="button-confirm-delete-board"
          >
            {del.isPending ? "Deleting…" : "Delete board"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
