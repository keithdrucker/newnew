import {
  Laptop,
  ShieldCheck,
  HardHat,
  Banknote,
  Users,
  Umbrella,
  Scale,
  Building2,
  Megaphone,
  ClipboardCheck,
  HardDrive,
  Lock,
  Briefcase,
  Layers,
  Wrench,
  LifeBuoy,
  Headphones,
  type LucideIcon,
} from "lucide-react";

export const DEPT_ICON_MAP: Record<string, LucideIcon> = {
  Laptop,
  ShieldCheck,
  HardHat,
  Banknote,
  Users,
  Umbrella,
  Scale,
  Building2,
  Megaphone,
  ClipboardCheck,
  HardDrive,
  Lock,
  Briefcase,
  Layers,
  Wrench,
  LifeBuoy,
  Headphones,
};

export const DEPT_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "Layers", label: "Layers (default)" },
  { value: "Laptop", label: "Laptop" },
  { value: "ShieldCheck", label: "Shield" },
  { value: "HardHat", label: "Hard hat" },
  { value: "Banknote", label: "Banknote" },
  { value: "Users", label: "Users" },
  { value: "Umbrella", label: "Umbrella" },
  { value: "Scale", label: "Scale" },
  { value: "Building2", label: "Building" },
  { value: "Megaphone", label: "Megaphone" },
  { value: "ClipboardCheck", label: "Clipboard" },
  { value: "HardDrive", label: "Hard drive" },
  { value: "Lock", label: "Lock" },
  { value: "Briefcase", label: "Briefcase" },
  { value: "Wrench", label: "Wrench" },
  { value: "LifeBuoy", label: "Life buoy" },
  { value: "Headphones", label: "Headphones" },
];

export const DEPT_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: "#0ea5e9", label: "Sky" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Amber" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#64748b", label: "Slate" },
];

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
