import { db } from "@workspace/db";

// The seed used "open" and "pending" which aren't valid ITSM statuses.
// Map them to their correct equivalents.
const result1 = await db.execute(`UPDATE tickets SET status = 'new' WHERE status = 'open'`);
const result2 = await db.execute(`UPDATE tickets SET status = 'in_progress' WHERE status = 'pending'`);

console.log(`✓ Fixed statuses: "open" → "new", "pending" → "in_progress"`);

// Verify
const counts = await db.execute(
  `SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY status`
);
console.log("\nStatus breakdown:");
for (const row of counts.rows as { status: string; count: string }[]) {
  console.log(`  ${row.status}: ${row.count}`);
}

process.exit(0);
