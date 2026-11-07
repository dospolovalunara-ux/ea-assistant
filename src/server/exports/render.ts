import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

/** Универсальная модель отчёта: заголовок, блоки текста и таблицы. Значения берутся из базы как есть. */
export interface ReportTable {
  title?: string;
  columns: string[];
  rows: (string | number | null)[][];
  /** Индексы колонок с суммами — в XLSX записываются числом. */
  moneyColumns?: number[];
}
export interface ReportDoc {
  title: string;
  subtitle?: string;
  watermark?: string;
  sections: ({ kind: "text"; heading?: string; lines: string[] } | ({ kind: "table" } & ReportTable))[];
}

const FONT = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");

export async function toXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXECUTIVE AI";
  const tables = doc.sections.filter((s) => s.kind === "table") as ({ kind: "table" } & ReportTable)[];
  const texts = doc.sections.filter((s) => s.kind === "text") as { kind: "text"; heading?: string; lines: string[] }[];
  if (texts.length || !tables.length) {
    const ws = wb.addWorksheet("Сводка");
    ws.addRow([doc.title]).font = { bold: true, size: 14 };
    if (doc.subtitle) ws.addRow([doc.subtitle]);
    for (const t of texts) {
      ws.addRow([]);
      if (t.heading) ws.addRow([t.heading]).font = { bold: true };
      for (const l of t.lines) ws.addRow([l]);
    }
    ws.getColumn(1).width = 90;
  }
  tables.forEach((t, i) => {
    const ws = wb.addWorksheet((t.title ?? `Таблица ${i + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    const header = ws.addRow(t.columns);
    header.font = { bold: true };
    for (const r of t.rows) {
      ws.addRow(r.map((v, ci) => (t.moneyColumns?.includes(ci) && typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v ?? "")));
    }
    t.columns.forEach((_, ci) => {
      ws.getColumn(ci + 1).width = Math.min(50, Math.max(12, ...t.rows.map((r) => String(r[ci] ?? "").length + 2), t.columns[ci]!.length + 2));
      if (t.moneyColumns?.includes(ci)) ws.getColumn(ci + 1).numFmt = "#,##0.00";
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(doc: ReportDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 48, info: { Title: doc.title, Creator: "EXECUTIVE AI" } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.registerFont("r", FONT);
    pdf.registerFont("b", FONT_BOLD);
    const mark = () => {
      if (!doc.watermark) return;
      pdf.save().font("b").fontSize(60).fillColor("#d0d0d0").opacity(0.35).rotate(-35, { origin: [300, 420] }).text(doc.watermark, 60, 380, { width: 500, align: "center" }).restore();
      pdf.opacity(1).fillColor("#000");
    };
    mark();
    pdf.on("pageAdded", mark);
    pdf.font("b").fontSize(16).text(doc.title);
    if (doc.subtitle) pdf.font("r").fontSize(10).fillColor("#555").text(doc.subtitle).fillColor("#000");
    pdf.moveDown();
    for (const s of doc.sections) {
      if (s.kind === "text") {
        if (s.heading) pdf.font("b").fontSize(12).text(s.heading).moveDown(0.3);
        pdf.font("r").fontSize(10);
        for (const l of s.lines) pdf.text(l, { paragraphGap: 2 });
        pdf.moveDown();
        continue;
      }
      if (s.title) pdf.font("b").fontSize(12).text(s.title).moveDown(0.3);
      const width = pdf.page.width - 96;
      const colW = width / s.columns.length;
      const row = (cells: (string | number | null)[], bold: boolean) => {
        const h = Math.max(...cells.map((c) => pdf.font(bold ? "b" : "r").fontSize(8.5).heightOfString(String(c ?? ""), { width: colW - 6 }))) + 6;
        if (pdf.y + h > pdf.page.height - 48) pdf.addPage();
        const y = pdf.y;
        cells.forEach((c, i) => pdf.font(bold ? "b" : "r").fontSize(8.5).text(String(c ?? ""), 48 + i * colW + 3, y + 3, { width: colW - 6 }));
        pdf.moveTo(48, y + h).lineTo(48 + width, y + h).strokeColor("#ccc").lineWidth(0.5).stroke();
        pdf.x = 48;
        pdf.y = y + h;
      };
      row(s.columns, true);
      for (const r of s.rows) row(r, false);
      pdf.moveDown();
    }
    pdf.end();
  });
}

export async function toDocx(doc: ReportDoc): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE })];
  if (doc.watermark) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.watermark, bold: true, color: "B42318", size: 28 })] }));
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: "555555" })] }));
  for (const s of doc.sections) {
    if (s.kind === "text") {
      if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }));
      for (const l of s.lines) children.push(new Paragraph({ text: l }));
      continue;
    }
    if (s.title) children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_2 }));
    const cell = (t: string | number | null, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), bold })] })] });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: s.columns.map((c) => cell(c, true)) }), ...s.rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) }))],
      }),
    );
  }
  return Packer.toBuffer(new Document({ creator: "EXECUTIVE AI", title: doc.title, sections: [{ children }] }));
}

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
} as const;
