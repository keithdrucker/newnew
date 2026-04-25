import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Session,
  ProjectSummary,
  Department,
} from "@workspace/api-client-react";

const useListProjectsMock = vi.fn();
const useListDepartmentsMock = vi.fn();
const useGetSessionMock = vi.fn();
const useGetDepartmentBoardMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useListProjects: (...args: unknown[]) => useListProjectsMock(...args),
  useGetSession: () => useGetSessionMock(),
  useListDepartments: () => useListDepartmentsMock(),
  useGetDepartmentBoard: (...args: unknown[]) =>
    useGetDepartmentBoardMock(...args),
  useListAgents: () => ({ data: [] }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  useListProjectComments: () => ({ data: [] }),
  useCreateProjectComment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProjectComment: () => ({ mutate: vi.fn(), isPending: false }),
  getListProjectsQueryKey: () => ["projects"],
  getGetProjectQueryKey: () => ["project"],
  getGetDepartmentBoardQueryKey: () => ["department-board"],
  getListProjectCommentsQueryKey: () => ["project-comments"],
}));

import ProjectsPage from "./projects";

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

const itDept: Department = {
  id: 1,
  slug: "it",
  name: "IT",
  icon: "Laptop",
  color: "#3b82f6",
  ticketCount: 0,
};

const hrDept: Department = {
  id: 2,
  slug: "hr",
  name: "HR",
  icon: "Users",
  color: "#22c55e",
  ticketCount: 0,
};

function makeProject(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 1,
    name: "Sample project",
    description: "",
    color: "#4B9CD3",
    status: "active",
    departmentId: 1,
    departmentName: "IT",
    bucketId: null,
    bucketName: null,
    ownerId: null,
    ownerName: null,
    dueAt: null,
    suggestedById: null,
    suggestedByName: null,
    goal: "",
    implementation: "",
    rationale: "",
    impactedDepartmentIds: [],
    impactedDepartmentNames: [],
    additionalComments: "",
    completedYear: null,
    labels: [],
    priority: "medium",
    checklist: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    ...overrides,
  } as ProjectSummary;
}

function renderProjects(path = "/projects") {
  const { hook } = memoryLocation({ path, static: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WouterRouter hook={hook}>
        <ProjectsPage />
      </WouterRouter>
    </QueryClientProvider>,
  );
}

describe("Projects page — role-scoped rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sane default for the board hook so consumers that don't drive it
    // (e.g. the create-mode dialog rendered alongside the global list)
    // don't crash on `data.columns` access.
    useGetDepartmentBoardMock.mockReturnValue({
      data: { departmentId: 0, columns: [], unassigned: [] },
      isLoading: false,
    });
  });

  it("renders projects across all departments for an admin session", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept, hrDept] });

    const projects: ProjectSummary[] = [
      makeProject({ id: 1, name: "IT Roadmap", departmentId: 1, departmentName: "IT" }),
      makeProject({ id: 2, name: "HR Onboarding", departmentId: 2, departmentName: "HR" }),
      makeProject({ id: 3, name: "Cross-team initiative", departmentId: null, departmentName: null }),
    ];
    useListProjectsMock.mockReturnValue({ data: projects, isLoading: false });

    renderProjects();

    expect(screen.getByTestId("card-project-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-project-2")).toBeInTheDocument();
    expect(screen.getByTestId("card-project-3")).toBeInTheDocument();
    expect(screen.getByText("IT Roadmap")).toBeInTheDocument();
    expect(screen.getByText("HR Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Cross-team initiative")).toBeInTheDocument();

    // Admin can create projects
    expect(screen.getByTestId("button-new-project")).toBeInTheDocument();
  });

  it("renders only the agent's accessible projects for an agent session", () => {
    useGetSessionMock.mockReturnValue({ data: agentSession });
    // Backend role-scoping: agent only sees their accessible department(s)
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });

    const projects: ProjectSummary[] = [
      makeProject({ id: 11, name: "IT scoped project", departmentId: 1, departmentName: "IT" }),
    ];
    useListProjectsMock.mockReturnValue({ data: projects, isLoading: false });

    renderProjects();

    expect(screen.getByTestId("card-project-11")).toBeInTheDocument();
    expect(screen.getByText("IT scoped project")).toBeInTheDocument();
    expect(screen.queryByText("HR Onboarding")).not.toBeInTheDocument();

    // Agents can also create projects (matches sidebar visibility)
    expect(screen.getByTestId("button-new-project")).toBeInTheDocument();
  });

  it("hides the New project button for an end_user session", () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });
    useListProjectsMock.mockReturnValue({ data: [], isLoading: false });

    renderProjects();

    // The end-user must not see project-creation UI
    expect(screen.queryByTestId("button-new-project")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("button-new-project-empty"),
    ).not.toBeInTheDocument();
    // Empty-state copy reflects the read-only global view
    expect(
      screen.getByText(
        "Pick a department from the sidebar to see its phase board.",
      ),
    ).toBeInTheDocument();
  });

  it("renders only the projects the end_user has access to", () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });

    // Backend filters down to projects the end-user is a member of
    const projects: ProjectSummary[] = [
      makeProject({
        id: 31,
        name: "Project I belong to",
        departmentId: 1,
        departmentName: "IT",
      }),
    ];
    useListProjectsMock.mockReturnValue({ data: projects, isLoading: false });

    renderProjects();

    expect(screen.getByTestId("card-project-31")).toBeInTheDocument();
    expect(screen.getByText("Project I belong to")).toBeInTheDocument();
    expect(screen.queryByTestId("card-project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("HR Onboarding")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-new-project")).not.toBeInTheDocument();
  });

  it("does not flash the New project button while the session is still loading", () => {
    // Session hook returns no data yet (e.g. still fetching) — canCreate must
    // resolve to false so we never momentarily render a privileged action.
    useGetSessionMock.mockReturnValue({ data: undefined });
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });
    useListProjectsMock.mockReturnValue({ data: [], isLoading: false });

    renderProjects();

    expect(screen.queryByTestId("button-new-project")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("button-new-project-empty"),
    ).not.toBeInTheDocument();
  });

  it("renders the department Kanban board when on /projects/dept/:slug", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept, hrDept] });
    useListProjectsMock.mockReturnValue({ data: [], isLoading: false });
    useGetDepartmentBoardMock.mockReturnValue({
      data: {
        departmentId: hrDept.id,
        columns: [
          {
            id: 100,
            departmentId: hrDept.id,
            name: "Backlog",
            position: 1,
            color: "#60A5FA",
            projects: [
              makeProject({
                id: 42,
                name: "HR pipeline card",
                departmentId: hrDept.id,
                departmentName: hrDept.name,
              }),
            ],
          },
        ],
        unassigned: [],
      },
      isLoading: false,
    });

    renderProjects("/projects/dept/hr");

    // Board fetched, not the flat list
    expect(useGetDepartmentBoardMock).toHaveBeenCalled();
    const boardArgs = useGetDepartmentBoardMock.mock.calls.at(-1)?.[0];
    expect(boardArgs).toBe(hrDept.id);

    // Department-scoped heading
    expect(
      screen.getByRole("heading", { level: 1, name: /HR initiatives/i }),
    ).toBeInTheDocument();

    // Kanban column + card show up
    expect(screen.getByTestId("department-kanban")).toBeInTheDocument();
    expect(screen.getByTestId("column-100")).toBeInTheDocument();
    expect(screen.getByTestId("card-project-42")).toBeInTheDocument();
    expect(screen.getByText("HR pipeline card")).toBeInTheDocument();
  });
});
