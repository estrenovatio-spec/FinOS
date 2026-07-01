import type { BusinessCloudPayload } from "@/lib/business/types";
import { defaultBusinessUnit } from "@/lib/business/types";

export function mergeBusinessPayload(
  local: BusinessCloudPayload,
  remote: BusinessCloudPayload,
): BusinessCloudPayload {
  const archiveMap = new Map<
    string,
    NonNullable<BusinessCloudPayload["deletedUnitsArchive"]>[number]
  >();
  for (const item of [
    ...(remote.deletedUnitsArchive ?? []),
    ...(local.deletedUnitsArchive ?? []),
  ]) {
    if (item && typeof item.id === "string") archiveMap.set(item.id, item);
  }
  const deletedUnitIds = new Set(
    Array.from(archiveMap.values())
      .map((item) => item.unit?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const unitMap = new Map<string, (typeof local.units)[0]>();
  for (const u of remote.units) {
    if (!deletedUnitIds.has(u.id)) unitMap.set(u.id, u);
  }
  for (const u of local.units) {
    if (!deletedUnitIds.has(u.id)) unitMap.set(u.id, u);
  }

  const deletedTransactionIds = new Set<string>([
    ...(remote.deletedTransactionIds ?? []),
    ...(local.deletedTransactionIds ?? []),
  ]);
  const deletedAssetIds = new Set<string>([
    ...(remote.deletedAssetIds ?? []),
    ...(local.deletedAssetIds ?? []),
  ]);

  const txMap = new Map<string, (typeof local.transactions)[0]>();
  for (const t of remote.transactions) {
    if (!deletedUnitIds.has(t.unitId)) txMap.set(t.id, t);
  }
  for (const t of local.transactions) {
    if (!deletedUnitIds.has(t.unitId)) txMap.set(t.id, t);
  }
  for (const id of deletedTransactionIds) txMap.delete(id);

  const assetMap = new Map<string, (typeof local.assets)[0]>();
  for (const a of [...remote.assets, ...local.assets]) {
    if (deletedUnitIds.has(a.unitId)) continue;
    if (deletedAssetIds.has(a.id)) continue;
    if (a && typeof a.id === "string") assetMap.set(a.id, a);
  }
  const visibleAssetIds = new Set(assetMap.keys());

  const units = Array.from(unitMap.values());
  if (units.length === 0) units.push(defaultBusinessUnit());

  const receiptMap = new Map<string, NonNullable<BusinessCloudPayload["passiveReceipts"]>[number]>();
  for (const r of [...(remote.passiveReceipts ?? []), ...(local.passiveReceipts ?? [])]) {
    if (!visibleAssetIds.has(r.assetId)) continue;
    if (r && typeof r.id === "string") receiptMap.set(r.id, r);
  }
  const debtMap = new Map<string, NonNullable<BusinessCloudPayload["debts"]>[number]>();
  for (const d of [...(remote.debts ?? []), ...(local.debts ?? [])]) {
    if (deletedUnitIds.has(d.unitId)) continue;
    if (d && typeof d.id === "string") debtMap.set(d.id, d);
  }

  return {
    version: 2,
    units,
    transactions: Array.from(txMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
    deletedTransactionIds: Array.from(deletedTransactionIds).slice(-500),
    deletedAssetIds: Array.from(deletedAssetIds).slice(-500),
    assets: Array.from(assetMap.values()),
    debts: Array.from(debtMap.values()),
    deletedUnitsArchive: Array.from(archiveMap.values())
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
      .slice(0, 30),
    passiveReceipts: Array.from(receiptMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
    taxRatePct: local.taxRatePct ?? remote.taxRatePct ?? 0,
  };
}
