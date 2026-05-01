import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  departmentsTable,
  kbArticlesTable,
  ticketCommentsTable,
  ticketsTable,
  usersTable,
} from "@workspace/db";
import { botAuth } from "../middleware/bot-auth";

const router: IRouter = Router();

router.use("/bot", botAuth);

// ---------------------------------------------------------------------------
// GET /bot/knowledge-base
// Returns all KB articles as a flat text blob the bot injects into its system prompt.
// ---------------------------------------------------------------------------
router.get("/bot/knowledge-base", async (_req, res): Promise<void> => {
  const articles = await db
    .select({ title: kbArticlesTable.title, body: kbArticlesTable.body })
    .from(kbArticlesTable)
    .orderBy(kbArticlesTable.title);

  const content = articles.length
    ? articles.map((a) => `## ${a.title}\n${a.body}`).join("\n\n")
    : "";

  res.json({ content });
});

// ---------------------------------------------------------------------------
// GET /bot/departments
// Returns the department list for the portal's department dropdown.
// ---------------------------------------------------------------------------
router.get("/bot/departments", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ id: departmentsTable.id, name: departmentsTable.name })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);

  res.json({ departments: rows });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ITSM_TO_BOT_STATUS: Record<string, string> = {
  new: "open",
  in_progress: "in_progress",
  with_user: "waiting",
  with_vendor: "waiting",
  on_hold: "waiting",
  scheduled: "in_progress",
  resolved: "resolved",
  closed: "closed",
};

function mapStatus(itsmStatus: string): string {
  return ITSM_TO_BOT_STATUS[itsmStatus] ?? "open";
}

async function nextRequestKey(): Promise<string> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(eq(ticketsTable.type, "request"));
  const next = (count ?? 0) + 24;
  return `REQ-${String(next).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// POST /bot/tickets
// Creates an ITSM ticket on behalf of a portal user (identified by email).
// ---------------------------------------------------------------------------
const CreateBotTicketBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  departmentId: z.number().int().positive(),
  reporterEmail: z.string().email(),
  initialMessages: z
    .array(
      z.object({
        sender: z.enum(["user", "system"]),
        content: z.string(),
      }),
    )
    .optional(),
});

router.post("/bot/tickets", async (req, res): Promise<void> => {
  const parsed = CreateBotTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, category, priority, departmentId, reporterEmail, initialMessages } =
    parsed.data;

  const [reporter] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, reporterEmail))
    .limit(1);

  if (!reporter) {
    res
      .status(404)
      .json({ error: `No ITSM user found with email: ${reporterEmail}` });
    return;
  }

  const ticketKey = await nextRequestKey();

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      ticketKey,
      title,
      description,
      type: "request",
      priority,
      status: "new",
      source: "bot_portal",
      category: category ?? null,
      departmentId,
      reporterId: reporter.id,
      riskLevel: "low",
      supportLevel: 1,
    })
    .returning();

  if (!ticket) {
    res.status(500).json({ error: "Failed to create ticket" });
    return;
  }

  // Store initial chat messages as reply comments so agents have full context.
  if (initialMessages?.length) {
    const toInsert = initialMessages.filter((m) => m.content.trim().length > 0);
    if (toInsert.length) {
      await db.insert(ticketCommentsTable).values(
        toInsert.map((m) => ({
          ticketId: ticket.id,
          authorId: reporter.id,
          body: m.content,
          kind: "reply",
        })),
      );
    }
  }

  res.status(201).json({
    ticket: {
      id: String(ticket.id),
      ticketKey: ticket.ticketKey,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category ?? "",
      status: mapStatus(ticket.status),
      priority: ticket.priority,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messageCount: initialMessages?.length ?? 0,
      lastMessagePreview: null,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /bot/tickets?email=<email>
// Lists all ITSM tickets for the given reporter email.
// ---------------------------------------------------------------------------
router.get("/bot/tickets", async (req, res): Promise<void> => {
  const email = req.query["email"] as string | undefined;
  if (!email) {
    res.status(400).json({ error: "email query param is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.json({ tickets: [] });
    return;
  }

  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.reporterId, user.id))
    .orderBy(desc(ticketsTable.updatedAt));

  // Get comment counts in one query.
  const counts = await db
    .select({
      ticketId: ticketCommentsTable.ticketId,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketCommentsTable)
    .groupBy(ticketCommentsTable.ticketId);

  const countMap = new Map(counts.map((r) => [r.ticketId, r.count]));

  res.json({
    tickets: tickets.map((t) => ({
      id: String(t.id),
      ticketKey: t.ticketKey,
      title: t.title,
      description: t.description,
      category: t.category ?? "",
      status: mapStatus(t.status),
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      messageCount: countMap.get(t.id) ?? 0,
      lastMessagePreview: null,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /bot/tickets/:id
// Returns a single ticket with its reply-kind comments as messages.
// ---------------------------------------------------------------------------
router.get("/bot/tickets/:id", async (req, res): Promise<void> => {
  const ticketId = Number(req.params["id"]);
  if (Number.isNaN(ticketId)) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const comments = await db
    .select()
    .from(ticketCommentsTable)
    .where(eq(ticketCommentsTable.ticketId, ticketId))
    .orderBy(ticketCommentsTable.createdAt);

  const messages = comments
    .filter((c) => c.kind === "reply")
    .map((c) => ({
      id: String(c.id),
      ticketId: String(ticketId),
      sender: c.authorId === ticket.reporterId ? ("user" as const) : ("agent" as const),
      content: c.body,
      createdAt: c.createdAt.toISOString(),
    }));

  res.json({
    ticket: {
      id: String(ticket.id),
      ticketKey: ticket.ticketKey,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category ?? "",
      status: mapStatus(ticket.status),
      priority: ticket.priority,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messageCount: messages.length,
      lastMessagePreview:
        messages.length > 0
          ? messages[messages.length - 1]!.content.slice(0, 140)
          : null,
      messages,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /bot/tickets/:id/messages
// Adds a reply comment to a ticket on behalf of the reporter.
// ---------------------------------------------------------------------------
router.post("/bot/tickets/:id/messages", async (req, res): Promise<void> => {
  const ticketId = Number(req.params["id"]);
  if (Number.isNaN(ticketId)) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const { content, reporterEmail } = req.body as {
    content?: string;
    reporterEmail?: string;
  };

  if (!content?.trim() || !reporterEmail) {
    res.status(400).json({ error: "content and reporterEmail are required" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [reporter] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, reporterEmail))
    .limit(1);

  if (!reporter) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [comment] = await db
    .insert(ticketCommentsTable)
    .values({ ticketId, authorId: reporter.id, body: content, kind: "reply" })
    .returning();

  res.status(201).json({
    id: String(comment!.id),
    ticketId: String(ticketId),
    sender: "user" as const,
    content: comment!.body,
    createdAt: comment!.createdAt.toISOString(),
  });
});

export default router;
