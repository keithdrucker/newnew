import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { Session } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", () => ({
  useListDepartments: () => ({
    data: [
      {
        id: 1,
        slug: "it",
        name: "IT",
        icon: "Laptop",
        color: "#3b82f6",
        ticketCount: 5,
      },
      {
        id: 2,
        slug: "hr",
        name: "HR",
        icon: "Users",
        color: "#22c55e",
        ticketCount: 0,
      },
    ],
  }),
  useListAgents: () => ({ data: [] }),
  useListPeople: () => ({ data: [] }),
  useSwitchSession: () => ({ mutate: vi.fn() }),
}));

import { SideNav } from "./side-nav";

const adminSession: Session = {
  userId: 1,
  name: "Ada Admin",
  role: "admin",
  departmentId: null,
  departmentName: null,
} as unknown as Session;

const agentSession: Session = {
  userId: 2,
  name: "Aaron Agent",
  role: "agent",
  departmentId: 1,
  departmentName: "IT",
} as unknown as Session;

const endUserSession: Session = {
  userId: 3,
  name: "Eve End-User",
  role: "end_user",
  departmentId: 1,
  departmentName: "IT",
} as unknown as Session;

function renderAt(path: string, session: Session | null) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <WouterRouter hook={hook}>
      <SideNav session={session} />
    </WouterRouter>,
  );
}

const ACTIVE_CLASS = "bg-white/10";

describe("SideNav active state and auto-expansion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dashboard dropdown", () => {
    it("auto-expands and highlights Overview when on '/'", () => {
      renderAt("/", adminSession);

      const dashboardRow = screen.getByTestId("nav-dashboard");
      expect(dashboardRow).toHaveClass(ACTIVE_CLASS);

      const overview = screen.getByTestId("nav-dashboard-overview");
      expect(overview).toBeVisible();
      expect(overview).toHaveClass(ACTIVE_CLASS);

      const ticketsChild = screen.getByTestId("nav-dashboard-tickets");
      expect(ticketsChild).not.toHaveClass(ACTIVE_CLASS);
    });

    it("auto-expands and highlights Tickets child when on '/tickets/dashboard'", () => {
      renderAt("/tickets/dashboard", adminSession);

      const dashboardRow = screen.getByTestId("nav-dashboard");
      expect(dashboardRow).toHaveClass(ACTIVE_CLASS);

      const ticketsChild = screen.getByTestId("nav-dashboard-tickets");
      expect(ticketsChild).toBeVisible();
      expect(ticketsChild).toHaveClass(ACTIVE_CLASS);

      const overview = screen.getByTestId("nav-dashboard-overview");
      expect(overview).not.toHaveClass(ACTIVE_CLASS);
    });

    it("auto-expands and highlights Projects child when on '/projects/dashboard'", () => {
      renderAt("/projects/dashboard", adminSession);

      const dashboardRow = screen.getByTestId("nav-dashboard");
      expect(dashboardRow).toHaveClass(ACTIVE_CLASS);

      const projectsChild = screen.getByTestId("nav-dashboard-projects");
      expect(projectsChild).toBeVisible();
      expect(projectsChild).toHaveClass(ACTIVE_CLASS);
    });
  });

  describe("Tickets dropdown", () => {
    it("auto-expands and highlights All Tickets on '/tickets'", () => {
      renderAt("/tickets", adminSession);

      const ticketsRow = screen.getByTestId("nav-tickets");
      expect(ticketsRow).toHaveClass(ACTIVE_CLASS);

      const allTickets = screen.getByTestId("nav-tickets-all");
      expect(allTickets).toBeVisible();
      expect(allTickets).toHaveClass(ACTIVE_CLASS);
    });

    it("auto-expands and highlights the matching department on '/tickets/dept/:slug'", () => {
      renderAt("/tickets/dept/it", adminSession);

      const ticketsRow = screen.getByTestId("nav-tickets");
      expect(ticketsRow).toHaveClass(ACTIVE_CLASS);

      const itDept = screen.getByTestId("nav-dept-it");
      expect(itDept).toBeVisible();
      expect(itDept).toHaveClass(ACTIVE_CLASS);

      const hrDept = screen.getByTestId("nav-dept-hr");
      expect(hrDept).not.toHaveClass(ACTIVE_CLASS);

      const allTickets = screen.getByTestId("nav-tickets-all");
      expect(allTickets).not.toHaveClass(ACTIVE_CLASS);
    });
  });

  describe("Projects dropdown", () => {
    it("auto-expands and highlights All Projects on '/projects'", () => {
      renderAt("/projects", adminSession);

      const projectsRow = screen.getByTestId("nav-projects");
      expect(projectsRow).toHaveClass(ACTIVE_CLASS);

      const allProjects = screen.getByTestId("nav-projects-all");
      expect(allProjects).toBeVisible();
      expect(allProjects).toHaveClass(ACTIVE_CLASS);
    });

    it("auto-expands and highlights the matching department on '/projects/dept/:slug'", () => {
      renderAt("/projects/dept/hr", adminSession);

      const projectsRow = screen.getByTestId("nav-projects");
      expect(projectsRow).toHaveClass(ACTIVE_CLASS);

      const hrDept = screen.getByTestId("nav-projects-dept-hr");
      expect(hrDept).toBeVisible();
      expect(hrDept).toHaveClass(ACTIVE_CLASS);

      const itDept = screen.getByTestId("nav-projects-dept-it");
      expect(itDept).not.toHaveClass(ACTIVE_CLASS);

      const allProjects = screen.getByTestId("nav-projects-all");
      expect(allProjects).not.toHaveClass(ACTIVE_CLASS);
    });
  });
});

describe("SideNav role-based visibility", () => {
  it("hides the Projects workspace entry and the Projects dashboard child for end users", () => {
    renderAt("/", endUserSession);

    expect(screen.queryByTestId("nav-projects")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("nav-dashboard-projects"),
    ).not.toBeInTheDocument();

    expect(screen.getByTestId("nav-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tickets")).toBeInTheDocument();
  });

  it("shows the Projects entries for agents", () => {
    renderAt("/", agentSession);

    expect(screen.getByTestId("nav-projects")).toBeInTheDocument();
    expect(screen.getByTestId("nav-dashboard-projects")).toBeInTheDocument();
  });

  it("shows the Administration section only for admins", () => {
    renderAt("/", adminSession);

    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByTestId("nav-assets")).toBeInTheDocument();
    expect(screen.getByTestId("nav-applications")).toBeInTheDocument();
    expect(screen.getByTestId("nav-vendors")).toBeInTheDocument();
    expect(screen.getByTestId("nav-people")).toBeInTheDocument();
    expect(screen.getByTestId("nav-settings")).toBeInTheDocument();
  });

  it("hides the Administration section for agents", () => {
    renderAt("/", agentSession);

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-assets")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-settings")).not.toBeInTheDocument();
  });

  it("hides the Administration section for end users", () => {
    renderAt("/", endUserSession);

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-people")).not.toBeInTheDocument();
  });
});
