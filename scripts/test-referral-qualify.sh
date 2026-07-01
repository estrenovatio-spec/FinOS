#!/usr/bin/env bash
# Preview: simulate 3 activity days and try qualify referral for a user.
# Usage: PREVIEW_URL=... TELEGRAM_ID=466020254 ./scripts/test-referral-qualify.sh [log_days|try_qualify]
set -euo pipefail

ACTION="${1:-log_days}"
PREVIEW_URL="${PREVIEW_URL:?set PREVIEW_URL}"
TELEGRAM_ID="${TELEGRAM_ID:?set TELEGRAM_ID}"
SECRET="${HOUSEHOLD_SESSION_SECRET:?set HOUSEHOLD_SESSION_SECRET}"

case "$ACTION" in
  log_days) API_ACTION="referral_log_days" ;;
  try) API_ACTION="referral_try_qualify" ;;
  *) echo "Usage: $0 [log_days|try]"; exit 1 ;;
esac

echo "→ $PREVIEW_URL/api/admin/subscription-test ($API_ACTION)"
curl -sS -X POST "$PREVIEW_URL/api/admin/subscription-test" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"$API_ACTION\",\"telegramId\":\"$TELEGRAM_ID\",\"count\":3}" | jq .
