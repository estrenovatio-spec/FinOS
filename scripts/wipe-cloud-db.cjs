/**
 * Полная очистка облачных таблиц VoiceBudget.
 * Usage: node scripts/with-env-local.cjs node scripts/wipe-cloud-db.cjs
 *    or: DATABASE_URL=... node scripts/wipe-cloud-db.cjs
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  if (process.env.CONFIRM_CLOUD_WIPE !== "DELETE_ALL_HOUSEHOLDS") {
    console.error(
      "❌ Защита: для полной очистки задайте CONFIRM_CLOUD_WIPE=DELETE_ALL_HOUSEHOLDS",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url || url === '""' || !/^postgres(ql)?:\/\//i.test(url)) {
    console.error("❌ Нет корректного DATABASE_URL");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const [tx, members, categories, households, users] = await prisma.$transaction([
    prisma.transaction.deleteMany(),
    prisma.householdMember.deleteMany(),
    prisma.category.deleteMany(),
    prisma.household.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("✅ Облако очищено:");
  console.log("   transactions:", tx.count);
  console.log("   members:", members.count);
  console.log("   categories:", categories.count);
  console.log("   households:", households.count);
  console.log("   users:", users.count);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
