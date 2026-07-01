-- Очистка облака Просто Бюджет (Supabase → SQL Editor)
-- Запускайте по ОДНОМУ блоку (выделить → Run). Не весь файл сразу.

-- 1
DELETE FROM "Transaction";

-- 2
DELETE FROM "Category";

-- 3
DELETE FROM "HouseholdMember";

-- 4
DELETE FROM "Household";

-- 5
DELETE FROM "User";
