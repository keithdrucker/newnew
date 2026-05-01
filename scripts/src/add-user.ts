import { db, usersTable, departmentsTable } from "@workspace/db";

const email = "walczykr@gmail.com";

const allDepts = await db.select().from(departmentsTable);
const legal = allDepts.find((d) => d.name.toLowerCase() === "legal");

if (!legal) {
  console.error("Legal department not found. Available:");
  allDepts.forEach((d) => console.log(`  ${d.name} (id=${d.id})`));
  process.exit(1);
}

await db.execute(
  `UPDATE users SET department_id = ${legal.id} WHERE email = '${email}'`,
);

const allUsers = await db.select().from(usersTable);
const user = allUsers.find((u) => u.email === email);

if (!user) {
  console.error(`User ${email} not found`);
  process.exit(1);
}

console.log(`✓ ${user.name} → ${legal.name} (dept id=${legal.id})`);
process.exit(0);
