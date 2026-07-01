#!/usr/bin/env bash
# PRODUCTION деплой — попадает клиентам текущего Vercel-проекта.
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
PRODUCTION_URL="$(echo "$OUT" | sed -n 's/.*Aliased[[:space:]]*\(https:\/\/[^[:space:]]*\).*/\1/p' | tail -1)"
if [[ -z "${PRODUCTION_URL:-}" ]]; then
  PRODUCTION_URL="$(echo "$OUT" | sed -n 's/.*Production[[:space:]]*\(https:\/\/[^[:space:]]*\).*/\1/p' | tail -1)"
fi
if echo "$OUT" | grep -q 'BLOCKED'; then
  echo ""
  echo "⚠️  Vercel вернул BLOCKED — новая версия НЕ вышла в production."
  exit 1
fi
if [[ -n "${INSPECT:-}" ]]; then
  echo ""
  echo "→ Статус: $INSPECT"
  if [[ -n "${PRODUCTION_URL:-}" ]]; then
    echo "   Production: $PRODUCTION_URL"
    echo "→ Проверка БД: curl -s ${PRODUCTION_URL}/api/status | grep dbTables"
  fi
fi
