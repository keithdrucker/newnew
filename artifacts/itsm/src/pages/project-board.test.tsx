import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ProjectDetail,
  ProjectBucketWithTasks,
  ProjectTask,
} from "@workspace/api-client-react";

// `project-board.tsx` does not call `useGetSession` directly today — the
// backend role-scopes the response (returning the project for permitted
// users, 403/404 otherwise) and the page just renders what it gets, or
// the not-found state. The "admin / agent / end-user" framing of these
// test cases is therefore expressed via the mocked backend payload (and
// the absence of payload for forbidden access), not via a session hook.
const useGetProjectMock = vi.fn();
const useListAgentsMock = vi.fn();
const useListDepartmentsMock = vi.fn();
const useListProjectTaskCommentsMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetProject: (...args: unknown[]) => useGetProjectMock(...args),
  useListAgents: () => useListAgentsMock(),
  useListDepartments: () => useListDepartmentsMock(),
  useListProjectTaskComments: (...args: unknown[]) =>
    useListProjectTaskCommentsMock(...args),
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
  });

  it("renders the full board — including bucket controls — for an admin session", () => {
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
  });

  it("renders an in-department project board for an agent session", () => {
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
  });

  it("renders the read-only view of a project the end_user has access to", () => {
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

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "End-user accessible project",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bucket-5")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-301")).toBeInTheDocument();
    expect(screen.getByText("Office supply suggestion")).toBeInTheDocument();
  });

  it("shows the access-denied state for an agent opening a project outside their department", () => {
    // Agent in IT trying to open an HR project → backend returns 403/404,
    // useGetProject exposes `data: undefined`. The board chrome must NOT
    // render — no buckets, tasks, or "Add bucket" button can leak through.
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
});
