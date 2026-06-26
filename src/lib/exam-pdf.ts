import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BRAND = rgb(0.059, 0.431, 0.337); // #0F6E56 deep teal
const BRAND_LIGHT = rgb(0.882, 0.961, 0.933);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.42, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);

// Band tint for the total hero.
const BAND_FILL: Record<string, ReturnType<typeof rgb>> = {
  excellent: rgb(0.886, 0.961, 0.906),
  pass: rgb(0.882, 0.929, 0.98),
  borderline: rgb(0.99, 0.953, 0.863),
  fail: rgb(0.996, 0.898, 0.898),
};
const BAND_INK: Record<string, ReturnType<typeof rgb>> = {
  excellent: rgb(0.086, 0.502, 0.318),
  pass: rgb(0.137, 0.392, 0.776),
  borderline: rgb(0.706, 0.486, 0.043),
  fail: rgb(0.8, 0.165, 0.165),
};
// Per-section accent.
const SEC_COLOR: Record<string, ReturnType<typeof rgb>> = {
  technical: rgb(0.729, 0.459, 0.09),
  footwork: rgb(0.216, 0.541, 0.867),
  tactical: rgb(0.114, 0.62, 0.459),
  physical: rgb(0.553, 0.361, 0.78),
};
const SEC_TRACK: Record<string, ReturnType<typeof rgb>> = {
  technical: rgb(0.98, 0.933, 0.855),
  footwork: rgb(0.902, 0.945, 0.984),
  tactical: rgb(0.882, 0.961, 0.933),
  physical: rgb(0.937, 0.91, 0.973),
};

export interface ExamPdfSection {
  key: string;
  label: string;
  subtotal: number;
  max: number;
  items: { label: string; score: number; max: number }[];
}
export interface ExamPdfData {
  academyName: string;
  studentName: string;
  windowLabel: string | null;
  examDate: string;
  levelLine: string;     // e.g. "Level 2 → Level 3 (Intermediate)" or "Level 6 · Elite review"
  total: number;
  bandKey: string;
  bandLabel: string;
  decisionLabel: string;
  sections: ExamPdfSection[];
  comment?: string | null;
  nextTarget?: string | null;
  generatedAt: string;
}

export async function renderExamPdf(data: ExamPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 48;

  const text = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x, y, size, font: f, color });
  const rightText = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y, size, font: f, color });

  // ── Header band ──────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: BRAND });
  text(data.academyName, M, H - 52, 20, bold, WHITE);
  text("Promotion Exam Report", M, H - 76, 12, font, BRAND_LIGHT);
  if (data.windowLabel) rightText(data.windowLabel, W - M, H - 76, 12, bold, WHITE);

  // ── Student + level ──────────────────────────────────────────
  let y = H - 138;
  text("Student", M, y, 9, font, MUTED);
  text(data.studentName, M, y - 19, 19, bold);
  rightText(data.levelLine, W - M, y - 5, 12, bold, BRAND);
  y -= 52;

  // ── Total hero + band ────────────────────────────────────────
  const heroH = 80;
  const fill = BAND_FILL[data.bandKey] ?? BRAND_LIGHT;
  const bink = BAND_INK[data.bandKey] ?? BRAND;
  page.drawRectangle({ x: M, y: y - heroH, width: W - M * 2, height: heroH, color: fill });
  text("Total score", M + 16, y - 22, 10, font, bink);
  text(String(data.total), M + 16, y - 58, 34, bold, bink);
  text("/ 100", M + 16 + bold.widthOfTextAtSize(String(data.total), 34) + 6, y - 58, 12, font, bink);
  rightText(data.bandLabel, W - M - 16, y - 30, 18, bold, bink);
  rightText(`Decision: ${data.decisionLabel}`, W - M - 16, y - 54, 10, font, bink);
  y -= heroH + 26;

  // ── Sections ─────────────────────────────────────────────────
  const barX = W - M - 150;
  const barW = 150;
  for (const sec of data.sections) {
    const color = SEC_COLOR[sec.key] ?? BRAND;
    const track = SEC_TRACK[sec.key] ?? BRAND_LIGHT;
    text(sec.label, M, y, 12, bold, color);
    rightText(`${sec.subtotal}/${sec.max}`, W - M, y, 11, bold, color);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.89, 0.91, 0.93) });
    y -= 17;
    for (const it of sec.items) {
      const pct = it.max ? Math.max(0, Math.min(1, it.score / it.max)) : 0;
      text(it.label, M, y, 10, font, INK);
      rightText(`${it.score}/${it.max}`, barX - 8, y, 9.5, font, MUTED);
      page.drawRectangle({ x: barX, y: y - 2, width: barW, height: 6, color: track });
      page.drawRectangle({ x: barX, y: y - 2, width: barW * pct, height: 6, color });
      y -= 19;
    }
    y -= 8;
  }

  const footer = () => {
    page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
    text("Excellent 80+  •  Pass 70+  •  Borderline 60+  •  Fail <60  ·  >=70 promotes", M, 48, 9, font, MUTED);
    rightText(`Generated ${data.generatedAt}`, W - M, 48, 9, font, MUTED);
  };
  const newPage = () => {
    footer();
    page = doc.addPage([595.28, 841.89]);
    y = H - 60;
  };

  if (data.comment) {
    if (y < 130) newPage();
    text("Coach comment", M, y, 12, bold);
    y -= 19;
    for (const line of wrap(data.comment, font, 11, W - M * 2)) {
      if (y < 90) newPage();
      text(line, M, y, 11, font, INK);
      y -= 16;
    }
    y -= 10;
  }
  if (data.nextTarget) {
    if (y < 110) newPage();
    text("Next target", M, y, 12, bold);
    y -= 19;
    for (const line of wrap(data.nextTarget, font, 11, W - M * 2)) {
      if (y < 90) newPage();
      text(line, M, y, 11, font, INK);
      y -= 16;
    }
  }

  footer();
  return doc.save();
}

function wrap(s: string, font: any, size: number, maxW: number): string[] {
  const words = s.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 16);
}
