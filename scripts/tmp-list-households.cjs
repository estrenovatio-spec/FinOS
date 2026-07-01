const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const households = await prisma.$queryRaw`
    SELECT h."inviteCode", h.name, h.mode, COUNT(m.id)::int AS members
    FROM "Household" h
    LEFT JOIN "HouseholdMember" m ON m."householdId" = h.id
    GROUP BY h.id
    ORDER BY h."createdAt" DESC
  `;
  console.log(JSON.stringify(households, null, 2));
}

main()
  .catch((e) => console.error(e.message))
  .finally(() => prisma.$disconnect());
