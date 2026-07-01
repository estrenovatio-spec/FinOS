/**
 * Убирает точные дубликаты keywords между категориями (оставляет в «главной»).
 * node scripts/dedupe-category-keywords.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const jsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/default-categories-current.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

/** keyword → id категории, где слово остаётся */
const KEEP_IN = {
  газ: "housing",
  осаго: "transport",
  каско: "transport",
  ипотека: "banking",
  квартира: "rent",
  квартплата: "rent",
  сантехник: "services",
  электрик: "services",
  хостел: "vacation",
  airbnb: "vacation",
  паб: "dining_out",
  steam: "subscriptions",
  subscription: "subscriptions",
  present: "gift_income",
};

const byId = Object.fromEntries(data.map((c) => [c.id, c]));
let removed = 0;

for (const [kw, keepId] of Object.entries(KEEP_IN)) {
  for (const c of data) {
    if (c.id === keepId) continue;
    const before = c.keywords.length;
    c.keywords = c.keywords.filter((w) => w.toLowerCase().trim() !== kw);
    removed += before - c.keywords.length;
  }
}

// transport: «газ» как топливо — длинные фразы вместо короткого «газ»
addUnique(byId.transport, "газ на заправке", "газ баллон", "газгольдер");

function addUnique(cat, ...words) {
  const set = new Set(cat.keywords.map((w) => w.toLowerCase()));
  for (const w of words) {
    const t = w.toLowerCase();
    if (!set.has(t)) {
      cat.keywords.push(w);
      set.add(t);
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Removed ${removed} cross-category duplicate keywords`);
