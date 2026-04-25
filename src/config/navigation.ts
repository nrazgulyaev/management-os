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
      { href: "/dashboard/channels", label: "Channels", icon: MapPin },
      { href: "/dashboard/guests", label: "Guests", icon: MessageSquareHeart },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/finance", label: "Finance", icon: Coins },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/operations", label: "Operations", icon: ClipboardList },
      { href: "/dashboard/inventory", label: "Inventory & procurement", icon: Package },
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
  { href: "/field/tasks/demo", label: "Tasks", icon: ShieldCheck },
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
