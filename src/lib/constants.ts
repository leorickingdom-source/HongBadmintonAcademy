export const APP_NAME = "Hong Badminton Academy";
export const APP_SHORT = "HBA";

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
    group: "Manage",
    items: [
      { href: "/admin/people", label: "People" },
      { href: "/admin/classes", label: "Classes & Schedule" },
      { href: "/admin/attendance", label: "Attendance" },
      { href: "/admin/coaches/summary", label: "Coaches" },
      { href: "/admin/marking-schemes", label: "Marking Schemes" },
    ],
  },
  {
    group: "Finance & Comms",
    items: [
      { href: "/admin/fee-plans", label: "Fee Plans" },
      { href: "/admin/invoices", label: "Invoices & Payments" },
      { href: "/admin/scorecards", label: "Growth Reports" },
    ],
  },
  {
    group: "More",
    items: [
      { href: "/admin/reports", label: "Reports & Export" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/announce", label: "Announcements" },
      { href: "/admin/messages", label: "WhatsApp Log" },
      { href: "/admin/rewards", label: "Reward Rules" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

// "Dashboard" is pinned by AppShell, so it is omitted from these lists.
export const COACH_NAV: NavItem[] = [
  { href: "/coach/checkin", label: "Check-in" },
  { href: "/coach/marking", label: "Marking" },
  { href: "/coach/attendance", label: "Attendance" },
  { href: "/coach/payroll", label: "My Payroll" },
];

export const PARENT_NAV: NavItem[] = [
  { href: "/parent/scorecards", label: "Growth Reports" },
  { href: "/parent/invoices", label: "Fees & Payments" },
];
