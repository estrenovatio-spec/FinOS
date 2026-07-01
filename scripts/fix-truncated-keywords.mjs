/**
 * Убирает обрезанные основы (аренд, квартир, копилк…) и дополняет полными словами.
 * node scripts/fix-truncated-keywords.mjs && node scripts/sync-default-categories.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const jsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/default-categories-current.json",
);
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const byId = Object.fromEntries(data.map((c) => [c.id, c]));

/** Удалить везде — полные формы добавляются в target */
const REMOVE_EVERYWHERE = new Set([
  "аренд",
  "квартир",
  "ипотек",
  "коммунал",
  "электрич",
  "отделк",
  "управляющая",
  "копилк",
  "цел",
  "макарон",
]);

/** categoryId → слова добавить (если ещё нет) */
const ADD_BY_CATEGORY = {
  rent: [
    "аренда",
    "аренду",
    "арендой",
    "арендная плата",
    "арендную",
    "арендной",
    "арендатор",
    "арендодатель",
    "снял квартиру",
    "квартира",
    "квартиру",
    "квартиры",
    "квартирный",
    "квартплата",
    "landlord",
    "rent",
    "lease",
  ],
  housing: [
    "жильё",
    "жилье",
    "дом",
    "кредит на жильё",
    "кредит на жилье",
    "жкх",
    "коммуналка",
    "коммуналку",
    "коммунальные",
    "коммунальные платежи",
    "коммунальные услуги",
    "за коммуналку",
    "оплатил коммуналку",
    "квитанция",
    "квитанцию",
    "счётчик",
    "счетчик",
    "электричество",
    "электроэнергию",
    "электроэнергия",
    "свет",
    "за свет",
    "за электричество",
    "вода",
    "водоснабжение",
    "за воду",
    "газ",
    "газ жкх",
    "оплата газа",
    "газоснабжение",
    "отопление",
    "за отопление",
    "тепло",
    "интернет",
    "домашний интернет",
    "счёт за интернет",
    "счет за интернет",
    "интернет-провайдер",
    "провайдер интернета",
    "ростелеком",
    "дом.ру",
    "дом ру",
    "мтс дом",
    "мтс интернет",
    "счёт мтс",
    "счет мтс",
    "билайн дом",
    "билайн интернет",
    "мегафон дом",
    "домофон",
    "консьерж",
    "консьержа",
    "управляющая компания",
    "ук",
    "тсж",
    "капремонт",
    "ремонт",
    "ремонт кухни",
    "ремонт квартиры",
    "ремонт дома",
    "капитальный ремонт",
    "отделка",
    "отделку",
    "отделочные работы",
    "строительство",
    "плиточник",
    "плиточника",
    "мебель",
    "мебели",
    "икея",
    "ikea",
    "леруа",
    "leroy merlin",
    "leroy",
    "obi",
    "оплата жкх",
    "оплатил жкх",
    "оплатила жкх",
    "плачу за жкх",
    "ипотечный платёж",
    "ипотечный платеж",
    "платёж по ипотеке",
    "платеж по ипотеке",
    "епд",
    "еирц",
    "housing",
    "mortgage",
    "utilities",
    "electricity",
    "water bill",
    "renovation",
    "repair",
  ],
  goal_jar: [
    "копилка",
    "копилку",
    "копилке",
    "копилки",
    "цель",
    "цели",
    "целевой",
  ],
};

function addUnique(cat, words) {
  const set = new Set(cat.keywords.map((w) => w.toLowerCase()));
  for (const w of words) {
    const t = w.toLowerCase().trim();
    if (!t || set.has(t)) continue;
    cat.keywords.push(w);
    set.add(t);
  }
}

let removed = 0;
for (const c of data) {
  const before = c.keywords.length;
  c.keywords = c.keywords.filter((w) => {
    const t = w.toLowerCase().trim();
    if (REMOVE_EVERYWHERE.has(t)) {
      removed++;
      return false;
    }
    return true;
  });
  if (before !== c.keywords.length) {
    /* logged via removed */
  }
}

for (const [id, words] of Object.entries(ADD_BY_CATEGORY)) {
  const cat = byId[id];
  if (cat) addUnique(cat, words);
}

// housing: новое название
if (byId.housing) {
  byId.housing.labels = { ru: "Дом и ЖКХ", en: "Home & utilities" };
}

// убрать короткие «мтс» / «билайн» без контекста дома (ложные срабатывания на связь)
for (const c of data) {
  if (c.id === "housing") {
    c.keywords = c.keywords.filter(
      (w) => !["мтс", "билайн", "провайдер"].includes(w.toLowerCase().trim()),
    );
  }
}

// сортировка keywords в каждой категории
for (const c of data) {
  c.keywords = [...new Set(c.keywords.map((w) => w.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Removed ${removed} truncated stems; updated housing label and keywords.`);
