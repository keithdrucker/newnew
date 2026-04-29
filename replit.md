# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to build a comprehensive IT Service Management (ITSM) solution, Harmony ITSM, for EW Howell construction firm. Modeled on established platforms like Freshservice and Atomicwork, Harmony ITSM aims to streamline IT operations, support, and project management.

The project encompasses:
- A multi-department ITSM web application (`itsm`) for agents and administrators, providing features like a Dashboard, Ticket Board, People, Agents, Knowledge Base, Assets, and Settings.
- A standalone end-user portal (`support`) for submitting and tracking requests, designed for simplicity and ease of use.
- A robust API server (`api-server`) built with Express and Drizzle, serving as the backend for both applications.
- A project management feature (Microsoft Planner-style boards) integrated within the ITSM application.

The business vision is to provide a tailored, efficient, and scalable ITSM platform to enhance internal service delivery and project coordination for EW Howell, improving operational efficiency and user satisfaction.

# User Preferences

I prefer clear, concise explanations and direct answers. I value iterative development and expect to be consulted before any major architectural changes or significant feature removals. Ensure all changes are well-documented.

# Navigation & Workspace Structure (Authoritative)

The top-level navigation is intentional and must be followed exactly for ALL
future workflow, UI, and data-model changes. Do not reshuffle these groups
without an explicit user request.

```
WORKSPACE
  Dashboard

  Day-to-Day Operations
    - Tickets
    - Operational Tasks

  Improvements
    - Initiatives
    - Projects

  Knowledge
  Timesheets

ADMINISTRATION
  Assets
  Applications
  Vendors
  People
  Settings
```

Rules:
- **Workspace** is where users do day-to-day work.
- **Administration** is only for system configuration and master data.
- **Tickets** and **Operational Tasks** are reactive / operational work
  (Day-to-Day Operations group).
- **Initiatives** and **Projects** are proactive improvement work
  (Improvements group). Projects are NOT operational items.
- **Knowledge** and **Timesheets** are operational tools, not
  administration items.
- Never place Initiatives or Projects under Day-to-Day Operations.
- Never place Knowledge or Timesheets under Administration.

As of April 2026, the side-nav (`artifacts/itsm/src/components/layout/side-nav.tsx`)
implements the structure above via four ordered arrays — `WORKSPACE_TOP`
(Dashboard), `DAY_TO_DAY` (Tickets, Operational Tasks), `IMPROVEMENTS`
(Initiatives, Projects), `WORKSPACE_BOTTOM` (Knowledge, Timesheets) —
rendered through a new `NavSubGroup` component that suppresses any
sub-group whose visible items are empty (e.g. for `end_user`).

# System Architecture

## Monorepo Structure
The project utilizes a pnpm workspace monorepo with each package managing its own dependencies. The core packages include `artifacts/itsm` (ITSM web app), `artifacts/support` (end-user portal), and `artifacts/api-server` (backend API).

## Technology Stack
- **Node.js**: 24
- **Package Manager**: pnpm
- **TypeScript**: 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (v4) and `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild (CJS bundle)
- **Frontend**: React, Vite, Wouter, TanStack Query

## UI/UX and Design
- **ITSAM Application (`itsm`)**:
    - **Color Scheme**: EW Howell brand palette (UNC Navy primary, Carolina Blue accent, pale Carolina secondary), with a slightly deeper navy for the icon rail.
    - **Typography**: Space Grotesk for display fonts (h1, h2).
    - **Theming**: Supports light, dark, and system themes, persisted in local storage. Uses semantic Tailwind tokens for consistent styling.
    - **Layout**: Custom three-column shell layout: 68px navy icon rail, 248px white contextual panel, and main content area.
    - **Component Library**: shadcn/ui primitives.
- **Support Portal (`support`)**:
    - Reuses shadcn/ui primitives for consistent look and feel with the ITSM app.
    - Independent theme persistence to avoid conflicts with the ITSM app.
    - Distinct favicon (blue "?" mark) to differentiate.

## Technical Implementations
- **Authentication (Demo)**: The support portal uses `localStorage` for `end_user` ID persistence and `POST /api/session/switch` for session management. No passwords are used in the demo.
- **Role-Based Access Control (RBAC)**:
    - `admin`: Full access to all departments and features.
    - `agent`: Scoped to specific `departmentId` or `visibleDepartmentIds` for board members.
    - `end_user`: Scoped to `reporterId = self`.
    - Board membership includes `owner`, `modify`, and `read_only` roles, enforced at the API level.
- **Ticket Management**:
    - Ticket key format: `INC-###` (incident) / `REQ-###` (request).
    - Per-department settings for portal, SLA, business hours, and auto-assignment.
    - **Default Ticket Board (per-user)**: `usersTable.defaultTicketBoard` (text, nullable) holds a department slug; `null` means All Tickets. The Tickets page (`artifacts/itsm/src/pages/tickets.tsx`) auto-redirects from `/tickets` to `/tickets/dept/<slug>` on mount when this is set, and exposes a "View Settings" dropdown (`button-view-settings` / `select-default-board`) plus an inline board switcher (`select-board`) so users can change boards manually. The preference is exposed on `Session.defaultTicketBoard` and updated via `PATCH /api/me/preferences` (`updateMePreferences`).
    - **Create Ticket dialog** (`artifacts/itsm/src/components/create-ticket-dialog.tsx`): launched from the primary "Create ticket" button (`button-create-ticket`) in the Tickets page header; submits via `useCreateTicket` and invalidates `/tickets` queries on success. Defaults `departmentId` from the current board's `deptSlug`, falling back to the user's department. **Server-side `POST /api/tickets` ignores `req.body.reporterId` and always binds the reporter to the authenticated user** (`getCurrentUser(req).id`) — the field is accepted only for spec compatibility, never trusted, to prevent ticket-impersonation.
- **Project Management (Initiative Pipeline)** — pivoted April 2026:
    - The 7-phase Kanban board now lives at the **department** level. Each project is a single card on its department's board. The old per-project board (one Kanban inside each project) is gone.
    - Phases (per-department, renamable, seeded on first read of `/api/departments/:id/board`): New Suggestions, Future Roadmap, Backlog, Phase 1 - R&D Go/No-Go, Phase 2 - Preparation & Planning, Phase 3 - Implementation, "2026 Completed Initiatives".
    - Routes: `/projects/dept/:slug` renders the department Kanban; `/projects` renders a flat global list of all projects across departments. The old `/projects/:id` route was removed.
    - Clicking a card opens `ProjectEditorDialog` (`artifacts/itsm/src/components/project-editor-dialog.tsx`) in edit mode. The dialog has Phase select (department buckets), Idea, Plan, Workflow, Checklist (folded in from the old work-step cards), Additional comments, Activity log.
    - Schema (`lib/db/src/schema/projects.ts`): `departmentBucketsTable` (id, departmentId FK, name, position, color; UNIQUE on (departmentId, name) so the bootstrap seed is idempotent under concurrent first-reads via `onConflictDoNothing`), `projectsTable.bucketId` (nullable FK to department_buckets), `projectsTable.checklist` (jsonb `ChecklistItem[]`), `projectCommentsTable` (per-project activity log). The old `projectBucketsTable` / `projectTasksTable` / `projectTaskCommentsTable` were dropped.
    - Each checklist item carries its own optional `assigneeId`. Persisted shape: `{ text, done, assigneeId|null }`. Server `sanitizeChecklist()` strips `assigneeName` and coerces `assigneeId` on POST/PATCH; the API hydrates `assigneeName` on read.
    - `completedYear` is auto-stamped (UTC year) when a project enters or is created in a bucket whose name matches `/\bcompleted\b/i`, and auto-cleared when it leaves.
    - **Bucket-department invariant** (enforced in both POST and PATCH `/api/projects`): `bucketId == null` OR (`departmentId != null` AND `bucket.departmentId === departmentId`). Cross-functional projects (no departmentId) cannot be pinned to any bucket. On PATCH, changing `departmentId` without re-supplying `bucketId` auto-clears the now-stale `bucketId` so projects never silently leak across boards.
    - Comment delete (`DELETE /api/projects/:id/comments/:commentId`): every caller — including the comment's author — must have at minimum READ access to the parent project. Non-authors additionally need MODIFY access. Prevents an end-user who lost board access from scrubbing their old comments.
    - Phase create/rename routes return 409 (not 500) on duplicate name within a department; the underlying SQLSTATE 23505 is detected via the `isUniqueViolation()` helper which walks `err.cause` for Drizzle's wrapper.
    - RBAC: Admins can delete projects, agents can edit buckets/cards on boards they have `modify` on, end-users have no access to projects.
- **Initiatives (decision pipeline)** — Apr 2026 redesign:
    - Four lanes: `backlog` → `under_review` → `approved` | `rejected_deferred`. Approving auto-creates a Project (`createdProjectId`) inside the same transaction; the link survives reopens.
    - Schema (`lib/db/src/schema/initiatives.ts`): intake fields (`problemOpportunity`, `impactScope`, `additionalNotes`), backlog-triage fields (`category`, `initialPriority`, `initialEffort`, `businessAlignment`, `investigationDecision`, `backlogNotes`, `backlogReviewedById`, `backlogReviewedAt`), under-review analysis (`benefits`, `tradeoffs`, `businessValueLevel`, `businessValueSummary`, `costLevel`, `estimatedCost`, `riskLevel`, `riskNotes`, `validationStatus`, `impactedTeams`), final decision (`finalDecision`, `decisionReason`, `revisitDate`, `decidedAt`, `decidedById`). Legacy `prosCons`/`expectedBenefit`/`roughCost` are preserved as read-only fallbacks.
    - **Audit log** (`initiative_audit_events`): every status change inserts a row inside the same tx with `oldStatus`, `newStatus`, `action` (`transition` | `approve` | `move_back` | `reopen`), `reason`, `changedById`, `changedAt`. Hydrated as `auditEvents[]` on every initiative response.
    - **Allowed transitions** (`artifacts/api-server/src/routes/initiatives.ts` `TRANSITIONS` table) — illegal transitions return 409:
        - `backlog → under_review` (requires `investigationDecision === "investigate_further"`)
        - `backlog → rejected_deferred` (close / do-not-pursue; requires `backlogNotes`)
        - `under_review → backlog` (move-back; requires `transitionReason`)
        - `under_review → approved` (requires `decisionReason`; auto-creates project)
        - `under_review → rejected_deferred` (defer or reject; requires `decisionReason`)
        - `approved → under_review` (reopen; requires `transitionReason`; preserves `createdProjectId`, clears `decidedAt`/`decidedById`/`finalDecision`)
        - `rejected_deferred → backlog | under_review` (reopen; requires `transitionReason`)
    - `revisitDate` is a Drizzle `date()` column (`YYYY-MM-DD`); the route coerces the zod-parsed `Date` back to ISO date before write.
    - Frontend (`artifacts/itsm/src/pages/initiatives.tsx`): four-column board with phase hints + per-card project link badge; create dialog captures Problem/Opportunity, Expected Benefit, Impact Scope (required) plus optional Department / Notes; detail dialog shows a Backlog → Under Review → Approved/Rejected `PhaseProgress` indicator, collapsible `Section`s (Intake, Backlog Triage, Under Review, Final Decision, Move Back/Reopen, Previous Review History), phase-specific editors/views, and an `AuditTimeline`. Action buttons are phase-scoped: `Save Triage` / `Close — Do Not Pursue` / `Move to Under Review` (Backlog), `Save Review` / `Reject` / `Defer` / `Approve & Create Project` (Under Review), `Reopen to Backlog`/`Reopen to Under Review` (terminal lanes).
- **API Server Conventions**:
    - Query strings are processed by `src/lib/queryCoerce.ts` for numeric parameters.
    - Drizzle's `inArray()` is used for list filters.
    - Atomic increment for Knowledge Base article views.
    - Full-text search uses the `q` query parameter.

## Feature Specifications
- **Harmony ITSM (`itsm`)**:
    - **Dashboard**: KPIs, status counts, charts, top agents, recent breaches. Filterable.
    - **Ticket Board**: Collapsible groups for "All Tickets" and 13 departments, showing open ticket counts.
    - **Tickets table**: Columns are `ID, Priority, Risk Level, Status, Title, User, Level, Category, Created, Last Update, SLA`. Risk Level uses color-coded badges (gray = low, yellow = medium, orange = high, red = critical).
    - **Tickets filters**: Status, Priority, Risk Level, Support Level, Category, SLA, Root Cause, Resolution, Created Date, Last Update Date, Assignee — all persisted into named ticket views via `TicketViewConfig`.
    - **Risk Rules**: Admin page at `/settings/risk-rules` (also via Settings → Automation card) maps a ticket category → default risk level via the `risk_rules` table. New tickets created with a matching category default to the configured risk level (overridden by an explicit selection in the create dialog).
    - **Ticket detail**: Inline editable Root Cause and Resolution panels (save on blur, agent/admin only); Risk Level + Category editable in the sidebar; SLA shown as on-track / breached.
    - **Admin Sections**: People, Agents, Knowledge Base, Assets, Settings, Applications (software catalog), Vendors.
    - **Board Settings**: Manage agents, portal settings, SLA, and assignment.
    - **Tests**: `pnpm --filter @workspace/itsm run test` runs the Vitest suite (jsdom + React Testing Library). Setup lives in `artifacts/itsm/src/test/setup.ts`, configured by `artifacts/itsm/vitest.config.ts`. The suite covers `src/components/layout/side-nav.tsx` — Dashboard / Tickets / Projects dropdown auto-expansion + active-state highlighting (including `*/dept/:slug` routes), and role-based visibility (Projects hidden for `end_user`, Administration only for `admin`). Sidebar children expose `data-testid` hooks (`nav-dashboard`, `nav-dashboard-overview|tickets|projects`, `nav-tickets`, `nav-tickets-all`, `nav-dept-<slug>`, `nav-projects`, `nav-projects-all`, `nav-projects-dept-<slug>`, `nav-assets|applications|vendors|people|settings`). Tests mock `@workspace/api-client-react` and use `wouter/memory-location` to drive the active route.
- **Harmony Support (`support`)**:
    - **User-centric Interface**: Lists user's open conversations, allows creating new requests, and provides a chat-style view of tickets.
    - **LLM Extension Ready**: Chat message component supports `user`, `agent`, and `assistant` roles for future AI integration.
- **Seed Data (`@workspace/db`)**: Includes 13 departments, ~32 users, 33 tickets, KB articles, and assets for development and testing.

# External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Google Fonts**: Used for loading the Space Grotesk display font in the ITSM application.
- **OpenAPI Specification**: Used by Orval for API client code generation.
