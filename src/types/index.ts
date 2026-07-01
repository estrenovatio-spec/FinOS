export type TxType = "income" | "expense";

export interface CategoryDefinition {
  id: string;
  type: TxType;
  labels: { ru: string; en: string };
  keywords: string[];
  isSystem: boolean;
}
export type Currency = "RUB" | "USD" | "EUR";
export type BudgetOwner = "me" | "partner";
export type HouseholdFilter = "all" | BudgetOwner;

export interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  categoryId: string;
  currency: Currency;
  note: string;
  date: string;
  owner: BudgetOwner;
  /** Кто создал операцию (user id в облаке) — для корректного «я/партнёр» на втором телефоне */
  createdBy?: string | null;
  /** Сумма, переведённая в копилку из этой операции */
  goalId?: string | null;
  goalAmount?: number | null;
  /** ISO — с облака; для слияния при синхронизации */
  updatedAt?: string;
  /** false — регулярный расход, ждёт подтверждения (не в балансе) */
  confirmed?: boolean;
  /** Шаблон регулярного платежа */
  recurringId?: string | null;
  /** Пробег на спидометре (заправка / ТО) */
  odometerKm?: number | null;
  /** Литры топлива при заправке */
  fuelLiters?: number | null;
  /** Какая машина из гаража */
  vehicleId?: string | null;
  /** Связка пары переводов me ↔ partner */
  transferPairId?: string | null;
  /** Связанная операция в бизнес-контуре (доход из бизнеса) */
  businessTxId?: string | null;
}
export type Locale = "ru" | "en";

export interface ParsedTransaction {
  amount: number;
  type: TxType;
  categoryId: string;
  currency: Currency;
  note: string;
  date: string;
  owner?: BudgetOwner;
  goalId?: string | null;
  goalAmount?: number | null;
  confirmed?: boolean;
  recurringId?: string | null;
  odometerKm?: number | null;
  fuelLiters?: number | null;
  vehicleId?: string | null;
  transferPairId?: string | null;
  createdBy?: string | null;
  businessTxId?: string | null;
}

/** @deprecated persisted legacy shape */
export interface LegacyTransaction extends Omit<Transaction, "categoryId" | "owner"> {
  category?: string;
}
