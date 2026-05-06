/**
 * Invoice PDF translation strings.
 *
 * Pure module — safe to import anywhere. Add new languages here without
 * touching the template. The template renders whatever shape this map
 * carries; missing keys fall back to English.
 */

export type InvoiceLanguage = "en" | "ru" | "id";

export interface InvoiceStrings {
  documentTypeStandard: string;
  documentTypePre: string;
  documentTypeFinal: string;
  documentTypeLateFee: string;
  documentTypeCreditNote: string;

  invoiceNumberLabel: string;
  issuedDate: string;
  dueDate: string;
  status: string;

  issuedBy: string;
  issuedTo: string;

  property: string;
  project: string;
  unit: string;
  unitType: string;
  buildingArea: string;
  plotArea: string;

  lineItems: string;
  description: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;

  subtotal: string;
  taxesBreakdown: string;
  grandTotal: string;
  equivalentIdr: string;
  fxRateAt: string;
  fxDisclaimer: string;

  paymentInstructions: string;
  bankTransfer: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  swiftBic: string;
  cryptoWallet: string;
  reference: string;

  termsHeader: string;
  termsBody: string;

  generatedAt: string;
  page: string;

  /** Status badge labels (mirrors `invoices.status` enum). */
  statusDraft: string;
  statusSent: string;
  statusViewed: string;
  statusPaid: string;
  statusOverdue: string;
  statusVoid: string;
}

const en: InvoiceStrings = {
  documentTypeStandard: "INVOICE",
  documentTypePre: "PRE-INVOICE",
  documentTypeFinal: "FINAL INVOICE",
  documentTypeLateFee: "LATE FEE INVOICE",
  documentTypeCreditNote: "CREDIT NOTE",

  invoiceNumberLabel: "Invoice no.",
  issuedDate: "Issued",
  dueDate: "Due by",
  status: "Status",

  issuedBy: "Issued by",
  issuedTo: "Issued to",

  property: "Property",
  project: "Project",
  unit: "Unit",
  unitType: "Type",
  buildingArea: "Building area",
  plotArea: "Plot area",

  lineItems: "Line items",
  description: "Description",
  amount: "Amount",
  taxRate: "Tax rate",
  taxAmount: "Tax",
  lineTotal: "Line total",

  subtotal: "Subtotal",
  taxesBreakdown: "Taxes",
  grandTotal: "Grand total",
  equivalentIdr: "≈ in IDR",
  fxRateAt: "FX rate (USD → IDR)",
  fxDisclaimer:
    "FX rate is the snapshot at issuance. Final IDR amount may differ at settlement.",

  paymentInstructions: "Payment instructions",
  bankTransfer: "Bank transfer",
  bankName: "Bank",
  accountName: "Account name",
  accountNumber: "Account no.",
  swiftBic: "SWIFT / BIC",
  cryptoWallet: "Crypto wallet (USDT)",
  reference: "Reference / memo",

  termsHeader: "Terms",
  termsBody:
    "Payment is due by the date shown above. Late payments accrue fees per the project's late-fee policy. This invoice is a payment demand under the corresponding sales contract — please use the reference above so we can match your payment.",

  generatedAt: "Generated",
  page: "Page",

  statusDraft: "Draft",
  statusSent: "Sent",
  statusViewed: "Viewed",
  statusPaid: "Paid",
  statusOverdue: "Overdue",
  statusVoid: "Void",
};

const ru: InvoiceStrings = {
  documentTypeStandard: "СЧЁТ",
  documentTypePre: "ПРЕДВАРИТЕЛЬНЫЙ СЧЁТ",
  documentTypeFinal: "ФИНАЛЬНЫЙ СЧЁТ",
  documentTypeLateFee: "СЧЁТ НА ПЕНИ",
  documentTypeCreditNote: "КРЕДИТ-НОТА",

  invoiceNumberLabel: "№ счёта",
  issuedDate: "Выставлен",
  dueDate: "Срок оплаты",
  status: "Статус",

  issuedBy: "Поставщик",
  issuedTo: "Получатель",

  property: "Объект",
  project: "Проект",
  unit: "Юнит",
  unitType: "Тип",
  buildingArea: "Площадь застройки",
  plotArea: "Площадь участка",

  lineItems: "Позиции",
  description: "Описание",
  amount: "Сумма",
  taxRate: "Ставка налога",
  taxAmount: "Налог",
  lineTotal: "Итого по строке",

  subtotal: "Промежуточный итог",
  taxesBreakdown: "Налоги",
  grandTotal: "Итого к оплате",
  equivalentIdr: "≈ в IDR",
  fxRateAt: "Курс (USD → IDR)",
  fxDisclaimer:
    "Курс зафиксирован на момент выставления счёта. Сумма в IDR при расчёте может отличаться.",

  paymentInstructions: "Реквизиты для оплаты",
  bankTransfer: "Банковский перевод",
  bankName: "Банк",
  accountName: "Получатель",
  accountNumber: "Счёт",
  swiftBic: "SWIFT / BIC",
  cryptoWallet: "Криптокошелёк (USDT)",
  reference: "Назначение / референс",

  termsHeader: "Условия",
  termsBody:
    "Платёж должен быть выполнен в указанный срок. Просроченные платежи облагаются пенями согласно политике проекта. Настоящий счёт является требованием по соответствующему договору купли-продажи — пожалуйста, используйте указанный референс, чтобы мы могли сопоставить платёж.",

  generatedAt: "Сформирован",
  page: "Стр.",

  statusDraft: "Черновик",
  statusSent: "Отправлен",
  statusViewed: "Просмотрен",
  statusPaid: "Оплачен",
  statusOverdue: "Просрочен",
  statusVoid: "Аннулирован",
};

const id: InvoiceStrings = {
  documentTypeStandard: "FAKTUR",
  documentTypePre: "PRA-FAKTUR",
  documentTypeFinal: "FAKTUR FINAL",
  documentTypeLateFee: "FAKTUR DENDA KETERLAMBATAN",
  documentTypeCreditNote: "NOTA KREDIT",

  invoiceNumberLabel: "No. faktur",
  issuedDate: "Diterbitkan",
  dueDate: "Jatuh tempo",
  status: "Status",

  issuedBy: "Diterbitkan oleh",
  issuedTo: "Ditujukan kepada",

  property: "Properti",
  project: "Proyek",
  unit: "Unit",
  unitType: "Tipe",
  buildingArea: "Luas bangunan",
  plotArea: "Luas lahan",

  lineItems: "Rincian",
  description: "Deskripsi",
  amount: "Jumlah",
  taxRate: "Tarif pajak",
  taxAmount: "Pajak",
  lineTotal: "Total baris",

  subtotal: "Subtotal",
  taxesBreakdown: "Pajak",
  grandTotal: "Total akhir",
  equivalentIdr: "≈ dalam IDR",
  fxRateAt: "Kurs (USD → IDR)",
  fxDisclaimer:
    "Kurs adalah snapshot pada saat penerbitan. Jumlah IDR akhir dapat berbeda pada saat pelunasan.",

  paymentInstructions: "Instruksi pembayaran",
  bankTransfer: "Transfer bank",
  bankName: "Bank",
  accountName: "Nama rekening",
  accountNumber: "No. rekening",
  swiftBic: "SWIFT / BIC",
  cryptoWallet: "Dompet kripto (USDT)",
  reference: "Referensi / memo",

  termsHeader: "Ketentuan",
  termsBody:
    "Pembayaran jatuh tempo pada tanggal yang ditunjukkan di atas. Pembayaran terlambat akan dikenakan denda sesuai kebijakan proyek. Faktur ini merupakan permintaan pembayaran berdasarkan kontrak penjualan terkait — mohon gunakan referensi di atas agar kami dapat mencocokkan pembayaran Anda.",

  generatedAt: "Dibuat",
  page: "Hal.",

  statusDraft: "Konsep",
  statusSent: "Terkirim",
  statusViewed: "Dilihat",
  statusPaid: "Dibayar",
  statusOverdue: "Terlambat",
  statusVoid: "Batal",
};

const ALL: Record<InvoiceLanguage, InvoiceStrings> = { en, ru, id };

export function getInvoiceStrings(language: string | null | undefined): InvoiceStrings {
  if (language === "ru" || language === "id") return ALL[language];
  return ALL.en;
}
