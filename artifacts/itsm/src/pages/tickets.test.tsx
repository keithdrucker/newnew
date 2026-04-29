import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session, Ticket, Department } from "@workspace/api-client-react";

const useListTicketsMock = vi.fn();
const useListDepartmentsMock = vi.fn();
const useGetSessionMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useListTickets: (...args: unknown[]) => useListTicketsMock(...args),
  useGetSession: () => useGetSessionMock(),
  useListDepartments: () => useListDepartmentsMock(),
  useListAgents: () => ({ data: [] }),
  useListTicketViews: () => ({ data: [] }),
  useCreateTicketView: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateTicketView: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteTicketView: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateMePreferences: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useListRiskRules: () => ({ data: [] }),
  useCreateTicket: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  getListTicketViewsQueryKey: () => ["ticket-views"],
  getGetSessionQueryKey: () => ["session"],
  getListTicketsQueryKey: () => ["/api/tickets"],
}));

import Tickets from "./tickets";

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

function makeTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 1,
    ticketKey: "IT-1",
    title: "Sample ticket",
    description: "",
    type: "incident",
    priority: "medium",
    status: "new",
    source: "portal",
    supportLevel: 1,
    departmentId: 1,
    departmentName: "IT",
    reporterId: 10,
    reporterName: "Reporter",
    assigneeId: null,
    assigneeName: null,
    location: null,
    team: null,
    category: null,
    riskLevel: "low",
    rootCause: null,
    resolution: null,
    slaBreached: false,
    slaStatus: "on_track",
    slaPhase: "resolution",
    slaPaused: false,
    slaActiveDueAt: null,
    responseSlaBreached: false,
    closureReason: null,
    withUserSince: null,
    lastUserReplyAt: null,
    responseDueAt: null,
    resolutionDueAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    ...overrides,
  } as Ticket;
}

function renderTickets(path = "/tickets") {
  const { hook } = memoryLocation({ path, static: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WouterRouter hook={hook}>
        <Tickets />
      </WouterRouter>
    </QueryClientProvider>,
  );
}

describe("Tickets page — role-scoped rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all-department tickets for an admin session", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept, hrDept] });

    const tickets: Ticket[] = [
      makeTicket({ id: 1, ticketKey: "IT-1", title: "IT alpha", departmentId: 1, departmentName: "IT" }),
      makeTicket({ id: 2, ticketKey: "HR-7", title: "HR bravo", departmentId: 2, departmentName: "HR" }),
      makeTicket({ id: 3, ticketKey: "IT-2", title: "IT charlie", departmentId: 1, departmentName: "IT" }),
    ];
    useListTicketsMock.mockReturnValue({ data: tickets, isLoading: false });

    renderTickets();

    expect(screen.getByTestId("row-ticket-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-ticket-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-ticket-3")).toBeInTheDocument();
    expect(screen.getByText("IT alpha")).toBeInTheDocument();
    expect(screen.getByText("HR bravo")).toBeInTheDocument();
    expect(screen.getByText("IT charlie")).toBeInTheDocument();
    expect(screen.queryByText("No tickets found.")).not.toBeInTheDocument();
  });

  it("renders only the agent's department tickets for an agent session", () => {
    useGetSessionMock.mockReturnValue({ data: agentSession });
    // Backend role-scoping: agent only sees their accessible department(s)
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });

    // Backend returns only IT tickets for this agent — UI must not show HR rows
    const tickets: Ticket[] = [
      makeTicket({ id: 11, ticketKey: "IT-11", title: "IT scoped one", departmentId: 1, departmentName: "IT" }),
      makeTicket({ id: 12, ticketKey: "IT-12", title: "IT scoped two", departmentId: 1, departmentName: "IT" }),
    ];
    useListTicketsMock.mockReturnValue({ data: tickets, isLoading: false });

    renderTickets();

    expect(screen.getByTestId("row-ticket-11")).toBeInTheDocument();
    expect(screen.getByTestId("row-ticket-12")).toBeInTheDocument();
    expect(screen.getByText("IT scoped one")).toBeInTheDocument();
    expect(screen.getByText("IT scoped two")).toBeInTheDocument();
    // HR ticket from the previous test should not leak in
    expect(screen.queryByText("HR bravo")).not.toBeInTheDocument();
  });

  it("renders only the end_user's own tickets and no others", () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });

    // Backend role-scoping: end_user only receives tickets they reported
    const tickets: Ticket[] = [
      makeTicket({
        id: 21,
        ticketKey: "IT-21",
        title: "My laptop is broken",
        departmentId: 1,
        departmentName: "IT",
        reporterId: 3,
        reporterName: "Eve End-User",
      }),
    ];
    useListTicketsMock.mockReturnValue({ data: tickets, isLoading: false });

    renderTickets();

    expect(screen.getByTestId("row-ticket-21")).toBeInTheDocument();
    expect(screen.getByText("My laptop is broken")).toBeInTheDocument();

    // Tickets reported by other people must not appear
    expect(screen.queryByTestId("row-ticket-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-ticket-12")).not.toBeInTheDocument();
    expect(screen.queryByText("HR bravo")).not.toBeInTheDocument();
  });

  it("scopes the request by departmentId when on /tickets/dept/:slug", () => {
    useGetSessionMock.mockReturnValue({ data: adminSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept, hrDept] });
    useListTicketsMock.mockReturnValue({ data: [], isLoading: false });

    renderTickets("/tickets/dept/hr");

    // The page must request the HR department's tickets specifically
    expect(useListTicketsMock).toHaveBeenCalled();
    const callArgs = useListTicketsMock.mock.calls.at(-1)?.[0];
    expect(callArgs).toMatchObject({ departmentId: hrDept.id });

    // Heading should reflect the department scope
    expect(
      screen.getByRole("heading", { level: 1, name: /HR/ }),
    ).toBeInTheDocument();
  });

  it("shows the empty state when the role-scoped query returns no rows", () => {
    useGetSessionMock.mockReturnValue({ data: endUserSession });
    useListDepartmentsMock.mockReturnValue({ data: [itDept] });
    useListTicketsMock.mockReturnValue({ data: [], isLoading: false });

    renderTickets();

    expect(screen.getByText("No tickets found.")).toBeInTheDocument();
  });
});
