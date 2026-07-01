import type { ServiceInquiryId } from "@/lib/services/inquiry-types";
import { serviceInquiryTopicLabel } from "@/lib/services/inquiry-types";
import { sendMessage } from "@/lib/telegram/bot-api";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyServiceInquiryAdmin(opts: {
  serviceId: ServiceInquiryId;
  fullName: string;
  phone: string;
  telegram?: string;
}): Promise<void> {
  const chatIdRaw = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!chatIdRaw) {
    console.warn("TELEGRAM_ADMIN_CHAT_ID не задан — уведомление в Telegram не отправлено");
    return;
  }

  const chatId = Number(chatIdRaw);
  if (!Number.isFinite(chatId)) {
    console.warn("TELEGRAM_ADMIN_CHAT_ID некорректен");
    return;
  }

  const topic = serviceInquiryTopicLabel(opts.serviceId, "ru");
  const header =
    opts.serviceId === "sg_advisor"
      ? "👔 <b>SG Capital — заявка на финансового советника</b>"
      : "📋 <b>Просто Бюджет — заявка</b>";
  const lines = [
    header,
    "",
    `<b>Тема:</b> ${escapeHtml(topic)}`,
    `<b>Имя:</b> ${escapeHtml(opts.fullName)}`,
    `<b>Телефон:</b> ${escapeHtml(opts.phone)}`,
  ];
  if (opts.telegram) lines.push(`<b>Telegram:</b> ${escapeHtml(opts.telegram)}`);

  try {
    await sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("notifyServiceInquiryAdmin:", err);
  }
}
