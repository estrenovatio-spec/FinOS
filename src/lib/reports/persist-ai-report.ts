import { apiSaveAiReport } from "@/lib/cloud/client";
import { useCloudStore } from "@/store/useCloudStore";

export async function persistAiReportToCloud(input: {
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  locale: "ru" | "en";
  tips: string[];
  fallback?: boolean;
  summaryJson?: unknown;
}): Promise<void> {
  const token = useCloudStore.getState().token;
  if (!token) return;
  try {
    await apiSaveAiReport(token, input);
  } catch {
    /* history is optional */
  }
}
