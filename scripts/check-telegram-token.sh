#!/usr/bin/env bash
# Проверка: какому боту принадлежит токен (getMe). Не коммитьте токен в git.
set -euo pipefail
TOKEN="${1:-}"
if [[ -z "$TOKEN" ]]; then
  echo "Использование: bash scripts/check-telegram-token.sh '123456:AAF...'"
  echo "Токен: @BotFather → ваш бот → API Token"
  exit 1
fi
curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('ok'):
    print('❌ Токен неверный:', d)
    sys.exit(1)
u = d['result']
print('✅ Бот:', '@' + u.get('username','?'), '—', u.get('first_name',''))
"
