/**
 * Prompt 113 — Typed registry of every environment variable the
 * Management OS reads.  The validation layer + the deployment
 * dashboard + the docs all consume this list, so adding a new env var
 * is a one-place change.
 *
 * Pure data — no `server-only`, no DB.  Safe to import from scripts
 * and tests.
 */

export type EnvCategory =
  | "core"
  | "supabase"
  | "security"
  | "notifications"
  | "ai"
  | "payments"
  | "demo";

export type EnvRequirement =
  /** Required everywhere. */
  | "always"
  /** Required only in staging / production. */
  | "production"
  /** Optional, but `getEnvReadinessReport` warns if missing. */
  | "optional"
  /** Required only when the linked feature flag is on. */
  | "conditional";

export interface EnvVarSpec {
  key: string;
  category: EnvCategory;
  /** True for `NEXT_PUBLIC_*` — never marshalled into a secret-redacted log. */
  public: boolean;
  requirement: EnvRequirement;
  description: string;
  /** Short purpose blurb shown in `docs/ENVIRONMENT-VARIABLES.md`. */
  usage: string;
  /** When `requirement = "conditional"`, the env var that gates this one. */
  conditionalOn?: string;
  /** True if a strong / random value is expected. The validation layer
   *  refuses placeholder-style values like `dev` / `changeme` /
   *  `local-secret-*` in production. */
  mustBeStrong?: boolean;
}

export const ENV_REGISTRY: ReadonlyArray<EnvVarSpec> = [
  // --------------------------------------------------------------------------
  // Core app
  // --------------------------------------------------------------------------
  {
    key: "NODE_ENV",
    category: "core",
    public: false,
    requirement: "always",
    description: "Node environment.",
    usage:
      "Set by the platform.  `production` flips production gates on.",
  },
  {
    key: "NEXT_PUBLIC_APP_ENV",
    category: "core",
    public: true,
    requirement: "production",
    description: "App-specific environment label.",
    usage:
      "`development` / `staging` / `production` / `demo`.  Surfaces in the deployment readiness UI.",
  },
  {
    key: "APP_BASE_URL",
    category: "core",
    public: false,
    requirement: "production",
    description: "Canonical absolute URL for the deployed app (no trailing slash).",
    usage:
      "Used by Supabase Auth redirects, statement PDF links, cron handlers, and notification CTAs.",
  },
  {
    key: "DATABASE_URL",
    category: "core",
    public: false,
    requirement: "production",
    description: "Pooled Postgres connection string.",
    usage: "Drizzle reads this in app code.",
  },
  {
    key: "DIRECT_URL",
    category: "core",
    public: false,
    requirement: "optional",
    description: "Direct (unpooled) Postgres URL for migrations.",
    usage: "`scripts/migrate.ts` + `scripts/seed.ts` prefer this.",
  },

  // --------------------------------------------------------------------------
  // Supabase
  // --------------------------------------------------------------------------
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    category: "supabase",
    public: true,
    requirement: "production",
    description: "Supabase project URL.",
    usage: "Used by browser + server Supabase clients.",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    category: "supabase",
    public: true,
    requirement: "production",
    description: "Supabase anon key (RLS-bound).",
    usage: "Used by browser + server Supabase clients.",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    category: "supabase",
    public: false,
    requirement: "production",
    description: "Supabase service-role key (bypasses RLS).",
    usage:
      "Server-only.  Used by admin actions, signed-URL minting, and cron handlers.  MUST never be exposed via NEXT_PUBLIC_*.",
    mustBeStrong: true,
  },

  // --------------------------------------------------------------------------
  // Security
  // --------------------------------------------------------------------------
  {
    key: "CRON_SECRET",
    category: "security",
    public: false,
    requirement: "production",
    description: "Bearer secret required by every /api/cron/* route.",
    usage:
      "Generate with `openssl rand -hex 32`.  Vercel Cron must send `Authorization: Bearer <CRON_SECRET>`.",
    mustBeStrong: true,
  },
  {
    key: "SECURITY_ENCRYPTION_SECRET",
    category: "security",
    public: false,
    requirement: "production",
    description: "Wraps MFA TOTP secrets at rest with AES-256-GCM.",
    usage: "≥ 32 characters.  Generate with `openssl rand -hex 48`.",
    mustBeStrong: true,
  },
  {
    key: "STAY_LINK_KMS_SECRET",
    category: "security",
    public: false,
    requirement: "production",
    description: "Wraps Wi-Fi passwords + verification links at rest.",
    usage: "≥ 32 characters.  Generate with `openssl rand -hex 48`.",
    mustBeStrong: true,
  },
  {
    key: "MFA_ISSUER",
    category: "security",
    public: false,
    requirement: "optional",
    description: "otpauth:// issuer label shown in authenticator apps.",
    usage: "Default `Arconique`.",
  },
  {
    key: "LOGIN_THROTTLE_ENABLED",
    category: "security",
    public: false,
    requirement: "optional",
    description: "`1` to enable login throttling.",
    usage: "Default `1` (enabled).  Set to `0` only in dev to bypass.",
  },
  {
    key: "LOGIN_MAX_FAILED_PER_EMAIL",
    category: "security",
    public: false,
    requirement: "optional",
    description: "Per-email failure threshold (rolling 10-minute window).",
    usage: "Default `5`.",
  },
  {
    key: "LOGIN_MAX_FAILED_PER_IP",
    category: "security",
    public: false,
    requirement: "optional",
    description: "Per-IP failure threshold (rolling 10-minute window).",
    usage: "Default `20`.",
  },
  {
    key: "LOGIN_LOCK_MINUTES",
    category: "security",
    public: false,
    requirement: "optional",
    description: "Lock duration when a threshold is exceeded.",
    usage: "Default `15`.",
  },

  // --------------------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------------------
  {
    key: "NOTIFICATIONS_DRY_RUN",
    category: "notifications",
    public: false,
    requirement: "production",
    description: "`1` = never call external providers; `0` = deliver.",
    usage:
      "MUST be set explicitly in production (refusing to default).  Set to `0` only after Resend / Twilio creds are verified.",
  },
  {
    key: "RESEND_API_KEY",
    category: "notifications",
    public: false,
    requirement: "conditional",
    conditionalOn: "NOTIFICATIONS_DRY_RUN=0",
    description: "Resend API key for outbound email.",
    usage: "Optional in dry-run mode.",
    mustBeStrong: true,
  },
  {
    key: "RESEND_FROM_EMAIL",
    category: "notifications",
    public: false,
    requirement: "conditional",
    conditionalOn: "NOTIFICATIONS_DRY_RUN=0",
    description: "Verified sender for outbound email.",
    usage: "Must be a domain you own and verified in Resend.",
  },
  {
    key: "TWILIO_ACCOUNT_SID",
    category: "notifications",
    public: false,
    requirement: "optional",
    description: "Twilio account SID.",
    usage: "Optional — SMS / WhatsApp delivery only.",
  },
  {
    key: "TWILIO_AUTH_TOKEN",
    category: "notifications",
    public: false,
    requirement: "optional",
    description: "Twilio auth token.",
    usage: "Optional — SMS / WhatsApp delivery only.",
    mustBeStrong: true,
  },
  {
    key: "TWILIO_FROM_SMS",
    category: "notifications",
    public: false,
    requirement: "optional",
    description: "Twilio SMS sender number (E.164).",
    usage: "Optional — SMS delivery only.",
  },
  {
    key: "TWILIO_FROM_WHATSAPP",
    category: "notifications",
    public: false,
    requirement: "optional",
    description: "Twilio WhatsApp sender (`whatsapp:+...`).",
    usage: "Optional — WhatsApp delivery only.",
  },

  // --------------------------------------------------------------------------
  // AI
  // --------------------------------------------------------------------------
  {
    key: "ANTHROPIC_API_KEY",
    category: "ai",
    public: false,
    requirement: "conditional",
    conditionalOn: "AI_DRY_RUN=0",
    description: "Anthropic API key for AI Operations + guest concierge.",
    usage: "Optional when AI is in dry-run mode.",
    mustBeStrong: true,
  },
  {
    key: "AI_DRY_RUN",
    category: "ai",
    public: false,
    requirement: "production",
    description: "`1` = never call Anthropic; `0` = make live calls.",
    usage:
      "MUST be set explicitly in production.  Default `1` (dry-run) when env is missing.",
  },
  {
    key: "ANTHROPIC_MODEL",
    category: "ai",
    public: false,
    requirement: "optional",
    description: "Claude model id.",
    usage: "Default `claude-3-5-haiku-latest`.",
  },

  // --------------------------------------------------------------------------
  // Demo / dev / bootstrap
  // --------------------------------------------------------------------------
  {
    key: "ARCONIQUE_FORCE_MOCK",
    category: "demo",
    public: false,
    requirement: "optional",
    description: "`1` to force mock data even when DATABASE_URL is set.",
    usage: "Demo / marketing only.  MUST NOT be enabled in production.",
  },
  {
    key: "NEXT_PUBLIC_ENABLE_DEMO_MODE",
    category: "demo",
    public: true,
    requirement: "optional",
    description: "Public demo banner toggle.",
    usage:
      "Surfaces demo banners on marketing routes.  Allowed in `staging`/`demo` but flagged in `production`.",
  },
  {
    key: "ADMIN_BOOTSTRAP_SECRET",
    category: "demo",
    public: false,
    requirement: "optional",
    description: "Required by the `/setup/admin-bootstrap` route.",
    usage:
      "Set to a strong value when you need to mint the first super_admin in a fresh environment.",
    mustBeStrong: true,
  },
  {
    key: "BACKUP_RUNBOOK_URL",
    category: "demo",
    public: false,
    requirement: "optional",
    description: "Public link to your team's backup / restore runbook.",
    usage: "Surfaces on `/dashboard/system/health`.",
  },
  {
    key: "CRON_MAX_CONCURRENT_PER_JOB",
    category: "core",
    public: false,
    requirement: "optional",
    description: "Max concurrent runs of any one cron job.",
    usage: "Default `1`.  Always 1 with current `job_locks` model.",
  },
  // --------------------------------------------------------------------------
  // Observability spine (Task H) — all optional; missing = local-stdout only.
  // --------------------------------------------------------------------------
  {
    key: "SENTRY_DSN",
    category: "core",
    public: false,
    requirement: "optional",
    description: "Sentry DSN — forwards warn/error logs to Sentry when set.",
    usage:
      "Standard `https://<key>@<host>/<project>` DSN.  Unset = no external error forwarding.",
  },
  {
    key: "LOGTAIL_TOKEN",
    category: "core",
    public: false,
    requirement: "optional",
    description: "Logtail (Better Stack) source token — forwards warn/error logs.",
    usage:
      "Source token from Better Stack.  Unset = no external log shipping.  Override host with `LOGTAIL_INGEST_HOST`.",
  },
  {
    key: "HEALTH_STALE_JOB_MINUTES",
    category: "core",
    public: false,
    requirement: "optional",
    description: "Minutes a job_run may sit `running` before /api/cron/health reports stale.",
    usage: "Default `60`.  /api/cron/health returns 503 once any run exceeds this.",
  },
];

/** Lookup helpers used by the validation + dashboard layers. */
export function findEnvSpec(key: string): EnvVarSpec | undefined {
  return ENV_REGISTRY.find((s) => s.key === key);
}

export function classifyEnvVar(key: string): EnvCategory | "unknown" {
  const spec = findEnvSpec(key);
  return spec?.category ?? "unknown";
}

const PUBLIC_PREFIX = "NEXT_PUBLIC_";

export function isPublicKey(key: string): boolean {
  return key.startsWith(PUBLIC_PREFIX);
}
