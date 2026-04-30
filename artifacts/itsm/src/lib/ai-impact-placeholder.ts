import type { Ticket } from "@workspace/api-client-react";

// PLACEHOLDER DATA — isolated from the dashboard component on purpose.
//
// The product currently has no AI handling pipeline and no per-ticket
// timing breakdown for "AI vs human" handling. The Support Performance
// dashboard spec calls for AI Impact and Time Intelligence sections
// anyway, so we derive *plausible* values from the real ticket dataset
// (deterministic, scoped to whatever filter the user picked) and label
// the section accordingly. When the AI tracking backend lands, replace
// every function below with a real query — the shape of the returned
// objects is stable and consumed by the dashboard.

const AI_DEFLECTION_RATE = 0.32;
const AI_RESOLUTION_RATE = 0.18;
const AVG_HUMAN_RESOLUTION_MIN = 47;
const AVG_AI_RESOLUTION_MIN = 4;

export interface AiImpactSummary {
  aiResolved: number;
  aiDeflected: number;
  humanEscalated: number;
  estimatedMinutesSaved: number;
  donutData: Array<{ name: string; value: number; fill: string }>;
  deflectedVsCreated: Array<{ name: string; value: number; fill: string }>;
  trend: Array<{ date: string; minutesSaved: number }>;
}

export interface TimeIntelligenceSummary {
  avgMinutesPerTicket: number;
  minutesSavedBeforeAssignment: number;
  humanSupportMinutes: number;
  aiHandlingMinutes: number;
  comparisonChart: Array<{ name: string; value: number; fill: string }>;
  trend: Array<{ date: string; humanMinutes: number; aiMinutes: number }>;
}

function avgResolutionMinutes(tickets: ReadonlyArray<Ticket>): number {
  let total = 0;
  let count = 0;
  for (const t of tickets) {
    if (t.resolvedAt) {
      const ms =
        new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime();
      if (Number.isFinite(ms) && ms > 0) {
        total += ms;
        count += 1;
      }
    }
  }
  if (count === 0) return AVG_HUMAN_RESOLUTION_MIN;
  return total / count / 60_000;
}

export function buildAiImpactSummary(
  tickets: ReadonlyArray<Ticket>,
): AiImpactSummary {
  const created = tickets.length;
  const aiResolved = Math.round(created * AI_RESOLUTION_RATE);
  const aiDeflected = Math.round(created * AI_DEFLECTION_RATE);
  const humanEscalated = Math.max(created - aiResolved, 0);
  const avgHumanMin = avgResolutionMinutes(tickets);
  const estimatedMinutesSaved = Math.round(aiDeflected * avgHumanMin);

  const donutData = [
    { name: "AI Resolved", value: aiResolved, fill: "#6366f1" },
    { name: "Human Escalated", value: humanEscalated, fill: "#f97316" },
  ];
  const deflectedVsCreated = [
    { name: "Tickets Created", value: created, fill: "#0ea5e9" },
    { name: "AI Deflected", value: aiDeflected, fill: "#10b981" },
  ];

  // Trend: bucket scoped tickets by ISO date and apply the deflection
  // rate for that day's volume × avg human resolution time, so the
  // chart actually moves with the date filter instead of looking like
  // a static demo curve.
  const byDate = new Map<string, number>();
  for (const t of tickets) {
    const d = new Date(t.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  const trend = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({
      date,
      minutesSaved: Math.round(count * AI_DEFLECTION_RATE * avgHumanMin),
    }));

  return {
    aiResolved,
    aiDeflected,
    humanEscalated,
    estimatedMinutesSaved,
    donutData,
    deflectedVsCreated,
    trend,
  };
}

export function buildTimeIntelligenceSummary(
  tickets: ReadonlyArray<Ticket>,
): TimeIntelligenceSummary {
  const avgHumanMin = avgResolutionMinutes(tickets);
  const aiImpact = buildAiImpactSummary(tickets);
  const aiHandlingMinutes = aiImpact.aiResolved * AVG_AI_RESOLUTION_MIN;
  const humanSupportMinutes = Math.round(
    (tickets.length - aiImpact.aiResolved) * avgHumanMin,
  );
  const minutesSavedBeforeAssignment = Math.round(
    aiImpact.aiDeflected * avgHumanMin * 0.6,
  );
  const comparisonChart = [
    { name: "Avg AI Resolution", value: AVG_AI_RESOLUTION_MIN, fill: "#6366f1" },
    {
      name: "Avg Human Resolution",
      value: Math.round(avgHumanMin),
      fill: "#f97316",
    },
  ];

  const byDate = new Map<string, { hum: number; ai: number }>();
  for (const t of tickets) {
    const d = new Date(t.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const cur = byDate.get(key) ?? { hum: 0, ai: 0 };
    cur.hum += avgHumanMin;
    cur.ai += AVG_AI_RESOLUTION_MIN;
    byDate.set(key, cur);
  }
  const trend = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      humanMinutes: Math.round(v.hum * (1 - AI_RESOLUTION_RATE)),
      aiMinutes: Math.round(v.ai * AI_RESOLUTION_RATE),
    }));

  return {
    avgMinutesPerTicket: Math.round(avgHumanMin),
    minutesSavedBeforeAssignment,
    humanSupportMinutes,
    aiHandlingMinutes,
    comparisonChart,
    trend,
  };
}

export function fmtMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}
