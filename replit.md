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
- **Project Management (Initiative Pipeline)**:
    - Boards model a department-initiative pipeline. New projects seed 7 phase buckets in order: New Suggestions, Future Roadmap, Backlog, Phase 1 - R&D Go/No-Go, Phase 2 - Preparation & Planning, Phase 3 - Implementation, Completed. Pre-existing projects (e.g., project 1 "IT Initiatives") keep their original buckets.
    - Each task / "initiative" captures: suggestedById, goal, implementation (how), rationale (why), impactedDepartmentIds (jsonb array of dept ids), additionalComments, plus the existing checklist (Point A → Z), labels, assignee, priority, due date.
    - `completedYear` is auto-stamped (UTC year) and cleared by the API in three paths: PATCH on a task that moves it across the "Completed" bucket boundary, and PATCH on a bucket that renames it across the same boundary (regex `/\bcompleted\b/i`). Cards display a green "Completed YYYY" badge when set.
    - New `projectTaskCommentsTable` powers the per-initiative activity log. Routes: `GET/POST /api/project-tasks/:id/comments` (read = project read access, post = modify), `DELETE /api/project-tasks/:id/comments/:commentId` (author or modify).
    - Frontend dialog (`artifacts/itsm/src/pages/project-board.tsx`) is sectioned: Idea, Plan, Workflow, Checklist, Additional comments, Activity log.
    - Schema includes `projectsTable`, `projectBucketsTable`, `projectTasksTable`, `projectTaskCommentsTable` with relationships.
    - RBAC: Admins can delete projects, agents can edit buckets/tasks, end-users are read-only.
- **API Server Conventions**:
    - Query strings are processed by `src/lib/queryCoerce.ts` for numeric parameters.
    - Drizzle's `inArray()` is used for list filters.
    - Atomic increment for Knowledge Base article views.
    - Full-text search uses the `q` query parameter.

## Feature Specifications
- **Harmony ITSM (`itsm`)**:
    - **Dashboard**: KPIs, status counts, charts, top agents, recent breaches. Filterable.
    - **Ticket Board**: Collapsible groups for "All Tickets" and 13 departments, showing open ticket counts.
    - **Admin Sections**: People, Agents, Knowledge Base, Assets, Settings, Applications (software catalog), Vendors.
    - **Board Settings**: Manage agents, portal settings, SLA, and assignment.
- **Harmony Support (`support`)**:
    - **User-centric Interface**: Lists user's open conversations, allows creating new requests, and provides a chat-style view of tickets.
    - **LLM Extension Ready**: Chat message component supports `user`, `agent`, and `assistant` roles for future AI integration.
- **Seed Data (`@workspace/db`)**: Includes 13 departments, ~32 users, 33 tickets, KB articles, and assets for development and testing.

# External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Google Fonts**: Used for loading the Space Grotesk display font in the ITSM application.
- **OpenAPI Specification**: Used by Orval for API client code generation.