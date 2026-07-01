import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/household-auth";
import { buildBudgetExcelWorkbook, filterBusinessTransactionsByPeriod, filterTransactionsByPeriod } from "@/lib/export/transactions-export";
import { fetchUserBusinessPayload } from "@/lib/business/db";
import { isDatabaseConfigured } from "@/lib/db";
import { buildSyncPayload, assertMember } from "@/lib/household/service";
import type { Locale, Transaction, CategoryDefinition } from "@/types";
import type { BusinessTransaction, BusinessUnit } from "@/lib/business/types";
import { getCategoryLabel } from "@/lib/categories";

export const dynamic = "force-dynamic";

function sessionFromRequest(req: NextRequest) {
  const headerSession = requireSession(req);
  if (headerSession) return headerSession;
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) return null;
  const authReq = new NextRequest(req.url, {
    headers: { authorization: `Bearer ${token}` },
  });
  return requireSession(authReq);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function encodeContentDisposition(filename: string): string {
  return `attachment; filename="${safeFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function escapeSvg(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfHexText(input: string): string {
  const bytes: number[] = [];
  for (const ch of input.replace(/\r?\n/g, " ")) {
    const code = ch.codePointAt(0) ?? 32;
    if (code > 0xffff) continue;
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return Buffer.from(bytes).toString("hex").toUpperCase();
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

type ExportPdfRow = {
  date: string;
  amount: string;
  category: string;
  note: string;
};

function makeRows(params: {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  businessTransactions: BusinessTransaction[];
  businessUnits: BusinessUnit[];
  locale: Locale;
}): ExportPdfRow[] {
  const isRu = params.locale === "ru";
  const unitName = (unitId: string) =>
    params.businessUnits.find((unit) => unit.id === unitId)?.name ?? (isRu ? "Бизнес" : "Business");

  return [
    ...params.transactions.map((tx) => ({
      date: tx.date,
      amount: `${tx.type === "income" ? "+" : "-"}${tx.amount} RUB`,
      category: getCategoryLabel(tx.categoryId, params.categories, params.locale),
      note: tx.note ?? "",
    })),
    ...params.businessTransactions.map((tx) => ({
      date: tx.date,
      amount: `${tx.kind === "operating_expense" || tx.kind === "family_withdrawal" || tx.kind === "tax_deposit" ? "-" : "+"}${tx.amount} RUB`,
      category: `${isRu ? "Бизнес" : "Business"}: ${unitName(tx.unitId)}`,
      note: `${businessKindLabel(tx.kind, params.locale)}${tx.note ? ` - ${tx.note}` : ""}`,
    })),
  ];
}

function makeTextPdf(params: {
  rows: ExportPdfRow[];
  locale: Locale;
  periodStart: string;
  periodEnd: string;
}): Buffer {
  const isRu = params.locale === "ru";
  const lines = [
    "Prosto Budget",
    `${params.periodStart} - ${params.periodEnd}`,
    `${isRu ? "Operatsiy" : "Entries"}: ${params.rows.length}`,
    "",
    ...(params.rows.length
      ? params.rows.map((row) => `${row.date} | ${row.amount} | ${row.category} | ${row.note}`.slice(0, 112))
      : [isRu ? "Za vybrannyy period operatsiy net" : "No entries for selected period"]),
  ];

  const pageW = 595;
  const pageH = 842;
  const margin = 40;
  const lineH = 14;
  const perPage = Math.max(1, Math.floor((pageH - margin * 2) / lineH));
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / perPage)) }, (_, index) =>
    lines.slice(index * perPage, index * perPage + perPage),
  );

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const cidInfoId = add("<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>");
  const fontDescriptorId = add("<< /Type /FontDescriptor /FontName /ArialUnicodeMS /Flags 4 /FontBBox [0 -250 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 >>");
  const cidFontId = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ArialUnicodeMS /CIDSystemInfo ${cidInfoId} 0 R /FontDescriptor ${fontDescriptorId} 0 R /DW 500 >>`);
  const fontId = add(`<< /Type /Font /Subtype /Type0 /BaseFont /ArialUnicodeMS /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] >>`);
  const pageIds: number[] = [];
  for (const pageLines of pages) {
    const content = [
      "BT",
      "/F1 10 Tf",
      `${margin} ${pageH - margin} Td`,
      ...pageLines.flatMap((line, index) => [
        index === 0 ? "" : `0 -${lineH} Td`,
        `<${pdfHexText(line)}> Tj`,
      ]).filter(Boolean),
      "ET",
    ].join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets[i + 1] = Buffer.byteLength(chunks.join(""));
    chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xref = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objects.length; i++) {
    chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.from(chunks.join(""), "binary");
}

function concatBuffers(parts: Buffer[]): Buffer {
  return Buffer.concat(parts);
}

function makeImagePdf(pages: { jpeg: Buffer; width: number; height: number }[]): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let cursor = 0;

  const push = (part: string | Buffer) => {
    const buffer = typeof part === "string" ? Buffer.from(part, "binary") : part;
    chunks.push(buffer);
    cursor += buffer.length;
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
    push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xref = cursor;
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objectCount; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return concatBuffers(chunks);
}

function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

function rowSvg(row: ExportPdfRow, y: number): string {
  return `
    <line x1="72" y1="${y - 28}" x2="1168" y2="${y - 28}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="88" y="${y}" class="cell">${escapeSvg(row.date)}</text>
    <text x="252" y="${y}" class="cell bold">${escapeSvg(row.amount)}</text>
    <text x="452" y="${y}" class="cell">${escapeSvg(clipText(row.category, 28))}</text>
    <text x="732" y="${y}" class="cell">${escapeSvg(clipText(row.note, 52))}</text>
  `;
}

async function makePdf(params: {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  businessTransactions: BusinessTransaction[];
  businessUnits: BusinessUnit[];
  locale: Locale;
  periodStart: string;
  periodEnd: string;
}): Promise<Buffer> {
  const rows = makeRows(params);
  return makeTextPdf({
    rows,
    locale: params.locale,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });
}

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") === "pdf" ? "pdf" : "xlsx";
  const locale: Locale = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ru";
  const from = req.nextUrl.searchParams.get("from")?.slice(0, 10) || new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to")?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  await assertMember(session.userId, session.householdId);
  const [sync, business] = await Promise.all([
    buildSyncPayload(session.householdId, session.userId),
    fetchUserBusinessPayload(session.userId),
  ]);
  const transactions = filterTransactionsByPeriod(sync.transactions, from, to);
  const businessTransactions = filterBusinessTransactionsByPeriod(business?.transactions ?? [], from, to);
  const businessUnits = business?.units ?? [];
  const businessAssets = business?.assets ?? [];
  const base = `prosto-budget-${from}_${to}`;

  if (type === "pdf") {
    const pdf = await makePdf({
      transactions,
      categories: sync.categories,
      businessTransactions,
      businessUnits,
      locale,
      periodStart: from,
      periodEnd: to,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": encodeContentDisposition(`${base}.pdf`),
        "Cache-Control": "no-store",
      },
    });
  }

  const xlsx = buildBudgetExcelWorkbook({
    transactions,
    categories: sync.categories,
    businessTransactions,
    businessUnits,
    businessAssets,
    locale,
    periodStart: from,
    periodEnd: to,
  });
  return new NextResponse(Buffer.from(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": encodeContentDisposition(`${base}.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
