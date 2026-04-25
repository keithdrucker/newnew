import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Mock the session module so we can control which user the route sees
// without standing up a real DB-backed session. The route's role gate
// runs before any DB access, so this is sufficient for the 403 test.
vi.mock("../lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser, type SessionUser } from "../lib/session";
import projectsRouter from "./projects";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(projectsRouter);
  return app;
}

function userWithRole(role: SessionUser["role"]): SessionUser {
  return {
    id: 99,
    email: "user@example.com",
    name: "Test User",
    role,
    departmentId: null,
  } as SessionUser;
}

describe("POST /projects role gating", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset();
  });

  it("rejects an end_user caller with 403 even with a valid request body", async () => {
    mockedGetCurrentUser.mockResolvedValue(userWithRole("end_user"));

    const app = makeApp();
    const res = await request(app)
      .post("/projects")
      .send({
        name: "Sneaky end-user project",
        description: "Should never be created",
        color: "#4B9CD3",
        status: "active",
        departmentId: null,
        ownerId: null,
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });

  it("rejects an end_user caller with 403 even with an empty body", async () => {
    // Defense in depth: the role check must run before body validation,
    // so we don't leak that we'd otherwise accept the payload.
    mockedGetCurrentUser.mockResolvedValue(userWithRole("end_user"));

    const app = makeApp();
    const res = await request(app).post("/projects").send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });
});
