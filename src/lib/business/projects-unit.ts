import type { BusinessUnit } from "@/lib/business/types";

/** Служебный юнит для пассивных проектов — не показываем в списке бизнесов. */
export const PROJECTS_SERVICE_UNIT_NAME = "Проекты";

export function isProjectsServiceUnit(unit: Pick<BusinessUnit, "name">): boolean {
  return unit.name.trim() === PROJECTS_SERVICE_UNIT_NAME;
}

export function visibleBusinessUnits(units: BusinessUnit[]): BusinessUnit[] {
  return units.filter((u) => !isProjectsServiceUnit(u));
}

export function resolveVisibleUnitId(
  units: BusinessUnit[],
  selectedUnitId: string | null,
): string | null {
  const visible = visibleBusinessUnits(units);
  if (selectedUnitId && visible.some((u) => u.id === selectedUnitId)) {
    return selectedUnitId;
  }
  return visible[0]?.id ?? null;
}
