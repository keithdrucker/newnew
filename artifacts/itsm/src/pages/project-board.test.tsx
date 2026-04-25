import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Session,
  ProjectDetail,
  ProjectBucketWithTasks,
  ProjectTask,
} from "@workspace/api-client-react";

// `project-board.tsx` calls `useGetSession` so it can hide privileged
// authoring chrome (Add bucket, bucket menu, Add task, rename) from
// end-users. The "admin / agent / end-user" framing of these test cases
// is expressed both by the mocked backend payload (the project data) and
// by the mocked session (which controls whether management controls
// render).
const useGetProjectMock = vi.fn();
const useListAgentsMock = vi.fn();
const useListDepartmentsMock = vi.fn();
const useListProjectTaskCommentsMock = vi.fn();
const useGetSessionMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetProject: (...args: unknown[]) => useGetProjectMock(...args),
  useListAgents: () => useListAgentsMock(),
  useListDepartments: () => useListDepartmentsMock(),
  useListProjectTaskComments: (...args: unknown[]) =>
    useListProjectTaskCommentsMock(...args),
  useGetSession: () => useGetSessionMock(),
  useCreateProjectBucket: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProjectBucket: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProjectBucket: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateProjectTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProjectTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProjectTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateProjectTaskComment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProjectTaskComment: () => ({ mutate: vi.fn(), isPending: false }),
  getGetProjectQueryKey: (id: number) => ["project", id],
  getListProjectsQueryKey: () => ["projects"],
  getListProjectTaskCommentsQueryKey: (id: number) => [
    "project-task-comments",
    id,
  ],
}));

import ProjectBoard from "./project-board";

const adminSession: Session = {
  userId: 1,
  name: "Ada Admin",
  email: "ada@example.com",
  role: "admin",
  departmentId: null,
  departmentName: null,
} as unknown as Session;

const agentSession: Session = {
  userId: 2,
  name: "Aaron Agent",
  email: "aaron@example.com",
  role: "agent",
  departmentId: 1,
  departmentName: "IT",
} as unknown as Session;

const endUserSession: Session = {
  userId: 3,
  name: "Eve End-User",
  email: "eve@example.com",
  role: "end_user",
  departmentId: 1,
  departmentName: "IT",
} as unknown as Session;

function makeTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 100,
    projectId: 7,
    bucketId: 1,
    title: "Task A",
    description: "",
    labels: [],
    checklist: [],
    assigneeId: null,
    assigneeName: null,
    priority: "medium",
    dueAt: null,
    position: 1,
    completed: false,
    suggestedById: null,
    suggestedByName: null,
    goal: "",
    implementation: "",
    rationale: "",
    impactedDepartmentIds: [],
    impactedDepartmentNames: [],
    additionalComments: "",
    completedYear: null,
    commentCount: 0,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    ...overrides,
  } as ProjectTask;
}

function makeBucket(
  overrides: Partial<ProjectBucketWithTasks> = {},
): ProjectBucketWithTasks {
  return {
    id: 1,
    projectId: 7,
    name: "Backlog",
    position: 1,
    createdAt: "2026-04-01T12:00:00.000Z",
    tasks: [],
    ...overrides,
  } as ProjectBucketWithTasks;
}

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 7,
    name: "IT Roadmap",
    description: "",
    color: "#4B9CD3",
    status: "active",
    departmentId: 1,
    departmentName: "IT",
    ownerId: null,
    ownerName: null,
    dueAt: null,
    bucketCount: 1,
    taskCount: 1,
    completedTaskCount: 0,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    buckets: [makeBucket({ tasks: [makeTask()] })],
    ...overrides,
  } as ProjectDetail;
}

function renderBoard(path = "/projects/7") {
  const { hook } = memoryLocation({ path, static: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WouterRouter hook={hook}>
        <ProjectBoard />
      </WouterRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectBoard page — role-scoped rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useListAgentsMock.mockReturnValue({ data: [] });
    useListDepartmentsMock.mockReturnValue({ data: [] });
    useListProjectTaskCommentsMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
    // Sensible default — individual tests override per role
    useGetSessionMock.mockReturnValue({ data: adminSession });
  });

  it("renders the full board — including bucket controls — for an admin session", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useGetProjectMock.mockReturnValue({
      data: makeProject({
        name: "Cross-team initiative",
        buckets: [
          makeBucket({
            id: 1,
            name: "Backlog",
            tasks: [makeTask({ id: 101, title: "Spec the migration" })],
          }),
          makeBucket({
            id: 2,
            name: "In progress",
            position: 2,
            tasks: [makeTask({ id: 102, bucketId: 2, title: "Run pilot" })],
          }),
        ],
      }),
      isLoading: false,
      isError: false,
    });

    renderBoard();

    expect(screen.getByTestId("project-board")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Cross-team initiative" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bucket-1")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-2")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-101")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-102")).toBeInTheDocument();
    // Admins can manage bucket structure
    expect(screen.getByTestId("button-add-bucket")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-menu-1")).toBeInTheDocument();
    expect(screen.getByTestId("add-task-1")).toBeInTheDocument();
    // Bucket name is rendered as a (rename) button for managers
    expect(screen.getByTestId("bucket-name-1").tagName).toBe("BUTTON");
  });

  it("renders an in-department project board for an agent session", () => {
    useGetSessionMock.mockReturnValue({ data: agentSession });
    useGetProjectMock.mockReturnValue({
      data: makeProject({
        name: "IT Roadmap",
        departmentId: 1,
        departmentName: "IT",
        buckets: [
          makeBucket({
            id: 10,
            name: "Now",
            tasks: [
              makeTask({ id: 201, bucketId: 10, title: "Patch servers" }),
            ],
          }),
        ],
      }),
      isLoading: false,
      isError: false,
    });

    renderBoard();

    expect(
      screen.getByRole("heading", { level: 1, name: "IT Roadmap" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bucket-10")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-201")).toBeInTheDocument();
    // Agents within the project's department can manage the board
    expect(screen.getByTestId("add-task-10")).toBeInTheDocument();
    expect(screen.getByTestId("button-add-bucket")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-menu-10")).toBeInTheDocument();
  });

  it("renders the read-only view of a project the end_user has access to", async () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useGetProjectMock.mockReturnValue({
      data: makeProject({
        name: "End-user accessible project",
        buckets: [
          makeBucket({
            id: 5,
            name: "Suggestions",
            tasks: [
              makeTask({
                id: 301,
                bucketId: 5,
                title: "Office supply suggestion",
                suggestedById: 3,
                suggestedByName: "Eve End-User",
              }),
            ],
          }),
        ],
      }),
      isLoading: false,
      isError: false,
    });

    renderBoard();

    // The board itself, the bucket, and the task all remain visible — the
    // end-user is allowed to *see* what's planned for them.
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "End-user accessible project",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bucket-5")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-301")).toBeInTheDocument();
    expect(screen.getByText("Office supply suggestion")).toBeInTheDocument();

    // …but every authoring affordance must be hidden.
    expect(screen.queryByTestId("button-add-bucket")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bucket-menu-5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-task-5")).not.toBeInTheDocument();

    // Bucket name still renders, but as plain text — no rename affordance.
    const bucketName = screen.getByTestId("bucket-name-5");
    expect(bucketName).toBeInTheDocument();
    expect(bucketName.tagName).not.toBe("BUTTON");

    // Task-level write affordances must also be hidden:
    //  - the per-card complete-toggle checkbox is gone
    //  - the card is not interactive (not a button, no role/tabindex)
    //  - clicking it does not surface the editor dialog
    expect(screen.queryByTestId("task-toggle-301")).not.toBeInTheDocument();

    const taskCard = screen.getByTestId("task-card-301");
    expect(taskCard.getAttribute("role")).not.toBe("button");
    expect(taskCard.getAttribute("tabindex")).toBeNull();

    await userEvent.click(taskCard);

    // None of the editor dialog's edit controls render — no title input,
    // no save / delete buttons, no comment composer.
    expect(screen.queryByTestId("input-task-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-save-task")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-delete-task")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-task-bucket")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-task-assignee")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("select-task-suggested-by"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-task-due")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-new-label")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-new-checklist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-new-comment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-post-comment")).not.toBeInTheDocument();
  });

  it("shows the access-denied state for an agent opening a project outside their department", () => {
    // Agent in IT trying to open an HR project → backend returns 403/404,
    // useGetProject exposes `data: undefined`. The board chrome must NOT
    // render — no buckets, tasks, or "Add bucket" button can leak through.
    useGetSessionMock.mockReturnValue({ data: agentSession });
    useGetProjectMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderBoard("/projects/999");

    expect(screen.getByText("Project not found.")).toBeInTheDocument();
    expect(screen.queryByTestId("project-board")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-add-bucket")).not.toBeInTheDocument();
    // Back-navigation to the projects list is offered so the user isn't stuck
    expect(
      screen.getByRole("link", { name: "Back to projects" }),
    ).toBeInTheDocument();
  });

  it("shows the access-denied state for an end_user opening a forbidden project", () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useGetProjectMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderBoard("/projects/888");

    expect(screen.getByText("Project not found.")).toBeInTheDocument();
    expect(screen.queryByTestId("project-board")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-add-bucket")).not.toBeInTheDocument();
  });

  it("does not flash any board chrome while the request is still loading", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useGetProjectMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderBoard();

    expect(screen.getByText("Loading board…")).toBeInTheDocument();
    expect(screen.queryByTestId("project-board")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-add-bucket")).not.toBeInTheDocument();
    expect(screen.queryByText("Project not found.")).not.toBeInTheDocument();
  });

  it("does not flash management chrome while the session is still loading", () => {
    // Session hook returns no data yet — canManage must resolve to false so
    // we never momentarily render Add bucket / bucket menu / Add task even
    // for what will eventually be an admin session.
    useGetSessionMock.mockReturnValue({ data: undefined });
    useGetProjectMock.mockReturnValue({
      data: makeProject({
        name: "Pending session",
        buckets: [makeBucket({ id: 9, name: "Triage", tasks: [] })],
      }),
      isLoading: false,
      isError: false,
    });

    renderBoard();

    expect(screen.queryByTestId("button-add-bucket")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bucket-menu-9")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-task-9")).not.toBeInTheDocument();
    // Bucket name renders, but as plain text rather than a rename button.
    const bucketName = screen.getByTestId("bucket-name-9");
    expect(bucketName.tagName).not.toBe("BUTTON");
  });
});
