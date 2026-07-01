import type { CategoryDefinition } from "@/types";
import categoriesData from "../../data/default-categories-current.json";

/** Системные категории (данные в data/default-categories-current.json) */
export const DEFAULT_CATEGORIES: CategoryDefinition[] = categoriesData as CategoryDefinition[];
