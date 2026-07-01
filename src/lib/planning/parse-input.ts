import {
  extractAllAmountsFromTranscript,
  parseAmountFromTranscript,
} from "@/lib/parse-amount";
import { roundMoneyUp } from "@/lib/format-money";
import type { Locale } from "@/types";
import type { PlanningInputAction, SavingsGoal } from "@/types/planning";
import { EMERGENCY_GOAL_ID } from "@/types/planning";

/** Без \\b: в JS \\b не работает с кириллицей. «кинул» не должен матчиться внутри «закинул». */
const DEPOSIT_RU =
  /(?:отлож(?:ил|ила|или|ить|у|им|ите|ишь|ит|ат|ате|аем)|откладыва(?:ю|ем|ете|л|ю)|полож(?:ил|ила|у|ить|им|ите)|закин(?:ул|ула|у|ем|ете|им|ить|ю|ем|ете)?|закидыва(?:ю|ем|ете|л|ла|ть)|перекинул(?:а)?|выкинул(?:а)?|(?<![а-яё])кинул(?:а|и)?|(?<![а-яё])кину\b|скинул(?:а)?|перев(?:ёл|ел)(?:\s+(?:в|на)\s+(?:копилк|накоп|цел|сбер|подушк))|внес(?:ла|ли|у|ёму|ем)?(?:\s+в\s+(?:копилк|цел|накоп|сбер|подушк))?|накопил(?:а|и)?|депозит|бросил(?:а)?|выделил(?:а)?|отправил(?:а)?(?:\s+в\s+(?:копилк|цел))?|коп(?:и|ил|ила|или|ить|лю|им|ите|ит|ят|яем)|запиш(?:и|ите|у|ем|ут)(?:\s+в)?|(?:в\s+)?копилк(?:у|и|а|е))(?=\s|$|[,.!?;:])/i;
const DEPOSIT_EN =
  /(?:saved|save|saving|deposited|deposit|put aside|set aside|transferred|transfer|moved|move)(?=\s|$|[,.!?;:])/i;

const CREATE_GOAL_RU =
  /(?:создай|создать|новая)\s+(?:цел(?:ь|и)|копилк(?:у|а))\s+(.+)/i;
const CREATE_GOAL_EN = /(?:create|new)\s+(?:goal|jar)\s+(.+)/i;

const TARGET_RU = /(?:цел(?:ь|и)|сумм(?:а|у))\s+(\d[\d\s.,]*(?:\s*(?:тыс|тысяч|млн|k|к|m))?)/i;
const TARGET_EN = /(?:target|goal amount)\s+(\d[\d\s.,]*(?:\s*(?:k|m))?)/i;

const GOAL_PREP_RU = /(?:на|в|для|по)/i;
const GOAL_PREP_EN = /(?:for|to|into)/i;

const DEADLINE_RU =
  /(?:до|к|срок|deadline)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i;
const DEADLINE_EN = /(?:by|until|deadline)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i;

const INCOME_HINT_RU =
  /(?:зарплат|получил|пришл|зачисли|доход|выручк|премия|аванс|фриланс|клиент|арендн|аренда\s+пришл|оплатил\s+клиент|клиент\s+оплатил)/i;
const INCOME_HINT_EN = /(?:salary|received|income|earned|paid|paycheck)/i;

/** Поступление денег — не путать с «перевёл в копилку». */
const INCOME_RECEIPT_RU =
  /(?:зарплат|получил|получила|получили|пришл|пришло|пришли|зачисли|зачислен|поступил|поступило|поступили|доход|выручк|премия|аванс|фриланс|клиент\s+оплатил|оплатил\s+клиент|заказчик\s+оплатил|аренда\s+пришл|арендн(?:ая|ый)?\s+плат|перевели(?:\s+\d|\s+мне|\s+на\s+сч)|перевёл\s+мне|перевел\s+мне|перевод\s+(?:от|с\s+работы|зарплат)|на\s+сч[её]т\s+пришл)/i;
const INCOME_RECEIPT_EN =
  /(?:salary|received|got paid|paycheck|deposited to (?:my )?account|credited|incoming)/i;

const GOAL_JAR_INTENT_RU =
  /(?:отлож|копилк|закинул?\s+в|закидыва(?:ю|л)|в\s+копилк|на\s+копилк|в\s+цел|на\s+цель|внес(?:ла|ли)?\s+в)/i;
const GOAL_JAR_INTENT_EN =
  /(?:save to|saving to|put (?:aside )?into|deposit(?:ed)? to|into (?:the )?(?:goal|jar))/i;

const SPLIT_HINT_RU = /(?:из них|из которых|в копилк|на копилк|в цел)/i;
const SPLIT_HINT_EN = /(?:of which|put aside|into (?:the )?(?:goal|jar))/i;

const GOAL_NAME_STOP_RU =
  /^(?:копилк(?:у|а|и|е)|цел(?:ь|и)|накоплени(?:е|я)|сбережени(?:е|я)|отлож(?:ен(?:ное|ные|ная))?|полож(?:ил|ила|у|ить)|закин(?:ул|ула|у|ить)?|закидыва(?:ю|л)?|кинул(?:а)?|перекинул(?:а)?|скинул(?:а)?)$/i;

const DEPOSIT_VERB_RU =
  /(?:отлож|полож|закин|закидыва|перекин|выкин|кинул|скинул|перевел|перевёл|внес|накопил|копил|коплю|запиш)/i;

function ruWordStem(word: string): string {
  return word
    .toLowerCase()
    .replace(/^(?:на|в|для)\s+/i, "")
    .replace(/(?:а|у|е|ом|ой|ою|ю|и|ы|ов|ей|ам|ами|ах)$/i, "")
    .trim();
}

function findGoalByName(goals: SavingsGoal[], name: string): SavingsGoal | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  if (/подушк|резерв|emergency|cushion/i.test(q)) {
    return goals.find((g) => g.id === EMERGENCY_GOAL_ID || g.kind === "emergency") ?? null;
  }
  return (
    goals.find((g) => g.name.toLowerCase() === q) ??
    goals.find((g) => g.name.toLowerCase().includes(q)) ??
    goals.find((g) => q.includes(g.name.toLowerCase())) ??
    null
  );
}

function cleanGoalName(raw: string): string {
  return raw
    .replace(/^["«]|["»]$/g, "")
    .replace(/\s*(?:руб(?:лей|ля)?|₽)\s*$/i, "")
    .replace(/\d[\d\s.,]*(?:\s*(?:тыс|тысяч|млн|k|к|m))?\s*(?:руб(?:лей|ля)?|₽)?\s*$/i, "")
    .replace(/(?:до|к|срок|deadline|by|until)\s+\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/gi, "")
    .replace(/(?:до|к|срок|deadline|by|until)\s+\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/^(?:копилк(?:у|а|и|е)\s+)+/i, "")
    .replace(/^(?:на|в|для|по|for|to|into)\s+/i, "")
    .trim();
}

function normalizeGoalDeadline(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  const month = m[2].padStart(2, "0");
  const day = m[1].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseGoalDeadline(text: string, locale: Locale): string | null {
  const re = locale === "ru" ? DEADLINE_RU : DEADLINE_EN;
  const m = text.match(re);
  if (m?.[1]) return normalizeGoalDeadline(m[1]);
  const bare = text.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{4})\b/);
  if (bare?.[1]) return normalizeGoalDeadline(bare[1]);
  return null;
}

/** Ищет существующую цель, название которой есть во фразе (любой порядок слов). */
function findGoalMentionedInText(text: string, goals: SavingsGoal[]): SavingsGoal | null {
  const lower = text.toLowerCase();
  let best: SavingsGoal | null = null;

  for (const g of goals) {
    const n = g.name.trim().toLowerCase();
    if (n.length < 2) continue;
    if (lower.includes(n)) {
      if (!best || n.length > best.name.length) best = g;
    }
  }
  if (best) return best;

  const prepMatch = lower.match(/(?:^|\s)(?:на|в|для|по)\s+([а-яё][а-яё\s]{1,40})/i);
  if (prepMatch?.[1]) {
    const phrase = cleanGoalName(prepMatch[1]);
    const firstWord = phrase.split(/\s+/)[0] ?? "";
    const stem = ruWordStem(firstWord);
    if (stem.length >= 3) {
      for (const g of goals) {
        const gn = ruWordStem(g.name.trim());
        if (gn.length < 2) continue;
        if (gn.includes(stem) || stem.includes(gn) || phrase.includes(g.name.toLowerCase())) {
          if (!best || g.name.length > best.name.length) best = g;
        }
      }
    }
  }

  return best;
}

function extractGoalNameFromText(text: string, locale: Locale): string {
  const patterns =
    locale === "ru"
      ? [
          /(?:^|\s)(?:на|в|для|по)\s+(?:копилк(?:у|а|и|е)\s+)?(?:на|в|для|по\s+)?([а-яёa-z][^,\d]+?)(?:[.!?]|$|\s+\d)/i,
          /(?:^|\s)(?:в\s+)?копилк(?:у|а|и|е)\s+(?:на|в|для|по\s+)?([а-яёa-z][^,\d]+?)(?:[.!?]|$|\s+\d)/i,
          /(?:^|\s)([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,})?)\s+\d[\d\s.,]*/i,
        ]
      : [
          /(?:^|\s)(?:for|to|into)\s+(?:goal|jar\s+)?([a-z][^,\d]+?)(?:[.!?]|$|\s+\d)/i,
          /(?:^|\s)(?:goal|jar)\s+([a-z][^,\d]+?)(?:[.!?]|$|\s+\d)/i,
        ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const name = cleanGoalName(m[1]);
    if (name.length >= 2 && !GOAL_NAME_STOP_RU.test(name) && !DEPOSIT_VERB_RU.test(name)) return name;
  }
  return "";
}

function parseGoalDepositFromText(
  text: string,
  locale: Locale,
  goals: SavingsGoal[],
): PlanningInputAction | null {
  const trimmed = text.trim();
  const amount = roundMoneyUp(parseAmountFromTranscript(trimmed, locale));
  if (amount <= 0) return null;

  const mentioned = findGoalMentionedInText(trimmed, goals);
  if (mentioned) {
    return { kind: "goal_deposit", goalId: mentioned.id, amount };
  }

  const goalName = extractGoalNameFromText(trimmed, locale);
  if (!goalName) return null;

  const goal = findGoalByName(goals, goalName);
  if (goal) return { kind: "goal_deposit", goalId: goal.id, amount };
  return { kind: "goal_deposit_by_name", goalName, amount };
}

function parseGoalCreateTail(
  tail: string,
  locale: Locale,
): { name: string; targetAmount: number; deadline: string | null } | null {
  let work = tail.trim();
  const deadline = parseGoalDeadline(work, locale);
  if (deadline) {
    work = work.replace(locale === "ru" ? DEADLINE_RU : DEADLINE_EN, "").trim();
    work = work.replace(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/, "").trim();
  }

  const targetMatch = locale === "ru" ? work.match(TARGET_RU) : work.match(TARGET_EN);
  let targetAmount = 0;
  let namePart = work;
  if (targetMatch) {
    targetAmount = roundMoneyUp(parseAmountFromTranscript(targetMatch[1], locale));
    namePart = work.replace(targetMatch[0], "").trim();
  } else {
    const amountAtEnd = namePart.match(
      /(\d[\d\s.,]*(?:\s*(?:тыс|тысяч|млн|k|к|m))?)\s*(?:руб(?:лей|ля)?|₽)?\s*$/i,
    );
    if (amountAtEnd) {
      targetAmount = roundMoneyUp(parseAmountFromTranscript(amountAtEnd[1], locale));
      namePart = namePart.slice(0, namePart.length - amountAtEnd[0].length).trim();
    }
  }

  const name = cleanGoalName(namePart.replace(/^["«]|["»]$/g, ""));
  if (!name) return null;
  return {
    name,
    targetAmount: targetAmount > 0 ? targetAmount : 0,
    deadline,
  };
}

function tryParseIncomeWithGoal(
  text: string,
  locale: Locale,
  goals: SavingsGoal[],
): PlanningInputAction | null {
  const trimmed = text.trim();
  const hasIncome =
    locale === "ru" ? INCOME_HINT_RU.test(trimmed) : INCOME_HINT_EN.test(trimmed);
  const hasSplit =
    locale === "ru" ? SPLIT_HINT_RU.test(trimmed) : SPLIT_HINT_EN.test(trimmed);
  const hasGoalPrep = locale === "ru" ? GOAL_PREP_RU.test(trimmed) : GOAL_PREP_EN.test(trimmed);

  const amounts = extractAllAmountsFromTranscript(trimmed, locale);
  if (amounts.length < 2 || !hasGoalPrep) return null;
  if (!hasIncome && !hasSplit) return null;

  const goalMatch = trimmed.match(/(?:^|\s)(?:на|в|для|for|to|into)\s+(.+?)(?:\s*$|\.|,)/i);
  if (!goalMatch) return null;

  const goalName = cleanGoalName(goalMatch[1]);
  if (!goalName) return null;

  const incomeAmount = amounts[0];
  const goalAmount = amounts[1];
  if (goalAmount <= 0 || goalAmount >= incomeAmount) return null;

  const goal = findGoalByName(goals, goalName);
  if (goal) {
    return {
      kind: "income_with_goal",
      incomeAmount,
      goalAmount,
      goalId: goal.id,
      goalName: goal.name,
      sourceText: trimmed,
    };
  }
  return {
    kind: "income_with_goal",
    incomeAmount,
    goalAmount,
    goalName,
    sourceText: trimmed,
  };
}

/** Зарплата / «пришло» / «перевели мне» — доход, не расход в копилку. */
export function isIncomeReceiptPhrase(text: string, locale: Locale): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const jarIntent = locale === "ru" ? GOAL_JAR_INTENT_RU : GOAL_JAR_INTENT_EN;
  if (jarIntent.test(trimmed)) return false;
  const receipt = locale === "ru" ? INCOME_RECEIPT_RU : INCOME_RECEIPT_EN;
  return receipt.test(trimmed);
}

export function tryParsePlanningInput(
  text: string,
  locale: Locale,
  goals: SavingsGoal[],
): PlanningInputAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const createMatch =
    locale === "ru" ? trimmed.match(CREATE_GOAL_RU) : trimmed.match(CREATE_GOAL_EN);
  if (createMatch) {
    const parsed = parseGoalCreateTail(createMatch[1], locale);
    if (parsed) return { kind: "goal_create", ...parsed };
  }

  const incomeGoal = tryParseIncomeWithGoal(trimmed, locale, goals);
  if (incomeGoal) return incomeGoal;

  if (isIncomeReceiptPhrase(trimmed, locale)) {
    return null;
  }

  const depositRe = locale === "ru" ? DEPOSIT_RU : DEPOSIT_EN;
  const parsedDeposit = parseGoalDepositFromText(trimmed, locale, goals);
  if (parsedDeposit) {
    if (depositRe.test(trimmed)) return parsedDeposit;
    // «5000 на отпуск» — без «отложил», если копилка с таким названием уже есть
    const hasPrep = locale === "ru" ? GOAL_PREP_RU.test(trimmed) : GOAL_PREP_EN.test(trimmed);
    if (hasPrep && findGoalMentionedInText(trimmed, goals)) return parsedDeposit;
  }

  return null;
}

/** Фраза похожа на перевод в копилку (для подстраховки после ИИ). */
export function looksLikeGoalDeposit(text: string, locale: Locale): boolean {
  if (isIncomeReceiptPhrase(text, locale)) return false;
  const depositRe = locale === "ru" ? DEPOSIT_RU : DEPOSIT_EN;
  return depositRe.test(text.trim());
}
