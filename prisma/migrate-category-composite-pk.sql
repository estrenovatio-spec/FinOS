-- Исправление: раньше PRIMARY KEY был только на Category.id («transport», «other»…),
-- поэтому вторая семья в облаке не могла создаться (household_create_failed).
-- Выполнить один раз в Supabase / Neon SQL Editor (или: psql "$DATABASE_URL" -f prisma/migrate-category-composite-pk.sql)

ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_pkey";
ALTER TABLE "Category" ADD CONSTRAINT "Category_pkey" PRIMARY KEY ("householdId", "id");
