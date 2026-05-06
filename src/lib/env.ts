import { z } from "zod";

/**
 * Server-only env. Lazily validated so missing values do not crash the
 * marketing/demo surfaces — instead, callers ask `isDbConfigured()` etc.
 * and we render mock fallbacks when the backend isn't wired.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ARCONIQUE_FORCE_MOCK: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  // v7 — background jobs / cron
  CRON_SECRET: z.string().min(16).optional(),
  APP_BASE_URL: z.string().url().optional(),
  NODE_ENV: z.string().optional(),
  // v8A — notification providers (all optional; missing = noop)
  RESEND_API_KEY: z.string().min(8).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(8).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(8).optional(),
  TWILIO_FROM_SMS: z.string().optional(),
  TWILIO_FROM_WHATSAPP: z.string().optional(),
  /** "1" = never call external providers (default for tests + dev). */
  NOTIFICATIONS_DRY_RUN: z.string().optional(),
  // v8B — AI Operations Co-pilot
  ANTHROPIC_API_KEY: z.string().min(8).optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  /** "1" = never call Anthropic (default for tests + dev). */
  AI_DRY_RUN: z.string().optional(),
  // v9G — Wi-Fi password + verification-link encryption.
  // 32+ random bytes, base64 or hex encoded. Used to wrap per-version
  // data keys in `wifi_encryption_keys`. Production must set this; dev
  // falls back to a deterministic key with a loud warning.
  STAY_LINK_KMS_SECRET: z.string().min(32).optional(),
  // Prompt 111 — Security baseline & operational hardening.
  // 32+ random bytes used to wrap MFA TOTP secrets at rest.  Production
  // must set this; dev falls back to a deterministic dev-only key with a
  // loud warning.
  SECURITY_ENCRYPTION_SECRET: z.string().min(32).optional(),
  /** Display name for the otpauth:// issuer label in authenticator apps. */
  MFA_ISSUER: z.string().optional(),
  /** "1" = enable login throttling (default in production). */
  LOGIN_THROTTLE_ENABLED: z.string().optional(),
  /** Failed-login threshold per email per 10-minute window. */
  LOGIN_MAX_FAILED_PER_EMAIL: z.coerce.number().int().min(1).optional(),
  /** Failed-login threshold per IP per 10-minute window. */
  LOGIN_MAX_FAILED_PER_IP: z.coerce.number().int().min(1).optional(),
  /** Lock duration in minutes when a threshold is exceeded. */
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).optional(),
  /** Max concurrent runs of any one cron job (always 1 with current locks). */
  CRON_MAX_CONCURRENT_PER_JOB: z.coerce.number().int().min(1).optional(),
  /** Public link to the backup / restore runbook. */
  BACKUP_RUNBOOK_URL: z.string().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_ENABLE_DEMO_MODE: z.string().optional(),
});

const parsedServer = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ARCONIQUE_FORCE_MOCK: process.env.ARCONIQUE_FORCE_MOCK,
  ADMIN_BOOTSTRAP_SECRET: process.env.ADMIN_BOOTSTRAP_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  APP_BASE_URL: process.env.APP_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_SMS: process.env.TWILIO_FROM_SMS,
  TWILIO_FROM_WHATSAPP: process.env.TWILIO_FROM_WHATSAPP,
  NOTIFICATIONS_DRY_RUN: process.env.NOTIFICATIONS_DRY_RUN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  AI_DRY_RUN: process.env.AI_DRY_RUN,
  STAY_LINK_KMS_SECRET: process.env.STAY_LINK_KMS_SECRET,
  SECURITY_ENCRYPTION_SECRET: process.env.SECURITY_ENCRYPTION_SECRET,
  MFA_ISSUER: process.env.MFA_ISSUER,
  LOGIN_THROTTLE_ENABLED: process.env.LOGIN_THROTTLE_ENABLED,
  LOGIN_MAX_FAILED_PER_EMAIL: process.env.LOGIN_MAX_FAILED_PER_EMAIL,
  LOGIN_MAX_FAILED_PER_IP: process.env.LOGIN_MAX_FAILED_PER_IP,
  LOGIN_LOCK_MINUTES: process.env.LOGIN_LOCK_MINUTES,
  CRON_MAX_CONCURRENT_PER_JOB: process.env.CRON_MAX_CONCURRENT_PER_JOB,
  BACKUP_RUNBOOK_URL: process.env.BACKUP_RUNBOOK_URL,
});

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ENABLE_DEMO_MODE: process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE,
});

export const env = {
  server: parsedServer.success ? parsedServer.data : ({} as z.infer<typeof serverSchema>),
  public: parsedPublic.success ? parsedPublic.data : ({} as z.infer<typeof publicSchema>),
};

export function forceMock(): boolean {
  return env.server.ARCONIQUE_FORCE_MOCK === "1";
}

export function isDbConfigured(): boolean {
  return !forceMock() && Boolean(env.server.DATABASE_URL);
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    env.public.NEXT_PUBLIC_SUPABASE_URL && env.public.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    env.public.NEXT_PUBLIC_SUPABASE_URL && env.server.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isDemoMode(): boolean {
  return env.public.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1";
}

export function isProduction(): boolean {
  return env.server.NODE_ENV === "production";
}

// v8A — notification provider configuration helpers.

export function isNotificationsDryRun(): boolean {
  // Default to dry-run when env is missing — production deployments must
  // explicitly opt in to live delivery by setting NOTIFICATIONS_DRY_RUN=0.
  const flag = env.server.NOTIFICATIONS_DRY_RUN;
  if (flag === undefined) return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

export function isResendConfigured(): boolean {
  return Boolean(env.server.RESEND_API_KEY && env.server.RESEND_FROM_EMAIL);
}

export function isTwilioConfigured(): boolean {
  return Boolean(env.server.TWILIO_ACCOUNT_SID && env.server.TWILIO_AUTH_TOKEN);
}

// v8B — AI configuration helpers.

export function isAiDryRun(): boolean {
  // Default to dry-run when env is missing — production deployments must
  // explicitly opt in to live Anthropic calls by setting AI_DRY_RUN=0.
  const flag = env.server.AI_DRY_RUN;
  if (flag === undefined) return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

export function isAiConfigured(): boolean {
  return Boolean(env.server.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return env.server.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
}

// -----------------------------------------------------------------------------
// Prompt 111 — Security baseline & operational hardening helpers.
// -----------------------------------------------------------------------------

export function securityEncryptionSecret(): string | null {
  return env.server.SECURITY_ENCRYPTION_SECRET ?? null;
}

export function isSecurityEncryptionConfigured(): boolean {
  return Boolean(env.server.SECURITY_ENCRYPTION_SECRET);
}

export function mfaIssuer(): string {
  return env.server.MFA_ISSUER || "Arconique";
}

export function isLoginThrottleEnabled(): boolean {
  const flag = env.server.LOGIN_THROTTLE_ENABLED;
  if (flag === undefined) return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

export function loginMaxFailedPerEmail(): number {
  return env.server.LOGIN_MAX_FAILED_PER_EMAIL ?? 5;
}

export function loginMaxFailedPerIp(): number {
  return env.server.LOGIN_MAX_FAILED_PER_IP ?? 20;
}

export function loginLockMinutes(): number {
  return env.server.LOGIN_LOCK_MINUTES ?? 15;
}

export function cronMaxConcurrentPerJob(): number {
  return env.server.CRON_MAX_CONCURRENT_PER_JOB ?? 1;
}

export function backupRunbookUrl(): string | null {
  return env.server.BACKUP_RUNBOOK_URL ?? null;
}

// v9G — Wi-Fi + verification encryption helpers.

/**
 * Returns the configured KMS secret, or `null` if missing. Callers in
 * production must treat `null` as "fail closed" — encryption / decryption
 * surfaces refuse to operate. In dev we fall back to a deterministic
 * placeholder with a loud `console.warn` so local dev keeps working.
 */
export function stayLinkKmsSecret(): string | null {
  return env.server.STAY_LINK_KMS_SECRET ?? null;
}

export function isStayLinkKmsConfigured(): boolean {
  return Boolean(env.server.STAY_LINK_KMS_SECRET);
}
