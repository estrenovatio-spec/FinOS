#!/usr/bin/env bash
# Preview-деплой: НЕ попадает клиентам. URL вида https://voicebudget-xxxx.vercel.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.node/bin:$PATH"

cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node не найден в $ROOT/.node/bin"
  exit 1
fi

echo "→ Node: $(node -v)"
echo "→ Локальная проверка сборки..."
npm run build
echo "→ Preview-деплой (без --prod, клиенты не затронуты)..."
OUT="$(NEXT_PUBLIC_APP_BOTTOM_NAV=true npx vercel deploy --yes 2>&1)" || {
  echo "❌ vercel deploy failed. Выполните: npx vercel login"
  exit 1
}
echo "$OUT"
URL="$(echo "$OUT" | grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' | head -1)"
echo ""
if [[ -n "${URL:-}" ]]; then
  echo "✅ Preview URL: $URL"
  echo ""
  echo "Тест в Telegram:"
  echo "  1. Создайте тестового бота в @BotFather (или временно смените Web App URL у Fin_BU_bot — только если клиентов мало)"
  echo "  2. Menu Button → Web App → $URL"
  echo "  3. На Vercel Preview env:"
  echo "     NEXT_PUBLIC_APP_BOTTOM_NAV=true"
  echo "     SUBSCRIPTION_BILLING_TEST=true"
  echo "     NEXT_PUBLIC_SITE_URL_PREVIEW=$URL"
  echo "     NEXT_PUBLIC_DIAGNOSTICS_FORM_URL=https://forms.yandex.ru/..."
  echo "     NEXT_PUBLIC_EDUCATION_VIDEOS_JSON='[{\"title\":\"Урок 1\",\"url\":\"https://...\"}]'"
else
  echo "→ Смотрите URL в выводе выше (vercel deploy)"
fi
