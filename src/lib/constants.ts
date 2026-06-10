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
      { href: "/admin/marking-schemes", label: "Marking Schemes" },
      { href: "/admin/rewards", label: "Reward Rules" },
    ],
  },
  {
    group: "Finance & Comms",
    items: [
      { href: "/admin/fee-plans", label: "Fee Plans" },
      { href: "/admin/invoices", label: "Invoices & Payments" },
      { href: "/admin/scorecards", label: "Score Cards" },
    ],
  },
  {
    group: "More",
    items: [
      { href: "/admin/reports", label: "Reports & Export" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/broadcast", label: "Broadcast" },
      { href: "/admin/messages", label: "WhatsApp Log" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

// "Dashboard" is pinned by AppShell, so it is omitted from these lists.
export const COACH_NAV: NavItem[] = [
  { href: "/coach/marking", label: "Marking" },
  { href: "/coach/attendance", label: "Attendance" },
];

export const PARENT_NAV: NavItem[] = [
  { href: "/parent/scorecards", label: "Score Cards" },
  { href: "/parent/invoices", label: "Fees & Payments" },
];
