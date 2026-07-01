#!/usr/bin/env bash
# Тест окончания trial на Preview: expire | remind | grant_trial | status
# (короткий алиас: grant → grant_trial)
#
#   export PREVIEW_URL=https://voicebudget-xxxx.vercel.app
#   export TELEGRAM_ID=123456789
#   ./scripts/test-trial-expire.sh expire
#
# Секрет берётся из .env.local (HOUSEHOLD_SESSION_SECRET), если не задан вручную
# реальный ключ длиной ≥32 символов (не заглушка из инструкции).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.node/bin:$PATH"

ACTION="${1:-status}"
if [[ "$ACTION" == "grant" ]]; then
  ACTION="grant_trial"
fi
TELEGRAM_ID="${TELEGRAM_ID:-}"
USERNAME="${USERNAME:-}"
PREVIEW_URL="${PREVIEW_URL:-}"

read_env_local() {
  local key="$1"
  [[ -f .env.local ]] || return 1
  local line
  line="$(grep -E "^${key}=" .env.local | head -1)" || return 1
  local val="${line#*=}"
  val="${val%$'\r'}"
  val="${val#\"}"; val="${val%\"}"
  val="${val#\'}"; val="${val%\'}"
  printf '%s' "$val"
}

if [[ -z "$PREVIEW_URL" ]]; then
  PREVIEW_URL="$(read_env_local NEXT_PUBLIC_SITE_URL_PREVIEW || true)"
fi

ENV_SECRET="${HOUSEHOLD_SESSION_SECRET:-}"
FILE_SECRET="$(read_env_local HOUSEHOLD_SESSION_SECRET || true)"

SECRET=""
if [[ ${#ENV_SECRET} -ge 32 ]] && [[ "$ENV_SECRET" != *"секрет"* ]] && [[ "$ENV_SECRET" != "change-me-to-random-64-chars" ]]; then
  SECRET="$ENV_SECRET"
elif [[ -n "$FILE_SECRET" ]]; then
  SECRET="$FILE_SECRET"
elif [[ -n "$ENV_SECRET" ]]; then
  echo "❌ HOUSEHOLD_SESSION_SECRET похож на заглушку. Уберите export или укажите ключ из Vercel Preview."
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "❌ HOUSEHOLD_SESSION_SECRET: добавьте в .env.local или export (тот же, что на Vercel Preview)."
  exit 1
fi
if [[ -z "$PREVIEW_URL" ]]; then
  echo "❌ PREVIEW_URL или NEXT_PUBLIC_SITE_URL_PREVIEW в .env.local (URL из BotFather)."
  exit 1
fi
if [[ -z "$TELEGRAM_ID" && -z "$USERNAME" ]]; then
  echo "❌ TELEGRAM_ID или USERNAME"
  exit 1
fi

BODY="{\"action\":\"$ACTION\""
if [[ -n "$TELEGRAM_ID" ]]; then
  BODY+=",\"telegramId\":\"$TELEGRAM_ID\""
fi
if [[ -n "$USERNAME" ]]; then
  U="${USERNAME#@}"
  BODY+=",\"username\":\"$U\""
fi
if [[ "$ACTION" == "remind" ]]; then
  BODY+=",\"force\":true"
fi
BODY+="}"

echo "→ $PREVIEW_URL/api/admin/subscription-test ($ACTION)"
RESP="$(curl -sS -X POST "$PREVIEW_URL/api/admin/subscription-test" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d "$BODY")"

if command -v python3 >/dev/null 2>&1; then
  echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
else
  echo "$RESP"
fi
