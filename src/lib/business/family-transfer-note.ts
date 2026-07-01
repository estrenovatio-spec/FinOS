/** Подпись дохода в семейном бюджете при переводе из бизнеса. */
export function familyIncomeNoteFromBusiness(
  unitName: string,
  locale: "ru" | "en",
): string {
  const name = unitName.trim() || (locale === "en" ? "business" : "бизнес");
  return locale === "en"
    ? `Income from business «${name}»`
    : `Доход из бизнеса «${name}»`;
}

export function familyIncomeNoteFromBusinessSale(
  unitName: string,
  locale: "ru" | "en",
): string {
  const name = unitName.trim() || (locale === "en" ? "business" : "бизнес");
  return locale === "en"
    ? `Business sale «${name}»`
    : `Продажа бизнеса «${name}»`;
}

export function familyIncomeNoteFromAssetSale(
  unitName: string,
  assetName: string,
  locale: "ru" | "en",
): string {
  const biz = unitName.trim() || (locale === "en" ? "business" : "бизнес");
  const asset = assetName.trim() || (locale === "en" ? "asset" : "актив");
  return locale === "en"
    ? `Sale of asset «${asset}» (${biz})`
    : `Продажа актива «${asset}» (${biz})`;
}

/** Подпись дохода в семье при зачислении пассива из проектов/активов. */
export function familyIncomeNoteFromPassive(
  unitName: string,
  assetName: string,
  locale: "ru" | "en",
): string {
  const biz = unitName.trim() || (locale === "en" ? "business" : "бизнес");
  const asset = assetName.trim() || (locale === "en" ? "asset" : "актив");
  return locale === "en"
    ? `Transfer from asset «${asset}» (${biz})`
    : `Перевод от актива «${asset}» (${biz})`;
}
