/**
 * Pure constants for the Stage 2.4 site operations. No server imports.
 */

export const ZONE_TYPES = [
  "foundation",
  "structure",
  "mep",
  "finishing",
  "landscaping",
  "infrastructure",
  "common_area",
  "other",
] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONE_TYPE_LABEL: Record<ZoneType, string> = {
  foundation: "Foundation",
  structure: "Structure",
  mep: "MEP (Mech/Elec/Plumb)",
  finishing: "Finishing",
  landscaping: "Landscaping",
  infrastructure: "Infrastructure",
  common_area: "Common area",
  other: "Other",
};

export const REPORT_STATUSES = [
  "draft",
  "submitted",
  "reviewed",
  "flagged",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewed: "Reviewed",
  flagged: "Flagged",
};

export const SOURCE_CHANNELS = [
  "web",
  "whatsapp",
  "mobile_app",
  "api",
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const WEATHER_CONDITIONS = [
  "clear",
  "overcast",
  "light_rain",
  "heavy_rain",
  "storm",
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const WEATHER_LABEL: Record<WeatherCondition, string> = {
  clear: "Clear",
  overcast: "Overcast",
  light_rain: "Light rain",
  heavy_rain: "Heavy rain",
  storm: "Storm",
};

export const WORKFORCE_ROLES = [
  "foreman",
  "skilled_worker",
  "unskilled_worker",
  "specialist",
  "equipment_operator",
  "helper",
] as const;
export type WorkforceRole = (typeof WORKFORCE_ROLES)[number];

export const WORKFORCE_ROLE_LABEL: Record<WorkforceRole, string> = {
  foreman: "Foreman",
  skilled_worker: "Skilled worker",
  unskilled_worker: "Unskilled worker",
  specialist: "Specialist",
  equipment_operator: "Equipment operator",
  helper: "Helper",
};
