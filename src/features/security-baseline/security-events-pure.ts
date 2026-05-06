/**
 * Prompt 111 — Pure helpers for security events.
 */

export type SecurityEventType =
  | "login_failed"
  | "login_locked"
  | "login_succeeded"
  | "mfa_enrolled"
  | "mfa_verified"
  | "mfa_failed"
  | "mfa_recovery_used"
  | "mfa_disabled"
  | "mfa_revoked"
  | "cron_denied"
  | "suspicious_request"
  | "secret_missing"
  | "job_lock_acquired"
  | "job_lock_skipped"
  | "job_lock_released";

export type SecurityEventSeverity = "info" | "warning" | "critical";

const SEVERITY_DEFAULTS: Record<SecurityEventType, SecurityEventSeverity> = {
  login_failed: "info",
  login_locked: "warning",
  login_succeeded: "info",
  mfa_enrolled: "info",
  mfa_verified: "info",
  mfa_failed: "warning",
  mfa_recovery_used: "warning",
  mfa_disabled: "warning",
  mfa_revoked: "warning",
  cron_denied: "warning",
  suspicious_request: "warning",
  secret_missing: "critical",
  job_lock_acquired: "info",
  job_lock_skipped: "info",
  job_lock_released: "info",
};

export function defaultSeverityForEvent(
  type: SecurityEventType,
): SecurityEventSeverity {
  return SEVERITY_DEFAULTS[type] ?? "info";
}

export function eventTypeLabel(type: SecurityEventType): string {
  switch (type) {
    case "login_failed":
      return "Login failed";
    case "login_locked":
      return "Login locked";
    case "login_succeeded":
      return "Login succeeded";
    case "mfa_enrolled":
      return "MFA enrolled";
    case "mfa_verified":
      return "MFA verified";
    case "mfa_failed":
      return "MFA failed";
    case "mfa_recovery_used":
      return "MFA recovery code used";
    case "mfa_disabled":
      return "MFA disabled";
    case "mfa_revoked":
      return "MFA revoked";
    case "cron_denied":
      return "Cron denied";
    case "suspicious_request":
      return "Suspicious request";
    case "secret_missing":
      return "Encryption secret missing";
    case "job_lock_acquired":
      return "Job lock acquired";
    case "job_lock_skipped":
      return "Job lock skipped";
    case "job_lock_released":
      return "Job lock released";
  }
}

export function severityTone(
  severity: SecurityEventSeverity,
): "info" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

const BANNED_METADATA_KEYS = new Set([
  "password",
  "passwordCiphertext",
  "secret",
  "secretCiphertext",
  "totpSecret",
  "providerSessionId",
  "tokenHash",
  "holdTokenHash",
  "configPrivateEncrypted",
]);

/**
 * Pure: drop banned keys from a security-event metadata payload.
 * Belt-and-braces — services should never pass these, but a typo
 * shouldn't leak a secret into the audit log.
 */
export function sanitizeSecurityEventMetadata(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (BANNED_METADATA_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}
