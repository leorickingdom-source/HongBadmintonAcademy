import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BRAND = rgb(0.059, 0.431, 0.337);
const BRAND_LIGHT = rgb(0.882, 0.961, 0.933);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.42, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);
const STATUS_INK: Record<string, ReturnType<typeof rgb>> = {
  paid: rgb(0.086, 0.502, 0.318),
  unpaid: rgb(0.706, 0.486, 0.043),
  overdue: rgb(0.8, 0.165, 0.165),
  canceled: rgb(0.42, 0.45, 0.5),
  refunded: rgb(0.42, 0.45, 0.5),
  draft: rgb(0.42, 0.45, 0.5),
};

export interface InvoicePdfData {
  academyName: string;
  branchName: string | null;
  invoiceNo: string;
  status: string;
  studentName: string;
  parentName: string | null;
  description: string;
  periodMonth: string | null;
  dueDate: string | null;
  paidAt: string | null;
  amount: string;   // formatted with currency
  academyPhone?: string | null;
  generatedAt: string;
}

const clean = (s: string): string =>
  (s ?? "").replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—―]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  const text = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(clean(s), { x, y, size, font: f, color });
  const rightText = (s: string, x: number, y: number, size: number, f = font, color = INK) => {
    const c = clean(s);
    page.drawText(c, { x: x - f.widthOfTextAtSize(c, size), y, size, font: f, color });
  };

  // header
  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: BRAND });
  text(d.academyName, M, H - 52, 20, bold, WHITE);
  text(d.branchName ? `Invoice · ${d.branchName}` : "Invoice", M, H - 76, 12, font, BRAND_LIGHT);
  rightText(d.invoiceNo, W - M, H - 76, 12, bold, WHITE);

  // bill to
  let y = H - 140;
  text("Billed to", M, y, 9, font, MUTED);
  text(d.parentName ?? d.studentName, M, y - 18, 15, bold);
  text(`Student: ${d.studentName}`, M, y - 36, 11, font, MUTED);
  rightText("Status", W - M, y, 9, font, MUTED);
  rightText(d.status.toUpperCase(), W - M, y - 18, 14, bold, STATUS_INK[d.status] ?? INK);
  y -= 68;

  // amount hero
  const heroH = 78;
  page.drawRectangle({ x: M, y: y - heroH, width: W - M * 2, height: heroH, color: BRAND_LIGHT });
  text("Amount due", M + 16, y - 24, 10, font, BRAND);
  text(d.amount, M + 16, y - 58, 30, bold, BRAND);
  if (d.dueDate) rightText(`Due ${d.dueDate}`, W - M - 16, y - 30, 12, bold, BRAND);
  if (d.paidAt) rightText(`Paid ${d.paidAt}`, W - M - 16, y - 50, 10, font, BRAND);
  y -= heroH + 30;

  // details
  const row = (label: string, val: string) => {
    text(label, M, y, 11, font, MUTED);
    rightText(val, W - M, y, 11, font, INK);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.89, 0.91, 0.93) });
    y -= 18;
  };
  row("Description", d.description);
  if (d.periodMonth) row("Billing period", d.periodMonth);
  row("Invoice no.", d.invoiceNo);
  row("Amount", d.amount);

  // footer
  page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
  text(d.academyPhone ? `Questions? ${d.academyPhone}` : "Thank you.", M, 48, 9, font, MUTED);
  rightText(`Generated ${d.generatedAt}`, W - M, 48, 9, font, MUTED);
  return doc.save();
}
