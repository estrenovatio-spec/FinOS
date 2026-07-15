# FIN OS Product Language

Цель словаря: одна и та же финансовая идея должна называться одинаково на всех пользовательских экранах.

## Главные вопросы продукта

1. Сколько у меня есть?
2. Сколько я могу потратить?
3. Что будет дальше?

## Словарь

`free money` → `Можно потратить` → Today, Forecast summary, Adviser

`planned free money` → `Можно потратить` → пользователь не должен видеть внутреннее название расчёта

`forecast` → `Прогноз` или `Прогноз денег` → Forecast tab, Adviser

`recurring` → `Регулярный платёж` / `Регулярные платежи и доходы` → Calendar, Adviser, Plan

`planned` → `по плану` → пояснения к доходам и свободным деньгам

`essential` → `базовые расходы` → Today breakdown, setup copy

`constraint` → `денег может не хватить` → Hero, explanation copy

`expected` → `ожидается` / `ожидается сегодня` / `ещё не пришло` → Today, Calendar, Expected Events

`safe spending` → `Можно потратить` → Today and related helper copy

`period` → не показывать без необходимости
Пользовательский вариант: `до 31 июля 2026`

## Где уже заменено

- [src/lib/planned-free-money-presenter.ts](/Users/bhima/Downloads/апп/finos-test/src/lib/planned-free-money-presenter.ts)
- [src/components/today/today-screen-presenter.ts](/Users/bhima/Downloads/апп/finos-test/src/components/today/today-screen-presenter.ts)
- [src/lib/advisor-context.ts](/Users/bhima/Downloads/апп/finos-test/src/lib/advisor-context.ts)
- [src/components/AiAnalysisTab.tsx](/Users/bhima/Downloads/апп/finos-test/src/components/AiAnalysisTab.tsx)

## Оставить в доменной модели, но не показывать пользователю

- `plannedFreeMoney`
- `recurringPayments`
- `essentialPlannedSpending`
- `constraintExplanation`
- `periodEndDate`
