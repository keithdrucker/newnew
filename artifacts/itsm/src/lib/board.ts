import type { Department } from "@workspace/api-client-react";

export interface BoardViewModel {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon: string;
  description: string | null;
  ticketCount: number;
}

export function toBoardViewModel(d: Department): BoardViewModel {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    color: d.color,
    icon: d.icon,
    description: d.description ?? null,
    ticketCount: d.ticketCount,
  };
}
