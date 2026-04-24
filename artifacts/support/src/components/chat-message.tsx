import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { chatTimestamp, initials } from "@/lib/format";

/**
 * Chat message author roles.
 *
 * NOTE: The chat surface is intentionally structured around three author
 * roles — `user`, `agent`, and a future `assistant` — so that an LLM-powered
 * support assistant can be inserted into the same message stream later
 * without restructuring the UI. This task only renders `user` and `agent`
 * (mapped from real ticket comments); `assistant` is reserved for a follow-up.
 */
export type ChatAuthorRole = "user" | "agent" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatAuthorRole;
  authorName: string;
  body: string;
  createdAt: string;
  pending?: boolean;
}

interface Props {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-2.5 group",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
      data-testid={`chat-message-${message.id}`}
    >
      <Avatar className="h-7 w-7 mt-0.5 shrink-0">
        <AvatarFallback
          className={cn(
            "text-[10px] font-medium",
            isUser
              ? "bg-primary text-primary-foreground"
              : isAssistant
                ? "bg-chart-3 text-white"
                : "bg-secondary text-secondary-foreground",
          )}
        >
          {initials(message.authorName)}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex flex-col max-w-[78%] sm:max-w-[70%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "flex items-baseline gap-2 px-1 mb-0.5",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="text-[11px] font-medium">
            {isUser ? "You" : message.authorName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {chatTimestamp(message.createdAt)}
          </span>
          {message.pending ? (
            <span className="text-[10px] text-muted-foreground italic">
              sending…
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : isAssistant
                ? "bg-chart-3/15 text-foreground rounded-tl-sm border border-chart-3/30"
                : "bg-card text-card-foreground rounded-tl-sm border",
            message.pending && "opacity-70",
          )}
        >
          {message.body}
        </div>
      </div>
    </div>
  );
}
