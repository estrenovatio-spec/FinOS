const RECOMMENDATIONS_KEY = "voicebudget-recommendations";
const RECOMMENDATIONS_TS_KEY = "voicebudget-recommendations-ts";
export const RECOMMENDATIONS_TTL_MS = 24 * 60 * 60 * 1000;

const WEEKLY_KEY = "voicebudget-weekly-analysis-v3";
const WEEKLY_TS_KEY = "voicebudget-weekly-analysis-ts-v3";
const WEEKLY_CHAT_KEY = "voicebudget-weekly-chat-v1";
export const WEEKLY_ANALYSIS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MONTHLY_KEY = "voicebudget-monthly-analysis-v2";
const MONTHLY_TS_KEY = "voicebudget-monthly-analysis-ts-v2";
const MONTHLY_CHAT_KEY = "voicebudget-monthly-chat-v1";
export const MONTHLY_ANALYSIS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedRecommendations {
  items: string[];
  generatedAt: number;
}

export function getCachedRecommendations(): CachedRecommendations | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RECOMMENDATIONS_KEY);
    const ts = localStorage.getItem(RECOMMENDATIONS_TS_KEY);
    if (!raw || !ts) return null;
    const generatedAt = Number(ts);
    if (Date.now() - generatedAt > RECOMMENDATIONS_TTL_MS) return null;
    return { items: JSON.parse(raw) as string[], generatedAt };
  } catch {
    return null;
  }
}

export function setCachedRecommendations(items: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(items));
  localStorage.setItem(RECOMMENDATIONS_TS_KEY, String(Date.now()));
}

export function clearCachedRecommendations(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECOMMENDATIONS_KEY);
  localStorage.removeItem(RECOMMENDATIONS_TS_KEY);
}

export interface CachedWeeklyAnalysis {
  items: string[];
  generatedAt: number;
  periodEnd: string;
}

export interface WeeklyChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function getCachedWeeklyAnalysis(): CachedWeeklyAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEEKLY_KEY);
    const ts = localStorage.getItem(WEEKLY_TS_KEY);
    if (!raw || !ts) return null;
    const generatedAt = Number(ts);
    if (Date.now() - generatedAt > WEEKLY_ANALYSIS_TTL_MS) return null;
    const parsed = JSON.parse(raw) as CachedWeeklyAnalysis;
    return { ...parsed, generatedAt };
  } catch {
    return null;
  }
}

export function setCachedWeeklyAnalysis(items: string[], periodEnd: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    WEEKLY_KEY,
    JSON.stringify({ items, generatedAt: Date.now(), periodEnd }),
  );
  localStorage.setItem(WEEKLY_TS_KEY, String(Date.now()));
  clearWeeklyChat();
}

export function clearCachedWeeklyAnalysis(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WEEKLY_KEY);
  localStorage.removeItem(WEEKLY_TS_KEY);
  clearWeeklyChat();
}

export function getWeeklyChatMessages(): WeeklyChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WEEKLY_CHAT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WeeklyChatMessage[];
  } catch {
    return [];
  }
}

export function setWeeklyChatMessages(messages: WeeklyChatMessage[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEEKLY_CHAT_KEY, JSON.stringify(messages));
}

export function clearWeeklyChat(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WEEKLY_CHAT_KEY);
}

export interface MonthlyChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CachedMonthlyAnalysis {
  items: string[];
  generatedAt: number;
  periodEnd: string;
}

export function getCachedMonthlyAnalysis(): CachedMonthlyAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MONTHLY_KEY);
    const ts = localStorage.getItem(MONTHLY_TS_KEY);
    if (!raw || !ts) return null;
    const generatedAt = Number(ts);
    if (Date.now() - generatedAt > MONTHLY_ANALYSIS_TTL_MS) return null;
    const parsed = JSON.parse(raw) as CachedMonthlyAnalysis;
    return { ...parsed, generatedAt };
  } catch {
    return null;
  }
}

export function setCachedMonthlyAnalysis(items: string[], periodEnd: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    MONTHLY_KEY,
    JSON.stringify({ items, generatedAt: Date.now(), periodEnd }),
  );
  localStorage.setItem(MONTHLY_TS_KEY, String(Date.now()));
  clearMonthlyChat();
}

export function clearCachedMonthlyAnalysis(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MONTHLY_KEY);
  localStorage.removeItem(MONTHLY_TS_KEY);
  clearMonthlyChat();
}

export function getMonthlyChatMessages(): MonthlyChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MONTHLY_CHAT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MonthlyChatMessage[];
  } catch {
    return [];
  }
}

export function setMonthlyChatMessages(messages: MonthlyChatMessage[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MONTHLY_CHAT_KEY, JSON.stringify(messages));
}

export function clearMonthlyChat(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MONTHLY_CHAT_KEY);
}

// TODO: migrate to Supabase/PostgreSQL
