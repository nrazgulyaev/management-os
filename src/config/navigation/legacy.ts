import {
  LayoutDashboard,
  Building2,
  Home,
  CalendarRange,
  Coins,
  ClipboardList,
  Package,
  Sparkles,
  FileText,
  type LucideIcon,
  Users,
  MapPin,
  MessageSquareHeart,
  Briefcase,
  Bed,
  KeyRound,
  Wrench,
  ShieldCheck,
  BookOpenText,
  Settings,
  Plug,
  Activity,
  BellRing,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  badge?: string;
  external?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

// Stage 10.I.3 — public marketing nav. Trimmed from 8 to 6 entries:
//   "Villa management" → "Management OS" (now under /products/*)
//   "Development OS" → /products/development-os
//   Pricing surface added (Stage 10.I.4 ships /pricing/management-os)
//   Owner portal / Investor reporting / Guest experience / Operations
//     stay reachable via the footer's Resources column (lower priority
//     in the primary nav once the per-product entries take centre stage).
export const marketingNav: NavItem[] = [
  { href: "/products/management-os", label: "Management OS" },
  { href: "/products/development-os", label: "Development OS" },
  { href: "/pricing/management-os", label: "Pricing" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/case-studies", label: "Case studies" },
  { href: "/contact", label: "Contact" },
];

export const dashboardNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/dashboard/projects", label: "Projects", icon: Building2 },
      { href: "/dashboard/villas", label: "Villas", icon: Home },
    ],
  },
  {
    label: "Owners & investors",
    items: [
      { href: "/dashboard/owners", label: "Owners", icon: Users },
      { href: "/dashboard/shares", label: "Ownership shares", icon: Briefcase },
    ],
  },
  {
    label: "Bookings",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: CalendarRange },
      { href: "/dashboard/bookings/calendar", label: "Calendar" },
      { href: "/dashboard/bookings/sync", label: "Sync" },
      { href: "/dashboard/bookings/rates", label: "Rate plans" },
      { href: "/dashboard/channels", label: "Channels", icon: MapPin },
      { href: "/dashboard/guests", label: "Guests", icon: MessageSquareHeart },
    ],
  },
  {
    label: "Guest stays",
    items: [
      { href: "/dashboard/guest-stays", label: "Overview", icon: KeyRound },
      { href: "/dashboard/guest-stays/tokens", label: "Tokens" },
      { href: "/dashboard/villa-guides", label: "Villa guides" },
      { href: "/dashboard/villa-guides/sections", label: "Sections" },
      { href: "/dashboard/villa-guides/wifi", label: "Wi-Fi" },
      { href: "/dashboard/villa-guides/emergency-contacts", label: "Emergency contacts" },
      { href: "/dashboard/villa-guides/neighborhood", label: "Neighborhood" },
      { href: "/dashboard/guest-services", label: "Services" },
      { href: "/dashboard/guest-services/catalog", label: "Catalog" },
      { href: "/dashboard/guest-services/orders", label: "Orders" },
      { href: "/dashboard/guest-services/finance-bridge", label: "Finance bridge" },
      { href: "/dashboard/guest-stays/security", label: "Security" },
      { href: "/dashboard/guest-stays/security/events", label: "Security events" },
      { href: "/dashboard/guest-stays/security/verifications", label: "Verifications" },
      { href: "/dashboard/villa-guides/wifi/migrate", label: "Wi-Fi migration" },
      // Mega-Sprint Phase 10 merged the guest-ai / guest-services /
      // guest-journey hubs into a single apex at /dashboard/concierge.
      // Drill-downs (sessions, handoffs, SLA, storage) stay reachable
      // via direct URL but no longer crowd the sidebar.
      { href: "/dashboard/concierge", label: "Concierge" },
    ],
  },
  {
    label: "Owner stays",
    items: [
      { href: "/dashboard/owner-stays", label: "Overview", icon: Home },
      { href: "/dashboard/owner-stays/requests", label: "Requests" },
      { href: "/dashboard/owner-stays/policies", label: "Policies" },
      { href: "/dashboard/owner-stays/equivalence-groups", label: "Equivalence groups" },
      { href: "/dashboard/owner-stays/finance-bridge", label: "Finance bridge" },
    ],
  },
  {
    label: "Maintenance intelligence",
    items: [
      { href: "/dashboard/maintenance-intelligence", label: "Overview", icon: Wrench },
      { href: "/dashboard/maintenance-intelligence/templates", label: "Templates" },
      { href: "/dashboard/maintenance-intelligence/plans", label: "Plans" },
      { href: "/dashboard/maintenance-intelligence/windows", label: "Windows" },
      { href: "/dashboard/maintenance-intelligence/risks", label: "Risk feed" },
    ],
  },
  {
    label: "Utilities",
    items: [
      { href: "/dashboard/utilities", label: "Overview", icon: Plug },
      { href: "/dashboard/utilities/accounts", label: "Accounts" },
      { href: "/dashboard/utilities/readings", label: "Readings" },
      { href: "/dashboard/utilities/payments", label: "Payments" },
      { href: "/dashboard/utilities/risks", label: "Risks" },
    ],
  },
  {
    label: "Front office",
    items: [
      { href: "/dashboard/front-office", label: "Today", icon: ClipboardList },
      { href: "/dashboard/front-office/arrivals", label: "Arrivals" },
      { href: "/dashboard/front-office/departures", label: "Departures" },
      { href: "/dashboard/front-office/in-house", label: "In-house" },
      { href: "/dashboard/front-office/requests", label: "Check-in/out requests" },
    ],
  },
  {
    label: "Availability",
    items: [
      { href: "/dashboard/availability", label: "Availability board", icon: CalendarRange },
      { href: "/dashboard/availability/blocks", label: "Calendar blocks" },
      { href: "/dashboard/readiness", label: "Readiness" },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/dashboard/security", label: "Overview", icon: ShieldCheck },
      { href: "/dashboard/security/cameras", label: "Cameras" },
      { href: "/dashboard/security/auth", label: "Authentication" },
      { href: "/dashboard/security/login-attempts", label: "Login attempts" },
      { href: "/dashboard/security/events", label: "Events" },
      { href: "/dashboard/security/mfa", label: "MFA factors" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/dashboard/integrations", label: "Overview", icon: Plug },
      { href: "/dashboard/integrations/calendar-feeds", label: "Calendar feeds" },
      { href: "/dashboard/integrations/calendar-events", label: "Calendar events" },
      { href: "/dashboard/integrations/conflicts", label: "Conflicts" },
      { href: "/dashboard/integrations/automation", label: "Automation rules" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/finance", label: "Finance", icon: Coins },
      { href: "/dashboard/finance/material-usage", label: "Material-usage bridge" },
      { href: "/dashboard/finance/transparency", label: "Statement transparency" },
    ],
  },
  {
    label: "Owner intelligence",
    items: [
      { href: "/dashboard/owner-intelligence", label: "Overview", icon: Activity },
      { href: "/dashboard/owner-intelligence/calendar", label: "Calendar" },
      { href: "/dashboard/owner-intelligence/health", label: "Health reports" },
      { href: "/dashboard/owner-intelligence/reviews", label: "Reviews" },
      { href: "/dashboard/owner-intelligence/preferences", label: "Preferences" },
      { href: "/dashboard/owner-intelligence/rebuild", label: "Rebuild events" },
      { href: "/dashboard/owner-intelligence/bookings", label: "Booking projection" },
      { href: "/dashboard/owner-intelligence/revenue", label: "Revenue source mix" },
    ],
  },
  {
    label: "Guest journey",
    items: [
      { href: "/dashboard/guest-journey", label: "Overview", icon: Sparkles },
      { href: "/dashboard/guest-journey/rules", label: "Rules" },
      { href: "/dashboard/guest-journey/runs", label: "Runs" },
      { href: "/dashboard/guest-journey/suggestions", label: "Suggestions" },
      { href: "/dashboard/guest-journey/reviews", label: "Review requests" },
    ],
  },
  {
    label: "Service fulfilment",
    items: [
      { href: "/dashboard/service-fulfilment", label: "Overview", icon: KeyRound },
      { href: "/dashboard/service-fulfilment/fulfilments", label: "Fulfilments" },
      { href: "/dashboard/service-fulfilment/vendors", label: "Vendors" },
      { href: "/dashboard/service-fulfilment/invoices", label: "Invoices" },
      { href: "/dashboard/service-fulfilment/ratings", label: "Ratings" },
      { href: "/dashboard/service-fulfilment/finance-bridge", label: "Finance bridge" },
    ],
  },
  {
    label: "Dynamic pricing",
    items: [
      { href: "/dashboard/pricing", label: "Overview", icon: Coins },
      { href: "/dashboard/pricing/rule-sets", label: "Rule sets" },
      { href: "/dashboard/pricing/calendar", label: "Calendar" },
      { href: "/dashboard/pricing/quote", label: "Quote tester" },
      { href: "/dashboard/pricing/logs", label: "Logs" },
      { href: "/dashboard/pricing/channel-push", label: "Channel push" },
    ],
  },
  {
    label: "Direct bookings",
    items: [
      { href: "/dashboard/direct-bookings", label: "Overview", icon: CalendarRange },
      { href: "/dashboard/direct-bookings/holds", label: "Holds" },
      { href: "/dashboard/direct-bookings/requests", label: "Requests" },
      { href: "/dashboard/direct-bookings/deposits", label: "Deposits" },
      { href: "/dashboard/direct-bookings/reconciliation", label: "Reconciliation" },
      { href: "/dashboard/direct-bookings/guest-status", label: "Guest status" },
      { href: "/dashboard/direct-bookings/messages", label: "Guest messages" },
    ],
  },
  {
    label: "Payments",
    items: [
      { href: "/dashboard/payments", label: "Overview", icon: Coins },
      { href: "/dashboard/payments/providers", label: "Providers" },
      { href: "/dashboard/payments/webhooks", label: "Webhooks" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/operations", label: "Command center", icon: ClipboardList },
      { href: "/dashboard/operations/tasks", label: "Tasks" },
      { href: "/dashboard/operations/housekeeping", label: "Housekeeping" },
      { href: "/dashboard/operations/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/dashboard/operations/preventive", label: "Preventive" },
      { href: "/dashboard/operations/checklists", label: "Checklists" },
      { href: "/dashboard/operations/service-requests", label: "Service requests" },
      { href: "/dashboard/operations/damage-reports", label: "Damage reports" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/dashboard/inventory", label: "Stock command", icon: Package },
      { href: "/dashboard/inventory/items", label: "Items" },
      { href: "/dashboard/inventory/stock", label: "Stock by location" },
      { href: "/dashboard/inventory/movements", label: "Movements" },
      { href: "/dashboard/inventory/locations", label: "Locations" },
      { href: "/dashboard/inventory/categories", label: "Categories" },
      { href: "/dashboard/inventory/suppliers", label: "Suppliers" },
      { href: "/dashboard/inventory/counts", label: "Counts" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { href: "/dashboard/procurement", label: "Procurement", icon: Briefcase },
      { href: "/dashboard/procurement/requests", label: "Purchase requests" },
      { href: "/dashboard/procurement/orders", label: "Purchase orders" },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/dashboard/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard/ai", label: "AI assistants", icon: Sparkles, badge: "8" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/dashboard/jobs", label: "Background jobs", icon: Activity },
      { href: "/dashboard/jobs/runs", label: "Job runs" },
      { href: "/dashboard/jobs/locks", label: "Job locks" },
      { href: "/dashboard/system/health", label: "System health" },
      { href: "/dashboard/system/deployment", label: "Deployment readiness" },
      { href: "/dashboard/demo", label: "Demo walkthrough" },
      { href: "/dashboard/notifications", label: "Notifications", icon: BellRing },
      { href: "/dashboard/notifications/inbox", label: "Inbox" },
      { href: "/dashboard/notifications/deliveries", label: "Delivery log" },
      { href: "/dashboard/notifications/preferences", label: "Notification preferences" },
      { href: "/dashboard/audit", label: "Audit log", icon: ShieldCheck },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/settings/responsibility-scopes", label: "Responsibility scopes" },
      { href: "/dashboard/settings/security", label: "My account security" },
    ],
  },
];

export const ownerNav: NavItem[] = [
  { href: "/owner", label: "Portfolio", icon: LayoutDashboard },
  { href: "/owner/villas", label: "My villas", icon: Home },
  { href: "/owner/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/owner/bookings", label: "Bookings", icon: Bed },
  { href: "/owner/revenue", label: "Revenue", icon: FileText },
  { href: "/owner/statements", label: "Statements", icon: FileText },
  { href: "/owner/stays", label: "Stays", icon: Bed },
  { href: "/owner/inbox", label: "Inbox", icon: BellRing },
  { href: "/owner/preferences/calendar", label: "Preferences", icon: Settings },
];

export const fieldNav: NavItem[] = [
  { href: "/field", label: "Today", icon: ClipboardList },
  { href: "/field/inventory", label: "Inventory", icon: Package },
  { href: "/field/tasks/demo", label: "Demo", icon: ShieldCheck },
];

export const guestNav: NavItem[] = [
  { href: "/stay/demo", label: "Your stay", icon: Bed },
  { href: "/stay/demo#check-in", label: "Check-in", icon: KeyRound },
  { href: "/stay/demo#guide", label: "Guide", icon: BookOpenText },
  { href: "/stay/demo#services", label: "Services", icon: MessageSquareHeart },
];

export const aiAssistantMeta = {
  Users,
  MapPin,
  Briefcase,
  Wrench,
};
