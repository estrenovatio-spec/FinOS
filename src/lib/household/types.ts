import type { BalanceOffsetsByUser } from "@/lib/balance-offsets";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, RecurringTransaction, SavingsGoal } from "@/types/planning";
import type { DebtItem } from "@/types/planning";

export interface HouseholdPublic {
  id: string;
  name: string;
  mode: "solo" | "shared";
  inviteCode: string;
  partnerLabel: string | null;
  memberCount: number;
}

export interface SyncPayload {
  household: HouseholdPublic;
  /** Участники семьи — для пересчёта owner на этом телефоне */
  memberUserIds: string[];
  /** Кто сейчас вошёл (для сессии на этом устройстве) */
  viewerUserId?: string;
  transactions: Transaction[];
  categories: CategoryDefinition[];
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  debts?: DebtItem[];
  /** Корректировки баланса по userId (синхронизация «реально в кармане») */
  balanceOffsets?: BalanceOffsetsByUser;
  vehicles?: import("@/types/vehicle").Vehicle[];
  vehiclePrefs?: import("@/types/vehicle").VehicleGaragePrefs;
  /** false — в БД нет vehicle-garage-v2, гараж только локально / legacy */
  vehicleGarageAvailable?: boolean;
  /** @deprecated один автомобиль — читайте vehicles[0] */
  vehicle?: import("@/types/vehicle").Vehicle | null;
}
