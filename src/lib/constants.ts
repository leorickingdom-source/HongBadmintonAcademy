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

// Admin sidebar — grouped by the 6 scope modules.
export const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/admin/students", label: "Students" },
      { href: "/admin/parents", label: "Parents" },
      { href: "/admin/coaches", label: "Coaches" },
    ],
  },
  {
    group: "Training",
    items: [
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
      { href: "/admin/broadcast", label: "Broadcast" },
      { href: "/admin/messages", label: "WhatsApp Log" },
    ],
  },
  {
    group: "Reports",
    items: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/reports", label: "Reports & Export" },
    ],
  },
];

export const COACH_NAV: NavItem[] = [
  { href: "/coach", label: "Dashboard" },
  { href: "/coach/marking", label: "Marking" },
  { href: "/coach/attendance", label: "Attendance" },
];

export const PARENT_NAV: NavItem[] = [
  { href: "/parent", label: "Dashboard" },
  { href: "/parent/scorecards", label: "Score Cards" },
  { href: "/parent/invoices", label: "Fees & Payments" },
];
