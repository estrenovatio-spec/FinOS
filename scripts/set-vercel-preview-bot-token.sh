#!/usr/bin/env bash
# Записать TELEGRAM_BOT_TOKEN_PREVIEW на Vercel (только Preview) и redeploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.node/bin:$PATH"
cd "$ROOT"

TOKEN="${1:-}"
if [[ -z "$TOKEN" ]]; then
  echo "Использование: bash scripts/set-vercel-preview-bot-token.sh 'TOKEN_ИЗ_BOTFATHER'"
  echo "Сначала проверьте: bash scripts/check-telegram-token.sh 'TOKEN...'"
  exit 1
fi

echo "→ Проверка токена…"
bash "$ROOT/scripts/check-telegram-token.sh" "$TOKEN"

echo "→ Удаляем старый TELEGRAM_BOT_TOKEN_PREVIEW на Preview (если есть)…"
npx vercel env rm TELEGRAM_BOT_TOKEN_PREVIEW preview --yes 2>/dev/null || true

echo "→ Добавляем новый (все Preview-деплои)…"
# Vercel CLI: value через stdin, --yes для preview без ветки
printf '%s' "$TOKEN" | npx vercel env add TELEGRAM_BOT_TOKEN_PREVIEW preview --yes --force 2>&1 || {
  echo ""
  echo "⚠️  CLI не смог добавить переменную (нужна ветка)."
  echo "   Вручную: vercel.com → voicebudget → Settings → Environment Variables"
  echo "   Имя: TELEGRAM_BOT_TOKEN_PREVIEW"
  echo "   Environment: Preview"
  echo "   Value: (тот же токен, что проверили выше)"
  exit 1
}

echo "→ Preview-деплой…"
npx vercel deploy --yes 2>&1 | grep -E "Preview|https://voicebudget|Error" || true
echo ""
echo "✅ Готово. Обновите Menu Button в @BotFather на URL из вывода выше."
