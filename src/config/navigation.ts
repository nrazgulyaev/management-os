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

export const marketingNav: NavItem[] = [
  { href: "/villa-management", label: "Villa management" },
  { href: "/owner-portal", label: "Owner portal" },
  { href: "/investor-reporting", label: "Investor reporting" },
  { href: "/guest-experience", label: "Guest experience" },
  { href: "/operations", label: "Operations" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/case-studies", label: "Case studies" },
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
      { href: "/dashboard/channels", label: "Channels", icon: MapPin },
      { href: "/dashboard/guests", label: "Guests", icon: MessageSquareHeart },
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
      { href: "/dashboard/notifications", label: "Notifications", icon: BellRing },
      { href: "/dashboard/notifications/preferences", label: "Notification preferences" },
      { href: "/dashboard/audit", label: "Audit log", icon: ShieldCheck },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ownerNav: NavItem[] = [
  { href: "/owner", label: "Portfolio", icon: LayoutDashboard },
  { href: "/owner/villas", label: "My villas", icon: Home },
  { href: "/owner/statements", label: "Statements", icon: FileText },
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
