// Tiny hand-rolled i18n. No library: two locales, one flat dictionary, server
// AND client safe (plain data). Parent surface is translated first — admin and
// coach screens stay English until their dictionaries are added.
//
// Usage: const L = dict(me.locale); L.schedule  — missing zh keys fall back to en.

export type Locale = "en" | "zh";

export function normalizeLocale(v: string | null | undefined): Locale {
  return v === "zh" ? "zh" : "en";
}

const en = {
  // shell / nav
  dashboard: "Dashboard",
  account: "Account",
  my_children: "My Children",
  schedule: "Schedule",
  monthly_report: "Monthly Report",
  progress_card: "Progress Card",
  fees_payments: "Fees & Payments",
  home: "Home",

  // parent home
  hello: "Hello",
  todays_schedule: "Today's schedule",
  next_session: "Next",
  not_enrolled: "Not enrolled",
  no_exam_yet: "No exam yet",
  last_exam_suffix: "/100 last exam",
  progress_arrow: "Progress →",
  promoted: "Promoted",
  no_children: "No children linked to your account yet. Contact the academy.",
  fees: "Fees",
  outstanding_suffix: "outstanding",
  overdue_settle: "overdue · please settle soon",
  invoice_whenever: "— settle whenever it's convenient",
  pay_now: "Pay now",
  view_and_pay: "View & pay",
  all_paid_up: "You're all paid up — thank you!",
  schedule_arrow: "Schedule →",

  // schedule page
  school_holidays: "School holidays — no class",
  upcoming_sessions: "Upcoming sessions",
  tap_session_hint: "Tap a session for coach, court & who's going",
  recent_sessions: "Recent sessions",
  no_upcoming: "No upcoming sessions scheduled.",

  // session list
  coach_label: "Coach",
  canceled: "canceled",
  leave_pending: "leave pending",
  leave_approved: "leave approved",
  leave_declined: "leave declined",
  request_leave: "Request leave",
  withdraw: "withdraw",
  send_request: "Send request",
  reason_placeholder: "Reason (optional) — e.g. fever, school event",
  no_attendance: "No attendance recorded.",
  not_marked: "not marked",
  tapped: "tapped",

  // monthly report
  monthly_report_desc: "How each month went — coach's marks, attendance and rewards. Exam results live on the Progress Card.",
  attendance: "Attendance",
  avg_session_rating: "avg session rating",
  fitness: "Fitness",
  skills: "Skills",
  attitude: "Attitude",
  nothing_recorded: "Nothing recorded this month yet.",
  marks_not_in: "Coach's monthly marks not in yet.",
  pts_suffix: "pts",

  // account
  my_account: "My account",
  language: "Language",
  language_hint: "Applies to your app — English or 中文.",
  save: "Save",
  saved: "Saved.",

  // child page
  branch: "Branch",
  your_coach: "Your child's coach",
  choose_coach_hint: "Choose who coaches your child.",
  none: "— none —",
  saved_tick: "Saved ✓",
  download_invoice: "Download",
  download_card: "Download this month's card (PDF)",
  exam_results: "Exam results",
  monthly_marks_h: "Monthly marks",
  attachment: "Attach a document (optional)",
  makeup_label: "Make-up",
  replacement_note: "Request leave below — the academy arranges a make-up class for you.",
} as const;

export type Dict = Record<keyof typeof en, string>;

const zh: Dict = {
  dashboard: "主页",
  account: "账户",
  my_children: "我的孩子",
  schedule: "课程表",
  monthly_report: "每月报告",
  progress_card: "进度卡",
  fees_payments: "学费与缴费",
  home: "主页",

  hello: "您好",
  todays_schedule: "今天的课程",
  next_session: "下一节",
  not_enrolled: "未报班",
  no_exam_yet: "暂无考试",
  last_exam_suffix: "/100 最近考试",
  progress_arrow: "查看进度 →",
  promoted: "已晋级",
  no_children: "您的账户还没有关联孩子，请联系学院。",
  fees: "学费",
  outstanding_suffix: "待缴",
  overdue_settle: "已逾期 · 请尽快缴付",
  invoice_whenever: "— 方便时缴付即可",
  pay_now: "立即缴付",
  view_and_pay: "查看并缴付",
  all_paid_up: "学费已全部缴清 — 谢谢！",
  schedule_arrow: "课程表 →",

  school_holidays: "学校假期 — 停课",
  upcoming_sessions: "即将到来的课程",
  tap_session_hint: "点击课程查看教练、场地和参加的孩子",
  recent_sessions: "最近的课程",
  no_upcoming: "暂无排课。",

  coach_label: "教练",
  canceled: "已取消",
  leave_pending: "请假审核中",
  leave_approved: "请假已批准",
  leave_declined: "请假被拒",
  request_leave: "申请请假",
  withdraw: "撤回",
  send_request: "提交申请",
  reason_placeholder: "原因（可选）— 如发烧、学校活动",
  no_attendance: "暂无出勤记录。",
  not_marked: "未记录",
  tapped: "打卡",

  monthly_report_desc: "每个月的表现 — 教练评分、出勤与奖励。考试成绩请看进度卡。",
  attendance: "出勤率",
  avg_session_rating: "平均课堂评分",
  fitness: "体能",
  skills: "技术",
  attitude: "态度",
  nothing_recorded: "本月暂无记录。",
  marks_not_in: "教练本月评分还未提交。",
  pts_suffix: "分",

  my_account: "我的账户",
  language: "语言 / Language",
  language_hint: "应用于您的界面 — English 或 中文。",
  save: "保存",
  saved: "已保存。",

  branch: "分院",
  your_coach: "孩子的教练",
  choose_coach_hint: "选择负责您孩子的教练。",
  none: "— 无 —",
  saved_tick: "已保存 ✓",
  download_invoice: "下载",
  download_card: "下载本月成长卡（PDF）",
  exam_results: "考试成绩",
  monthly_marks_h: "每月评分",
  attachment: "上传证明文件（可选）",
  makeup_label: "补课",
  replacement_note: "在下方申请请假 — 学院将为您安排补课。",
};

const DICTS: Record<Locale, Dict> = { en: en as Dict, zh };

export function dict(locale: string | null | undefined): Dict {
  return DICTS[normalizeLocale(locale)];
}
