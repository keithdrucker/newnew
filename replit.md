# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Harmony ITSM (`artifacts/itsm`)
Multi-department IT Service Management web app for EW Howell construction firm,
modeled on Freshservice / Atomicwork. React + Vite + Wouter + TanStack Query.

**Sections (left sidebar):**
- Dashboard — KPIs (avg response, avg resolution, SLA score, breached SLA), status counts, opened-vs-resolved area chart, top agents, recent breaches. Filterable by department + date range (30 / 180 / 365 days).
- Ticket Board — collapsible group with **All Tickets** plus 13 departments (IT, QAQC, Safety, Finance & Accounting, HR, Insurance, Legal, MWBE, Marketing & Sales, Prequalification, Procore, Security, Workplace Resources). Each shows a colored department icon + open-ticket count badge.
- People, Agents, Knowledge Base, Assets, Settings (settings restricted to admin role in nav).

**Demo session:** initial active user is admin Lena Park (id 33). The sidebar footer popover lets you switch into any agent or end_user; backend RBAC scopes responses accordingly:
- `admin` → sees every department.
- `agent` → scoped to `departmentId`.
- `end_user` → scoped to `reporterId = self`.

**Ticket key format:** `INC-###` (incident) / `REQ-###` (request).

**Settings (per-department):** portal toggle/title/welcome/categories, default priority, response & resolution SLA minutes, business hours, auto-assign + notification toggles. PATCH `/api/departments/:id/settings`. The `/settings` page lists all boards as clickable rows (with hover-revealed Edit + Delete actions). Each row navigates to a dedicated `/settings/boards/:slug` page (`pages/board-settings.tsx`) showing a Portal card and an SLA & assignment card side-by-side, plus Edit/Delete buttons in the header. `EditBoardDialog` (PATCH `/api/departments/:id`) and `DeleteBoardDialog` (DELETE `/api/departments/:id`) live in `components/settings/`. On rename in the detail page, the user is redirected to the new slug; on delete, sent back to `/settings`.

**Theme / dark mode:** Tailwind v4 with `@custom-variant dark (&:is(.dark *))`; CSS vars defined in `:root` (light) and `.dark` blocks of `src/index.css`. `ThemeProvider` (`src/components/providers/theme-provider.tsx`) supports `light | dark | system`, persists to localStorage key `harmony-itsm-theme`, listens to `prefers-color-scheme`. Inline init script in `index.html` applies the saved theme before React mounts to prevent FOUC. UI toggle is the **Appearance** card at the top of the Settings page. Pages use semantic Tailwind tokens (`bg-card`, `bg-muted`, `text-muted-foreground`, `text-foreground`, `bg-accent`) instead of hardcoded slate-* utilities.

### API Server (`artifacts/api-server`)
Express 5 + Drizzle. Routes: `/api/session`, `/api/departments(/:id/settings)`, `/api/tickets(/:id/comments)`, `/api/people`, `/api/agents`, `/api/knowledge-base`, `/api/assets`, `/api/dashboard(/timeseries|/breached)`.

**Conventions worth remembering:**
- All list/dashboard endpoints run query strings through `src/lib/queryCoerce.ts` so numeric query params (`departmentId`, `rangeDays`, etc.) survive Express's string-only parser before Zod parsing.
- Use Drizzle `inArray()` (not `` sql`= ANY(${arr})` ``) for list filters — the latter does not bind correctly with Postgres array params.
- Asset status enum is `in_use | in_storage | repair | retired`. There is no `in_stock`, `in_repair`, or `lost`.
- KB articles have `views` (no `published` flag). View count is incremented atomically via `sql\`views + 1\`` on each GET.
- List query param for full-text is `q` (not `search`) on tickets / people / KB / assets.

### Seed (`@workspace/db`)
13 departments, ~32 users (mix of admin/agent/end_user), 33 tickets, KB articles, assets. Re-runnable; safe to call after `pnpm --filter @workspace/db run push`.
