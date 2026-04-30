import type { Ticket, TicketRiskLevel } from "@workspace/api-client-react";

export const RISK_LEVELS: ReadonlyArray<TicketRiskLevel | "uncategorized"> = [
  "critical",
  "high",
  "medium",
  "low",
  "uncategorized",
];

export const RISK_LEVEL_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  uncategorized: "Uncategorized",
};

export const RISK_LEVEL_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#10b981",
  uncategorized: "#94a3b8",
};

export const ROOT_CAUSE_CATEGORIES = [
  "User Error / Training Gap",
  "Software Issue / Bug",
  "Configuration Issue",
  "Access / Permissions",
  "Network / Connectivity",
  "Hardware Failure",
  "Data Issue",
  "External Vendor Issue",
  "Security / Policy Block",
  "Other (Needs Review)",
  "Unknown / Not Categorized",
] as const;

export const RESOLUTION_CATEGORIES = [
  "User Training / Guidance",
  "Configuration Change",
  "Software Fix / Patch",
  "Access Granted / Modified",
  "System Restart / Reset",
  "Hardware Replacement",
  "Escalated to Vendor",
  "Process Change",
  "Documentation Updated",
  "No Issue Found",
  "Other (Needs Review)",
  "Unknown / Not Categorized",
] as const;

export const CATEGORY_PALETTE = [
  "#6366f1",
  "#10b981",
  "#f97316",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
  "#facc15",
  "#22d3ee",
  "#f472b6",
  "#84cc16",
  "#fb7185",
  "#94a3b8",
];

// Lightweight rule-based classifier. Designed to be replaced later by
// the categorization spec (manual selection + AI-suggested + stored
// `rootCauseCategory`/`resolutionCategory` fields). Until those fields
// exist on the Ticket schema, this falls back to reading the free-text
// `rootCause` / `resolution` notes that are already on every ticket.
function matchKeywords(
  text: string | null | undefined,
  rules: ReadonlyArray<readonly [string, ReadonlyArray<string>]>,
  fallback: string,
): string {
  if (!text) return fallback;
  const lower = text.toLowerCase();
  for (const [label, keywords] of rules) {
    for (const k of keywords) {
      if (lower.includes(k)) return label;
    }
  }
  return fallback;
}

export function classifyRootCause(notes: string | null | undefined): string {
  return matchKeywords(
    notes,
    [
      [
        "User Error / Training Gap",
        ["user error", "training", "didn't know", "did not know", "unfamiliar", "misuse"],
      ],
      [
        "Software Issue / Bug",
        ["bug", "crash", "exception", "stack trace", "regression", "broken"],
      ],
      [
        "Configuration Issue",
        ["config", "setting", "misconfigured", "policy missing", "wrong value"],
      ],
      [
        "Access / Permissions",
        ["permission", "access denied", "forbidden", "unauthorized", "role missing", "rbac"],
      ],
      [
        "Network / Connectivity",
        ["network", "connectivity", "vpn", "dns", "timeout", "offline", "wifi"],
      ],
      [
        "Hardware Failure",
        ["hardware", "disk", "ram", "device failed", "battery", "thermal"],
      ],
      [
        "Data Issue",
        ["corrupt data", "stale data", "data missing", "import failed", "csv"],
      ],
      [
        "External Vendor Issue",
        ["vendor", "third party", "third-party", "upstream outage", "supplier"],
      ],
      [
        "Security / Policy Block",
        ["security", "policy block", "blocked by", "compliance", "firewall", "mfa"],
      ],
    ],
    "Unknown / Not Categorized",
  );
}

export function classifyResolution(notes: string | null | undefined): string {
  return matchKeywords(
    notes,
    [
      [
        "User Training / Guidance",
        ["walked", "trained", "showed", "guidance", "explained", "training"],
      ],
      [
        "Configuration Change",
        ["config change", "updated setting", "changed setting", "reconfigured", "policy update"],
      ],
      [
        "Software Fix / Patch",
        ["patch", "hotfix", "deployed fix", "release", "rolled out", "code fix"],
      ],
      [
        "Access Granted / Modified",
        ["granted access", "added to group", "permission granted", "role added", "access restored"],
      ],
      [
        "System Restart / Reset",
        ["restart", "rebooted", "reset", "reboot", "service restart"],
      ],
      [
        "Hardware Replacement",
        ["replaced", "swapped", "new device", "rma", "replacement"],
      ],
      [
        "Escalated to Vendor",
        ["escalated", "vendor ticket", "supplier", "third party", "third-party"],
      ],
      [
        "Process Change",
        ["process update", "runbook", "playbook", "process change", "policy change"],
      ],
      [
        "Documentation Updated",
        ["updated docs", "kb article", "documented", "knowledge base"],
      ],
      [
        "No Issue Found",
        ["no issue", "could not reproduce", "cannot reproduce", "not a bug", "user closed"],
      ],
    ],
    "Unknown / Not Categorized",
  );
}

export function getTicketRiskBucket(t: Ticket): string {
  return t.riskLevel ?? "uncategorized";
}

export function getTicketCategoryBucket(t: Ticket): string {
  const c = (t.category ?? "").trim();
  return c.length === 0 ? "Uncategorized" : c;
}

// `rootCauseCategory` / `resolutionCategory` aren't yet stored on the
// Ticket schema. Until the categorization spec ships and persists them,
// derive at read-time from the existing free-text notes so dashboards
// already reflect categorization signal. When the persisted fields land,
// these helpers should prefer the persisted value when present.
export function getTicketRootCauseCategory(t: Ticket): string {
  return classifyRootCause(t.rootCause);
}

export function getTicketResolutionCategory(t: Ticket): string {
  return classifyResolution(t.resolution);
}

export function bucketCounts<T>(
  items: ReadonlyArray<T>,
  bucketOf: (item: T) => string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const k = bucketOf(item);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
