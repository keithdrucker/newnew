import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TicketDetail as TicketDetailData } from "@workspace/api-client-react";

// `ticket-detail.tsx` does not call `useGetSession` directly today — the
// backend role-scopes the response and the page just renders whatever it
// gets (or the not-found state if the request was forbidden). The "admin /
// agent / end-user" framing of the test cases is therefore expressed by
// shaping the mocked backend payload (and the absence of payload for
// denied access), not by mocking a session hook.
const useGetTicketMock = vi.fn();
const useUpdateTicketMock = vi.fn();
const useAddTicketCommentMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetTicket: (...args: unknown[]) => useGetTicketMock(...args),
  useUpdateTicket: () => useUpdateTicketMock(),
  useAddTicketComment: () => useAddTicketCommentMock(),
}));

import TicketDetail from "./ticket-detail";

function makeTicketDetail(
  overrides: Partial<TicketDetailData> = {},
): TicketDetailData {
  return {
    id: 42,
    ticketKey: "IT-42",
    title: "Sample ticket",
    description: "A description",
    type: "incident",
    priority: "medium",
    status: "open",
    source: "portal",
    supportLevel: 1,
    departmentId: 1,
    departmentName: "IT",
    reporterId: 3,
    reporterName: "Eve End-User",
    assigneeId: null,
    assigneeName: null,
    location: null,
    team: null,
    category: null,
    slaBreached: false,
    responseDueAt: null,
    resolutionDueAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    comments: [],
    ...overrides,
  } as TicketDetailData;
}

function renderTicketDetail(path = "/tickets/42") {
  const { hook } = memoryLocation({ path, static: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WouterRouter hook={hook}>
        <TicketDetail />
      </WouterRouter>
    </QueryClientProvider>,
  );
}

describe("TicketDetail page — role-scoped rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateTicketMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useAddTicketCommentMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("renders the full ticket — including edit controls — for an admin session", () => {
    useGetTicketMock.mockReturnValue({
      data: makeTicketDetail({
        title: "Server is down",
        description: "Production is offline",
      }),
      isLoading: false,
      isError: false,
    });

    renderTicketDetail();

    expect(
      screen.getByRole("heading", { level: 1, name: "Server is down" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Production is offline")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("IT-42")).toBeInTheDocument();
    // Editing controls are present for admins
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Type your reply here..."),
    ).toBeInTheDocument();
  });

  it("renders an in-department ticket for an agent session", () => {
    useGetTicketMock.mockReturnValue({
      data: makeTicketDetail({
        id: 11,
        ticketKey: "IT-11",
        title: "Agent's IT ticket",
        departmentId: 1,
        departmentName: "IT",
      }),
      isLoading: false,
      isError: false,
    });

    renderTicketDetail("/tickets/11");

    expect(
      screen.getByRole("heading", { level: 1, name: "Agent's IT ticket" }),
    ).toBeInTheDocument();
    expect(screen.getByText("IT-11")).toBeInTheDocument();
    // Agents may triage/respond — editing controls and reply box are present
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Type your reply here..."),
    ).toBeInTheDocument();
  });

  it("renders an end_user's own ticket so they can read it and reply", () => {
    useGetTicketMock.mockReturnValue({
      data: makeTicketDetail({
        id: 21,
        ticketKey: "IT-21",
        title: "My laptop is broken",
        reporterId: 3,
        reporterName: "Eve End-User",
        comments: [
          {
            id: 1,
            ticketId: 21,
            authorName: "Aaron Agent",
            authorRole: "agent",
            body: "We're investigating.",
            createdAt: "2026-04-02T09:00:00.000Z",
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });

    renderTicketDetail("/tickets/21");

    expect(
      screen.getByRole("heading", { level: 1, name: "My laptop is broken" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Eve End-User")).toBeInTheDocument();
    // Reporter can read agent comments on their own ticket
    expect(screen.getByText("We're investigating.")).toBeInTheDocument();
    // Reporter can post a reply on their own ticket
    expect(
      screen.getByPlaceholderText("Type your reply here..."),
    ).toBeInTheDocument();
  });

  it("shows the access-denied state when the backend hides a ticket from this session", () => {
    // End-user trying to open a ticket they don't own → backend returns 403/404,
    // useGetTicket exposes `data: undefined`. We must NOT leak any ticket
    // chrome (no title, no status select, no reply box).
    useGetTicketMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderTicketDetail("/tickets/999");

    expect(screen.getByText("Ticket not found")).toBeInTheDocument();
    // None of the privileged controls or sensitive UI should render
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(screen.queryByText("Reporter")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type your reply here..."),
    ).not.toBeInTheDocument();
  });

  it("shows the access-denied state for an agent opening a ticket outside their department", () => {
    // Agent in IT trying to open an HR ticket → backend returns 403/404.
    useGetTicketMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderTicketDetail("/tickets/777");

    expect(screen.getByText("Ticket not found")).toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type your reply here..."),
    ).not.toBeInTheDocument();
  });

  it("renders a loading skeleton (and no privileged chrome) while the request is in flight", () => {
    useGetTicketMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderTicketDetail();

    // While loading we must not flash sensitive controls or the reply box
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type your reply here..."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ticket not found")).not.toBeInTheDocument();
  });
});
