# Отчёт проверки VoiceBudget

**Дата:** 2026-05-30 13:51:15 MSK

## Git
```
0734acb Fix transactions tab filter persistence and add subscription free-until date.
## main...origin/main
 M docs/CHECK_REPORT.md
```

## Node
```
v20.18.1
```

## Сборка (npm run build)
```

> voicebudget@0.1.0 build
> prisma generate && next build

Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 118ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Interested in query caching in just a few lines of code? Try Accelerate today! https://pris.ly/tip-3-accelerate

  ▲ Next.js 14.2.21
  - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...

./src/components/WeeklyAnalysis.tsx
134:5  Warning: React Hook useCallback has unnecessary dependencies: 'trackingStartedAt' and 'transactions'. Either exclude them or remove the dependency array.  react-hooks/exhaustive-deps

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
   Collecting page data ...
   Generating static pages (0/27) ...
   Generating static pages (6/27) 
   Generating static pages (13/27) 
   Generating static pages (20/27) 
 ✓ Generating static pages (27/27)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                       Size     First Load JS
┌ ○ /                                             61.1 kB         187 kB
├ ○ /_not-found                                   876 B          88.3 kB
├ ƒ /api/admin/wipe-cloud                         0 B                0 B
├ ƒ /api/help-chat                                0 B                0 B
├ ƒ /api/household/bootstrap                      0 B                0 B
├ ƒ /api/household/categories                     0 B                0 B
├ ƒ /api/household/categories/[id]                0 B                0 B
├ ƒ /api/household/category-budgets               0 B                0 B
├ ƒ /api/household/category-budgets/[categoryId]  0 B                0 B
├ ƒ /api/household/create                         0 B                0 B
├ ƒ /api/household/goals                          0 B                0 B
├ ƒ /api/household/goals/[id]                     0 B                0 B
├ ƒ /api/household/import                         0 B                0 B
├ ƒ /api/household/join                           0 B                0 B
├ ƒ /api/household/leave                          0 B                0 B
├ ƒ /api/household/partner-label                  0 B                0 B
├ ƒ /api/household/recurring                      0 B                0 B
├ ƒ /api/household/recurring/[id]                 0 B                0 B
├ ƒ /api/household/sync                           0 B                0 B
├ ƒ /api/household/transactions                   0 B                0 B
├ ƒ /api/household/transactions/[id]              0 B                0 B
├ ○ /api/llm-ping                                 0 B                0 B
├ ƒ /api/monthly-analysis                         0 B                0 B
├ ƒ /api/monthly-chat                             0 B                0 B
├ ƒ /api/parse-voice                              0 B                0 B
├ ƒ /api/payments/yookassa/create                 0 B                0 B
├ ƒ /api/payments/yookassa/webhook                0 B                0 B
├ ƒ /api/recommendations                          0 B                0 B
├ ƒ /api/status                                   0 B                0 B
├ ƒ /api/stt-ping                                 0 B                0 B
├ ƒ /api/telegram/setup-webhook                   0 B                0 B
├ ƒ /api/telegram/webhook                         0 B                0 B
├ ƒ /api/transcribe                               0 B                0 B
└ ƒ /api/weekly-analysis                          0 B                0 B
+ First Load JS shared by all                     87.5 kB
  ├ chunks/117-c69a367b3c047caa.js                31.8 kB
  ├ chunks/fd9d1056-fb0b8c8f080b81a3.js           53.6 kB
  └ other shared chunks (total)                   2.07 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

**Итог:** ✅ OK

## Production /api/status
```
{"ok":true,"telegramToken":true,"databaseUrl":true,"sessionSecret":true,"llm":true,"sttProviders":["groq"],"sttReady":true,"paymentsConfigured":false,"dbTables":true,"planningTables":true}
```

**Итог:** ✅ Production OK

## Локальный .env.local
```
✅ Файл .env.local есть на диске
    DATABASE_URL=postgresql://postgres.rnihhkjbceylkqnafnxu:***@aws-1-eu-central-1.pooler.supabase.com:5…
✅ Похоже на Supabase — строка сохранена.
```

**Итог:** ✅ OK

## Таблицы planning/subscription (локально → Supabase)
```
DB_ERROR: 
Invalid `prisma.$queryRaw()` invocation:


Server has closed the connection.
(exit 1 — таймаут или ошибка БД)
```

**Итог:** ⚠️ См. вывод

## npm audit (только high+, max 60s)
```
# npm audit report

@tootallnate/once  <2.0.1
@tootallnate/once vulnerable to Incorrect Control Flow Scoping - https://github.com/advisories/GHSA-vpq2-c234-7xj6
fix available via `npm audit fix --force`
Will install vercel@50.41.0, which is a breaking change
node_modules/@tootallnate/once
  @vercel/fun  *
  Depends on vulnerable versions of @tootallnate/once
  Depends on vulnerable versions of path-to-regexp
  Depends on vulnerable versions of tar
  node_modules/@vercel/fun
    vercel  28.12.3 || >=28.17.0
    Depends on vulnerable versions of @vercel/backends
    Depends on vulnerable versions of @vercel/build-utils
    Depends on vulnerable versions of @vercel/elysia
    Depends on vulnerable versions of @vercel/express
    Depends on vulnerable versions of @vercel/fastify
    Depends on vulnerable versions of @vercel/fun
    Depends on vulnerable versions of @vercel/h3
    Depends on vulnerable versions of @vercel/hono
    Depends on vulnerable versions of @vercel/hydrogen
    Depends on vulnerable versions of @vercel/koa
    Depends on vulnerable versions of @vercel/nestjs
    Depends on vulnerable versions of @vercel/node
    Depends on vulnerable versions of @vercel/python
    Depends on vulnerable versions of @vercel/redwood
    Depends on vulnerable versions of @vercel/remix-builder
    Depends on vulnerable versions of @vercel/rust
    Depends on vulnerable versions of @vercel/static-build
    Depends on vulnerable versions of smol-toml
    node_modules/vercel

ajv  7.0.0-alpha.0 - 8.17.1
Severity: moderate
ajv has ReDoS when using `$data` option - https://github.com/advisories/GHSA-2g4f-4pwh-qvx6
fix available via `npm audit fix --force`
Will install vercel@50.41.0, which is a breaking change
node_modules/@vercel/static-config/node_modules/ajv
  @vercel/static-config  *
(exit 1 — таймаут 60s или сеть)
```

**Итог:** ⚠️ См. вывод

## Кратко для утра

| Проверка | Статус |
|----------|--------|
| Сборка | ✅ OK |
| Vercel /api/status | ✅ Production OK |
| .env.local | ✅ OK |
| Таблицы БД | ⚠️ См. вывод |
| npm audit high | ⚠️ См. вывод |

Подробнее по безопасности: [SECURITY_AND_BUGS_REVIEW.md](./SECURITY_AND_BUGS_REVIEW.md)

Повторить: `bash scripts/run-checks.sh`
