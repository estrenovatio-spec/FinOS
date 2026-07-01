#!/usr/bin/env bash
# PRODUCTION деплой — попадает клиентам (voicebudget.vercel.app + @Fin_BU_bot).
# Для теста без клиентов используйте: npm run deploy:preview
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.node/bin:$PATH"

cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node не найден в $ROOT/.node/bin"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx не найден. Проверьте папку .node в проекте."
  exit 1
fi

echo "→ Node: $(node -v)"
echo "→ Локальная проверка сборки..."
npx prisma generate
npx next build --webpack
echo "→ Деплой на Vercel (сборка на сервере, не prebuilt)..."
OUT="$(npx vercel deploy --prod --yes 2>&1)"
echo "$OUT"
INSPECT="$(echo "$OUT" | sed -n 's/.*Inspect[[:space:]]*\(.*\)/\1/p' | head -1)"
if echo "$OUT" | grep -q 'BLOCKED'; then
  echo ""
  echo "⚠️  Vercel вернул BLOCKED — новая версия НЕ вышла в production."
  exit 1
fi
if [[ -n "${INSPECT:-}" ]]; then
  echo ""
  echo "→ Статус: $INSPECT"
  echo "   Production: https://voicebudget.vercel.app"
  echo "→ Проверка БД: curl -s https://voicebudget.vercel.app/api/status | grep dbTables"
fi
