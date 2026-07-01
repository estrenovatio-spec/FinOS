import { getCategoryLabel } from "@/lib/categories";
import { formatIsoDate } from "@/lib/format-date";
import type {
  BusinessAsset,
  BusinessTransaction,
  BusinessUnit,
} from "@/lib/business/types";
import type { CategoryDefinition, Locale, Transaction } from "@/types";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
): Transaction[] {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  end.setHours(23, 59, 59, 999);
  return transactions
    .filter((tx) => {
      const d = new Date(tx.date);
      return d >= start && d <= end && tx.confirmed !== false;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function buildTransactionsCsv(
  transactions: Transaction[],
  categories: CategoryDefinition[],
  locale: Locale,
): string {
  const header =
    locale === "ru"
      ? ["Дата", "Тип", "Сумма", "Категория", "Заметка", "Кто"].join(",")
      : ["Date", "Type", "Amount", "Category", "Note", "Owner"].join(",");

  const rows = transactions.map((tx) => {
    const type =
      tx.type === "income"
        ? locale === "ru"
          ? "Доход"
          : "Income"
        : locale === "ru"
          ? "Расход"
          : "Expense";
    const owner =
      tx.owner === "partner"
        ? locale === "ru"
          ? "Партнёр"
          : "Partner"
        : locale === "ru"
          ? "Я"
          : "Me";
    return [
      tx.date,
      type,
      String(tx.amount),
      getCategoryLabel(tx.categoryId, categories, locale),
      tx.note ?? "",
      owner,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return `\uFEFF${header}\n${rows.join("\n")}`;
}

export function filterBusinessTransactionsByPeriod(
  transactions: BusinessTransaction[],
  periodStart: string,
  periodEnd: string,
): BusinessTransaction[] {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  end.setHours(23, 59, 59, 999);
  return transactions
    .filter((tx) => {
      const d = new Date(tx.date);
      return d >= start && d <= end;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function escapeXmlCell(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function businessKindLabel(kind: BusinessTransaction["kind"], locale: Locale): string {
  const isRu = locale === "ru";
  switch (kind) {
    case "operating_income":
      return isRu ? "Доход бизнеса" : "Business income";
    case "operating_expense":
      return isRu ? "Расход бизнеса" : "Business expense";
    case "cushion_deposit":
      return isRu ? "В резерв бизнеса" : "Business reserve";
    case "tax_deposit":
      return isRu ? "На налоговый счёт" : "Tax account";
    case "family_withdrawal":
      return isRu ? "Вывод в семью" : "Family withdrawal";
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
}

function worksheetXml(rows: (string | number)[][]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell) => {
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c><v>${cell}</v></c>`;
          }
          return `<c t="inlineStr"><is><t>${escapeXmlCell(String(cell))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function concatZipParts(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function buildZip(files: { path: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { date, time } = dosDateTime();
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.path);
    const content = enc.encode(file.content);
    const crc = crc32(content);
    const localHeader = concatZipParts([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    parts.push(localHeader, content);

    centralParts.push(
      concatZipParts([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(time),
        u16(date),
        u32(crc),
        u32(content.length),
        u32(content.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += localHeader.length + content.length;
  }

  const central = concatZipParts(centralParts);
  const end = concatZipParts([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concatZipParts([...parts, central, end]);
}

function buildXlsxWorkbook(sheets: { name: string; rows: (string | number)[][] }[]): Uint8Array {
  const normalized = sheets.map((sheet, index) => ({
    ...sheet,
    name: sheetName(sheet.name) || `Sheet ${index + 1}`,
  }));
  const sheetOverrides = normalized
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const workbookSheets = normalized
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXmlCell(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  const rels = normalized
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");

  return buildZip([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    },
    ...normalized.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet.rows),
    })),
  ]);
}

export function buildBudgetExcelWorkbook(params: {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  businessTransactions: BusinessTransaction[];
  businessUnits: BusinessUnit[];
  businessAssets: BusinessAsset[];
  locale: Locale;
  periodStart: string;
  periodEnd: string;
}): Uint8Array {
  const {
    transactions,
    categories,
    businessTransactions,
    businessUnits,
    businessAssets,
    locale,
    periodStart,
    periodEnd,
  } = params;
  const isRu = locale === "ru";
  const businessUnitsById = new Map(businessUnits.map((unit) => [unit.id, unit]));
  const allBusinessUnitIds = Array.from(
    new Set([
      ...businessUnits.map((unit) => unit.id),
      ...businessTransactions.map((tx) => tx.unitId),
      ...businessAssets.map((asset) => asset.unitId),
    ]),
  );
  const exportBusinessUnits: BusinessUnit[] = allBusinessUnitIds.map((unitId, index) => {
    const unit = businessUnitsById.get(unitId);
    if (unit) return unit;
    return {
      id: unitId,
      name: isRu ? `Бизнес ${index + 1}` : `Business ${index + 1}`,
      color: "#6366f1",
      createdAt: "",
    };
  });
  const unitName = (unitId: string) =>
    exportBusinessUnits.find((unit) => unit.id === unitId)?.name ?? (isRu ? "Бизнес" : "Business");
  const familyIncome = sum(transactions.filter((tx) => tx.type === "income").map((tx) => tx.amount));
  const familyExpense = sum(transactions.filter((tx) => tx.type === "expense").map((tx) => tx.amount));
  const businessIncome = sum(
    businessTransactions.filter((tx) => tx.kind === "operating_income").map((tx) => tx.amount),
  );
  const businessExpense = sum(
    businessTransactions.filter((tx) => tx.kind === "operating_expense").map((tx) => tx.amount),
  );
  const reserveDeposits = sum(
    businessTransactions.filter((tx) => tx.kind === "cushion_deposit").map((tx) => tx.amount),
  );
  const taxDeposits = sum(
    businessTransactions.filter((tx) => tx.kind === "tax_deposit").map((tx) => tx.amount),
  );
  const familyWithdrawals = sum(
    businessTransactions.filter((tx) => tx.kind === "family_withdrawal").map((tx) => tx.amount),
  );
  const businessSummaryRows = exportBusinessUnits.flatMap((unit) => {
    const rows = businessTransactions.filter((tx) => tx.unitId === unit.id);
    const assets = businessAssets.filter((asset) => asset.unitId === unit.id);
    const unitIncome = sum(rows.filter((tx) => tx.kind === "operating_income").map((tx) => tx.amount));
    const unitExpense = sum(rows.filter((tx) => tx.kind === "operating_expense").map((tx) => tx.amount));
    const unitReserve = sum(rows.filter((tx) => tx.kind === "cushion_deposit").map((tx) => tx.amount));
    const unitTax = sum(rows.filter((tx) => tx.kind === "tax_deposit").map((tx) => tx.amount));
    const unitWithdrawal = sum(rows.filter((tx) => tx.kind === "family_withdrawal").map((tx) => tx.amount));
    return [[
      unit.name,
      unitIncome,
      unitExpense,
      unitIncome - unitExpense,
      unitReserve,
      unitTax,
      unitWithdrawal,
      rows.length,
      assets.length,
    ]];
  });

  const familyRows: (string | number)[][] = [
    isRu
      ? ["Дата", "Тип", "Сумма", "Категория", "Заметка", "Кто"]
      : ["Date", "Type", "Amount", "Category", "Note", "Owner"],
    ...(transactions.length
      ? transactions.map((tx) => [
          tx.date,
          tx.type === "income" ? (isRu ? "Доход" : "Income") : isRu ? "Расход" : "Expense",
          tx.amount,
          getCategoryLabel(tx.categoryId, categories, locale),
          tx.note ?? "",
          tx.owner === "partner" ? (isRu ? "Партнёр" : "Partner") : isRu ? "Я" : "Me",
        ])
      : [[isRu ? "Нет семейных операций за выбранный период" : "No family entries for selected period", "", "", "", "", ""]]),
  ];

  const businessRows: (string | number)[][] = [
    isRu
      ? ["Дата", "Бизнес", "Тип", "Сумма", "Заметка"]
      : ["Date", "Business", "Type", "Amount", "Note"],
    ...(businessTransactions.length
      ? businessTransactions.map((tx) => [
          tx.date,
          unitName(tx.unitId),
          businessKindLabel(tx.kind, locale),
          tx.amount,
          tx.note ?? "",
        ])
      : [[isRu ? "Нет бизнес-операций за выбранный период" : "No business entries for selected period", "", "", "", ""]]),
  ];

  const projectRows: (string | number)[][] = [
    isRu
      ? ["Бизнес", "Проект/актив", "Тип", "Капитал", "Плановый доход в месяц", "Часов в месяц"]
      : ["Business", "Project/asset", "Type", "Capital", "Planned monthly income", "Hours per month"],
    ...(businessAssets.length
      ? businessAssets.map((asset) => [
          unitName(asset.unitId),
          asset.name,
          asset.type,
          asset.capitalValue,
          asset.monthlyNet,
          asset.hoursPerMonth ?? "",
        ])
      : [[isRu ? "Проекты и активы пока не добавлены" : "No projects/assets yet", "", "", "", "", ""]]),
  ];

  const businessSummary: (string | number)[][] = [
    isRu
      ? ["Бизнес", "Выручка", "Расходы", "Прибыль", "В резерв", "На налоговый счёт", "Выведено в семью", "Операций", "Проектов/активов"]
      : ["Business", "Revenue", "Expenses", "Profit", "To reserve", "To tax account", "Withdrawn to family", "Entries", "Projects/assets"],
    ...(businessSummaryRows.length
      ? businessSummaryRows
      : [[isRu ? "Бизнесы пока не добавлены" : "No businesses yet", 0, 0, 0, 0, 0, 0, 0, 0]]),
  ];

  const metaRows: (string | number)[][] = [
    [isRu ? "Период" : "Period", `${periodStart} — ${periodEnd}`],
    [isRu ? "Семейных операций" : "Family entries", transactions.length],
    [isRu ? "Доход семьи" : "Family income", familyIncome],
    [isRu ? "Расходы семьи" : "Family expenses", familyExpense],
    [isRu ? "Итог семьи" : "Family net", familyIncome - familyExpense],
    [isRu ? "Бизнесов" : "Businesses", exportBusinessUnits.length],
    [isRu ? "Бизнес-операций" : "Business entries", businessTransactions.length],
    [isRu ? "Выручка бизнеса" : "Business revenue", businessIncome],
    [isRu ? "Расходы бизнеса" : "Business expenses", businessExpense],
    [isRu ? "Прибыль бизнеса" : "Business profit", businessIncome - businessExpense],
    [isRu ? "Переложено в резерв бизнеса" : "Moved to business reserve", reserveDeposits],
    [isRu ? "Переложено на налоговый счёт" : "Moved to tax account", taxDeposits],
    [isRu ? "Выведено из бизнеса в семью" : "Withdrawn from business to family", familyWithdrawals],
    [isRu ? "Проектов/активов" : "Projects/assets", businessAssets.length],
    [
      isRu ? "Что входит в файл" : "What is included",
      isRu
        ? "Семейные операции, список бизнесов, бизнес-операции и проекты/активы. Нули означают, что за выбранный период операций не было."
        : "Family entries, businesses, business entries, and projects/assets. Zero values mean there were no entries for the selected period.",
    ],
  ];

  return buildXlsxWorkbook([
    { name: isRu ? "Итог" : "Summary", rows: metaRows },
    { name: isRu ? "Семья" : "Family", rows: familyRows },
    { name: isRu ? "Бизнесы" : "Businesses", rows: businessSummary },
    { name: isRu ? "Бизнес" : "Business", rows: businessRows },
    { name: isRu ? "Итог бизнеса" : "Business summary", rows: businessSummary },
    { name: isRu ? "Проекты" : "Projects", rows: projectRows },
  ]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildImagePdf(pages: { jpeg: Uint8Array; width: number; height: number }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;

  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const startObject = (id: number) => {
    offsets[id] = cursor;
    push(`${id} 0 obj\n`);
  };

  const pageW = 595.28;
  const pageH = 841.89;
  const pageIds = pages.map((_, index) => 3 + index * 3);
  const imageIds = pages.map((_, index) => 4 + index * 3);
  const contentIds = pages.map((_, index) => 5 + index * 3);
  const objectCount = 2 + pages.length * 3;

  push("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const imageId = imageIds[index];
    const contentId = contentIds[index];
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/${imageName} Do\nQ\n`;

    startObject(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);

    startObject(imageId);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push("\nendstream\nendobj\n");

    startObject(contentId);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefAt = cursor;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= objectCount; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);

  const bytes = concatBytes(chunks);
  const pdfBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  bold = false,
): void {
  ctx.font = `${bold ? "700 " : ""}24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(ellipsize(ctx, text, width), x, y);
}

export function buildTransactionsPdfBlob(params: {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  businessTransactions: BusinessTransaction[];
  businessUnits: BusinessUnit[];
  locale: Locale;
  periodStart: string;
  periodEnd: string;
  title: string;
}): Blob {
  const {
    transactions,
    categories,
    businessTransactions,
    businessUnits,
    locale,
    periodStart,
    periodEnd,
    title,
  } = params;
  const isRu = locale === "ru";
  const unitName = (unitId: string) =>
    businessUnits.find((unit) => unit.id === unitId)?.name ?? (isRu ? "Бизнес" : "Business");
  const rows = [
    ...transactions.map((tx) => ({
      date: formatIsoDate(tx.date, locale),
      amount: `${tx.type === "income" ? "+" : "−"}${tx.amount.toLocaleString(isRu ? "ru-RU" : "en-US")} ₽`,
      category: getCategoryLabel(tx.categoryId, categories, locale),
      note: tx.note ?? "",
    })),
    ...businessTransactions.map((tx) => ({
      date: formatIsoDate(tx.date, locale),
      amount: `${tx.kind === "operating_expense" || tx.kind === "family_withdrawal" || tx.kind === "tax_deposit" ? "−" : "+"}${tx.amount.toLocaleString(isRu ? "ru-RU" : "en-US")} ₽`,
      category: `${isRu ? "Бизнес" : "Business"}: ${unitName(tx.unitId)}`,
      note: `${businessKindLabel(tx.kind, locale)}${tx.note ? ` — ${tx.note}` : ""}`,
    })),
  ];

  const width = 1240;
  const height = 1754;
  const margin = 72;
  const rowH = 54;
  const headerH = 190;
  const footerH = 70;
  const perPage = Math.max(1, Math.floor((height - headerH - footerH) / rowH));
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#111827";
    ctx.font = "700 38px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(title, margin, 86);
    ctx.fillStyle = "#4b5563";
    ctx.font = "24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(
      `${formatIsoDate(periodStart, locale)} — ${formatIsoDate(periodEnd, locale)} · ${rows.length} ${isRu ? "операций" : "entries"}`,
      margin,
      126,
    );

    const top = headerH;
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(margin, top - 40, width - margin * 2, 44);
    ctx.fillStyle = "#111827";
    drawCell(ctx, isRu ? "Дата" : "Date", margin + 16, top - 11, 150, true);
    drawCell(ctx, isRu ? "Сумма" : "Amount", margin + 180, top - 11, 180, true);
    drawCell(ctx, isRu ? "Категория" : "Category", margin + 380, top - 11, 260, true);
    drawCell(ctx, isRu ? "Заметка" : "Note", margin + 660, top - 11, 480, true);

    const pageRows = rows.slice(pageIndex * perPage, pageIndex * perPage + perPage);
    pageRows.forEach((row, i) => {
      const y = top + i * rowH;
      ctx.strokeStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.moveTo(margin, y + 15);
      ctx.lineTo(width - margin, y + 15);
      ctx.stroke();
      ctx.fillStyle = "#111827";
      drawCell(ctx, row.date, margin + 16, y + 52, 150);
      drawCell(ctx, row.amount, margin + 180, y + 52, 180, true);
      drawCell(ctx, row.category, margin + 380, y + 52, 260);
      drawCell(ctx, row.note, margin + 660, y + 52, 480);
    });

    ctx.fillStyle = "#6b7280";
    ctx.font = "20px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(`Просто Бюджет · ${pageIndex + 1}/${pageCount}`, margin, height - 42);
    pages.push({ jpeg: dataUrlBytes(canvas.toDataURL("image/jpeg", 0.92)), width, height });
  }

  return buildImagePdf(pages);
}

export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

async function shareBlobFile(filename: string, blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (!nav.share || typeof File === "undefined") return false;
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  try {
    if (nav.canShare && !nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title: filename });
    return true;
  } catch {
    return false;
  }
}

function isTelegramOrMobileWebView(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function saveBlobFile(
  filename: string,
  blob: Blob,
  options: { openBlobInWebView?: boolean } = {},
): Promise<"shared" | "downloaded" | "opened" | "failed"> {
  if (isTelegramOrMobileWebView() && (await shareBlobFile(filename, blob))) {
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  let opened = false;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (options.openBlobInWebView !== false && isTelegramOrMobileWebView()) {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      opened = Boolean(win);
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return opened ? "opened" : "downloaded";
  } catch {
    URL.revokeObjectURL(url);
  }

  if (await shareBlobFile(filename, blob)) return "shared";
  return "failed";
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  downloadBlobFile(filename, new Blob([content], { type: mime }));
}

export function openTransactionsPdfPrint(params: {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  locale: Locale;
  periodStart: string;
  periodEnd: string;
  title: string;
}): void {
  const { transactions, categories, locale, periodStart, periodEnd, title } = params;
  const rows = transactions
    .map((tx) => {
      const type = tx.type === "income" ? "+" : "−";
      const cat = getCategoryLabel(tx.categoryId, categories, locale);
      const note = tx.note?.trim() ? ` — ${tx.note}` : "";
      return `<tr>
        <td>${formatIsoDate(tx.date, locale)}</td>
        <td>${type}${tx.amount.toLocaleString(locale === "ru" ? "ru-RU" : "en-US")} ₽</td>
        <td>${cat}</td>
        <td>${note}</td>
      </tr>`;
    })
    .join("");

  const periodLabel = `${formatIsoDate(periodStart, locale)} — ${formatIsoDate(periodEnd, locale)}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#111}
h1{font-size:18px;margin:0 0 4px}
p{color:#555;font-size:12px;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
th{background:#f5f5f5}
@media print{body{padding:12px}}
</style></head><body>
<h1>${title}</h1>
<p>${periodLabel} · ${transactions.length} ${locale === "ru" ? "записей" : "entries"}</p>
<table><thead><tr>
<th>${locale === "ru" ? "Дата" : "Date"}</th>
<th>${locale === "ru" ? "Сумма" : "Amount"}</th>
<th>${locale === "ru" ? "Категория" : "Category"}</th>
<th>${locale === "ru" ? "Заметка" : "Note"}</th>
</tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
