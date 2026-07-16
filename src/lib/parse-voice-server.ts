import { z } from "zod";
import { APP_CURRENCY } from "@/lib/app-currency";
import {
  PARSE_PROMPT,
  fallbackParse,
  fallbackParseMany,
  normalizeAiParsed,
  splitTranscriptClauses,
} from "@/lib/ai";
import { getDefaultCategories } from "@/lib/categories";
import {
  createLlmChatCompletion,
  getLlmBaseUrl,
  getLlmClient,
  getLlmModel,
  isLlmConfigured,
} from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";
import {
  applyDetectedOwnersWithCarry,
  normalizeOwnerDetectOptions,
  type OwnerDetectOptions,
} from "@/lib/detect-owner";
import { hasPartnerDetectionConfig } from "@/lib/detect-owner";
import { sanitizeTransactionNote } from "@/lib/transaction-note";
import {
  extractCompactMultiAmountInput,
  extractSeparatedMoneyAmounts,
} from "@/lib/multiple-amounts";
import type { CategoryDefinition, Locale, ParsedTransaction } from "@/types";

const MAX_TRANSACTIONS = 200;
const BULK_LIST_THRESHOLD = 12;

const parsedItemSchema = z
  .object({
    amount: z.coerce.number(),
    type: z.enum(["income", "expense"]),
    categoryId: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    currency: z.enum(["RUB", "USD", "EUR"]).optional(),
    note: z.string().optional(),
    date: z.string().optional(),
  })
  .refine((d) => Boolean(d.categoryId || d.category), {
    message: "categoryId or category required",
  });

const parsedManySchema = z.object({
  transactions: z.array(parsedItemSchema).min(1).max(MAX_TRANSACTIONS),
});

type ParsedItem = z.infer<typeof parsedItemSchema>;

function emptyFallback(
  locale: Locale,
  categories: CategoryDefinition[],
): ParsedTransaction {
  return fallbackParse("", locale, categories);
}

function itemToParsedTransaction(
  item: ParsedItem,
  clause: string,
  locale: Locale,
  categories: CategoryDefinition[],
): ParsedTransaction {
  const today = new Date().toISOString().slice(0, 10);
  const normalized = {
    ...item,
    currency: APP_CURRENCY,
    note: sanitizeTransactionNote(
      item.note?.trim() || clause.slice(0, 120),
      item.amount,
    ),
    date:
      item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : today,
  };
  return normalizeAiParsed(normalized, clause, categories, locale);
}

function extractParsedItems(raw: unknown): ParsedItem[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      const parsed = parsedItemSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("AI JSON validation failed");
  }

  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.transactions)) {
    const validated = parsedManySchema.safeParse(obj);
    if (!validated.success) throw new Error("AI JSON validation failed");
    return validated.data.transactions;
  }

  const single = parsedItemSchema.safeParse(obj);
  if (single.success) return [single.data];

  throw new Error("AI JSON validation failed");
}

function applyOwnersToItems(
  items: ParsedTransaction[],
  fullText: string,
  ownerOpts: OwnerDetectOptions,
): ParsedTransaction[] {
  const clauses = splitTranscriptClauses(fullText);
  const itemClauses = items.map(
    (item, index) => clauses[index]?.trim() || item.note?.trim() || fullText,
  );
  return applyDetectedOwnersWithCarry(items, itemClauses, ownerOpts, "me");
}

function expandSeparatedAmountItems(
  items: ParsedTransaction[],
  fullText: string,
): ParsedTransaction[] {
  if (items.length !== 1) return items;
  const compact = extractCompactMultiAmountInput(fullText);
  if (compact && compact.amounts.length > 1) {
    return compact.amounts.map((amount) => ({
      ...items[0],
      amount,
      note: sanitizeTransactionNote(compact.label || items[0].note || fullText.slice(0, 120), amount),
    }));
  }
  const amounts = extractSeparatedMoneyAmounts(fullText);
  if (amounts.length <= 1) return items;
  return amounts.map((amount) => ({
    ...items[0],
    amount,
    note: sanitizeTransactionNote(
      items[0].note || fullText.slice(0, 120),
      amount,
    ),
  }));
}

function splitSingleParsedItemAcrossClauses(
  items: ParsedTransaction[],
  fullText: string,
  locale: Locale,
  categories: CategoryDefinition[],
): ParsedTransaction[] {
  const clauses = splitTranscriptClauses(fullText);
  if (items.length !== 1 || clauses.length <= 1) return items;
  const fallbackItems = fallbackParseMany(fullText, locale, categories);
  return fallbackItems.length > 1 ? fallbackItems : items;
}

export async function parseTranscriptServerMany(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
  ownerCtx?: OwnerDetectOptions | string | null,
): Promise<{ items: ParsedTransaction[]; fallback: boolean }> {
  const text = transcript.trim();
  const ownerOpts = normalizeOwnerDetectOptions(ownerCtx, locale);
  if (ownerOpts.hasPartner === undefined) {
    ownerOpts.hasPartner = hasPartnerDetectionConfig(
      ownerOpts.partnerName,
      ownerOpts.partnerKeywords,
    );
  }

  const withOwner = (items: ParsedTransaction[]) =>
    applyOwnersToItems(items, text, ownerOpts);

  if (!text) {
    return {
      items: withOwner([emptyFallback(locale, categories)]),
      fallback: true,
    };
  }

  const clauses = splitTranscriptClauses(text);

  if (clauses.length > BULK_LIST_THRESHOLD) {
    return {
      items: withOwner(fallbackParseMany(text, locale, categories)),
      fallback: true,
    };
  }

  if (!isLlmConfigured()) {
    return {
      items: withOwner(fallbackParseMany(text, locale, categories)),
      fallback: true,
    };
  }

  const openai = getLlmClient();
  if (!openai) {
    return {
      items: withOwner(fallbackParseMany(text, locale, categories)),
      fallback: true,
    };
  }

  try {
    const completion = await createLlmChatCompletion(openai, {
      messages: [
        {
          role: "system",
          content:
            locale === "ru"
              ? "Ты разбираешь русские фразы про деньги в JSON. Строго следуй categoryId из каталога в запросе (включая keywords пользователя). Только JSON, без пояснений."
              : "You parse money phrases into JSON. Use only categoryId values from the request catalog (including user keywords). JSON only, no prose.",
        },
        {
          role: "user",
          content: PARSE_PROMPT(
            text,
            locale,
            categories,
            ownerOpts.partnerName,
            ownerOpts.myName,
            ownerOpts.partnerKeywords,
          ),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const raw: unknown = extractJsonFromLlmContent(content);
    const parsedItems = extractParsedItems(raw);

    const items = expandSeparatedAmountItems(
      splitSingleParsedItemAcrossClauses(
        parsedItems
          .map((item, index) =>
            itemToParsedTransaction(
              item,
              clauses[index] ?? item.note?.trim() ?? text,
              locale,
              categories,
            ),
          )
          .filter((item) => item.amount > 0),
        text,
        locale,
        categories,
      ),
      text,
    );

    if (items.length === 0) throw new Error("No valid transactions");

    return { items: withOwner(items), fallback: false };
  } catch (err) {
    console.error("[parse-voice-server] LLM error", {
      message: err instanceof Error ? err.message : err,
      baseUrl: getLlmBaseUrl() ?? "(official OpenAI)",
      model: getLlmModel(),
    });
    return {
      items: withOwner(fallbackParseMany(text, locale, categories)),
      fallback: true,
    };
  }
}

/** @deprecated prefer parseTranscriptServerMany — returns first item only */
export async function parseTranscriptServer(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
  ownerCtx?: OwnerDetectOptions | string | null,
): Promise<{ data: ParsedTransaction; fallback: boolean }> {
  const { items, fallback } = await parseTranscriptServerMany(
    transcript,
    locale,
    categories,
    ownerCtx,
  );
  return {
    data: items[0] ?? emptyFallback(locale, categories),
    fallback,
  };
}
