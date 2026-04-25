export interface StatementLine {
  section:
    | "revenue"
    | "fees"
    | "taxes"
    | "expenses"
    | "shared"
    | "fee_mgmt"
    | "reserves"
    | "payout";
  label: string;
  amount: number; // IDR minor; negative for costs/fees
  hint?: string;
}

export const mockStatement = {
  owner: "Emma Whitmore",
  villa: "Eternal 07",
  villaCode: "EV-07",
  project: "Eternal Villas",
  period: "March 2026",
  periodRange: "1 Mar 2026 — 31 Mar 2026",
  statementId: "STM-EV07-2026-03",
  approvedBy: "Dewi S. (Finance Manager) · Nikita R. (Director)",
  hash: "a91f2c…7d4b",
  currency: "IDR",
  lines: [
    { section: "revenue", label: "Gross booking revenue", amount: 284_600_000_000, hint: "19 nights · ADR 14,980,000" },
    { section: "revenue", label: "Cleaning fee (charged to guest)", amount: 18_200_000_000 },
    { section: "revenue", label: "Extra services (breakfast, transfer)", amount: 9_400_000_000 },
    { section: "fees", label: "OTA commission — Airbnb", amount: -6_840_000_000, hint: "3% of channel revenue" },
    { section: "fees", label: "OTA commission — Booking.com", amount: -14_580_000_000, hint: "15%" },
    { section: "fees", label: "Payment processing (Xendit / Stripe)", amount: -4_920_000_000 },
    { section: "fees", label: "Bank fees & FX loss", amount: -1_260_000_000 },
    { section: "taxes", label: "PHR — Bali hospitality tax (10%)", amount: -28_460_000_000 },
    { section: "taxes", label: "PPN — VAT (11%)", amount: -9_420_000_000, hint: "On extra services only" },
    { section: "expenses", label: "Cleaning & laundry", amount: -11_200_000_000 },
    { section: "expenses", label: "Utilities (electricity, water, wifi)", amount: -9_450_000_000 },
    { section: "expenses", label: "Maintenance & repairs", amount: -4_800_000_000, hint: "AC service · pool pump" },
    { section: "expenses", label: "Toiletries & consumables", amount: -3_100_000_000 },
    { section: "shared", label: "Pool-allocated shared costs", amount: -8_940_000_000, hint: "Landscaping · security · GM allocation" },
    { section: "fee_mgmt", label: "Management fee (18% of net)", amount: -38_420_000_000 },
    { section: "reserves", label: "Renovation reserve (3%)", amount: -7_290_000_000 },
    { section: "reserves", label: "FF&E / Depreciation reserve (5%)", amount: -12_150_000_000 },
  ] as StatementLine[],
};

export function statementTotals(lines: StatementLine[]) {
  const sum = (filter: (l: StatementLine) => boolean) =>
    lines.filter(filter).reduce((acc, l) => acc + l.amount, 0);

  const revenue = sum((l) => l.section === "revenue");
  const fees = sum((l) => l.section === "fees");
  const taxes = sum((l) => l.section === "taxes");
  const expenses = sum((l) => l.section === "expenses");
  const shared = sum((l) => l.section === "shared");
  const mgmt = sum((l) => l.section === "fee_mgmt");
  const reserves = sum((l) => l.section === "reserves");
  const net = revenue + fees + taxes + expenses + shared + mgmt + reserves;
  return { revenue, fees, taxes, expenses, shared, mgmt, reserves, net };
}
