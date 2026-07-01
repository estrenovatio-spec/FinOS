import type { AdvisorConfig } from "@/lib/advisor-config";
import { advisorInviteRu } from "@/lib/advisor-config";
import type { Locale } from "@/types";

function tipsRu(advisor: AdvisorConfig): string[] {
  return [
    "Сначала зафиксируйте цели на 3–6 месяцев: подушка, крупная покупка, погашение долга — без цели бюджет быстро «размывается».",
    "Правило «заплати себе первым»: в день поступления дохода переводите 10–15% на отдельный накопительный счёт, остальное — на жизнь.",
    "Разделите расходы на обязательные (ЖКХ, еда, транспорт) и гибкие (развлечения, доставка) — сокращать проще вторую группу.",
    "Раз в квартал пересматривайте подписки и автоплатежи: в РФ они часто «съедают» 3–7% бюджета незаметно.",
    "Ведите учёт не только трат, но и нерегулярных доходов (премии, подработка) — иначе план дохода будет занижен.",
    "Подушка безопасности в рублях: цель — 3–6 месяцев обязательных расходов; храните на ликвидном счёте, не в рисковых инструментах.",
    "Перед крупной покупкой задайте вопрос: «Могу ли я купить это дважды?» — если нет, отложите на 48 часов.",
    "Семейный бюджет: договоритесь о лимите «личных» трат без согласования — это снижает конфликты и импульсные покупки.",
    "Инфляция в РФ: закладывайте +5–10% к плану на продукты и ЖКХ при годовом планировании.",
    "Не смешивайте «операционный» и «инвестиционный» кошелёк: сначала стабильный денежный поток, потом долгосрочные цели.",
    "Раз в месяц сравнивайте план и факт по 3–5 категориям — этого достаточно для первых шагов в консалтинге.",
    "Долги: стратегия «лавины» (сначала самый дорогой процент) или «снежного кома» (сначала мелкие долги) — выберите одну и придерживайтесь.",
    "Резерв на налоги и обязательные платежи держите отдельно, если доход нерегулярный (ИП, фриланс).",
    "Финансовый план — это не таблица, а привычка: 10 минут в неделю на обзор цифр важнее разового «идеального» бюджета.",
    `Глубокий разбор (цели, долги, инвестиции, страхование) лучше делать с экспертом — ${advisorInviteRu(advisor)}.`,
    "Консалтинг начинается с честной картины: 30 дней учёта дают базу для реалистичного плана, а не для самокритики.",
    "Планируйте «радости» в бюджете заранее — 5–10% на отдых снижает срывы и импульсные траты.",
    "Когда доход растёт, не спешите сразу повышать уровень жизни — сначала отложите половину прибавки. Этот простой принцип работает годами!",
  ];
}

function tipsEn(advisor: AdvisorConfig): string[] {
  return [
    "Set 3–6 month goals first: emergency fund, major purchase, debt payoff — without goals, budgets drift.",
    "Pay yourself first: on payday, move 10–15% to a separate savings account before spending the rest.",
    "Split costs into fixed (housing, food, transport) and flexible (entertainment, delivery) — trim the flexible bucket first.",
    "Review subscriptions quarterly — in Russia they often eat 3–7% of budget unnoticed.",
    "Track irregular income too (bonuses, side gigs) or your income plan will be too low.",
    "Emergency fund: aim for 3–6 months of essential expenses in a liquid RUB account.",
    "Before a big purchase, ask: “Could I buy this twice?” If not, wait 48 hours.",
    "Household budgets work better with agreed “personal spend” limits — fewer conflicts and impulse buys.",
    "For annual planning in Russia, add ~5–10% to food and utilities for inflation.",
    "Don't mix daily cash-flow with long-term investing wallets — stabilize cash-flow first.",
    "Monthly: compare plan vs actual in 3–5 categories — enough for early consulting-style reviews.",
    "Debt: pick avalanche (highest rate first) or snowball (smallest balance first) and stick to one method.",
    "If income is irregular, keep a separate reserve for taxes and mandatory payments.",
    "A financial plan is a habit: 10 minutes weekly beats one perfect spreadsheet once a year.",
    `Deeper planning (goals, debt, investing, insurance) works best 1:1 — contact ${advisor.name}: ${advisor.contact}.`,
    "Consulting starts with an honest picture: 30 days of tracking beats guilt-driven cuts.",
    "Budget for joy upfront — 5–10% for leisure reduces binge spending.",
    "When income rises, raise savings, not only lifestyle — saving half of each raise compounds for years.",
  ];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandomPlanningTips(
  locale: Locale,
  advisor: AdvisorConfig,
  count = 3,
): string[] {
  const pool = locale === "ru" ? tipsRu(advisor) : tipsEn(advisor);
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}
