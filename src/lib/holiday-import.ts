import "server-only";
import { inflateRawSync } from "zlib";

// Parse an uploaded holidays file (CSV or XLSX) into { date: YYYY-MM-DD, name }.
// Two columns expected: date, name. A header row (containing "date"/"name") is
// skipped. Excel date serials are converted. Unparseable rows are dropped.

export interface ParsedHoliday {
  date: string;
  name: string;
}

const XML_ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
function unxml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENT[m] ?? m);
}

// Excel serial day (1900 date system, with the well-known 1900 leap-year quirk)
// → YYYY-MM-DD. Epoch base is 1899-12-30.
function serialToYmd(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Coerce a raw cell into YYYY-MM-DD, or null if it isn't a date.
function toYmd(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d+(\.\d+)?$/.test(v)) return serialToYmd(Number(v)); // Excel serial
  const d = new Date(v); // e.g. "1 Jan 2026", "2026/01/01"
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalize(rows: string[][]): ParsedHoliday[] {
  const out: ParsedHoliday[] = [];
  for (const row of rows) {
    const cells = row.filter((c) => c != null && String(c).trim() !== "");
    if (cells.length < 2) continue;
    const [a, b] = cells;
    if (/date/i.test(a) && /name|holiday|desc/i.test(b)) continue; // header
    const date = toYmd(String(a));
    const name = String(b).trim();
    if (date && name) out.push({ date, name });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function readCsv(text: string): string[][] {
  return text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "").map(parseCsvLine);
}

// ─── XLSX (read first sheet via the central directory) ──────────────────────
function unzip(buf: Buffer): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  // End of central directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return files;
  let p = buf.readUInt32LE(eocd + 16); // start of central directory
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // Local header → data offset.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    try {
      files[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    } catch {
      /* skip unreadable entry */
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.split("<si>").slice(1)) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]));
    out.push(texts.join(""));
  }
  return out;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowXml of xml.split("<row").slice(1)) {
    const cells: string[] = [];
    for (const cm of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const inner = cm[2];
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let val = "";
      if (t === "s") val = shared[Number(vMatch?.[1] ?? -1)] ?? "";
      else if (t === "inlineStr") val = unxml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "");
      else if (t === "str") val = unxml(vMatch?.[1] ?? "");
      else val = vMatch?.[1] ?? ""; // number / date serial
      cells.push(val);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const shared = files["xl/sharedStrings.xml"] ? parseSharedStrings(files["xl/sharedStrings.xml"].toString("utf8")) : [];
  const sheetKey =
    Object.keys(files).find((n) => n === "xl/worksheets/sheet1.xml") ??
    Object.keys(files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetKey) return [];
  return parseSheet(files[sheetKey].toString("utf8"), shared);
}

export function parseHolidayFile(filename: string, buf: Buffer): ParsedHoliday[] {
  const rows = filename.toLowerCase().endsWith(".xlsx") ? readXlsx(buf) : readCsv(buf.toString("utf8"));
  return normalize(rows);
}
