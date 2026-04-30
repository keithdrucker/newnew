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
- **Project Management (Phase-driven lifecycle)** — Apr 2026 rework:
    - Single fixed 6-phase board at `/projects` (no per-department boards): `backlog_needs_assignment` → `planning` → `in_progress` → `completed`, with `on_hold` and `cancelled` as side states. `previousActivePhase` is captured on hold so Resume returns to the right lane. The legacy department-bucket board (`departmentBucketsTable`, `projectsTable.bucketId`) is preserved but no longer driven by the UI.
    - **Phase-content model** (per spec): Backlog owns assignment + timeline (`ownerId`, `assignedTeam`, `priority`, `startDate`, `endDate` = "Anticipated completion date"). Planning is checklist-only (`planningNotes` + `checklist[]`); start/end carry forward as read-only. In Progress shows the original dates read-only and exposes an editable `updatedCompletionDate` (re-estimate; the original `endDate` is never overwritten). Completed (a.k.a. **"Project Closeout"**) requires `completionSummary` AND `keyTakeaway`, and auto-captures `completedById` + `completedAt`.
    - **Phase-transition gates** (POST `/api/projects/:id/phase`): legal transitions are enumerated in `PHASE_TRANSITIONS`. `backlog → planning` requires both dates with `endDate > startDate` (else 400 "Anticipated completion date must be after start date."). `* → completed` requires non-empty summary AND key takeaway. Resume from `on_hold` must return to `previousActivePhase`. Every transition writes a `project_audit_events` row in the same `db.transaction(tx)` as the column update via `writeAudit(tx, ...)`; `writeAudit` accepts a tx executor so phase changes, all four checklist endpoints, and project-create insert are all atomic.
    - **Importing in-flight work**: the Projects header carries an outline "Import project" button (no "New project" — new work is supposed to flow in from approved Initiatives). `ProjectImportDialog` (`artifacts/itsm/src/components/project-create-dialog.tsx`) lets admins backfill an already-running project directly into any phase (default `in_progress`). `status` is hardcoded to `"active"` everywhere — phase owns the lifecycle.
    - Schema (`lib/db/src/schema/projects.ts`): `projectsTable` carries `phase`, `previousActivePhase`, all phase-specific fields, plus `updatedCompletionDate`, `keyTakeaway`, `completedById`. `projectAuditEventsTable` (`action`, `oldPhase`, `newPhase`, `detail` jsonb, `reason`, `changedById`, `changedAt`; indexed on `projectId` + `changedAt`) is the audit trail; `projectCommentsTable` is the discussion thread. Each `ChecklistItem` is `{ id, position, text, done, assigneeId|null }` with stable UUIDs back-filled lazily by the API on first interaction.
    - Detail UI (`artifacts/itsm/src/components/project-detail-dialog.tsx`): one collapsible `Section` per phase, tone = `active` | `done` | `default`. Backlog's "Move to Planning" runs `tryMoveToPlanning()` which validates dates client-side and `await`s `saveBasics()` before opening `PhaseChangeDialog`, so the server-side gate sees the freshly-persisted dates. The phase modal has phase-specific required fields (`holdReason` for on_hold; `completionSummary` + `keyTakeaway` for completed; `cancellationReason` for cancelled).
    - **Project Closeout layout**: when `phase === "completed"`, the dialog renders TWO stacked sections — the read-only "Project Closeout" (Completion summary, Key takeaway, Completed by, Completed on, plus a hint pointing at History) and a separate "Actions" section directly below it that holds the **Reopen Project** button. The reopen control is intentionally OUTSIDE the closeout form so the closeout reads as a documentation card and reopening reads as a deliberate action.
    - **Reopen semantics** (`POST /projects/:id/phase` from `completed → in_progress`): clears BOTH `completedAt` AND `completedById` on the row so only ONE active completion pair exists at a time. The `completionSummary` and `keyTakeaway` text persist on the row (so re-completion can edit instead of retype). All historical completion + reopen events stay in `project_audit_events` — each `completed` and `reopened` row carries `changedById` + `changedAt` + `oldPhase` + `newPhase` + (optional) `reason`, so a Complete → Reopen → Complete-again cycle yields three distinct timeline entries the History section renders in order.
    - Cards (`artifacts/itsm/src/pages/projects.tsx`): show name, priority, owner avatar, checklist progress, and `start – due`. When `updatedCompletionDate` is set the card displays the re-estimate with a small "upd." badge and the original `endDate` in the tooltip.
    - **Bucket-department invariant** still enforced for the legacy bucketed view (POST + PATCH `/api/projects`): `bucketId == null` OR (`departmentId != null` AND `bucket.departmentId === departmentId`). Changing `departmentId` without re-supplying `bucketId` auto-clears the now-stale bucket.
    - Comment delete (`DELETE /api/projects/:id/comments/:commentId`): caller needs READ to the parent project; non-authors additionally need MODIFY. RBAC: admins can delete projects, agents can edit on boards they have `modify` on, end-users have no access.
- **Initiatives (decision pipeline)** — Apr 2026 redesign:
    - Four lanes: `backlog` → `under_review` → `approved` | `rejected_deferred`. Approving auto-creates a Project (`createdProjectId`) inside the same transaction; the link survives reopens.
    - Schema (`lib/db/src/schema/initiatives.ts`): intake fields (`problemOpportunity`, `impactScope`, `additionalNotes`), backlog-triage fields (`category`, `initialPriority`, `initialEffort`, `businessAlignment`, `investigationDecision`, `backlogNotes`, `backlogReviewedById`, `backlogReviewedAt`, `reviewStartDate`, `anticipatedApprovalDate`), under-review analysis (`benefits`, `tradeoffs`, `businessValueLevel`, `businessValueSummary`, `costLevel`, `estimatedCost`, `riskLevel`, `riskNotes`, `validationStatus`, `impactedTeams`), final decision (`finalDecision`, `decisionReason`, `revisitDate`, `decidedAt`, `decidedById`). Legacy `prosCons`/`expectedBenefit`/`roughCost` are preserved as read-only fallbacks.
    - **Backlog accountability dates** (`reviewStartDate`, `anticipatedApprovalDate`): both are Drizzle `date()` columns (`YYYY-MM-DD`) entered in the Backlog Triage section. PATCH coerces a zod-parsed `Date` back to ISO date string before write (same pattern as `revisitDate`). The cards and the Backlog Triage view show a rose "Late" badge whenever `anticipatedApprovalDate < today` AND `status ∈ {backlog, under_review}` (helper `isInitiativeLate`). The dates are pure tracking — there is no hard server-side block on transitioning past the anticipated date — so the badge is the accountability surface, not a gate.
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
    - **Workflows**: Admin page at `/settings/workflows` (Settings → Automation card → Workflows tile) — generic, module-aware rule engine stored in `workflows` / `workflow_runs` / `workflow_run_approvers` / `workflow_audit_events`. Each workflow has WHEN (trigger), IF (conditions JSON), THEN (actions JSON), Approvals (approver kind + targets, approval type single/all/any, optional decision rationale), Notifications, and Status (Draft/Active/Inactive). Modules supported today: Tickets and Initiatives (extensible to Projects/Changes/Risks via `lib/workflow-options.ts` option lists). Phase-1 execution wires Initiative approvals: from an Under Review initiative, an admin clicks "Start Approval Workflow", picks an active Initiatives/Approval workflow, which creates a `workflow_run` with one approver row per resolved user. Approvers record approve/reject/defer + rationale; resolution rules (single = first decision wins; all = unanimous; any = first approve) cascade back through the same allowed-transition path on the parent initiative (approve → `approved` + auto-create Project; reject → `rejected_deferred` w/ `finalDecision=reject`; defer → `rejected_deferred` w/ `finalDecision=defer`). All actions write `workflow_audit_events` (`created/updated/activated/deactivated/triggered/approver_decided/resolved`). Initiative detail dialog shows the active run with approver rows and a past-runs list.
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
