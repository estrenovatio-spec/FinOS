import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "docs", "mini-tips-chunks");
const outMd = path.join(root, "docs", "budget-mini-tips.md");
const outTs = path.join(root, "src", "lib", "budget-mini-tips.ts");

const chunks = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith(".txt"))
  .sort();

let md = "";
const tips = [];

for (const file of chunks) {
  const text = fs.readFileSync(path.join(srcDir, file), "utf8");
  md += text + "\n";
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/);
    if (m) tips.push(m[2].trim());
  }
}

if (tips.length < 1) {
  console.error("No tips found in docs/mini-tips-chunks");
  process.exit(1);
}

fs.writeFileSync(outMd, md.trim() + "\n");

const ts = `/** ${tips.length} мини-советов для ведения бюджета */
export const BUDGET_MINI_TIPS = ${JSON.stringify(tips, null, 2)} as const;

export type BudgetMiniTip = (typeof BUDGET_MINI_TIPS)[number];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandomMiniTips(count = 3): string[] {
  return shuffle([...BUDGET_MINI_TIPS]).slice(0, Math.min(count, BUDGET_MINI_TIPS.length));
}

/** @deprecated use pickRandomMiniTips */
export const pickRandomBudgetQuotes = pickRandomMiniTips;
`;

fs.writeFileSync(outTs, ts);
console.log(`Wrote ${tips.length} tips → ${outTs}`);
