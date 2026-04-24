import {
  useDeleteKbArticle,
  getListKbArticlesQueryKey,
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

export function DeleteArticleDialog({
  articleId,
  articleTitle,
  open,
  onOpenChange,
  onDeleted,
}: {
  articleId: number;
  articleTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteKbArticle();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const onConfirm = () => {
    del.mutate(
      { id: articleId },
      {
        onSuccess: () => {
          toast({
            title: "Source removed",
            description: `"${articleTitle}" has been deleted.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListKbArticlesQueryKey(),
          });
          onOpenChange(false);
          onDeleted?.();
        },
        onError: (err) => {
          toast({
            title: "Could not delete",
            description:
              err instanceof Error
                ? err.message
                : "You may not have permission to delete this article.",
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
          <AlertDialogTitle>Remove this source?</AlertDialogTitle>
          <AlertDialogDescription>
            "{articleTitle}" will be permanently removed from the knowledge
            base. This action cannot be undone.
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
            data-testid="button-confirm-delete-article"
          >
            {del.isPending ? "Removing…" : "Remove source"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
