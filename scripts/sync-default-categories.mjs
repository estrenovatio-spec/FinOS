/**
 * Сборка default-categories из data/default-categories-current.json
 * Запуск после правок JSON: node scripts/sync-default-categories.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "data/default-categories-current.json");
const tsPath = path.join(root, "src/lib/default-categories.ts");

const categories = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const ts = `import type { CategoryDefinition } from "@/types";
import categoriesData from "../../data/default-categories-current.json";

/** Системные категории (данные в data/default-categories-current.json) */
export const DEFAULT_CATEGORIES: CategoryDefinition[] = categoriesData as CategoryDefinition[];
`;

fs.writeFileSync(tsPath, ts);
console.log(`Synced ${categories.length} categories → src/lib/default-categories.ts`);
