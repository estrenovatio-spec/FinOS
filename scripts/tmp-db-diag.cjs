const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.user.findFirst({ take: 1 });
    console.log("user.findFirst: OK");
  } catch (e) {
    console.error("user.findFirst FAIL:", e.message);
  }

  try {
    await prisma.user.upsert({
      where: { telegramId: BigInt(999999999) },
      create: {
        telegramId: BigInt(999999999),
        firstName: "diag",
      },
      update: { firstName: "diag" },
    });
    console.log("user.upsert: OK");
    await prisma.user.delete({ where: { telegramId: BigInt(999999999) } });
  } catch (e) {
    console.error("user.upsert FAIL:", e.message);
  }

  const households = await prisma.household.findMany({
    select: { inviteCode: true, name: true, mode: true, members: { select: { userId: true } } },
    include: { members: true },
  }).catch(async (e) => {
    console.error("household FAIL:", e.message);
    return [];
  });

  if (Array.isArray(households)) {
    console.log("households:", JSON.stringify(households, null, 2));
  }
}

main()
  .finally(() => prisma.$disconnect());
