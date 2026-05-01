import { db, ticketsTable, departmentsTable } from "@workspace/db";

const tickets = await db
  .select({
    id: ticketsTable.id,
    ticketKey: ticketsTable.ticketKey,
    title: ticketsTable.title,
    status: ticketsTable.status,
    source: ticketsTable.source,
    departmentId: ticketsTable.departmentId,
    reporterId: ticketsTable.reporterId,
    createdAt: ticketsTable.createdAt,
  })
  .from(ticketsTable)
  .orderBy(ticketsTable.createdAt);

const depts = await db.select().from(departmentsTable);
const deptMap = new Map(depts.map((d) => [d.id, d.name]));

const recent = tickets.slice(-5);
console.log(`\nTotal tickets: ${tickets.length}`);
console.log("\nMost recent 5 tickets:");
for (const t of recent) {
  console.log(
    `  [${t.ticketKey}] "${t.title}" | status=${t.status} | dept=${deptMap.get(t.departmentId) ?? t.departmentId} | source=${t.source} | reporterId=${t.reporterId}`
  );
}

process.exit(0);
