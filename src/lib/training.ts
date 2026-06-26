// HBA Training System v2 — the canonical 6-level ladder, per-level curriculum,
// promotion-exam rubrics, pass bands and the exam cycle. Source of truth for the
// coach grading flow, the admin syllabus reference and the parent level card.
// Mirrors the boss-approved HBA_TRAINING_SYSTEM_v2 document.

// ─── Exam cycle ─────────────────────────────────────────────────────────────
// Exams run 3×/year, every 4 months: April, August, December.
export const EXAM_MONTHS = [4, 8, 12] as const; // 1-based months
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Malaysia is UTC+8 (no DST) — derive the wall-clock "now" the rest of the app uses.
function mytNow(): Date {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

export function examWindowLabel(d: Date = mytNow()): string {
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// The next exam window on/after `from` (label + ISO date of the 1st of that month).
export function nextExamWindow(from: Date = mytNow()): { label: string; date: string } {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1; // 1-based
  for (const em of EXAM_MONTHS) {
    if (em >= m) return { label: `${MONTH_ABBR[em - 1]} ${y}`, date: `${y}-${String(em).padStart(2, "0")}-01` };
  }
  // Past December — first window of next year.
  const em = EXAM_MONTHS[0];
  return { label: `${MONTH_ABBR[em - 1]} ${y + 1}`, date: `${y + 1}-${String(em).padStart(2, "0")}-01` };
}

export function isExamMonth(d: Date = mytNow()): boolean {
  return (EXAM_MONTHS as readonly number[]).includes(d.getUTCMonth() + 1);
}

// ─── Levels & curriculum ────────────────────────────────────────────────────
export interface CurriculumGroup {
  label: string;
  items: string[];
}
export interface TrainingLevel {
  level: number;       // 1–6
  name: string;        // "Starter", "Beginner", …
  objective: string;   // short Chinese goal from the doc
  groups: CurriculumGroup[];
}

export const TRAINING_LEVELS: TrainingLevel[] = [
  {
    level: 1, name: "Starter", objective: "喜欢羽球 + 基本协调",
    groups: [
      { label: "Technical", items: ["Lobbing (straight)", "Lift (straight / cross)", "High serve"] },
      { label: "Footwork", items: ["Front & back movement", "Four corner (front & back)"] },
      { label: "Physical / Coordination", items: ["Basic agility games", "Balance exercises", "Hand–eye coordination", "Reaction games"] },
      { label: "Game Understanding", items: ["Basic rules of badminton", "How to hold racket", "Court awareness"] },
    ],
  },
  {
    level: 2, name: "Beginner", objective: "建立稳定基本技术",
    groups: [
      { label: "Technical", items: ["Drop (straight / cross)", "Net shot (straight / cross)", "Low serve"] },
      { label: "Footwork", items: ["Six corner movement"] },
      { label: "Physical", items: ["Agility ladder", "Basic speed drills", "Reaction training"] },
      { label: "Game Understanding", items: ["Simple rally practice", "Basic singles positioning", "Introduction to doubles"] },
    ],
  },
  {
    level: 3, name: "Intermediate", objective: "开始比赛能力",
    groups: [
      { label: "Technical", items: ["Smash", "Tap / net kill", "Cross net shot", "Clear consistency"] },
      { label: "Footwork", items: ["Six corner with speed", "Recovery movement", "Shadow footwork"] },
      { label: "Physical", items: ["Speed & agility", "Jump training", "Core stability"] },
      { label: "Game Understanding", items: ["Basic singles tactics", "Basic doubles rotation", "Rally control"] },
    ],
  },
  {
    level: 4, name: "Advanced", objective: "完整技术 + 战术意识",
    groups: [
      { label: "Technical", items: ["Jump smash", "Half smash", "Drive (FH/BH)", "Backhand clear", "Net kill"] },
      { label: "Footwork", items: ["Advanced six corner", "Attack footwork", "Recovery speed drills"] },
      { label: "Physical", items: ["Speed endurance", "Agility reaction", "Core strength"] },
      { label: "Tactical", items: ["Singles attack vs defense", "Doubles rotation", "Shot selection"] },
    ],
  },
  {
    level: 5, name: "Competition Team", objective: "比赛训练",
    groups: [
      { label: "Technical", items: ["Smash variation", "Deception drop", "Fast drive rally", "Net spinning"] },
      { label: "Tactical — Singles", items: ["Rally building", "Court control"] },
      { label: "Tactical — Doubles", items: ["Front court interception", "Defensive formation"] },
      { label: "Footwork", items: ["Multi shuttle footwork", "Explosive movement"] },
      { label: "Physical", items: ["Interval training", "Jump power", "Speed endurance"] },
      { label: "Mental", items: ["Match discipline", "Pressure handling"] },
    ],
  },
  {
    level: 6, name: "Elite Team", objective: "高水平运动员",
    groups: [
      { label: "Technical", items: ["Advanced deception", "Reverse slice drop", "Backhand smash", "Net tumbling control"] },
      { label: "Tactical — Singles", items: ["Tempo control", "Opponent reading"] },
      { label: "Tactical — Doubles", items: ["High speed attacking system", "Tactical variation"] },
      { label: "Footwork", items: ["Random multi shuttle", "High speed recovery"] },
      { label: "Physical", items: ["Strength training", "Advanced agility", "Endurance conditioning"] },
    ],
  },
];

export function levelInfo(level: number | null | undefined): TrainingLevel | null {
  if (!level) return null;
  return TRAINING_LEVELS.find((l) => l.level === level) ?? null;
}

export function levelName(level: number | null | undefined): string {
  return levelInfo(level)?.name ?? "—";
}

// Coarse 4-tier rank derived from the fine 6-level (keeps the existing leaderboard
// / badge / fee-tier plumbing in sync with the training ladder — one ladder, two
// granularities). See src/lib/ranks.ts CLASS_RANKS.
export function levelToRank(level: number | null | undefined): string | null {
  if (!level) return null;
  if (level <= 2) return "Beginner";
  if (level === 3) return "Intermediate";
  if (level === 4) return "Advanced";
  return "Elite"; // 5–6
}

// ─── Exam rubric ────────────────────────────────────────────────────────────
export type SectionKey = "technical" | "footwork" | "tactical" | "physical";

export interface ExamItem {
  label: string;
  max: number;
}
export interface ExamSection {
  key: SectionKey;
  label: string; // faithful per-level label (Game vs Tactical, Attitude vs Mental)
  max: number;   // section cap (40 / 25 / 20 / 15)
  items: ExamItem[];
}
export interface ExamSpec {
  fromLevel: number;
  toLevel: number;      // fromLevel + 1, except L6 review (7 = "stay Elite")
  title: string;        // e.g. "Starter Assessment"
  review?: boolean;     // L6 = Elite review, not a promotion
  sections: ExamSection[];
}

// Section maxes are fixed across every level: 40 / 25 / 20 / 15 = 100.
export const SECTION_MAX: Record<SectionKey, number> = {
  technical: 40, footwork: 25, tactical: 20, physical: 15,
};

export const EXAM_SPECS: ExamSpec[] = [
  {
    fromLevel: 1, toLevel: 2, title: "Starter Assessment",
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Lobbing straight consistency", max: 15 },
        { label: "Lift (straight / cross)", max: 15 },
        { label: "High serve", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Front & back movement", max: 10 },
        { label: "Four corner movement", max: 15 },
      ]},
      { key: "tactical", label: "Game Understanding", max: 20, items: [
        { label: "Grip", max: 10 },
        { label: "Basic rally / court awareness", max: 10 },
      ]},
      { key: "physical", label: "Physical / Attitude", max: 15, items: [
        { label: "Coordination", max: 5 },
        { label: "Focus", max: 5 },
        { label: "Effort", max: 5 },
      ]},
    ],
  },
  {
    fromLevel: 2, toLevel: 3, title: "Beginner Assessment",
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Drop shot accuracy", max: 15 },
        { label: "Net shot control", max: 15 },
        { label: "Low serve", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Six corner movement", max: 15 },
        { label: "Recovery speed", max: 10 },
      ]},
      { key: "tactical", label: "Game Understanding", max: 20, items: [
        { label: "Basic rally", max: 10 },
        { label: "Court positioning", max: 10 },
      ]},
      { key: "physical", label: "Physical / Attitude", max: 15, items: [
        { label: "Agility", max: 5 },
        { label: "Focus", max: 5 },
        { label: "Effort", max: 5 },
      ]},
    ],
  },
  {
    fromLevel: 3, toLevel: 4, title: "Intermediate Assessment",
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Smash technique", max: 15 },
        { label: "Cross net shot", max: 15 },
        { label: "Tap / net kill", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Six corner speed", max: 15 },
        { label: "Shadow movement", max: 10 },
      ]},
      { key: "tactical", label: "Game Understanding", max: 20, items: [
        { label: "Singles positioning", max: 10 },
        { label: "Rally control", max: 10 },
      ]},
      { key: "physical", label: "Physical / Attitude", max: 15, items: [
        { label: "Speed", max: 5 },
        { label: "Jump", max: 5 },
        { label: "Effort", max: 5 },
      ]},
    ],
  },
  {
    fromLevel: 4, toLevel: 5, title: "Advanced Assessment",
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Jump smash", max: 10 },
        { label: "Drive control (FH/BH)", max: 10 },
        { label: "Net kill", max: 10 },
        { label: "Backhand clear", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Advanced six corner", max: 15 },
        { label: "Attack recovery", max: 10 },
      ]},
      { key: "tactical", label: "Tactical Understanding", max: 20, items: [
        { label: "Singles attack / defense", max: 10 },
        { label: "Doubles rotation", max: 10 },
      ]},
      { key: "physical", label: "Physical / Attitude", max: 15, items: [
        { label: "Speed endurance", max: 5 },
        { label: "Agility", max: 5 },
        { label: "Attitude / discipline", max: 5 },
      ]},
    ],
  },
  {
    fromLevel: 5, toLevel: 6, title: "Competition Team Assessment",
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Smash variation", max: 10 },
        { label: "Deception drop", max: 10 },
        { label: "Net spinning", max: 10 },
        { label: "Fast drive rally", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Explosive six corner", max: 15 },
        { label: "Multi shuttle movement", max: 10 },
      ]},
      { key: "tactical", label: "Tactical Understanding", max: 20, items: [
        { label: "Match strategy", max: 10 },
        { label: "Court control", max: 10 },
      ]},
      { key: "physical", label: "Physical / Mental", max: 15, items: [
        { label: "Power", max: 5 },
        { label: "Endurance", max: 5 },
        { label: "Mental discipline", max: 5 },
      ]},
    ],
  },
  {
    fromLevel: 6, toLevel: 7, title: "Elite Assessment", review: true,
    sections: [
      { key: "technical", label: "Technical", max: 40, items: [
        { label: "Advanced deception", max: 10 },
        { label: "Reverse slice / variation shot", max: 10 },
        { label: "Backhand smash / advanced attack", max: 10 },
        { label: "Net tumbling control", max: 10 },
      ]},
      { key: "footwork", label: "Footwork", max: 25, items: [
        { label: "Random multi shuttle", max: 15 },
        { label: "High speed recovery", max: 10 },
      ]},
      { key: "tactical", label: "Tactical Understanding", max: 20, items: [
        { label: "Rally construction / tempo control", max: 10 },
        { label: "Opponent reading / match decision", max: 10 },
      ]},
      { key: "physical", label: "Physical / Mental", max: 15, items: [
        { label: "Strength", max: 5 },
        { label: "Endurance", max: 5 },
        { label: "Match discipline / composure", max: 5 },
      ]},
    ],
  },
];

export function examSpecFor(fromLevel: number): ExamSpec | null {
  return EXAM_SPECS.find((e) => e.fromLevel === fromLevel) ?? null;
}

// ─── Pass bands ─────────────────────────────────────────────────────────────
export const PROMOTE_MIN = 70; // ≥70 → eligible to promote

export type BandKey = "excellent" | "pass" | "borderline" | "fail";
export interface Band {
  key: BandKey;
  label: string;
  tone: "green" | "blue" | "yellow" | "red";
  note: string;
}
const BANDS: { min: number; band: Band }[] = [
  { min: 80, band: { key: "excellent", label: "Excellent", tone: "green", note: "Technically stable — ready to level up." } },
  { min: 70, band: { key: "pass", label: "Pass", tone: "blue", note: "Meets the standard — promote, keep working on weak areas." } },
  { min: 60, band: { key: "borderline", label: "Borderline", tone: "yellow", note: "Close — hold level, retest in 1–2 months." } },
  { min: 0,  band: { key: "fail", label: "Fail", tone: "red", note: "Below standard — stay at level, rebuild basics." } },
];

export function bandFor(total: number): Band {
  for (const b of BANDS) if (total >= b.min) return b.band;
  return BANDS[BANDS.length - 1].band;
}

export type Decision = "promote" | "maintain" | "reassess";
export const DECISION_LABEL: Record<Decision, string> = {
  promote: "Promote",
  maintain: "Maintain current level",
  reassess: "Reassess next cycle",
};

// Default promotion decision from the score + whether this is the L6 review.
export function defaultDecision(total: number, review: boolean): Decision {
  if (review) return total >= PROMOTE_MIN ? "maintain" : "reassess"; // L6: stay-Elite vs review
  if (total >= PROMOTE_MIN) return "promote";
  if (total >= 60) return "reassess";
  return "maintain";
}
