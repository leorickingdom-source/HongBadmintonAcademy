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
export const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
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
