import type { VillaStatus } from "@/components/ui/status-pill";

export interface MockVilla {
  id: string;
  code: string;
  name: string;
  project: string;
  projectId: string;
  bedrooms: number;
  maxGuests: number;
  status: VillaStatus;
  occupancyYTD: number;
  adr: number;
  mtdRevenue: number;
  nextArrival?: { guest: string; dateISO: string; nights: number };
  nextDeparture?: { guest: string; dateISO: string };
  openTasks: number;
  openTickets: number;
}

export const mockVillas: MockVilla[] = [
  {
    id: "es-s1",
    code: "ES-S1",
    name: "Enso S1",
    project: "Enso Villas",
    projectId: "enso-villas",
    bedrooms: 3,
    maxGuests: 6,
    status: "occupied",
    occupancyYTD: 88.2,
    adr: 920_000_000,
    mtdRevenue: 184_000_000_000,
    nextDeparture: { guest: "Mr. Tanaka", dateISO: "2026-04-26" },
    openTasks: 2,
    openTickets: 0,
  },
  {
    id: "es-s2",
    code: "ES-S2",
    name: "Enso S2",
    project: "Enso Villas",
    projectId: "enso-villas",
    bedrooms: 3,
    maxGuests: 6,
    status: "cleaning",
    occupancyYTD: 85.4,
    adr: 920_000_000,
    mtdRevenue: 176_800_000_000,
    nextArrival: { guest: "Family Nielsen", dateISO: "2026-04-25", nights: 6 },
    openTasks: 1,
    openTickets: 1,
  },
  {
    id: "es-s5",
    code: "ES-S5",
    name: "Enso S5",
    project: "Enso Villas",
    projectId: "enso-villas",
    bedrooms: 4,
    maxGuests: 8,
    status: "ready",
    occupancyYTD: 89.1,
    adr: 1_080_000_000,
    mtdRevenue: 204_600_000_000,
    nextArrival: { guest: "A. Martin", dateISO: "2026-04-26", nights: 4 },
    openTasks: 0,
    openTickets: 0,
  },
  {
    id: "es-s6",
    code: "ES-S6",
    name: "Enso S6",
    project: "Enso Villas",
    projectId: "enso-villas",
    bedrooms: 4,
    maxGuests: 8,
    status: "maintenance_blocked",
    occupancyYTD: 74.8,
    adr: 1_080_000_000,
    mtdRevenue: 140_400_000_000,
    openTasks: 0,
    openTickets: 2,
  },
  {
    id: "ev-07",
    code: "EV-07",
    name: "Eternal 07",
    project: "Eternal Villas",
    projectId: "eternal-villas",
    bedrooms: 3,
    maxGuests: 6,
    status: "inspection",
    occupancyYTD: 82.0,
    adr: 780_000_000,
    mtdRevenue: 164_000_000_000,
    nextArrival: { guest: "H. Williams", dateISO: "2026-04-25", nights: 5 },
    openTasks: 1,
    openTickets: 0,
  },
  {
    id: "ev-03",
    code: "EV-03",
    name: "Eternal 03",
    project: "Eternal Villas",
    projectId: "eternal-villas",
    bedrooms: 3,
    maxGuests: 6,
    status: "owner_stay",
    occupancyYTD: 71.5,
    adr: 780_000_000,
    mtdRevenue: 118_000_000_000,
    openTasks: 0,
    openTickets: 0,
  },
  {
    id: "ah-01",
    code: "AH-01",
    name: "Ahau 01",
    project: "Ahau Gardens",
    projectId: "ahau-gardens",
    bedrooms: 3,
    maxGuests: 6,
    status: "ready",
    occupancyYTD: 73.6,
    adr: 1_120_000_000,
    mtdRevenue: 156_800_000_000,
    nextArrival: { guest: "L. Okonkwo", dateISO: "2026-04-27", nights: 7 },
    openTasks: 0,
    openTickets: 1,
  },
  {
    id: "ah-02",
    code: "AH-02",
    name: "Ahau 02",
    project: "Ahau Gardens",
    projectId: "ahau-gardens",
    bedrooms: 4,
    maxGuests: 8,
    status: "checkout_pending",
    occupancyYTD: 69.4,
    adr: 1_240_000_000,
    mtdRevenue: 148_800_000_000,
    nextDeparture: { guest: "S. Dubois", dateISO: "2026-04-24" },
    openTasks: 1,
    openTickets: 0,
  },
];
