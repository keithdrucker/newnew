import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Confirmation prompt shown by editor dialogs (Initiatives, Projects)
// when the user attempts to exit while there are unsaved edits. The
// three actions follow the agreed product copy:
//   - Save & Close (primary): persist edits, then close.
//   - Discard Changes: close without saving.
//   - Cancel: dismiss the prompt and stay on the editor.
//
// The component is purposefully unaware of the editor's domain — the
// caller wires up `onSave`, `onDiscard`, and the open state. This
// keeps the prompt reusable across initiatives, projects, and any
// future editor that needs the same protection.
export function UnsavedChangesDialog({
  open,
  onCancel,
  onSave,
  onDiscard,
  isSaving = false,
}: {
  open: boolean;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  isSaving?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSaving) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-unsaved-changes"
        onInteractOutside={(e) => {
          // While saving, lock the prompt so the user can't dismiss
          // it by clicking the backdrop mid-flight.
          if (isSaving) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isSaving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Do you want to save your changes
            before closing?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            data-testid="button-unsaved-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onDiscard}
            disabled={isSaving}
            data-testid="button-unsaved-discard"
          >
            Discard Changes
          </Button>
          <Button
            onClick={() => {
              void onSave();
            }}
            disabled={isSaving}
            data-testid="button-unsaved-save"
          >
            {isSaving ? "Saving…" : "Save & Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook that installs a `beforeunload` warning while `dirty` is true.
// Browsers show a native confirm sheet when the user closes the tab,
// reloads, or types a new URL — a final safety net beyond the
// in-app dialog interception.
export function useBeforeUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers require a non-empty returnValue. Modern
      // browsers ignore the message text and show their own copy.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
