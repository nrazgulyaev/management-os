/**
 * Pure constants for the Stage 2.4 vendor CRM. No server imports.
 */

export const VENDOR_TYPES = [
  "general_contractor",
  "subcontractor_civil",
  "subcontractor_mep",
  "subcontractor_finishing",
  "subcontractor_landscaping",
  "architect_designer",
  "engineer_consultant",
  "permits_legal",
  "material_supplier",
  "equipment_rental",
  "logistics_transport",
  "security_services",
  "cleaning_services",
  "other",
] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const VENDOR_TYPE_LABEL: Record<VendorType, string> = {
  general_contractor: "General contractor",
  subcontractor_civil: "Subcontractor — civil",
  subcontractor_mep: "Subcontractor — MEP",
  subcontractor_finishing: "Subcontractor — finishing",
  subcontractor_landscaping: "Subcontractor — landscaping",
  architect_designer: "Architect / designer",
  engineer_consultant: "Engineer / consultant",
  permits_legal: "Permits / legal",
  material_supplier: "Material supplier",
  equipment_rental: "Equipment rental",
  logistics_transport: "Logistics / transport",
  security_services: "Security services",
  cleaning_services: "Cleaning services",
  other: "Other",
};

export const VENDOR_STATUSES = ["active", "inactive", "blacklisted"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

export const ENGAGEMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "terminated",
] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const ENGAGEMENT_STATUS_LABEL: Record<EngagementStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  terminated: "Terminated",
};
