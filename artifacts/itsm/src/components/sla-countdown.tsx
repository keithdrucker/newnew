import { useEffect, useState } from "react";
import { AlertCircle, Clock, Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Phase = "response" | "resolution" | "none";

type Props = {
  slaStatus: string | null | undefined;
  /** Effective deadline of the active SLA (preferred). Falls back to
   *  resolutionDueAt when the server hasn't supplied it (older payloads). */
  slaActiveDueAt?: string | null | undefined;
  slaPhase?: Phase | null | undefined;
  slaPaused?: boolean | null | undefined;
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

function phaseLabel(phase: Phase | null | undefined): string {
  if (phase === "response") return "Response";
  if (phase === "resolution") return "Resolution";
  return "";
}

/**
 * Live SLA indicator. Renders one of four states keyed off `slaPhase`:
 *  - "On Track" (no active phase or no due date)
 *  - "Paused — <Phase>" (resolution clock paused while waiting on user/vendor/etc.)
 *  - "⏱ <remaining> — <Phase>" (active countdown, color by urgency)
 *  - "Breached — <Phase>" (deadline elapsed)
 *
 * Re-renders every second so the countdown stays live without re-fetching.
 */
export function SlaCountdown({
  slaStatus,
  slaActiveDueAt,
  slaPhase,
  slaPaused,
  resolutionDueAt,
  resolvedAt,
  size = "sm",
  className,
}: Props) {
  // Prefer the server-provided active due date (accounts for pause time);
  // fall back to resolutionDueAt when missing.
  const activeDue = slaActiveDueAt ?? resolutionDueAt ?? null;
  const phase: Phase = slaPhase ?? (resolvedAt ? "none" : "resolution");

  const [, force] = useState(0);
  useEffect(() => {
    if (
      slaStatus === "breached" ||
      slaPaused ||
      phase === "none" ||
      !activeDue
    )
      return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [slaStatus, slaPaused, phase, activeDue]);

  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const phaseSuffix = phaseLabel(phase) ? ` — ${phaseLabel(phase)}` : "";

  // Breached wins over paused (server signals breach via slaStatus).
  if (slaStatus === "breached") {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-amber-100 text-amber-800", className)}
        data-testid="sla-badge-breached"
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Breached{phaseSuffix}
      </Badge>
    );
  }

  // Paused — slate badge so it's visually distinct from active countdown.
  if (slaPaused) {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-slate-100 text-slate-700", className)}
        data-testid="sla-badge-paused"
      >
        <Pause className="h-3 w-3 mr-1" />
        Paused{phaseSuffix}
      </Badge>
    );
  }

  // No active SLA (resolved/closed or no due date) — quiet "On Track".
  if (phase === "none" || !activeDue) {
    return (
      <span
        className={cn(textSize, "text-muted-foreground/70", className)}
        data-testid="sla-on-track"
      >
        On Track
      </span>
    );
  }

  const remainingMs = new Date(activeDue).getTime() - Date.now();

  // Defensive: due date already passed but backend hasn't recomputed yet.
  if (remainingMs <= 0) {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-amber-100 text-amber-800", className)}
        data-testid="sla-badge-breached"
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Breached{phaseSuffix}
      </Badge>
    );
  }

  // Color the badge by urgency: <1h critical (red), <4h warning (orange),
  // otherwise on-track (emerald).
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
      title={`Due ${new Date(activeDue).toLocaleString()}`}
      data-testid="sla-badge-active"
    >
      <Clock className="h-3 w-3 mr-1" />
      {formatRemaining(remainingMs)} left{phaseSuffix}
    </Badge>
  );
}
