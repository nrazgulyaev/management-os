export interface MockOwner {
  id: string;
  displayName: string;
  initials: string;
  country: string;
  joinedYear: number;
  scope: string;
  holdings: { villa?: string; project?: string; share: number }[];
  ytdPayouts: number; // IDR minor
  annualizedYield: number; // %
  currency: "IDR" | "USD";
}

export const mockOwners: MockOwner[] = [
  {
    id: "owner-emma",
    displayName: "Emma Whitmore",
    initials: "EW",
    country: "United Kingdom",
    joinedYear: 2023,
    scope: "2 villas · Enso pool",
    holdings: [
      { villa: "Enso S5", share: 100 },
      { villa: "Eternal 07", share: 100 },
      { project: "Enso Villas", share: 3 },
    ],
    ytdPayouts: 684_200_000_000,
    annualizedYield: 11.4,
    currency: "USD",
  },
  {
    id: "owner-takeda",
    displayName: "Takeda Family Office",
    initials: "TF",
    country: "Japan",
    joinedYear: 2022,
    scope: "Enso pool",
    holdings: [{ project: "Enso Villas", share: 12 }],
    ytdPayouts: 2_310_000_000_000,
    annualizedYield: 10.6,
    currency: "USD",
  },
  {
    id: "owner-larsen",
    displayName: "Larsen Holdings",
    initials: "LH",
    country: "Singapore",
    joinedYear: 2024,
    scope: "Ahau 02",
    holdings: [{ villa: "Ahau 02", share: 100 }],
    ytdPayouts: 412_600_000_000,
    annualizedYield: 9.3,
    currency: "IDR",
  },
];
