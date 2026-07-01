"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBuiltinHelpAnswer } from "@/lib/help-app-knowledge";
import type { HelpChatMessage } from "@/lib/help-chat";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { t } from "@/lib/i18n";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import type { Locale } from "@/types";

const CHAT_STORAGE_KEY = "voicebudget-help-chat-v1";
const STORED_MESSAGES_MAX = 200;
/** В API уходят только последние операции — иначе тяжёлый JSON и сбои в Telegram WebView */
const HELP_CHAT_TX_SNAPSHOT_MAX = 150;

function readStoredChat(): HelpChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is HelpChatMessage =>
        typeof m === "object" &&
        m != null &&
        (m as HelpChatMessage).role !== undefined &&
        typeof (m as HelpChatMessage).content === "string",
    );
  } catch {
    return [];
  }
}

function writeStoredChat(messages: HelpChatMessage[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-STORED_MESSAGES_MAX)));
  } catch {
    /* ignore */
  }
}

type HelpFaqChatProps = {
  locale: Locale;
};

export function HelpFaqChat({ locale }: HelpFaqChatProps) {
  const transactions = useStore((s) => s.transactions);
  const categories = useStore((s) => s.categories);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const partnerName = useStore((s) => s.partnerName);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const cloudToken = useCloudStore((s) => s.token);

  const [chat, setChat] = useState<HelpChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataSourceHint, setDataSourceHint] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChat(readStoredChat());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, loading]);

  const sendQuestion = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;

    const userMsg: HelpChatMessage = { role: "user", content: q };
    const nextChat = [...chat, userMsg];
    setChat(nextChat);
    setQuestion("");
    setLoading(true);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cloudToken) headers.Authorization = `Bearer ${cloudToken}`;

    const auth = getCloudAuthBody();

    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          locale,
          question: q,
          messages: chat,
          trackingStartedAt,
          partnerLabel: partnerName,
          ...auth,
          clientSnapshot: {
            transactions: transactions.slice(-HELP_CHAT_TX_SNAPSHOT_MAX),
            categories,
            savingsGoals,
            categoryBudgets,
            recurringTransactions,
          },
        }),
      });

      const raw = await res.text();
      let json: {
        success?: boolean;
        reply?: string;
        dataSource?: string;
        error?: string;
        builtin?: boolean;
      } = {};
      if (raw.trim()) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          /* HTML 504 от прокси и т.п. */
        }
      }

      if (!res.ok) {
        const builtin = formatBuiltinHelpAnswer(q, locale);
        if (builtin) {
          json = { success: true, reply: builtin, builtin: true };
        } else {
          throw new Error(json.error ?? `http_${res.status}`);
        }
      }

      const reply =
        json.reply?.trim() ||
        (locale === "ru"
          ? "Не удалось получить ответ. Посмотрите шпаргалку выше или попробуйте через минуту."
          : "No answer yet. See the quick reference above or try again in a minute.");

      if (json.dataSource === "cloud_db") {
        setDataSourceHint(t(locale, "helpChatSourceCloud"));
      } else if (json.dataSource === "client_device" && transactions.length > 0) {
        setDataSourceHint(t(locale, "helpChatSourceLocal"));
      } else {
        setDataSourceHint(null);
      }

      const withReply: HelpChatMessage[] = [...nextChat, { role: "assistant", content: reply }];
      setChat(withReply);
      writeStoredChat(withReply);
    } catch {
      const builtin = formatBuiltinHelpAnswer(q, locale);
      const errMsg = builtin
        ? builtin
        : locale === "ru"
          ? "Сейчас не удалось связаться с сервером. Проверьте интернет или посмотрите шпаргалку выше."
          : "Could not reach the server. Check your connection or use the quick reference above.";
      const withReply: HelpChatMessage[] = [...nextChat, { role: "assistant", content: errMsg }];
      setChat(withReply);
      writeStoredChat(withReply);
    } finally {
      setLoading(false);
    }
  }, [
    categories,
    categoryBudgets,
    chat,
    cloudToken,
    loading,
    locale,
    partnerName,
    question,
    recurringTransactions,
    savingsGoals,
    trackingStartedAt,
    transactions,
  ]);

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        {t(locale, "helpChatTitle")}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{t(locale, "helpChatHint")}</p>

      <div className="mb-2 max-h-56 space-y-2 overflow-y-auto rounded-md bg-background/80 p-2">
        {chat.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">{t(locale, "helpChatEmpty")}</p>
        )}
        {chat.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={
              msg.role === "user"
                ? "ml-3 rounded-lg bg-primary/10 px-2.5 py-2 text-xs leading-snug"
                : "mr-1 rounded-lg bg-secondary/80 px-2.5 py-2 text-xs leading-snug"
            }
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t(locale, "helpChatThinking")}
          </p>
        )}
        <div ref={chatEndRef} />
      </div>

      {dataSourceHint ? (
        <p className="mb-2 text-[10px] text-muted-foreground">{dataSourceHint}</p>
      ) : null}

      <div className="flex gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendQuestion();
            }
          }}
          placeholder={t(locale, "helpChatPlaceholder")}
          disabled={loading}
          rows={2}
          className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={loading || !question.trim()}
          onClick={() => void sendQuestion()}
          aria-label={t(locale, "helpChatSend")}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
