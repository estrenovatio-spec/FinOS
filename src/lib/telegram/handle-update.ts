import { detectCategoryId, getCategoryLabel, getFallbackCategoryId } from "@/lib/categories";
import { inferParseLocale } from "@/lib/locale-infer";
import { prisma } from "@/lib/db";
import {
  createCloudTransaction,
  createHousehold,
  depositCloudGoal,
  getHouseholdSavingsGoals,
  getUserMembership,
  upsertCloudGoal,
  upsertTelegramUser,
} from "@/lib/household/service";
import { scheduleHouseholdMemberGoogleSheetLog } from "@/lib/google-sheets-schedule";
import { subscriptionEnforced } from "@/lib/payments/config";
import { getSubscriptionForUser } from "@/lib/payments/subscription";
import { dbCategoryToApp } from "@/lib/household/sync-mapper";
import { parseTranscriptServerMany } from "@/lib/parse-voice-server";
import { applyGoalMonthlyToGoal, resolveGoalMonthlyPlans } from "@/lib/planning/analytics";
import { buildGoalDepositTransaction } from "@/lib/planning/goal-transfer";
import { tryParsePlanningInput } from "@/lib/planning/parse-input";
import { transcribeTelegramVoice } from "@/lib/stt";
import {
  escapeHtml,
  miniAppKeyboard,
  urlKeyboard,
  sendChatAction,
  sendMessage,
  editMessageText,
  downloadTelegramFile,
  getTelegramFile,
} from "@/lib/telegram/bot-api";
import { recognitionPhraseUserKey } from "@/lib/recognition-phrases";
import { RecognitionStatusDisplay } from "@/lib/telegram/recognition-status";
import { ruPlural, enPlural } from "@/lib/i18n";
import type { TelegramMessage, TelegramUpdate, TelegramUser } from "@/lib/telegram/bot-types";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { formatBotHelpHtml, formatBotStartHtml } from "@/lib/help-faq-content";
import { getTelegramBotName } from "@/lib/telegram/bot-name";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createWebLoginToken } from "@/lib/household/web-login-token";
import type { Locale, ParsedTransaction, Transaction } from "@/types";
import type { SavingsGoal } from "@/types/planning";

function makeTransactionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function localeFromUser(user: TelegramUser | undefined): Locale {
  const code = user?.language_code?.toLowerCase() ?? "";
  return code.startsWith("en") ? "en" : "ru";
}

function siteUrl(): string {
  return getPublicSiteUrl();
}

function toWebAppUser(from: TelegramUser): TelegramWebAppUser {
  return {
    id: from.id,
    first_name: from.first_name,
    username: from.username,
  };
}

async function ensureHousehold(userId: string, tgUser: TelegramWebAppUser) {
  let membership = await getUserMembership(userId);
  if (membership) return membership;

  const { household, isNew } = await createHousehold(userId, { mode: "solo" });
  if (isNew) {
    scheduleHouseholdMemberGoogleSheetLog({
      action: "create",
      tgUser,
      household,
      logTag: "telegram/ensure-household",
    });
  }
  membership = await getUserMembership(userId);
  if (!membership) throw new Error("household_create_failed");
  return membership;
}

async function householdCategories(householdId: string) {
  const rows = await prisma.category.findMany({ where: { householdId } });
  return rows.map(dbCategoryToApp);
}

async function householdPartnerLabel(householdId: string): Promise<string | null> {
  const row = await prisma.household.findUnique({
    where: { id: householdId },
    select: { partnerLabel: true },
  });
  return row?.partnerLabel?.trim() || null;
}

function slugifyGoalId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function saveGoalDepositToCloud(
  userId: string,
  householdId: string,
  goal: SavingsGoal,
  amount: number,
): Promise<void> {
  const tx: Transaction = {
    id: makeTransactionId(),
    ...buildGoalDepositTransaction(goal, amount),
    owner: "me",
  };
  await createCloudTransaction(userId, householdId, tx);
  await depositCloudGoal(userId, householdId, goal.id, amount);
}

async function applyPlanningFromBot(
  userId: string,
  householdId: string,
  action: ReturnType<typeof tryParsePlanningInput> & object,
  goals: SavingsGoal[],
  categories: ReturnType<typeof dbCategoryToApp>[],
  locale: Locale,
): Promise<string | null> {
  if (!action) return null;

  if (action.kind === "goal_deposit") {
    const goal = goals.find((g) => g.id === action.goalId);
    if (!goal) return null;
    await saveGoalDepositToCloud(userId, householdId, goal, action.amount);
    return `✅ +${action.amount} ₽ → «${escapeHtml(goal.name)}» (списано с баланса)`;
  }

  if (action.kind === "goal_deposit_by_name") {
    const q = action.goalName.toLowerCase();
    let goal =
      goals.find((g) => g.name.toLowerCase() === q) ??
      goals.find((g) => g.name.toLowerCase().includes(q));
    const wasNew = !goal;
    if (!goal) {
      let id = slugifyGoalId(action.goalName) || `goal-${Date.now().toString(36)}`;
      goal = {
        id,
        name: action.goalName.trim(),
        targetAmount: 0,
        savedAmount: 0,
        deadline: null,
        monthlyContribution: null,
        kind: "custom",
        emergencyMonths: null,
      };
      await upsertCloudGoal(userId, householdId, goal);
    }
    await saveGoalDepositToCloud(userId, householdId, goal, action.amount);
    if (wasNew) {
      return `✅ Создана копилка «${escapeHtml(goal.name)}» +${action.amount} ₽ (списано с баланса)`;
    }
    return `✅ +${action.amount} ₽ → «${escapeHtml(goal.name)}» (списано с баланса)`;
  }

  if (action.kind === "goal_create") {
    let id = slugifyGoalId(action.name);
    if (goals.some((g) => g.id === id)) {
      id = `${id}-${Date.now().toString(36).slice(-4)}`;
    }
    const goal = applyGoalMonthlyToGoal({
      id,
      name: action.name.trim(),
      targetAmount: action.targetAmount,
      savedAmount: 0,
      deadline: action.deadline ?? null,
      monthlyContribution: null,
      kind: "custom",
      emergencyMonths: null,
    });
    await upsertCloudGoal(userId, householdId, goal);
    const targetLine =
      action.targetAmount > 0
        ? `${action.targetAmount} ₽`
        : locale === "en"
          ? "no target amount"
          : "без суммы цели";
    const deadlineLine = goal.deadline
      ? locale === "en"
        ? `, by ${goal.deadline}`
        : `, до ${goal.deadline}`
      : "";
    const plans = resolveGoalMonthlyPlans(
      goal.targetAmount,
      goal.savedAmount,
      goal.deadline,
    );
    const monthlyLine = plans
      ? locale === "en"
        ? `\nSave only: ~${plans.onAccount} ₽/mo · If invested: ~${plans.ifInvested} ₽/mo`
        : `\nПросто копить: ~${plans.onAccount} ₽/мес · Если инвестировать: ~${plans.ifInvested} ₽/мес`
      : "";
    return `✅ Копилка «${escapeHtml(goal.name)}» — ${targetLine}${deadlineLine}${monthlyLine}`;
  }

  if (action.kind === "income_with_goal") {
    const q = action.goalName.toLowerCase();
    let goal =
      (action.goalId ? goals.find((g) => g.id === action.goalId) : null) ??
      goals.find((g) => g.name.toLowerCase() === q) ??
      goals.find((g) => g.name.toLowerCase().includes(q));
    if (!goal) {
      let id = slugifyGoalId(action.goalName) || `goal-${Date.now().toString(36)}`;
      goal = {
        id,
        name: action.goalName.trim(),
        targetAmount: 0,
        savedAmount: 0,
        deadline: null,
        monthlyContribution: null,
        kind: "custom",
        emergencyMonths: null,
      };
      await upsertCloudGoal(userId, householdId, goal);
    }
    const categoryId =
      detectCategoryId(action.sourceText, "income", categories) || getFallbackCategoryId("income");
    const tx: Transaction = {
      id: makeTransactionId(),
      amount: action.incomeAmount,
      type: "income",
      categoryId,
      currency: "RUB",
      note: action.sourceText.slice(0, 120),
      date: new Date().toISOString().slice(0, 10),
      owner: "me",
      goalId: goal.id,
      goalAmount: action.goalAmount,
    };
    await createCloudTransaction(userId, householdId, tx);
    await depositCloudGoal(userId, householdId, goal.id, action.goalAmount);
    const free = action.incomeAmount - action.goalAmount;
    if (locale === "en") {
      return `✅ Income +${action.incomeAmount} ₽, ${action.goalAmount} ₽ → «${escapeHtml(goal.name)}» (${free} ₽ free)`;
    }
    return `✅ Доход +${action.incomeAmount} ₽, в «${escapeHtml(goal.name)}» ${action.goalAmount} ₽ (свободно ${free} ₽)`;
  }

  return null;
}

function formatAmount(amount: number, type: ParsedTransaction["type"], locale: Locale): string {
  const sign = type === "income" ? "+" : "−";
  const formatted = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US").format(amount);
  return `${sign}${formatted} ₽`;
}

function formatSuccessReply(
  parsed: ParsedTransaction,
  transcript: string,
  locale: Locale,
  categories: ReturnType<typeof dbCategoryToApp>[],
  partnerLabel?: string | null,
): string {
  return formatMultiSuccessReply([parsed], transcript, locale, categories, partnerLabel);
}

function formatMultiSuccessReply(
  items: ParsedTransaction[],
  transcript: string,
  locale: Locale,
  categories: ReturnType<typeof dbCategoryToApp>[],
  partnerLabel?: string | null,
): string {
  const heard = escapeHtml(transcript.slice(0, 200));
  const lines = items.map((parsed) => {
    const category = getCategoryLabel(parsed.categoryId, categories, locale);
    const amount = formatAmount(parsed.amount, parsed.type, locale);
    const ownerNote =
      parsed.owner === "partner" && partnerLabel?.trim()
        ? locale === "en"
          ? ` · ${partnerLabel.trim()}`
          : ` · ${partnerLabel.trim()}`
        : "";
    return `${amount} · ${escapeHtml(category)}${escapeHtml(ownerNote)}`;
  });

  if (locale === "en") {
    const header =
      items.length === 1
        ? "✅ <b>Added:</b>"
        : `✅ <b>Added ${items.length} ${enPlural(items.length, "entry", "entries")}:</b>`;
    return `${header}\n${lines.join("\n")}\n<i>${heard}</i>`;
  }

  const header =
    items.length === 1
      ? "✅ <b>Добавлено:</b>"
      : `✅ <b>Добавлено ${items.length} ${ruPlural(items.length, "запись", "записи", "записей")}:</b>`;
  return `${header}\n${lines.join("\n")}\n<i>${heard}</i>`;
}

async function saveParsedTransaction(
  userId: string,
  householdId: string,
  parsed: ParsedTransaction,
  transcript: string,
): Promise<Transaction> {
  const tx: Transaction = {
    id: makeTransactionId(),
    amount: parsed.amount,
    type: parsed.type,
    categoryId: parsed.categoryId,
    currency: parsed.currency,
    note: parsed.note?.trim() || transcript.slice(0, 120),
    date: parsed.date,
    owner: parsed.owner ?? "me",
  };
  await createCloudTransaction(userId, householdId, tx);
  return tx;
}

function sttErrorHint(lastError: string | undefined, locale: Locale): string {
  const code = lastError ?? "";
  if (code === "no_stt_key") {
    return locale === "en"
      ? "Voice STT key missing on server (GROQ or apinet)."
      : "На сервере нет ключа для голоса (GROQ или apinet).";
  }
  if (code.includes("402") || code.toLowerCase().includes("balance")) {
    return locale === "en" ? "Top up apinet/Groq balance." : "Пополните баланс apinet/Groq.";
  }
  if (code.includes("429") || code.toLowerCase().includes("rate limit")) {
    return locale === "en"
      ? "Groq rate limit — wait a minute or renew the API key."
      : "Лимит Groq — подождите минуту или обновите ключ API на console.groq.com";
  }
  if (code.includes("401") || code.includes("403") || code.toLowerCase().includes("invalid api key")) {
    return locale === "en"
      ? "Invalid Groq API key on server — update GROQ_API_KEY on Vercel."
      : "Неверный ключ Groq на сервере — обновите GROQ_API_KEY на Vercel и Redeploy.";
  }
  if (
    code.toLowerCase().includes("no available channel") ||
    code.toLowerCase().includes("distributor")
  ) {
    return locale === "en"
      ? "apinet has no Whisper on your key — use Groq (GROQ_API_KEY) or voice in bot."
      : "У apinet нет Whisper на вашем ключе — добавьте GROQ_API_KEY на Vercel или голос боту.";
  }
  if (code.includes("404") || code.toLowerCase().includes("not found")) {
    return locale === "en"
      ? "Whisper not available on this API (try Groq)."
      : "Whisper недоступен на этом API (попробуйте Groq).";
  }
  if (code === "stt_timeout") {
    return locale === "en" ? "STT server too slow." : "Сервер распознавания не успел ответить.";
  }
  if (code) {
    return locale === "en" ? `Code: ${code.slice(0, 80)}` : `Код: ${code.slice(0, 80)}`;
  }
  return "";
}

async function transcribeVoiceFile(
  buffer: ArrayBuffer,
  locale: Locale,
): Promise<{ transcript: string; lastError?: string }> {
  const result = await transcribeTelegramVoice(buffer, locale, 100_000);
  return {
    transcript: result.transcript?.trim() ?? "",
    lastError: result.lastError,
  };
}

async function replyStatus(
  chatId: number,
  statusMsgId: number | null,
  text: string,
  extra?: { parse_mode?: "HTML"; reply_markup?: Record<string, unknown> },
): Promise<number | null> {
  if (statusMsgId) {
    try {
      await editMessageText(chatId, statusMsgId, text, extra);
      return statusMsgId;
    } catch {
      /* fallback to new message */
    }
  }
  const msg = await sendMessage(chatId, text, extra);
  return msg.message_id;
}

async function replySubscriptionRequired(
  chatId: number,
  locale: Locale,
  statusMsgId: number | null,
  priceRub: number,
  periodDays: number,
): Promise<void> {
  const payUrl = `${siteUrl()}/?paywall=1`;
  const text =
    locale === "en"
      ? `<b>Cloud sync requires a subscription</b>\n\n${priceRub} ₽ / ${periodDays} days — voice bot + cloud sync with partner.\n\nPay in the Mini App:`
      : `<b>Для облака нужна подписка</b>\n\n${priceRub} ₽ / ${periodDays} дн. — голосовой бот + синхронизация с партнёром.\n\nОплатите в Mini App:`;

  await replyStatus(chatId, statusMsgId, text, {
    parse_mode: "HTML",
    reply_markup: miniAppKeyboard(
      locale === "en" ? "Subscribe" : "Оформить подписку",
      payUrl,
    ),
  });
}

async function processTranscript(
  message: TelegramMessage,
  transcript: string,
  locale: Locale,
  statusMsgId: number | null = null,
): Promise<void> {
  const from = message.from;
  if (!from) return;

  const chatId = message.chat.id;
  const text = transcript.trim();
  if (!text) {
    await replyStatus(
      chatId,
      statusMsgId,
      locale === "en"
        ? "Could not hear anything. Send a voice message like: «spent 500 on lunch»."
        : "Не расслышал. Отправьте голосовое: «потратил 500 на обед».",
    );
    return;
  }

  await sendChatAction(chatId, "typing");

  const user = await upsertTelegramUser(toWebAppUser(from));
  const sub = await getSubscriptionForUser(user.id);
  if (subscriptionEnforced() && !sub.active) {
    await replySubscriptionRequired(chatId, locale, statusMsgId, sub.priceRub, sub.periodDays);
    return;
  }

  const membership = await ensureHousehold(user.id, toWebAppUser(from));
  const categories = await householdCategories(membership.householdId);
  const partnerLabel = await householdPartnerLabel(membership.householdId);
  const goals = await getHouseholdSavingsGoals(membership.householdId);

  const parseLocale = inferParseLocale(text, locale);

  const planningAction = tryParsePlanningInput(text, parseLocale, goals);
  if (planningAction) {
    const reply = await applyPlanningFromBot(
      user.id,
      membership.householdId,
      planningAction,
      goals,
      categories,
      parseLocale,
    );
    if (reply) {
      await replyStatus(chatId, statusMsgId, reply, {
        parse_mode: "HTML",
        reply_markup: miniAppKeyboard(
          locale === "en" ? "Open app" : "Открыть приложение",
          siteUrl(),
        ),
      });
      return;
    }
  }

  const { items: parsedItems } = await parseTranscriptServerMany(text, parseLocale, categories, {
    partnerName: partnerLabel,
    myName: from.first_name ?? null,
    hasPartner: Boolean(partnerLabel?.trim()),
  });
  const validItems = parsedItems.filter((item) => item.amount > 0);
  if (validItems.length === 0) {
    await replyStatus(
      chatId,
      statusMsgId,
      locale === "en"
        ? `Heard: «${escapeHtml(text)}»\nCould not find an amount. Try: «spent 500 on lunch».`
        : `Услышал: «${escapeHtml(text)}»\nНе нашёл сумму. Пример: «потратил 500 на обед».`,
      { parse_mode: "HTML" },
    );
    return;
  }

  for (const parsed of validItems) {
    await saveParsedTransaction(user.id, membership.householdId, parsed, text);
  }
  await replyStatus(
    chatId,
    statusMsgId,
    formatMultiSuccessReply(validItems, text, parseLocale, categories, partnerLabel),
    {
    parse_mode: "HTML",
    reply_markup: miniAppKeyboard(
      locale === "en" ? "Open app" : "Открыть приложение",
      siteUrl(),
    ),
  });
}

async function handleVoiceMessage(message: TelegramMessage): Promise<void> {
  const voice = message.voice ?? message.audio;
  if (!voice) return;

  const locale = localeFromUser(message.from);
  const chatId = message.chat.id;
  let statusMsgId: number | null = null;

  const statusRef = { current: statusMsgId as number | null };
  const phraseUserKey = recognitionPhraseUserKey(message.from?.id ?? chatId);
  const recognitionStatus = new RecognitionStatusDisplay(chatId, statusRef, phraseUserKey);

  try {
    await sendChatAction(chatId, "typing");
    await recognitionStatus.start();
    statusMsgId = statusRef.current;

    const fileMeta = await getTelegramFile(voice.file_id);
    if (!fileMeta.file_path) throw new Error("telegram_file_path_missing");

    const buffer = await downloadTelegramFile(fileMeta.file_path);
    const { transcript, lastError } = await transcribeVoiceFile(buffer, locale);

    await recognitionStatus.finishBeforeResult();

    if (!transcript) {
      console.error("[telegram/voice] stt failed", {
        lastError,
        bytes: buffer.byteLength,
        duration: voice.duration,
      });
      const hint = sttErrorHint(lastError, locale);

      await replyStatus(
        chatId,
        statusMsgId,
        locale === "en"
          ? `Could not recognize speech.${hint ? `\n${hint}` : ""}\n\nTry text: «500 lunch»`
          : `Не удалось распознать речь.${hint ? `\n${hint}` : ""}\n\nНапишите текстом: «500 на обед»`,
      );
      return;
    }

    try {
      await processTranscript(message, transcript, locale, statusMsgId);
    } catch (processErr) {
      const detail =
        processErr instanceof Error ? processErr.message.slice(0, 120) : "process_error";
      console.error("[telegram/voice] after stt", detail, processErr);
      await replyStatus(
        chatId,
        statusMsgId,
        locale === "en"
          ? `Heard your message but could not save it.\nTry text: «500 lunch» or open Mini App.\n(${detail})`
          : `Речь распознана, но не удалось сохранить.\nНапишите текстом: «500 на обед» или откройте Mini App.\n(${detail})`,
      );
    }
  } catch (err) {
    recognitionStatus.stop();
    const detail = err instanceof Error ? err.message.slice(0, 120) : "voice_error";
    console.error("[telegram/voice]", detail, err);
    await replyStatus(
      chatId,
      statusMsgId,
      locale === "en"
        ? `⚠️ Voice failed (${detail}). Send text: «500 lunch».`
        : `⚠️ Голос не обработался (${detail}). Напишите текстом: «500 на обед».`,
    );
  }
}

async function handleTextMessage(message: TelegramMessage): Promise<void> {
  const text = message.text?.trim();
  if (!text) return;

  const locale = localeFromUser(message.from);
  const chatId = message.chat.id;
  const lower = text.toLowerCase();

  if (lower === "/start") {
    const webApp = siteUrl();
    const botName = getTelegramBotName();
    await sendMessage(chatId, formatBotStartHtml(locale, botName), {
      parse_mode: "HTML",
      reply_markup: miniAppKeyboard(
        locale === "en" ? "Open Mini App" : "Открыть Mini App",
        webApp,
      ),
    });
    return;
  }

  if (lower === "/help") {
    const webApp = siteUrl();
    const botName = getTelegramBotName();
    await sendMessage(chatId, formatBotHelpHtml(locale, botName), {
      parse_mode: "HTML",
      reply_markup: miniAppKeyboard(
        locale === "en" ? "Open Mini App" : "Открыть Mini App",
        webApp,
      ),
    });
    return;
  }

  const command = lower.split(/\s/)[0] ?? "";

  if (
    command === "/web" ||
    command.startsWith("/web@") ||
    command === "/desktop" ||
    command.startsWith("/desktop@") ||
    command === "/login" ||
    command.startsWith("/login@")
  ) {
    const from = message.from;
    if (!from) return;
    const tgUser = toWebAppUser(from);
    const user = await upsertTelegramUser(tgUser);
    await ensureHousehold(user.id, tgUser);
    const token = await createWebLoginToken(user.id);
    const url = `${siteUrl()}/?web_login=${encodeURIComponent(token)}`;
    await sendMessage(
      chatId,
      locale === "en"
        ? "Open this link on your computer. It works once and expires in 5 minutes."
        : "Откройте эту ссылку на компьютере. Она работает один раз и сгорит через 5 минут.",
      {
        reply_markup: urlKeyboard(
          locale === "en" ? "Log in on computer" : "Войти на компьютере",
          url,
        ),
      },
    );
    return;
  }

  if (command === "/appss_verify" || command.startsWith("/appss_verify@")) {
    const token =
      process.env.TELEGRAM_APPSS_VERIFY_RESPONSE?.trim() || "appss_48b635";
    await sendMessage(chatId, token);
    return;
  }

  if (text.startsWith("/")) return;

  await processTranscript(message, text, locale);
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.from || message.from.is_bot) return;

  if (message.voice || message.audio) {
    await handleVoiceMessage(message);
    return;
  }

  if (message.text) {
    await handleTextMessage(message);
  }
}
