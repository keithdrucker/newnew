import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from "react";
import { Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChatComposerHandle {
  focus: () => void;
  clear: () => void;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  pending?: boolean;
  placeholder?: string;
  submitLabel?: string;
  hint?: string;
  /**
   * NOTE: When the LLM-powered support assistant is added, an "assistant
   * suggestion" surface (e.g. canned reply chips, draft preview, /commands
   * picker) can be rendered above this composer using the same submit path.
   * This component is intentionally simple to keep that future extension
   * point clean.
   */
  toolbar?: React.ReactNode;
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      value,
      onChange,
      onSubmit,
      disabled = false,
      pending = false,
      placeholder = "Write a reply…",
      submitLabel = "Send",
      hint,
      toolbar,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => onChange(""),
    }));

    const trimmed = value.trim();
    const canSubmit = trimmed.length > 0 && !disabled && !pending;

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (canSubmit) onSubmit();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }
    };

    return (
      <div className="border-t bg-card">
        <div className="px-3 sm:px-4 py-3">
          {toolbar ? <div className="mb-2">{toolbar}</div> : null}
          <div
            className={cn(
              "flex items-end gap-2 rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/40 transition-shadow",
              disabled && "opacity-60",
            )}
          >
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || pending}
              rows={1}
              className="min-h-[44px] max-h-40 border-0 bg-transparent shadow-none resize-none focus-visible:ring-0 px-3 py-2.5 text-sm"
              data-testid="input-chat-message"
            />
            <Button
              type="button"
              size="sm"
              className="m-1.5 h-8 px-3"
              disabled={!canSubmit}
              onClick={onSubmit}
              data-testid="button-send-message"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">{submitLabel}</span>
            </Button>
          </div>
          <div className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            {hint ?? "Press Enter to send · Shift + Enter for a new line"}
          </div>
        </div>
      </div>
    );
  },
);
