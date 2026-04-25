export interface MockProject {
  id: string;
  code: string;
  name: string;
  tagline: string;
  area: string;
  villas: number;
  bedrooms: number;
  status: "live" | "soft_open" | "development";
  ownershipModel: "individual" | "pooled" | "hybrid";
  occupancy: number; // %
  adr: number; // IDR minor
  revpar: number; // IDR minor
  ytdRevenue: number; // IDR minor
  heroPhoto: string;
  description: string;
}

export const mockProjects: MockProject[] = [
  {
    id: "eternal-villas",
    code: "EV",
    name: "Eternal Villas",
    tagline: "Six residences above the Ayung valley",
    area: "Ubud",
    villas: 6,
    bedrooms: 18,
    status: "live",
    ownershipModel: "hybrid",
    occupancy: 82.4,
    adr: 780_000_000, // 7,800,000 IDR minor
    revpar: 642_720_000,
    ytdRevenue: 1_140_000_000_000,
    heroPhoto:
      "linear-gradient(180deg, rgba(14,59,46,0.1) 0%, rgba(14,59,46,0.4) 100%)",
    description:
      "A private enclave of six architect-designed villas carved into the Ayung valley. Hybrid ownership with shared operating reserves.",
  },
  {
    id: "enso-villas",
    code: "ES",
    name: "Enso Villas",
    tagline: "Circle-inspired retreats in Berawa",
    area: "Berawa, Canggu",
    villas: 8,
    bedrooms: 24,
    status: "live",
    ownershipModel: "pooled",
    occupancy: 87.1,
    adr: 920_000_000,
    revpar: 801_320_000,
    ytdRevenue: 1_840_000_000_000,
    heroPhoto:
      "linear-gradient(180deg, rgba(176,138,62,0.15) 0%, rgba(42,45,43,0.45) 100%)",
    description:
      "Eight fully-pooled villas operated as one hospitality asset. Pool members receive weighted distribution against net operating profit.",
  },
  {
    id: "ahau-gardens",
    code: "AH",
    name: "Ahau Gardens",
    tagline: "Garden residences in Pererenan",
    area: "Pererenan",
    villas: 5,
    bedrooms: 15,
    status: "soft_open",
    ownershipModel: "individual",
    occupancy: 71.3,
    adr: 1_120_000_000,
    revpar: 798_560_000,
    ytdRevenue: 720_000_000_000,
    heroPhoto:
      "linear-gradient(180deg, rgba(110,138,122,0.15) 0%, rgba(15,17,16,0.5) 100%)",
    description:
      "Individually-owned garden villas with shared landscape and security. Each owner receives a dedicated monthly P&L.",
  },
];
