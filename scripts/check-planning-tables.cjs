const { PrismaClient } = require("@prisma/client");

const REQUIRED = [
  "SavingsGoal",
  "CategoryBudget",
  "RecurringTransaction",
  "Subscription",
  "Payment",
];

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${REQUIRED}::text[])
    `;
    const found = new Set(rows.map((r) => r.table_name));
    let ok = true;
    for (const name of REQUIRED) {
      const exists = found.has(name);
      console.log(`${name}: ${exists ? "OK" : "MISSING"}`);
      if (!exists) ok = false;
    }
    if (ok) {
      const goals = await prisma.savingsGoal.count();
      const subs = await prisma.subscription.count();
      console.log(`SavingsGoal rows: ${goals}`);
      console.log(`Subscription rows: ${subs}`);
      console.log("ALL_PLANNING_TABLES_OK");
    } else {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("DB_ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
