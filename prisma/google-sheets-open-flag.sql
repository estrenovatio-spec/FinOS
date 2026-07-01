-- Один раз в Supabase SQL Editor, если db push недоступен:
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSheetsOpenLogged" BOOLEAN NOT NULL DEFAULT false;
