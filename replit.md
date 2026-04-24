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
- Administration also includes **Applications** (software catalog with owner, department, license seats/usage, monthly cost, lifecycle status active|piloting|deprecated, category productivity|design|ops|finance|dev|security|other) and **Vendors** (external suppliers with category software|hardware|services|telecom|consulting|other, contact details, status active|inactive, notes; list response includes `appCount` derived from a case-insensitive match of `applications.vendor` to `vendors.name`).

**Demo session:** initial active user is admin Lena Park (id 33). The sidebar footer popover lets you switch into any agent or end_user; backend RBAC scopes responses accordingly:
- `admin` → sees every department.
- `agent` → scoped to `departmentId`.
- `end_user` → scoped to `reporterId = self`.

**Ticket key format:** `INC-###` (incident) / `REQ-###` (request).

**Settings (per-department):** portal toggle/title/welcome/categories, default priority, response & resolution SLA minutes, business hours, auto-assign + notification toggles. PATCH `/api/departments/:id/settings`. The `/settings` page lists all boards as clickable rows (with hover-revealed Edit + Delete actions). Each row navigates to a dedicated `/settings/boards/:slug` page (`pages/board-settings.tsx`) showing an **Agents on this board** card (board membership manager), then a Portal card and an SLA & assignment card side-by-side, plus Edit/Delete buttons in the header. `EditBoardDialog` (PATCH `/api/departments/:id`) and `DeleteBoardDialog` (DELETE `/api/departments/:id`) live in `components/settings/`. On rename in the detail page, the user is redirected to the new slug; on delete, sent back to `/settings`.

**Per-board membership & roles:** Each board has its own member list with three roles:
- `owner` — full control of board tickets
- `modify` — can view, edit, comment, and close tickets
- `read_only` — can view tickets and dashboard but cannot edit

Schema: `board_members(id, departmentId, userId, role, createdAt, updatedAt)` with `unique(departmentId, userId)`. Routes (admin-only writes): `GET /api/departments/:id/members`, `POST /api/departments/:id/members`, `PATCH /api/departments/:id/members/:userId`, `DELETE /api/departments/:id/members/:userId`. The `BoardMembersCard` component (`components/settings/board-members-card.tsx`) renders the list with avatar, name, optional Admin badge, role select dropdown (with badged label per option), and remove button; an "Add agent" dialog with search + role picker pulls from `useListAgents()` (filtering out end_users and already-added members).

**Per-board access enforcement** (`artifacts/api-server/src/lib/board-access.ts`):
- `getBoardRole(user, deptId)` → highest role on a board (admin always returns `owner`; an agent's legacy `users.departmentId` is treated as implicit `modify` on that dept for backwards compat with seed data).
- `roleAtLeast(role, min)` → ranking helper (`read_only` < `modify` < `owner`).
- `visibleDepartmentIds(user)` / `modifiableDepartmentIds(user, min)` → set of dept ids the user has any role / a sufficient role on (admin → `null` meaning "all").
- Tickets routes use `visibleDepartmentIds` for list scoping (replacing the old single-dept filter), `getBoardRole` for `GET /tickets/:id` (any role allows view), and `roleAtLeast(..., 'modify')` for PATCH `/tickets/:id` and POST `/tickets/:id/comments` (read_only members are blocked from edits with a 403 "Read-only on this board").

**Theme / dark mode:** Tailwind v4 with `@custom-variant dark (&:is(.dark *))`; CSS vars defined in `:root` (light) and `.dark` blocks of `src/index.css`. `ThemeProvider` (`src/components/providers/theme-provider.tsx`) supports `light | dark | system`, persists to localStorage key `harmony-itsm-theme`, listens to `prefers-color-scheme`. Inline init script in `index.html` applies the saved theme before React mounts to prevent FOUC. UI toggle is the **Appearance** card at the top of the Settings page. Pages use semantic Tailwind tokens (`bg-card`, `bg-muted`, `text-muted-foreground`, `text-foreground`, `bg-accent`) instead of hardcoded slate-* utilities.

**Brand palette (EW Howell Service Hub — UNC colors):** White background, **UNC Navy** primary `217 58% 19%` (≈ #13294B), **Carolina Blue** accent `202 58% 56%` (≈ #4B9CD3), pale Carolina secondary `204 56% 94%`. Sidebar (icon rail) uses a slightly deeper navy `218 65% 17%` with Carolina blue active accents. Radius `0.625rem`. Display font is **Space Grotesk** (loaded via Google Fonts in `src/index.css`); applied via `--app-font-display`/`--font-display` and the base rule on `h1, h2`. Charts use a navy → Carolina blue → pale Carolina ramp (`--chart-1..5`).

**Shell layout (custom — distinct from the default sidebar template):** `components/layout/app-layout.tsx` renders three columns: a **68px navy icon rail** (`components/layout/icon-rail.tsx`) with the "EW" Carolina-blue monogram tile, vertical icon nav with a Carolina-blue active indicator and tooltips, plus the user/role switcher avatar at the bottom; a **248px white contextual panel** (`components/layout/context-panel.tsx`) that shows the EW Howell · Service Hub eyebrow, the section eyebrow + display-font title + tagline (driven by route via `SECTION_META`), and section-specific content (tickets routes show All Tickets + the department list inside a "Departments" collapsible; other routes show Quick links + a "Signed in" card); and the main content area. Admin-only rail items respect `session.role`. Replaces the previous single-pane `sidebar.tsx`.

### Harmony Support (`artifacts/support`)
Standalone end-user portal for the Harmony ITSM project — a separate React + Vite + TS web app served at `/support/` (slug `support`). Reuses `@workspace/api-client-react` and the same shadcn/Tailwind UI primitives as `itsm` (copied into `src/components/ui` so the look and feel stays consistent).

**Auth model (demo, no passwords):** the portal stores the chosen end_user id in `localStorage["harmony-support-end-user-id"]` (`src/lib/portal-auth.ts`) and uses the existing global `POST /api/session/switch` endpoint via `PortalSessionProvider` (`src/components/providers/portal-session-provider.tsx`). On load, it silently re-asserts the choice if the global server session has drifted (e.g. someone switched users in the agent ITSM app). Sign-out clears local state only — it does not log other apps out. The sign-in page (`src/pages/sign-in.tsx`) lists end_users from `GET /api/people` (server already filters to `role = end_user`).

**Routes (wouter, base = `BASE_URL` = `/support`):**
- `/` → `pages/tickets-list.tsx` — the user's open conversations (server scopes `GET /api/tickets` to `reporterId = self` because the session role is `end_user`). Polls every 15s.
- `/new` → `pages/new-conversation.tsx` — form that creates a ticket via `POST /api/tickets` with `type: "request"`, `priority: "medium"`, `source: "chat"`, defaulting `departmentId` to the user's own department when known. On success, navigates to the new chat thread.
- `/tickets/:id` → `pages/chat-thread.tsx` — chat-style view of a ticket. Polls `GET /api/tickets/:id` every 5s, sends replies via `POST /api/tickets/:id/comments`, and renders an optimistic bubble while the request is in flight. The first bubble is the ticket description (authored by the reporter); subsequent bubbles are the ticket comments. Resolved/closed tickets hide the composer and show a "start a new request" CTA instead.

**Chat surface (future LLM extension):** `components/chat-message.tsx` defines `ChatAuthorRole = "user" | "agent" | "assistant"` and renders all three bubble styles. Today only `user` and `agent` are produced from real ticket comments; the `assistant` role is reserved so an LLM-powered support assistant can be inserted into the same message stream later. `components/chat-composer.tsx` exposes a `toolbar` slot for future canned-reply chips / suggestion previews.

**Theme:** same `light | dark | system` ThemeProvider as `itsm`, but persisted under `harmony-support-theme` (own localStorage key) so the two apps don't fight. Theme picker lives in the account dropdown in `components/portal-shell.tsx`. Favicon is a blue "?" mark (`public/favicon.svg`) to distinguish from the orange ITSM favicon.

**Projects (Microsoft Planner-style boards):** Inside the Tickets group there is now a **Projects** sub-link (hidden for end users). The list page (`/projects`, `pages/projects.tsx`) shows a card grid with a colored swatch, owner, due date, task progress (`x of y tasks`, completion %) and a "New project" dialog (name + description + color swatch picker). Each project opens a Planner-style board (`/projects/:id`, `pages/project-board.tsx`) with a dark navy header (`← My plans / <name>`, project icon + H1 + task count, Board / Charts / Schedule tabs, toolbar with search + Filter + "Group by Bucket" + Share), then horizontally-scrolling **bucket columns** (`To do`, `In progress`, `Done` by default — fully editable; rename inline, delete via the column menu, add a new bucket via "+ Add bucket"). Each task card shows up to 3 colored label chips on top, a circle that toggles completion (becomes a green check + strikethrough), the title, an optional priority dot (urgent/high/low — medium is hidden), checklist progress (`done/total`), due date, and the assignee initials avatar bottom-right. Clicking a card opens a "Edit task" dialog with title, bucket move, assignee, priority, due date, label editor (name + 8 color swatches), checklist (add / check off / remove), notes, save, and a destructive delete button.

Projects schema (`lib/db/src/schema/projects.ts`): `projectsTable(id, name, description, color, status active|on_hold|completed, departmentId fk → departments, ownerId fk → users, dueAt, createdAt, updatedAt)`, `projectBucketsTable(id, projectId fk → projects ON DELETE CASCADE, name, position, createdAt)`, `projectTasksTable(id, bucketId fk → projectBuckets ON DELETE CASCADE, projectId fk → projects, title, description, completed, priority urgent|high|medium|low, position, dueAt, assigneeId fk → users, labels jsonb [{name,color}], checklist jsonb [{id,text,done}], createdAt, updatedAt)`. API routes (`artifacts/api-server/src/routes/projects.ts`): `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/buckets`, `PATCH/DELETE /api/project-buckets/:id` (cascades tasks), `POST /api/projects/:id/tasks`, `PATCH/DELETE /api/project-tasks/:id`. POST /projects auto-seeds three default buckets (`To do`, `In progress`, `Done`). RBAC: end_users get 403 on any write; only `admin` can DELETE a project; agents can fully edit buckets/tasks.

### API Server (`artifacts/api-server`)
Express 5 + Drizzle. Routes: `/api/session`, `/api/departments(/:id/settings)`, `/api/tickets(/:id/comments)`, `/api/people`, `/api/agents`, `/api/knowledge-base`, `/api/assets`, `/api/applications(/:id)`, `/api/vendors(/:id)`, `/api/dashboard(/timeseries|/breached)`, `/api/projects(/:id)(/buckets|/tasks)`, `/api/project-buckets/:id`, `/api/project-tasks/:id`.

**Conventions worth remembering:**
- All list/dashboard endpoints run query strings through `src/lib/queryCoerce.ts` so numeric query params (`departmentId`, `rangeDays`, etc.) survive Express's string-only parser before Zod parsing.
- Use Drizzle `inArray()` (not `` sql`= ANY(${arr})` ``) for list filters — the latter does not bind correctly with Postgres array params.
- Asset status enum is `in_use | in_storage | repair | retired`. There is no `in_stock`, `in_repair`, or `lost`.
- KB articles have `views` (no `published` flag). View count is incremented atomically via `sql\`views + 1\`` on each GET.
- List query param for full-text is `q` (not `search`) on tickets / people / KB / assets.

### Seed (`@workspace/db`)
13 departments, ~32 users (mix of admin/agent/end_user), 33 tickets, KB articles, assets. Re-runnable; safe to call after `pnpm --filter @workspace/db run push`.
