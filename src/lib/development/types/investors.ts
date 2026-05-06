/**
 * Pure types for the Stage 2.3 investor capital cluster. Mirror the DB
 * shape but stay UI-friendly (string for dates, number for small ints,
 * string for BIGINTs that JSON-serialize from postgres-js).
 *
 * No server-only imports.
 */
import type {
  CommitmentStatus,
  DistributionAllocationStatus,
  DistributionStatus,
  DistributionTriggerReason,
  DistributionType,
  DrawdownPaymentMethod,
  DrawdownStatus,
  DrawdownTriggerReason,
  InvestorStatus,
  InvestorType,
  LegalEntityType,
  ReportingLanguage,
  SupportedCurrency,
  WalletTransactionType,
} from "../constants/investor-constants";

// -----------------------------------------------------------------------------
// Investors
// -----------------------------------------------------------------------------

export interface InvestorListItem {
  id: string;
  investorCode: string;
  legalName: string;
  investorType: InvestorType;
  legalEntityType: LegalEntityType | null;
  taxResidency: string | null;
  primaryCurrency: SupportedCurrency;
  reportingLanguage: ReportingLanguage;
  contactEmail: string | null;
  contactPhone: string | null;
  status: InvestorStatus;
  onboardedAt: string;
  exitedAt: string | null;

  // Aggregates from related rows
  commitmentCount: number;
  totalCommittedUsdMinor: string;
  totalDrawnUsdMinor: string;
  totalDistributedUsdMinor: string;
  walletAvailableTotalUsdMinor: string;
}

export interface InvestorDetail extends InvestorListItem {
  contactId: string | null;
  notes: string | null;
  commitments: CommitmentListItem[];
}

export interface InvestorMetrics {
  totalInvestors: number;
  byType: Record<InvestorType, number>;
  byStatus: Record<InvestorStatus, number>;
  totalCommittedUsdMinor: string;
  totalDrawnUsdMinor: string;
  totalDistributedUsdMinor: string;
  totalWalletAvailableUsdMinor: string;
}

export interface CreateInvestorInput {
  investorCode: string;
  investorType: InvestorType;
  legalName: string;
  legalEntityType?: LegalEntityType | null;
  taxResidency?: string | null;
  primaryCurrency?: SupportedCurrency;
  reportingLanguage?: ReportingLanguage;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactId?: string | null;
  notes?: string | null;
}

// -----------------------------------------------------------------------------
// Commitments
// -----------------------------------------------------------------------------

export interface CommitmentListItem {
  id: string;
  commitmentCode: string;
  investorId: string;
  investorCode: string;
  investorLegalName: string;
  investorType: InvestorType;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  committedAmountMinor: string;
  committedCurrency: SupportedCurrency;
  committedAmountUsdMinor: string;
  fxRateAtCommitment: string;
  profitSharePercent: string;
  capitalReturnPriority: number;
  isLandownerJv: boolean;
  status: CommitmentStatus;
  signedAt: string | null;
  drawnUsdMinor: string;
  remainingUsdMinor: string;
  drawnPercent: number;
  walletAvailableUsdMinor: string;
}

export interface CommitmentDetail extends CommitmentListItem {
  landownerAssetValueMinor: string | null;
  landownerAssetCurrency: SupportedCurrency | null;
  agreementDocumentId: string | null;
  notes: string | null;
  createdAt: string;
  drawdowns: DrawdownListItem[];
  walletId: string;
}

export interface CreateCommitmentInput {
  investorId: string;
  projectId?: string | null;
  commitmentCode: string;
  committedAmountMinor: bigint | string;
  committedCurrency: SupportedCurrency;
  fxRateAtCommitment: string;
  profitSharePercent: string;
  capitalReturnPriority?: number;
  isLandownerJv?: boolean;
  landownerAssetValueMinor?: bigint | string | null;
  landownerAssetCurrency?: SupportedCurrency | null;
  signedAt?: string | null;
  agreementDocumentId?: string | null;
  notes?: string | null;
}

// -----------------------------------------------------------------------------
// Drawdowns
// -----------------------------------------------------------------------------

export interface DrawdownListItem {
  id: string;
  commitmentId: string;
  commitmentCode: string;
  drawdownNumber: number;
  amountMinor: string;
  currency: SupportedCurrency;
  amountUsdMinor: string;
  fxRateAtDrawdown: string;
  requestedAt: string;
  dueDate: string;
  receivedAt: string | null;
  status: DrawdownStatus;
  triggerReason: DrawdownTriggerReason;
  paymentMethod: DrawdownPaymentMethod | null;
  paymentReference: string | null;
}

export interface RequestDrawdownInput {
  commitmentId: string;
  amountMinor: bigint | string;
  currency: SupportedCurrency;
  fxRateAtDrawdown: string;
  dueDate: string;
  triggerReason: DrawdownTriggerReason;
  triggerBalanceAtRequestUsdMinor?: bigint | string | null;
  notes?: string | null;
}

export interface ConfirmDrawdownInput {
  drawdownId: string;
  receivedAt?: string;
  paymentMethod: DrawdownPaymentMethod;
  paymentReference?: string | null;
  receiptDocumentId?: string | null;
}

// -----------------------------------------------------------------------------
// Wallets & wallet transactions
// -----------------------------------------------------------------------------

export interface WalletSummary {
  id: string;
  commitmentId: string;
  availableBalanceUsdMinor: string;
  holdBalanceUsdMinor: string;
  reinvestPendingUsdMinor: string;
  totalDrawnUsdMinor: string;
  totalReturnedCapitalUsdMinor: string;
  totalProfitDistributedUsdMinor: string;
  totalWithdrawnUsdMinor: string;
  totalReinvestedUsdMinor: string;
  lastActivityAt: string;
}

export interface WalletTransactionListItem {
  id: string;
  walletId: string;
  commitmentId: string;
  transactionType: WalletTransactionType;
  amountUsdMinor: string;
  balanceAvailableAfterUsdMinor: string;
  balanceHoldAfterUsdMinor: string;
  drawdownId: string | null;
  distributionId: string | null;
  description: string | null;
  externalReference: string | null;
  occurredAt: string;
}

export interface IRRResult {
  irrAnnualized: number | null; // null if insufficient data
  cashflows: { date: string; amountUsdMinor: string; type: "in" | "out" | "terminal" }[];
}

// -----------------------------------------------------------------------------
// Distributions
// -----------------------------------------------------------------------------

export interface DistributionListItem {
  id: string;
  projectId: string | null;
  projectName: string | null;
  distributionNumber: number;
  distributionType: DistributionType;
  totalAmountUsdMinor: string;
  triggerReason: DistributionTriggerReason;
  declaredAt: string;
  effectiveDate: string;
  status: DistributionStatus;
  completedAt: string | null;
  allocationCount: number;
}

export interface DistributionAllocationItem {
  id: string;
  commitmentId: string;
  commitmentCode: string;
  investorLegalName: string;
  capitalReturnAmountUsdMinor: string;
  profitAmountUsdMinor: string;
  totalAmountUsdMinor: string;
  outstandingCapitalAtDeclareUsdMinor: string;
  profitSharePercentUsed: string;
  status: DistributionAllocationStatus;
  executedAt: string | null;
}

export interface DistributionDetail extends DistributionListItem {
  notes: string | null;
  allocations: DistributionAllocationItem[];
}
