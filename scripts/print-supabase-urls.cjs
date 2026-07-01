/**
 * Строит правильные строки Supabase из текущего DATABASE_URL в .env.local
 * Usage: node scripts/print-supabase-urls.cjs eu-central-1
 *        node scripts/print-supabase-urls.cjs eu-central-1 --write-local
 */
const fs = require("fs");
const path = require("path");

const region = process.argv[2];
const writeLocal = process.argv.includes("--write-local");

if (!region) {
  console.error("Укажите регион из Supabase (например eu-central-1):");
  console.error("  node scripts/print-supabase-urls.cjs eu-central-1");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Нет .env.local");
  process.exit(1);
}

const text = fs.readFileSync(envPath, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error("Нет DATABASE_URL в .env.local");
  process.exit(1);
}

const raw = line.slice("DATABASE_URL=".length).trim();
let url;
try {
  url = new URL(raw.replace(/^postgresql:/, "postgres:"));
} catch {
  console.error("DATABASE_URL не похож на URL — проверьте .env.local");
  process.exit(1);
}

const password = url.password;
if (!password) {
  console.error("В DATABASE_URL нет пароля");
  process.exit(1);
}

const host = url.hostname;
const refMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
const projectRef = refMatch?.[1] ?? url.username.replace(/^postgres\./, "");

if (!projectRef) {
  console.error("Не удалось определить project ref из", host);
  process.exit(1);
}

const enc = encodeURIComponent(password);
const poolerHost = `aws-0-${region}.pooler.supabase.com`;

const vercelUrl = `postgresql://postgres.${projectRef}:${enc}@${poolerHost}:6543/postgres?pgbouncer=true`;
const localUrl = `postgresql://postgres.${projectRef}:${enc}@${poolerHost}:5432/postgres`;

const mask = (s) => s.replace(/:([^:@/]+)@/, ":***@");

console.log("\n=== Для Vercel (DATABASE_URL) — Transaction pooler :6543 ===");
console.log("Скопируйте из Supabase целиком. Шаблон (подставьте пароль из Dashboard):\n");
console.log(mask(vercelUrl));
console.log("\n=== Для Mac .env.local — Session pooler :5432 ===\n");
console.log(mask(localUrl));
console.log("\nПолные строки (с паролем) → файл .env.urls.local (только у вас на Mac):");
const outPath = path.join(process.cwd(), ".env.urls.local");
fs.writeFileSync(
  outPath,
  `# Не коммитить. Вставьте на Vercel первую строку.\nDATABASE_URL_VERCEL=${vercelUrl}\nDATABASE_URL_MAC=${localUrl}\n`,
);
console.log("  ", outPath);
console.log("\nРегион:", region, "| project:", projectRef);
console.log("\nНЕ используйте хост db." + projectRef + ".pooler.supabase.com — такого нет.\n");

if (writeLocal) {
  const next = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${localUrl}`);
  fs.writeFileSync(envPath, next);
  console.log("✅ .env.local обновлён (Session pooler :5432)\n");
}
