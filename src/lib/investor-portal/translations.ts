/**
 * Investor portal UI strings, keyed by ISO language code. Pure module —
 * no server imports. The investor's `reporting_language` determines the
 * dictionary at render time.
 *
 * EN is the canonical / fallback locale. RU/ID/ZH stub to EN where a
 * key isn't yet translated; gradual translation is fine and the helper
 * `t()` falls back to EN automatically. As Stage 2.3.C ships, only the
 * top-line nav + dashboard headings are localized — full coverage lands
 * before real-investor onboarding.
 */
import type { ReportingLanguage } from "@/lib/development/constants/investor-constants";

export interface PortalStrings {
  appTitle: string;
  welcomeBack: (name: string) => string;
  loading: string;
  signOut: string;

  // Nav
  navDashboard: string;
  navCommitments: string;
  navDistributions: string;
  navWallet: string;
  navDocuments: string;
  navProfile: string;

  // Login
  loginTitle: string;
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  loginError: string;
  notInvestor: string;

  // Dashboard
  dashTotalCommitted: string;
  dashTotalDrawn: string;
  dashTotalDistributed: string;
  dashInWallet: string;
  dashIrr: string;
  dashRecentActivity: string;
  dashActiveCommitments: string;
  dashNoCommitments: string;

  // Common
  amount: string;
  status: string;
  date: string;
  type: string;
  project: string;
  inUSD: string;
  fxDisclaimer: (date: string) => string;

  // Withdrawal / reinvest stubs
  requestWithdrawal: string;
  requestReinvest: string;
  notYetEnabled: string;

  // Status badges
  statusActive: string;
  statusClosed: string;
  statusReceived: string;
  statusRequested: string;
  statusOverdue: string;
}

const en: PortalStrings = {
  appTitle: "Arconique Investor Portal",
  welcomeBack: (name) => `Welcome back, ${name}`,
  loading: "Loading…",
  signOut: "Sign out",

  navDashboard: "Dashboard",
  navCommitments: "My Commitments",
  navDistributions: "Distributions",
  navWallet: "Wallet",
  navDocuments: "Documents",
  navProfile: "Profile",

  loginTitle: "Sign in to the Arconique Investor Portal",
  loginEmail: "Email",
  loginPassword: "Password",
  loginSubmit: "Sign in",
  loginError: "Invalid email or password.",
  notInvestor: "This portal is for investors only. Contact Arconique if you believe this is an error.",

  dashTotalCommitted: "Total committed",
  dashTotalDrawn: "Total drawn",
  dashTotalDistributed: "Total distributed",
  dashInWallet: "In wallet",
  dashIrr: "Weighted IRR",
  dashRecentActivity: "Recent activity",
  dashActiveCommitments: "Active commitments",
  dashNoCommitments: "No active commitments yet.",

  amount: "Amount",
  status: "Status",
  date: "Date",
  type: "Type",
  project: "Project",
  inUSD: "in USD",
  fxDisclaimer: (date) => `as of ${date}`,

  requestWithdrawal: "Request withdrawal",
  requestReinvest: "Request reinvest",
  notYetEnabled:
    "Withdrawal and reinvest requests are not yet enabled. Please contact your Arconique account manager.",

  statusActive: "Active",
  statusClosed: "Closed",
  statusReceived: "Received",
  statusRequested: "Pending",
  statusOverdue: "Overdue",
};

const ru: Partial<PortalStrings> = {
  appTitle: "Инвесторский портал Arconique",
  welcomeBack: (name) => `Добро пожаловать, ${name}`,
  loading: "Загрузка…",
  signOut: "Выйти",

  navDashboard: "Панель",
  navCommitments: "Мои инвестиции",
  navDistributions: "Распределения",
  navWallet: "Кошелёк",
  navDocuments: "Документы",
  navProfile: "Профиль",

  loginTitle: "Вход в Инвесторский портал Arconique",
  loginEmail: "Электронная почта",
  loginPassword: "Пароль",
  loginSubmit: "Войти",
  loginError: "Неверный email или пароль.",
  notInvestor:
    "Этот портал предназначен только для инвесторов. Если вы считаете, что произошла ошибка, свяжитесь с Arconique.",

  dashTotalCommitted: "Всего обязательств",
  dashTotalDrawn: "Получено",
  dashTotalDistributed: "Распределено",
  dashInWallet: "В кошельке",
  dashIrr: "Средневзвешенный IRR",
  dashRecentActivity: "Недавняя активность",
  dashActiveCommitments: "Активные инвестиции",
  dashNoCommitments: "Активных инвестиций пока нет.",

  amount: "Сумма",
  status: "Статус",
  date: "Дата",
  type: "Тип",
  project: "Проект",
  inUSD: "в USD",
  fxDisclaimer: (date) => `на дату ${date}`,

  requestWithdrawal: "Запросить вывод",
  requestReinvest: "Запросить реинвестирование",
  notYetEnabled:
    "Запросы на вывод и реинвестирование пока недоступны. Свяжитесь с вашим менеджером.",

  statusActive: "Активный",
  statusClosed: "Закрыт",
  statusReceived: "Получено",
  statusRequested: "Ожидает",
  statusOverdue: "Просрочено",
};

const id: Partial<PortalStrings> = {
  appTitle: "Portal Investor Arconique",
  welcomeBack: (name) => `Selamat datang kembali, ${name}`,
  loading: "Memuat…",
  signOut: "Keluar",

  navDashboard: "Dasbor",
  navCommitments: "Komitmen Saya",
  navDistributions: "Distribusi",
  navWallet: "Dompet",
  navDocuments: "Dokumen",
  navProfile: "Profil",

  loginTitle: "Masuk ke Portal Investor Arconique",
  loginEmail: "Email",
  loginPassword: "Kata sandi",
  loginSubmit: "Masuk",
  loginError: "Email atau kata sandi tidak valid.",
  notInvestor:
    "Portal ini khusus untuk investor. Jika Anda yakin ini adalah kesalahan, silakan hubungi Arconique.",

  dashTotalCommitted: "Total komitmen",
  dashTotalDrawn: "Total ditarik",
  dashTotalDistributed: "Total didistribusikan",
  dashInWallet: "Saldo dompet",
  dashIrr: "IRR tertimbang",
  dashRecentActivity: "Aktivitas terbaru",
  dashActiveCommitments: "Komitmen aktif",
  dashNoCommitments: "Belum ada komitmen aktif.",

  amount: "Jumlah",
  status: "Status",
  date: "Tanggal",
  type: "Jenis",
  project: "Proyek",
  inUSD: "dalam USD",
  fxDisclaimer: (date) => `per ${date}`,

  requestWithdrawal: "Ajukan penarikan",
  requestReinvest: "Ajukan reinvestasi",
  notYetEnabled:
    "Permintaan penarikan dan reinvestasi belum diaktifkan. Hubungi manajer akun Arconique Anda.",

  statusActive: "Aktif",
  statusClosed: "Ditutup",
  statusReceived: "Diterima",
  statusRequested: "Menunggu",
  statusOverdue: "Terlambat",
};

const zh: Partial<PortalStrings> = {
  appTitle: "Arconique 投资人门户",
  welcomeBack: (name) => `欢迎回来,${name}`,
  signOut: "退出",
  navDashboard: "仪表盘",
  navCommitments: "我的投资",
  navDistributions: "分配",
  navWallet: "钱包",
  navDocuments: "文档",
  navProfile: "个人资料",
};

const dictionaries: Record<ReportingLanguage, Partial<PortalStrings>> = {
  en,
  ru,
  id,
  zh,
};

/**
 * Returns the strings for the given language, falling back to EN per key.
 * Use `t(key)` to access — overrides land per-key without losing fallback
 * coverage.
 */
export function getPortalStrings(lang: ReportingLanguage): PortalStrings {
  const dict = dictionaries[lang] ?? {};
  return new Proxy(en, {
    get(target, prop) {
      const overridden = (dict as Record<string, unknown>)[prop as string];
      if (overridden !== undefined) return overridden;
      return target[prop as keyof PortalStrings];
    },
  }) as PortalStrings;
}
