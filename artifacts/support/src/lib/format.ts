import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function chatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
    return format(d, "MMM d, h:mm a");
  } catch {
    return "";
  }
}

export function dayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMM d");
  } catch {
    return "";
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function statusLabel(s: string): string {
  switch (s) {
    case "open":
      return "Open";
    case "pending":
      return "Awaiting reply";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return s;
  }
}
