import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BRAND = rgb(0.059, 0.431, 0.337);
const BRAND_LIGHT = rgb(0.882, 0.961, 0.933);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.42, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);
const DOT_ON = rgb(0.086, 0.502, 0.318);
const DOT_OFF = rgb(0.85, 0.87, 0.89);

export interface MonthlyCardMonth {
  label: string;
  attendancePct: number | null;
  avgRating: number | null;
  fitness: number | null;
  skills: number | null;
  attitude: number | null;
  comment: string | null;
  points: number;
}
export interface MonthlyCardData {
  academyName: string;
  studentName: string;
  branchName: string | null;
  levelLine: string;
  months: MonthlyCardMonth[];   // newest first
  generatedAt: string;
}

const clean = (s: string): string =>
  (s ?? "").replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—―]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");

export async function renderMonthlyCardPdf(d: MonthlyCardData): Promise<Uint8Array> {
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
  const dotRow = (v: number | null, x: number, y: number) => {
    for (let n = 1; n <= 5; n++) {
      page.drawCircle({ x: x + (n - 1) * 12, y: y + 3, size: 3.5, color: v && n <= v ? DOT_ON : DOT_OFF });
    }
  };

  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: BRAND });
  text(d.academyName, M, H - 52, 20, bold, WHITE);
  text("Monthly Progress Card", M, H - 76, 12, font, BRAND_LIGHT);
  if (d.branchName) rightText(d.branchName, W - M, H - 76, 12, bold, WHITE);

  let y = H - 140;
  text("Student", M, y, 9, font, MUTED);
  text(d.studentName, M, y - 18, 18, bold);
  rightText(d.levelLine, W - M, y - 4, 12, bold, BRAND);
  y -= 52;

  const dims: [string, keyof MonthlyCardMonth][] = [["Fitness", "fitness"], ["Skills", "skills"], ["Attitude", "attitude"]];
  for (const m of d.months) {
    const blockH = 118;
    page.drawRectangle({ x: M, y: y - blockH, width: W - M * 2, height: blockH, color: rgb(0.98, 0.98, 0.99), borderColor: rgb(0.9, 0.92, 0.94), borderWidth: 1 });
    text(m.label, M + 14, y - 22, 13, bold);
    rightText(m.points > 0 ? `+${m.points} pts` : "", W - M - 14, y - 22, 11, bold, BRAND);
    text(`Attendance: ${m.attendancePct == null ? "-" : m.attendancePct + "%"}`, M + 14, y - 42, 10, font, MUTED);
    if (m.avgRating != null) text(`Avg session rating: ${m.avgRating}/5`, M + 170, y - 42, 10, font, MUTED);

    let ry = y - 62;
    for (const [label, key] of dims) {
      text(label, M + 14, ry, 10, font, INK);
      dotRow(m[key] as number | null, M + 90, ry);
      ry -= 16;
    }
    if (m.comment) {
      const c = clean(m.comment);
      const max = W - M * 2 - 28;
      const words = c.split(" ");
      let line = "";
      for (const w of words) {
        if (font.widthOfTextAtSize(line + " " + w, 9) > max) break;
        line = line ? line + " " + w : w;
      }
      text('"' + line + (line.length < c.length ? '...' : '') + '"', M + 200, y - 62, 9, font, MUTED);
    }
    y -= blockH + 14;
  }

  page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
  text("Fitness / Skills / Attitude rated 1-5 by the coach each month.", M, 48, 9, font, MUTED);
  rightText(`Generated ${d.generatedAt}`, W - M, 48, 9, font, MUTED);
  return doc.save();
}
