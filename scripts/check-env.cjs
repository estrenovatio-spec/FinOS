const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.log("❌ Файл .env.local НЕ найден в папке voicebudget");
  console.log("   Создайте: cp .env.local.example .env.local");
  process.exit(1);
}

const text = fs.readFileSync(envPath, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));

if (!line || line.length < 20) {
  console.log("❌ В .env.local нет строки DATABASE_URL=...");
  process.exit(1);
}

const masked = line.replace(/:([^:@/]+)@/, ":***@");
console.log("✅ Файл .env.local есть на диске");
console.log("   ", masked.slice(0, 100) + (masked.length > 100 ? "…" : ""));

if (line.includes("@host:5432")) {
  console.log("❌ Всё ещё шаблон из примера (host:5432). Вставьте строку из Supabase.");
  process.exit(1);
}
if (line.includes("supabase.co")) {
  console.log("✅ Похоже на Supabase — строка сохранена.");
} else {
  console.log("⚠️  Хост не supabase — проверьте, что скопировали URI из Supabase.");
}
