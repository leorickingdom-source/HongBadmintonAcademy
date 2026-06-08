import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Client can later swap the colour/logo; these are sensible defaults.
const BRAND = rgb(0.086, 0.639, 0.29); // #16a34a
const INK = rgb(0.059, 0.09, 0.165); // #0f172a
const MUTED = rgb(0.42, 0.45, 0.5);
const LIGHT = rgb(0.95, 0.96, 0.97);
const WHITE = rgb(1, 1, 1);

export interface ScorecardPdfData {
  academyName: string;
  studentName: string;
  periodLabel: string;
  avgScore: number | null;
  attendancePct: number | null;
  sessionsAttended: number;
  sessionsTotal: number;
  rewardPoints: number;
  criteria: { name: string; score: number; max: number }[];
  comment?: string | null;
  generatedAt: string;
}

export async function renderScorecardPdf(data: ScorecardPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 48; // margin

  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    f = font,
    color = INK,
  ) => page.drawText(s, { x, y, size, font: f, color });

  // ── Header band ──────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: BRAND });
  text(data.academyName, M, H - 56, 22, bold, WHITE);
  text("Monthly Score Card", M, H - 82, 13, font, WHITE);
  text(data.periodLabel, W - M - bold.widthOfTextAtSize(data.periodLabel, 13), H - 82, 13, bold, WHITE);

  // ── Student ──────────────────────────────────────────────────
  let y = H - 150;
  text("Student", M, y, 10, font, MUTED);
  text(data.studentName, M, y - 20, 20, bold);
  y -= 64;

  // ── Metric cards ─────────────────────────────────────────────
  const gap = 14;
  const cardW = (W - M * 2 - gap * 2) / 3;
  const cardH = 78;
  const metrics: [string, string][] = [
    ["Avg skill score", data.avgScore != null ? data.avgScore.toFixed(1) + "%" : "—"],
    [
      "Attendance",
      data.attendancePct != null
        ? `${data.attendancePct}%`
        : "—",
    ],
    ["Reward points", String(data.rewardPoints)],
  ];
  metrics.forEach(([label, value], i) => {
    const x = M + i * (cardW + gap);
    page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: LIGHT, borderColor: rgb(0.89, 0.91, 0.93), borderWidth: 1 });
    text(label, x + 14, y - 24, 10, font, MUTED);
    text(value, x + 14, y - 56, 26, bold, BRAND);
  });
  // sub line for attendance detail
  text(
    `Sessions attended: ${data.sessionsAttended} / ${data.sessionsTotal}`,
    M,
    y - cardH - 18,
    10,
    font,
    MUTED,
  );
  y -= cardH + 50;

  // ── Skills breakdown ─────────────────────────────────────────
  text("Skills breakdown", M, y, 13, bold);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
  y -= 22;

  if (data.criteria.length === 0) {
    text("No assessment recorded this period.", M, y, 11, font, MUTED);
    y -= 20;
  } else {
    const barX = W - M - 200;
    const barW = 200;
    for (const c of data.criteria) {
      const pct = c.max > 0 ? Math.max(0, Math.min(1, c.score / c.max)) : 0;
      text(c.name, M, y, 11, font, INK);
      const scoreLabel = `${c.score} / ${c.max}`;
      text(scoreLabel, barX - 8 - font.widthOfTextAtSize(scoreLabel, 10), y, 10, font, MUTED);
      // bar
      page.drawRectangle({ x: barX, y: y - 2, width: barW, height: 8, color: LIGHT });
      page.drawRectangle({ x: barX, y: y - 2, width: barW * pct, height: 8, color: BRAND });
      y -= 26;
      if (y < 160) break; // keep within page
    }
  }

  // ── Coach comment ────────────────────────────────────────────
  if (data.comment) {
    y -= 10;
    text("Coach comment", M, y, 13, bold);
    y -= 22;
    for (const line of wrap(data.comment, font, 11, W - M * 2)) {
      text(line, M, y, 11, font, INK);
      y -= 16;
      if (y < 90) break;
    }
  }

  // ── Footer ───────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
  text(`Generated ${data.generatedAt}`, M, 48, 9, font, MUTED);
  const f = data.academyName;
  text(f, W - M - font.widthOfTextAtSize(f, 9), 48, 9, font, MUTED);

  return doc.save();
}

// Greedy word-wrap to a pixel width.
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
  return lines.slice(0, 8);
}
