import type { VillaStatus } from "@/components/ui/status-pill";

export interface HousekeepingTask {
  id: string;
  villa: string;
  villaCode: string;
  scheduledAt: string; // HH:mm
  assignee: string;
  progress: number; // 0-100
  status: "queued" | "in_progress" | "awaiting_approval" | "approved";
  priority: "p2" | "p3" | "p4";
  checklistTotal: number;
  checklistDone: number;
}

export interface MaintenanceTicket {
  id: string;
  villa: string;
  villaCode: string;
  title: string;
  category: string;
  priority: "p1" | "p2" | "p3" | "p4";
  status: "open" | "triaged" | "in_progress" | "waiting_parts" | "resolved";
  openedAgo: string;
  assignee?: string;
  sla: "ok" | "warn" | "breach";
}

export interface PreventiveTask {
  id: string;
  scope: string;
  task: string;
  dueIn: string;
  cadence: string;
  assignee?: string;
}

export const housekeepingTasks: HousekeepingTask[] = [
  {
    id: "hk-1",
    villa: "Enso S2",
    villaCode: "ES-S2",
    scheduledAt: "11:00",
    assignee: "Sari W.",
    progress: 62,
    status: "in_progress",
    priority: "p2",
    checklistTotal: 18,
    checklistDone: 11,
  },
  {
    id: "hk-2",
    villa: "Eternal 07",
    villaCode: "EV-07",
    scheduledAt: "13:00",
    assignee: "Ketut A.",
    progress: 100,
    status: "awaiting_approval",
    priority: "p3",
    checklistTotal: 22,
    checklistDone: 22,
  },
  {
    id: "hk-3",
    villa: "Ahau 02",
    villaCode: "AH-02",
    scheduledAt: "14:30",
    assignee: "Made T.",
    progress: 0,
    status: "queued",
    priority: "p3",
    checklistTotal: 24,
    checklistDone: 0,
  },
];

export const maintenanceTickets: MaintenanceTicket[] = [
  {
    id: "mt-1",
    villa: "Enso S6",
    villaCode: "ES-S6",
    title: "Master bedroom AC not cooling below 26°C",
    category: "AC",
    priority: "p2",
    status: "in_progress",
    openedAgo: "6h",
    assignee: "Budi W.",
    sla: "ok",
  },
  {
    id: "mt-2",
    villa: "Enso S6",
    villaCode: "ES-S6",
    title: "Pool filter pressure alarm",
    category: "Pool",
    priority: "p2",
    status: "waiting_parts",
    openedAgo: "1d",
    assignee: "Budi W.",
    sla: "warn",
  },
  {
    id: "mt-3",
    villa: "Enso S2",
    villaCode: "ES-S2",
    title: "Living room ceiling fan wobble",
    category: "Electrical",
    priority: "p3",
    status: "triaged",
    openedAgo: "2h",
    sla: "ok",
  },
  {
    id: "mt-4",
    villa: "Ahau 01",
    villaCode: "AH-01",
    title: "Garden irrigation leak near entrance",
    category: "Landscaping",
    priority: "p3",
    status: "open",
    openedAgo: "30m",
    sla: "ok",
  },
];

export const preventiveTasks: PreventiveTask[] = [
  {
    id: "pv-1",
    scope: "Eternal Villas · all",
    task: "Quarterly AC deep clean",
    dueIn: "4 days",
    cadence: "Every 90 days",
    assignee: "External · CoolAir",
  },
  {
    id: "pv-2",
    scope: "Enso Villas · S1–S8",
    task: "Monthly pest management",
    dueIn: "2 days",
    cadence: "Every 30 days",
    assignee: "External · BaliPest",
  },
  {
    id: "pv-3",
    scope: "Ahau Gardens · common",
    task: "Fire extinguisher inspection",
    dueIn: "18 days",
    cadence: "Every 180 days",
    assignee: "Internal · Security",
  },
];

export const statusBoardSummary: {
  status: VillaStatus;
  count: number;
}[] = [
  { status: "ready", count: 2 },
  { status: "occupied", count: 3 },
  { status: "cleaning", count: 1 },
  { status: "inspection", count: 1 },
  { status: "checkout_pending", count: 1 },
  { status: "maintenance_blocked", count: 1 },
  { status: "owner_stay", count: 1 },
  { status: "out_of_service", count: 0 },
];
