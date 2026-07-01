/** Корректировки «реально в кармане» по userId участника семьи (в облаке). */
export type BalanceOffsetsByUser = Record<string, number>;

function coerceOffset(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseBalanceOffsets(raw: unknown): BalanceOffsetsByUser {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BalanceOffsetsByUser = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = coerceOffset(value);
    if (n !== null) {
      out[key] = n;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const offset = coerceOffset((value as Record<string, unknown>).offset);
      if (offset !== null) out[key] = offset;
    }
  }
  return out;
}

/** Партнёр: из memberUserIds или единственный другой ключ в offsets (если ids на устройстве устарели). */
export function resolvePartnerUserId(
  viewerUserId: string | null,
  memberUserIds: readonly string[],
  offsets?: BalanceOffsetsByUser,
): string | null {
  if (!viewerUserId) return null;
  const fromMembers = memberUserIds.find((id) => id !== viewerUserId);
  if (fromMembers) return fromMembers;
  if (!offsets) return null;
  const keys = Object.keys(offsets).filter((id) => id !== viewerUserId);
  return keys.length > 0 ? keys[0]! : null;
}

/** Локальные cashOffsetMe / cashOffsetPartner с точки зрения текущего зрителя. */
export function cashOffsetsForViewer(
  offsets: BalanceOffsetsByUser | undefined,
  viewerUserId: string | null,
  memberUserIds: readonly string[],
): { cashOffsetMe: number; cashOffsetPartner: number } {
  if (!viewerUserId || !offsets) {
    return { cashOffsetMe: 0, cashOffsetPartner: 0 };
  }
  const partnerId = resolvePartnerUserId(viewerUserId, memberUserIds, offsets);
  return {
    cashOffsetMe: offsets[viewerUserId] ?? 0,
    cashOffsetPartner: partnerId ? (offsets[partnerId] ?? 0) : 0,
  };
}
