/**
 * Standard chart of accounts for the double-entry GL foundation (0122).
 *
 * Minimal-but-sufficient COA to post every money event in the existing
 * finance layer (auto-post wiring lands in later PRs). Each org seeds its
 * own copy. PURE data module (no DB / no "server-only") so both the seed
 * script (node) and server code can import it.
 */

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export interface StandardAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: "debit" | "credit";
  note?: string;
}

/** The canonical seed set (~23 accounts). Verified against the existing
 *  finance schema by the GL design pass (incl. input-VAT, suspense, and
 *  owner-recharge accounts the adversarial review required). */
export const STANDARD_COA: StandardAccount[] = [
  // Assets
  { code: "1000", name: "Cash & Bank", type: "asset", normalBalance: "debit", note: "All bank/crypto/wallet/cash accounts." },
  { code: "1100", name: "Accounts Receivable — Buyers", type: "asset", normalBalance: "debit", note: "Sales AR (contract milestones, sales invoices, late fees)." },
  { code: "1200", name: "Accounts Receivable — Other", type: "asset", normalBalance: "debit", note: "Dev-OS receivable invoices + misc." },
  { code: "1300", name: "Capital Contributions Receivable", type: "asset", normalBalance: "debit", note: "Drawdown requested, cash not yet received." },
  { code: "1400", name: "Input VAT Recoverable", type: "asset", normalBalance: "debit", note: "Recoverable input tax on purchases." },
  { code: "1500", name: "Work in Progress / Project Assets", type: "asset", normalBalance: "debit", note: "Capitalized dev costs (construction-in-progress)." },
  // Liabilities
  { code: "2000", name: "Accounts Payable — Vendors", type: "liability", normalBalance: "credit", note: "Dev-OS payable invoices + realized commitments." },
  { code: "2100", name: "Owner Payables (Net Due to Owners)", type: "liability", normalBalance: "credit", note: "owner_statements net payout owed; cleared by payouts." },
  { code: "2200", name: "Reserve / Sinking Fund Held", type: "liability", normalBalance: "credit", note: "Reserve held back from owners." },
  { code: "2300", name: "Taxes Payable", type: "liability", normalBalance: "credit", note: "Output VAT/withholding owed to authority." },
  { code: "2400", name: "Distributions / Investor Capital Payable", type: "liability", normalBalance: "credit", note: "Declared distributions not yet wired." },
  { code: "2500", name: "Deferred Revenue / Customer Deposits", type: "liability", normalBalance: "credit", note: "Reservation fees + deposits before earned." },
  { code: "2900", name: "Suspense / Clearing", type: "liability", normalBalance: "credit", note: "Uncategorized inflows pending classification." },
  // Equity
  { code: "3000", name: "Investor Capital Contributed", type: "equity", normalBalance: "credit", note: "Funded investor equity (drawdowns received)." },
  { code: "3100", name: "Director Loans / Shareholder Capital", type: "equity", normalBalance: "credit", note: "Director loans + shareholder contributions." },
  { code: "3900", name: "Retained Earnings / Period Net", type: "equity", normalBalance: "credit", note: "Closing target for revenue/expense at period close." },
  // Revenue
  { code: "4000", name: "Rental Revenue", type: "revenue", normalBalance: "credit", note: "Gross earned rental income (revenue_lines)." },
  { code: "4100", name: "Fee & Commission Income", type: "revenue", normalBalance: "credit", note: "Operator fee/commission + management fee income." },
  { code: "4200", name: "Sales / Development Revenue", type: "revenue", normalBalance: "credit", note: "Unit-sale / contract revenue + late fees earned." },
  { code: "4300", name: "Owner Recharge Income", type: "revenue", normalBalance: "credit", note: "Owner-chargeable cost recharges (keeps opex gross)." },
  // Expense
  { code: "5000", name: "Operating Expenses", type: "expense", normalBalance: "debit", note: "Villa/project opex + dev opex/cogs." },
  { code: "5100", name: "Management Fee Expense (Owner-side)", type: "expense", normalBalance: "debit", note: "Owner-perspective mirror of management fee." },
  { code: "5900", name: "FX Gain/Loss & Rounding", type: "expense", normalBalance: "debit", note: "Plug for currency revaluation + minor-unit rounding." },
];
