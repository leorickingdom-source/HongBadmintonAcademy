export const APP_NAME = "Hong Badminton Academy";
export const APP_SHORT = "HBA";

// Rows per page for the admin directory tables. Defined here (a server-safe
// module) — NOT in the "use client" paginator — because server components
// (StudentsList, PeopleList) read it for slicing/range. A const exported from a
// "use client" file resolves to a client reference (undefined) on the server,
// which silently makes `slice(0, NaN)` return zero rows.
export const PAGE_SIZE = 25;

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  coach: "Coach",
  parent: "Parent",
};

export interface NavItem {
  href: string;
  label: string;
}

// Admin sidebar — frequent sections first; occasional tools tucked under "More".
// "Dashboard" (the role home) is pinned by AppShell above these groups, so it is
// not repeated here.
export const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Daily",
    items: [
      { href: "/admin/attendance/matrix", label: "Attendance" },
      { href: "/admin/sessions", label: "Sessions" },
      { href: "/admin/people", label: "Directory" },
      { href: "/admin/classes", label: "Classes & Schedule" },
    ],
  },
  {
    group: "Teaching",
    items: [
      { href: "/admin/coaches/summary", label: "Coaches & Payroll" },
      { href: "/admin/leaderboard", label: "Leaderboard" },
      { href: "/admin/exams", label: "Exams & Progress" },
      { href: "/admin/training", label: "Training Syllabus" },
      { href: "/admin/rewards", label: "Reward Rules" },
    ],
  },
  {
    group: "Finance & Comms",
    items: [
      { href: "/admin/invoices", label: "Invoices & Payments" },
      { href: "/admin/collections", label: "Collections" },
      { href: "/admin/announce", label: "Announcements" },
      { href: "/admin/messages", label: "WhatsApp Log" },
      { href: "/admin/fee-plans", label: "Fee Plans" },
    ],
  },
  {
    group: "Insights & Setup",
    items: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/reports", label: "Reports & Export" },
      { href: "/admin/holidays", label: "Holidays" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

// "Dashboard" is pinned by AppShell, so it is omitted from these lists.
// Order matters: the mobile bottom-tab bar shows Home + these items.
export const COACH_NAV: NavItem[] = [
  { href: "/coach/checkin", label: "Check-in & mark" },
  { href: "/coach/schedule", label: "Schedule" },
  { href: "/coach/exams", label: "Exams" },
  { href: "/coach/payroll", label: "My Payroll" },
];

export const PARENT_NAV: NavItem[] = [
  { href: "/parent/children", label: "My Children" },
  { href: "/parent/schedule", label: "Schedule" },
  { href: "/parent/scorecards", label: "Progress Card" },
  { href: "/parent/invoices", label: "Fees & Payments" },
];
