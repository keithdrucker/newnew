import { useEffect, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  slaStatus: string | null | undefined;
  resolutionDueAt: string | null | undefined;
  resolvedAt?: string | null;
  size?: "sm" | "md";
  className?: string;
};

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

/**
 * Live SLA indicator. Shows "Breached" when the backend already marked the
 * ticket breached, "Resolved" when there's no active deadline, otherwise
 * counts down toward `resolutionDueAt` and re-renders every second.
 */
export function SlaCountdown({
  slaStatus,
  resolutionDueAt,
  resolvedAt,
  size = "sm",
  className,
}: Props) {
  // Re-render every second so the countdown stays live without re-fetching
  // the ticket. We only need wall-clock now; we don't store it.
  const [, force] = useState(0);
  useEffect(() => {
    if (slaStatus === "breached" || resolvedAt || !resolutionDueAt) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [slaStatus, resolvedAt, resolutionDueAt]);

  const textSize = size === "sm" ? "text-xs" : "text-sm";

  if (slaStatus === "breached") {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-amber-100 text-amber-800", className)}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Breached
      </Badge>
    );
  }

  if (resolvedAt || !resolutionDueAt) {
    return (
      <span className={cn(textSize, "text-muted-foreground/70", className)}>
        On track
      </span>
    );
  }

  const remainingMs = new Date(resolutionDueAt).getTime() - Date.now();

  // Defensive: due date already passed but backend hasn't recomputed yet.
  // Treat as breached visually so the UI isn't misleading.
  if (remainingMs <= 0) {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-amber-100 text-amber-800", className)}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Breached
      </Badge>
    );
  }

  // Color the badge by urgency: <1h critical (red), <4h warning (orange),
  // otherwise on-track (green/emerald).
  const oneHour = 60 * 60 * 1000;
  const fourHours = 4 * oneHour;
  const tone =
    remainingMs < oneHour
      ? "bg-red-100 text-red-800"
      : remainingMs < fourHours
        ? "bg-orange-100 text-orange-800"
        : "bg-emerald-100 text-emerald-800";

  return (
    <Badge
      variant="secondary"
      className={cn(tone, "tabular-nums", className)}
      title={`Due ${new Date(resolutionDueAt).toLocaleString()}`}
    >
      <Clock className="h-3 w-3 mr-1" />
      {formatRemaining(remainingMs)} left
    </Badge>
  );
}
