#!/usr/bin/env bash
# Быстрая проверка без зависаний (таймауты на долгие команды).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.node/bin:$PATH"
cd "$ROOT"
REPORT="$ROOT/docs/CHECK_REPORT.md"
TIMEOUT="${TIMEOUT:-120}"

run_with_timeout() {
  local secs="$1"
  shift
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  elif command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  else
    "$@"
  fi
}

append_section() {
  local title="$1"
  local body="$2"
  local result="$3"
  {
    echo "## $title"
    echo '```'
    echo "$body"
    echo '```'
    echo ""
    echo "**Итог:** $result"
    echo ""
  } >> "$REPORT"
}

{
  echo "# Отчёт проверки VoiceBudget"
  echo ""
  echo "**Дата:** $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo ""
  echo "## Git"
  echo '```'
  git log -1 --oneline 2>&1
  git status -sb 2>&1
  echo '```'
  echo ""
  echo "## Node"
  echo '```'
  node -v 2>&1
  echo '```'
  echo ""
} > "$REPORT"

# Сборка уже включает lint+types в next build — быстрее отдельного lint/tsc
BUILD_OUT="$(run_with_timeout "$TIMEOUT" npm run build 2>&1)" || BUILD_OUT="${BUILD_OUT}
(exit $? — возможно таймаут ${TIMEOUT}s)"
if echo "$BUILD_OUT" | grep -q "Compiled successfully"; then
  BUILD_RESULT="✅ OK"
else
  BUILD_RESULT="❌ FAIL или таймаут"
fi
append_section "Сборка (npm run build)" "$BUILD_OUT" "$BUILD_RESULT"

# Prod status
STATUS_OUT="$(curl -sS -m 20 "https://voicebudget.vercel.app/api/status" 2>&1)" || STATUS_OUT="curl failed: $?"
if echo "$STATUS_OUT" | grep -q '"ok":true'; then
  STATUS_RESULT="✅ Production OK"
elif echo "$STATUS_OUT" | grep -q '"ok"'; then
  STATUS_RESULT="⚠️ Production отвечает, но ok:false — см. JSON"
else
  STATUS_RESULT="❌ Не удалось получить status"
fi
append_section "Production /api/status" "$STATUS_OUT" "$STATUS_RESULT"

# Локальное env (без сети)
ENV_OUT="$(node scripts/check-env.cjs 2>&1)" && ENV_RESULT="✅ OK" || ENV_RESULT="⚠️ $?"
append_section "Локальный .env.local" "$ENV_OUT" "$ENV_RESULT"

# Таблицы БД (нужен .env.local)
if [[ -f .env.local ]]; then
  TABLES_OUT="$(run_with_timeout 45 node scripts/with-env-local.cjs node scripts/check-planning-tables.cjs 2>&1)" || TABLES_OUT="${TABLES_OUT}
(exit $? — таймаут или ошибка БД)"
  if echo "$TABLES_OUT" | grep -q "MISSING"; then
    TABLES_RESULT="❌ Есть отсутствующие таблицы"
  elif echo "$TABLES_OUT" | grep -q "OK"; then
    TABLES_RESULT="✅ Таблицы на месте"
  else
    TABLES_RESULT="⚠️ См. вывод"
  fi
else
  TABLES_OUT="(пропущено — нет .env.local)"
  TABLES_RESULT="—"
fi
append_section "Таблицы planning/subscription (локально → Supabase)" "$TABLES_OUT" "$TABLES_RESULT"

# npm audit — короткий summary, не полный fix
AUDIT_OUT="$(run_with_timeout 60 npm audit --audit-level=high 2>&1 | head -40)" || AUDIT_OUT="${AUDIT_OUT}
(exit $? — таймаут 60s или сеть)"
if echo "$AUDIT_OUT" | grep -qiE "found 0 vulnerabilities|0 vulnerabilities"; then
  AUDIT_RESULT="✅ high: 0"
elif echo "$AUDIT_OUT" | grep -qi "vulnerabilit"; then
  AUDIT_RESULT="⚠️ Есть уязвимости — см. вывод (часто в devDependencies / Next)"
else
  AUDIT_RESULT="⚠️ См. вывод"
fi
append_section "npm audit (только high+, max 60s)" "$AUDIT_OUT" "$AUDIT_RESULT"

{
  echo "## Кратко для утра"
  echo ""
  echo "| Проверка | Статус |"
  echo "|----------|--------|"
  echo "| Сборка | $BUILD_RESULT |"
  echo "| Vercel /api/status | $STATUS_RESULT |"
  echo "| .env.local | $ENV_RESULT |"
  echo "| Таблицы БД | $TABLES_RESULT |"
  echo "| npm audit high | $AUDIT_RESULT |"
  echo ""
  echo "Подробнее по безопасности: [SECURITY_AND_BUGS_REVIEW.md](./SECURITY_AND_BUGS_REVIEW.md)"
  echo ""
  echo "Повторить: \`bash scripts/run-checks.sh\`"
} >> "$REPORT"

echo "→ Готово: $REPORT"
