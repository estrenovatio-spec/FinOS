import { prisma } from "@/lib/db";

/** Deletes all cloud budget data (households, transactions, users). */
export async function wipeAllCloudData(): Promise<{
  transactions: number;
  members: number;
  categories: number;
  households: number;
  users: number;
}> {
  const tx = await prisma.transaction.deleteMany();
  const categories = await prisma.category.deleteMany();
  const members = await prisma.householdMember.deleteMany();
  const households = await prisma.household.deleteMany();
  const users = await prisma.user.deleteMany();
  return {
    transactions: tx.count,
    members: members.count,
    categories: categories.count,
    households: households.count,
    users: users.count,
  };
}
