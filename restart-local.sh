#!/bin/bash

echo "🛑 Останавливаю старые процессы Next/Node..."

pkill -f "next" 2>/dev/null
pkill -f "node.*voicebudget" 2>/dev/null

lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :3007 | xargs kill -9 2>/dev/null
lsof -ti :3010 | xargs kill -9 2>/dev/null

echo "🧹 Чищу кэш Next..."

rm -rf .next
rm -rf node_modules/.cache

echo "🚀 Запускаю dev server на 3010..."

npm run dev -- -p 3010
