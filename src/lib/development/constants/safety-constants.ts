/**
 * Pure constants for the Stage 2.4 safety incident log. No server imports.
 */

export const SAFETY_SEVERITIES = [
  "near_miss",
  "minor",
  "moderate",
  "severe",
  "fatal",
] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export const SAFETY_SEVERITY_LABEL: Record<SafetySeverity, string> = {
  near_miss: "Near miss",
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  fatal: "Fatal",
};

export const SAFETY_SEVERITY_TONE: Record<
  SafetySeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  near_miss: "neutral",
  minor: "info",
  moderate: "warning",
  severe: "danger",
  fatal: "danger",
};

/** Severities that the cron escalator considers "must be resolved fast". */
export const ESCALATION_SEVERITIES: ReadonlySet<SafetySeverity> = new Set([
  "severe",
  "fatal",
]);

export const SAFETY_CATEGORIES = [
  "fall",
  "electrical",
  "equipment",
  "material_handling",
  "fire",
  "chemical",
  "structural",
  "vehicle",
  "weather",
  "other",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export const SAFETY_CATEGORY_LABEL: Record<SafetyCategory, string> = {
  fall: "Fall",
  electrical: "Electrical",
  equipment: "Equipment",
  material_handling: "Material handling",
  fire: "Fire",
  chemical: "Chemical",
  structural: "Structural",
  vehicle: "Vehicle",
  weather: "Weather",
  other: "Other",
};

export const SAFETY_STATUSES = [
  "open",
  "under_investigation",
  "resolved",
  "closed",
] as const;
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];

export const SAFETY_STATUS_LABEL: Record<SafetyStatus, string> = {
  open: "Open",
  under_investigation: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};
