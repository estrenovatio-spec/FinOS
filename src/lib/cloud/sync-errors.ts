/** Сбрасывать облачную сессию только при явной ошибке авторизации */
export function isAuthSyncError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg === "unauthorized" ||
    msg === "forbidden" ||
    msg === "invalid_init_data" ||
    msg === "http_401" ||
    msg === "http_403"
  );
}

export function isSubscriptionSyncError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg === "subscription_required" || msg === "http_402";
}
