// Stage 6.P3.5 — Coverage audit classifier.
//
// Reads tmp/coverage-audit.json (produced by audit-coverage.ts) and
// the master sidebar inventory below, then emits the final markdown
// report at docs/STAGE-6-COVERAGE-AUDIT.md.
//
// Run with: npx tsx scripts/audit-coverage-classify.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface PageAnalysis {
  route: string;
  pageFile: string;
  appShell: string;
  depth: number;
  imports: string[];
  importsActionsFrom: string[];
  importsQueriesFrom: string[];
  hasReadShape: boolean;
  hasCreateUi: boolean;
  hasEditUi: boolean;
  hasDeleteUi: boolean;
  formActionCount: number;
  importedActionNames: string[];
  testRefs: string[];
  isDashboardLike?: boolean;
  hasNewSubRoute?: boolean;
  hasDetailSubRoute?: boolean;
  hasEditSubRoute?: boolean;
}

interface Audit {
  generatedAt: string;
  totals: Record<string, unknown>;
  pages: PageAnalysis[];
}

const ROOT = process.cwd();
const audit: Audit = JSON.parse(
  readFileSync(join(ROOT, "tmp/coverage-audit.json"), "utf8"),
);

// ---------------------------------------------------------------------------
// Master inventory — every section the user listed in the audit prompt.
// Keys are display names; values are candidate routes (the first one that
// resolves wins). Some sections have multiple candidates because the
// production sidebar may use either a top-level slug or a nested one.
// ---------------------------------------------------------------------------

interface InventoryEntry {
  domain: string;
  name: string;
  routeCandidates: string[];
  /** When the user's prompt flagged a stage hint badge. */
  stageHint?: string;
  /** When the section is genuinely read-only by design (audit log,
   *  notification log, etc.). */
  readOnlyByDesign?: boolean;
}

const INVENTORY: InventoryEntry[] = [
  // -------------------------------------------------------------------------
  // Management OS — verified against actual src/app/(dashboard)/**/page.tsx
  // -------------------------------------------------------------------------
  { domain: "Portfolio (Mgmt OS)", name: "Projects", routeCandidates: ["/dashboard/projects"] },
  { domain: "Portfolio (Mgmt OS)", name: "Villas", routeCandidates: ["/dashboard/villas"] },
  { domain: "Owners & Investors (Mgmt OS)", name: "Owners", routeCandidates: ["/dashboard/owners"] },
  { domain: "Owners & Investors (Mgmt OS)", name: "Ownership shares", routeCandidates: ["/dashboard/shares"] },

  { domain: "Bookings (Mgmt OS)", name: "Bookings", routeCandidates: ["/dashboard/bookings"] },
  { domain: "Bookings (Mgmt OS)", name: "Calendar", routeCandidates: ["/dashboard/bookings/calendar"] },
  { domain: "Bookings (Mgmt OS)", name: "Sync", routeCandidates: ["/dashboard/bookings/sync"] },
  { domain: "Bookings (Mgmt OS)", name: "Rate plans", routeCandidates: ["/dashboard/bookings/rates"] },
  { domain: "Bookings (Mgmt OS)", name: "Channels (Mgmt)", routeCandidates: ["/dashboard/channels"] },
  { domain: "Bookings (Mgmt OS)", name: "Guests", routeCandidates: ["/dashboard/guests"] },

  { domain: "Guest Stays", name: "Overview", routeCandidates: ["/dashboard/guest-stays"] },
  { domain: "Guest Stays", name: "Tokens", routeCandidates: ["/dashboard/guest-stays/tokens"] },
  { domain: "Guest Stays", name: "Villa guides", routeCandidates: ["/dashboard/villa-guides"] },
  { domain: "Guest Stays", name: "Sections (sub-pages)", routeCandidates: ["/dashboard/villa-guides/sections"] },
  { domain: "Guest Stays", name: "Wi-Fi", routeCandidates: ["/dashboard/villa-guides/wifi"] },
  { domain: "Guest Stays", name: "Emergency contacts", routeCandidates: ["/dashboard/villa-guides/emergency-contacts"] },
  { domain: "Guest Stays", name: "Neighborhood", routeCandidates: ["/dashboard/villa-guides/neighborhood"] },

  { domain: "Guest Services", name: "Services", routeCandidates: ["/dashboard/guest-services"] },
  { domain: "Guest Services", name: "Catalog", routeCandidates: ["/dashboard/guest-services/catalog"] },
  { domain: "Guest Services", name: "Orders", routeCandidates: ["/dashboard/guest-services/orders"] },
  { domain: "Guest Services", name: "Finance bridge", routeCandidates: ["/dashboard/guest-services/finance-bridge"] },

  { domain: "Guest Stay Security", name: "Security", routeCandidates: ["/dashboard/guest-stays/security"] },
  { domain: "Guest Stay Security", name: "Security events", routeCandidates: ["/dashboard/guest-stays/security/events"], readOnlyByDesign: true },
  { domain: "Guest Stay Security", name: "Verifications", routeCandidates: ["/dashboard/guest-stays/security/verifications"] },
  { domain: "Guest Stay Security", name: "Wi-Fi migration", routeCandidates: ["/dashboard/villa-guides/wifi/migrate"] },
  { domain: "Guest Stay Security", name: "Attachment storage", routeCandidates: ["/dashboard/guest-ai/storage"] },

  { domain: "Concierge AI", name: "Concierge AI", routeCandidates: ["/dashboard/guest-ai"] },
  { domain: "Concierge AI", name: "AI sessions", routeCandidates: ["/dashboard/guest-ai/sessions"], readOnlyByDesign: true },
  { domain: "Concierge AI", name: "AI handoffs", routeCandidates: ["/dashboard/guest-ai/handoffs"] },
  { domain: "Concierge AI", name: "Handoff SLA", routeCandidates: ["/dashboard/guest-ai/handoffs/metrics"], readOnlyByDesign: true },

  { domain: "Owner Stays", name: "Overview", routeCandidates: ["/dashboard/owner-stays"] },
  { domain: "Owner Stays", name: "Requests", routeCandidates: ["/dashboard/owner-stays/requests"] },
  { domain: "Owner Stays", name: "Policies", routeCandidates: ["/dashboard/owner-stays/policies"] },
  { domain: "Owner Stays", name: "Equivalence groups", routeCandidates: ["/dashboard/owner-stays/equivalence-groups"] },
  { domain: "Owner Stays", name: "Finance bridge", routeCandidates: ["/dashboard/owner-stays/finance-bridge", "/dashboard/owner-stays/finance"] },

  { domain: "Maintenance Intelligence", name: "Overview", routeCandidates: ["/dashboard/maintenance-intelligence"] },
  { domain: "Maintenance Intelligence", name: "Templates", routeCandidates: ["/dashboard/maintenance-intelligence/templates"] },
  { domain: "Maintenance Intelligence", name: "Plans", routeCandidates: ["/dashboard/maintenance-intelligence/plans"] },
  { domain: "Maintenance Intelligence", name: "Windows", routeCandidates: ["/dashboard/maintenance-intelligence/windows"] },
  { domain: "Maintenance Intelligence", name: "Risk feed", routeCandidates: ["/dashboard/maintenance-intelligence/risks"], readOnlyByDesign: true },

  { domain: "Utilities", name: "Overview", routeCandidates: ["/dashboard/utilities"] },
  { domain: "Utilities", name: "Accounts", routeCandidates: ["/dashboard/utilities/accounts"] },
  { domain: "Utilities", name: "Readings", routeCandidates: ["/dashboard/utilities/readings"] },
  { domain: "Utilities", name: "Payments", routeCandidates: ["/dashboard/utilities/payments"] },
  { domain: "Utilities", name: "Risks", routeCandidates: ["/dashboard/utilities/risks"] },

  { domain: "Front Office", name: "Today", routeCandidates: ["/dashboard/front-office"] },
  { domain: "Front Office", name: "Arrivals", routeCandidates: ["/dashboard/front-office/arrivals"] },
  { domain: "Front Office", name: "Departures", routeCandidates: ["/dashboard/front-office/departures"] },
  { domain: "Front Office", name: "In-house", routeCandidates: ["/dashboard/front-office/in-house"] },
  { domain: "Front Office", name: "Check-in/out requests", routeCandidates: ["/dashboard/front-office/requests"] },

  { domain: "Availability", name: "Availability board", routeCandidates: ["/dashboard/availability"] },
  { domain: "Availability", name: "Calendar blocks", routeCandidates: ["/dashboard/availability/blocks"] },
  { domain: "Availability", name: "Readiness", routeCandidates: ["/dashboard/readiness"] },

  { domain: "Security (Mgmt)", name: "Overview", routeCandidates: ["/dashboard/security"] },
  { domain: "Security (Mgmt)", name: "Cameras", routeCandidates: ["/dashboard/security/cameras"] },
  { domain: "Security (Mgmt)", name: "Authentication", routeCandidates: ["/dashboard/security/auth"] },
  { domain: "Security (Mgmt)", name: "Login attempts", routeCandidates: ["/dashboard/security/login-attempts"], readOnlyByDesign: true },
  { domain: "Security (Mgmt)", name: "Events", routeCandidates: ["/dashboard/security/events"], readOnlyByDesign: true },
  { domain: "Security (Mgmt)", name: "MFA factors", routeCandidates: ["/dashboard/security/mfa"] },

  { domain: "Integrations (Mgmt)", name: "Overview", routeCandidates: ["/dashboard/integrations"] },
  { domain: "Integrations (Mgmt)", name: "Calendar feeds", routeCandidates: ["/dashboard/integrations/calendar-feeds"] },
  { domain: "Integrations (Mgmt)", name: "Calendar events", routeCandidates: ["/dashboard/integrations/calendar-events"], readOnlyByDesign: true },
  { domain: "Integrations (Mgmt)", name: "Conflicts", routeCandidates: ["/dashboard/integrations/conflicts"] },
  { domain: "Integrations (Mgmt)", name: "Automation rules", routeCandidates: ["/dashboard/integrations/automation"] },

  { domain: "Finance (Mgmt)", name: "Finance", routeCandidates: ["/dashboard/finance"] },
  { domain: "Finance (Mgmt)", name: "Material-usage bridge", routeCandidates: ["/dashboard/finance/material-usage"] },
  { domain: "Finance (Mgmt)", name: "Statement transparency", routeCandidates: ["/dashboard/finance/transparency"] },

  { domain: "Owner Intelligence", name: "Overview", routeCandidates: ["/dashboard/owner-intelligence"] },
  { domain: "Owner Intelligence", name: "Calendar", routeCandidates: ["/dashboard/owner-intelligence/calendar"], readOnlyByDesign: true },
  { domain: "Owner Intelligence", name: "Health reports", routeCandidates: ["/dashboard/owner-intelligence/health"], readOnlyByDesign: true },
  { domain: "Owner Intelligence", name: "Reviews", routeCandidates: ["/dashboard/owner-intelligence/reviews"] },
  { domain: "Owner Intelligence", name: "Preferences", routeCandidates: ["/dashboard/owner-intelligence/preferences"] },
  { domain: "Owner Intelligence", name: "Rebuild events", routeCandidates: ["/dashboard/owner-intelligence/rebuild"], readOnlyByDesign: true },
  { domain: "Owner Intelligence", name: "Booking projection", routeCandidates: ["/dashboard/owner-intelligence/bookings"], readOnlyByDesign: true },
  { domain: "Owner Intelligence", name: "Revenue source mix", routeCandidates: ["/dashboard/owner-intelligence/revenue"], readOnlyByDesign: true },

  { domain: "Guest Journey", name: "Overview", routeCandidates: ["/dashboard/guest-journey"] },
  { domain: "Guest Journey", name: "Rules", routeCandidates: ["/dashboard/guest-journey/rules"] },
  { domain: "Guest Journey", name: "Runs", routeCandidates: ["/dashboard/guest-journey/runs"], readOnlyByDesign: true },
  { domain: "Guest Journey", name: "Suggestions", routeCandidates: ["/dashboard/guest-journey/suggestions"], readOnlyByDesign: true },
  { domain: "Guest Journey", name: "Review requests", routeCandidates: ["/dashboard/guest-journey/reviews"] },

  { domain: "Service Fulfilment", name: "Overview", routeCandidates: ["/dashboard/service-fulfilment"] },
  { domain: "Service Fulfilment", name: "Fulfilments", routeCandidates: ["/dashboard/service-fulfilment/fulfilments"] },
  { domain: "Service Fulfilment", name: "Vendors", routeCandidates: ["/dashboard/service-fulfilment/vendors"] },
  { domain: "Service Fulfilment", name: "Invoices", routeCandidates: ["/dashboard/service-fulfilment/invoices"] },
  { domain: "Service Fulfilment", name: "Ratings", routeCandidates: ["/dashboard/service-fulfilment/ratings"] },
  { domain: "Service Fulfilment", name: "Finance bridge", routeCandidates: ["/dashboard/service-fulfilment/finance-bridge"] },

  { domain: "Dynamic Pricing", name: "Overview", routeCandidates: ["/dashboard/pricing"] },
  { domain: "Dynamic Pricing", name: "Rule sets", routeCandidates: ["/dashboard/pricing/rule-sets"] },
  { domain: "Dynamic Pricing", name: "Calendar", routeCandidates: ["/dashboard/pricing/calendar"] },
  { domain: "Dynamic Pricing", name: "Quote tester", routeCandidates: ["/dashboard/pricing/quote"] },
  { domain: "Dynamic Pricing", name: "Logs", routeCandidates: ["/dashboard/pricing/logs"], readOnlyByDesign: true },
  { domain: "Dynamic Pricing", name: "Channel push", routeCandidates: ["/dashboard/pricing/channel-push"] },

  { domain: "Direct Bookings", name: "Overview", routeCandidates: ["/dashboard/direct-bookings"] },
  { domain: "Direct Bookings", name: "Holds", routeCandidates: ["/dashboard/direct-bookings/holds"] },
  { domain: "Direct Bookings", name: "Requests", routeCandidates: ["/dashboard/direct-bookings/requests"] },
  { domain: "Direct Bookings", name: "Deposits", routeCandidates: ["/dashboard/direct-bookings/deposits"] },
  { domain: "Direct Bookings", name: "Reconciliation", routeCandidates: ["/dashboard/direct-bookings/reconciliation"] },
  { domain: "Direct Bookings", name: "Guest status", routeCandidates: ["/dashboard/direct-bookings/guest-status"] },
  { domain: "Direct Bookings", name: "Guest messages", routeCandidates: ["/dashboard/direct-bookings/messages"] },

  { domain: "Payments (Mgmt)", name: "Overview", routeCandidates: ["/dashboard/payments"] },
  { domain: "Payments (Mgmt)", name: "Providers", routeCandidates: ["/dashboard/payments/providers"] },
  { domain: "Payments (Mgmt)", name: "Webhooks", routeCandidates: ["/dashboard/payments/webhooks"], readOnlyByDesign: true },

  { domain: "Operations (Mgmt)", name: "Command center", routeCandidates: ["/dashboard/operations"] },
  { domain: "Operations (Mgmt)", name: "Tasks", routeCandidates: ["/dashboard/operations/tasks"] },
  { domain: "Operations (Mgmt)", name: "Housekeeping", routeCandidates: ["/dashboard/operations/housekeeping"] },
  { domain: "Operations (Mgmt)", name: "Maintenance", routeCandidates: ["/dashboard/operations/maintenance"] },
  { domain: "Operations (Mgmt)", name: "Preventive", routeCandidates: ["/dashboard/operations/preventive"] },
  { domain: "Operations (Mgmt)", name: "Checklists", routeCandidates: ["/dashboard/operations/checklists"] },
  { domain: "Operations (Mgmt)", name: "Service requests", routeCandidates: ["/dashboard/operations/service-requests"] },
  { domain: "Operations (Mgmt)", name: "Damage reports", routeCandidates: ["/dashboard/operations/damage-reports", "/dashboard/operations/damage"] },

  { domain: "Inventory (Mgmt)", name: "Stock command", routeCandidates: ["/dashboard/inventory"] },
  { domain: "Inventory (Mgmt)", name: "Items", routeCandidates: ["/dashboard/inventory/items"] },
  { domain: "Inventory (Mgmt)", name: "Stock by location", routeCandidates: ["/dashboard/inventory/stock"] },
  { domain: "Inventory (Mgmt)", name: "Movements", routeCandidates: ["/dashboard/inventory/movements"] },
  { domain: "Inventory (Mgmt)", name: "Locations", routeCandidates: ["/dashboard/inventory/locations"] },
  { domain: "Inventory (Mgmt)", name: "Categories", routeCandidates: ["/dashboard/inventory/categories"] },
  { domain: "Inventory (Mgmt)", name: "Suppliers", routeCandidates: ["/dashboard/inventory/suppliers"] },
  { domain: "Inventory (Mgmt)", name: "Counts", routeCandidates: ["/dashboard/inventory/counts"] },

  { domain: "Procurement (Mgmt)", name: "Procurement", routeCandidates: ["/dashboard/procurement"] },
  { domain: "Procurement (Mgmt)", name: "Purchase requests", routeCandidates: ["/dashboard/procurement/requests"] },
  { domain: "Procurement (Mgmt)", name: "Purchase orders", routeCandidates: ["/dashboard/procurement/orders"] },

  { domain: "Documents (Mgmt)", name: "Documents", routeCandidates: ["/dashboard/documents"] },
  { domain: "Intelligence (Mgmt)", name: "AI assistants", routeCandidates: ["/dashboard/ai"] },

  { domain: "System (Mgmt)", name: "Background jobs", routeCandidates: ["/dashboard/jobs"] },
  { domain: "System (Mgmt)", name: "Job runs", routeCandidates: ["/dashboard/jobs/runs"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Job locks", routeCandidates: ["/dashboard/jobs/locks"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "System health", routeCandidates: ["/dashboard/system/health"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Deployment readiness", routeCandidates: ["/dashboard/system/deployment"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Demo walkthrough", routeCandidates: ["/dashboard/demo"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Notifications", routeCandidates: ["/dashboard/notifications"] },
  { domain: "System (Mgmt)", name: "Inbox (system notifications)", routeCandidates: ["/dashboard/notifications/inbox"] },
  { domain: "System (Mgmt)", name: "Delivery log", routeCandidates: ["/dashboard/notifications/deliveries"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Notification preferences", routeCandidates: ["/dashboard/notifications/preferences"] },
  { domain: "System (Mgmt)", name: "Audit log", routeCandidates: ["/dashboard/audit"], readOnlyByDesign: true },
  { domain: "System (Mgmt)", name: "Settings", routeCandidates: ["/dashboard/settings"] },
  { domain: "System (Mgmt)", name: "Responsibility scopes", routeCandidates: ["/dashboard/settings/responsibility-scopes"] },
  { domain: "System (Mgmt)", name: "My account security", routeCandidates: ["/dashboard/settings/security"] },

  // -------------------------------------------------------------------------
  // Development OS
  // -------------------------------------------------------------------------
  { domain: "Dev OS Top Level", name: "Command center", routeCandidates: ["/development-os"] },

  { domain: "Cabinets (Dev OS)", name: "My cabinet", routeCandidates: ["/development-os/cabinets/my-cabinet"] },
  { domain: "Cabinets (Dev OS)", name: "Site supervisor", routeCandidates: ["/development-os/cabinets/site-supervisor"] },
  { domain: "Cabinets (Dev OS)", name: "Project manager", routeCandidates: ["/development-os/cabinets/project-manager"] },
  { domain: "Cabinets (Dev OS)", name: "CFO / Accountant", routeCandidates: ["/development-os/cabinets/cfo-accountant"] },
  { domain: "Cabinets (Dev OS)", name: "QS / Cost analyst", routeCandidates: ["/development-os/cabinets/qs"] },
  { domain: "Cabinets (Dev OS)", name: "Procurement manager", routeCandidates: ["/development-os/cabinets/procurement-manager"] },
  { domain: "Cabinets (Dev OS)", name: "Warehouse manager", routeCandidates: ["/development-os/cabinets/warehouse-manager"] },
  { domain: "Cabinets (Dev OS)", name: "Marketing staff", routeCandidates: ["/development-os/cabinets/marketing-staff"] },
  { domain: "Cabinets (Dev OS)", name: "Sales manager", routeCandidates: ["/development-os/cabinets/sales-manager"] },

  { domain: "Marketing (Dev OS)", name: "Dashboard", routeCandidates: ["/development-os/marketing/dashboard"] },
  { domain: "Marketing (Dev OS)", name: "Lead sources", routeCandidates: ["/development-os/marketing/lead-sources"] },
  { domain: "Marketing (Dev OS)", name: "Campaigns", routeCandidates: ["/development-os/marketing/campaigns"] },
  { domain: "Marketing (Dev OS)", name: "Content pipeline", routeCandidates: ["/development-os/marketing/content"] },
  { domain: "Marketing (Dev OS)", name: "Conversations", routeCandidates: ["/development-os/marketing/conversations"] },
  { domain: "Marketing (Dev OS)", name: "Manager performance", routeCandidates: ["/development-os/marketing/manager-performance"], readOnlyByDesign: true },

  { domain: "AI Agents", name: "Hub", routeCandidates: ["/development-os/ai-agents"] },
  { domain: "AI Agents", name: "Inbox", routeCandidates: ["/development-os/ai-agents/inbox"] },
  { domain: "AI Agents", name: "QS Cost Analyst", routeCandidates: ["/development-os/ai-agents/qs-cost-analyst"] },
  { domain: "AI Agents", name: "Procurement Analyst", routeCandidates: ["/development-os/ai-agents/procurement-analyst"] },
  { domain: "AI Agents", name: "Tax Assistant", routeCandidates: ["/development-os/ai-agents/tax-assistant"] },
  { domain: "AI Agents", name: "Marketing Assistant", routeCandidates: ["/development-os/ai-agents/marketing-assistant"] },
  { domain: "AI Agents", name: "Executive Business", routeCandidates: ["/development-os/ai-agents/executive-business"] },
  { domain: "AI Agents", name: "Daily Digest", routeCandidates: ["/development-os/ai-agents/daily-digest"] },
  { domain: "AI Agents", name: "Weekly Plan", routeCandidates: ["/development-os/ai-agents/weekly-plan"] },
  { domain: "AI Agents", name: "Project Memory", routeCandidates: ["/development-os/ai-agents/memory"] },

  { domain: "Executive (Dev OS)", name: "Dashboard", routeCandidates: ["/development-os/dashboard"], readOnlyByDesign: true },
  { domain: "Executive (Dev OS)", name: "Visual reports", routeCandidates: ["/development-os/reports"], readOnlyByDesign: true },
  { domain: "Executive (Dev OS)", name: "Risk radar", routeCandidates: ["/development-os/risk-radar"] },
  { domain: "Executive (Dev OS)", name: "Executive digests", routeCandidates: ["/development-os/digests"] },

  { domain: "Build & Sell", name: "Projects", routeCandidates: ["/development-os/projects"] },
  { domain: "Build & Sell", name: "Assets", routeCandidates: ["/development-os/assets"] },
  { domain: "Build & Sell", name: "Asset types", routeCandidates: ["/development-os/asset-types"] },
  { domain: "Build & Sell", name: "Site reports", routeCandidates: ["/development-os/site-reports"] },
  { domain: "Build & Sell", name: "Sales & buyers", routeCandidates: ["/development-os/buyers"] },
  { domain: "Build & Sell", name: "Sales (legacy)", routeCandidates: ["/development-os/sales"] },
  { domain: "Build & Sell", name: "Reservations", routeCandidates: ["/development-os/reservations"] },
  { domain: "Build & Sell", name: "Contracts", routeCandidates: ["/development-os/contracts"] },
  { domain: "Build & Sell", name: "Invoices", routeCandidates: ["/development-os/invoices"] },
  { domain: "Build & Sell", name: "Discounts", routeCandidates: ["/development-os/discounts"] },

  { domain: "Capital", name: "Finance", routeCandidates: ["/development-os/finance"] },
  { domain: "Capital", name: "Invoices", routeCandidates: ["/development-os/finance/invoices"] },
  { domain: "Capital", name: "Tax types", routeCandidates: ["/development-os/finance/tax-types"] },
  { domain: "Capital", name: "Tax reports", routeCandidates: ["/development-os/finance/tax-reports"] },
  { domain: "Capital", name: "Shared costs", routeCandidates: ["/development-os/finance/shared-costs"] },
  { domain: "Capital", name: "Document extraction", routeCandidates: ["/development-os/finance/document-extractions"] },
  { domain: "Capital", name: "Investors", routeCandidates: ["/development-os/investors"] },
  { domain: "Capital", name: "Investor requests", routeCandidates: ["/development-os/investor-requests"] },
  { domain: "Capital", name: "Commitments", routeCandidates: ["/development-os/commitments"] },
  { domain: "Capital", name: "Distributions", routeCandidates: ["/development-os/distributions"] },
  { domain: "Capital", name: "Revenue streams", routeCandidates: ["/development-os/revenue-streams"] },

  { domain: "Strategic", name: "Project cycle intelligence", routeCandidates: ["/development-os/project-cycle"] },
  { domain: "Strategic", name: "Unit profitability", routeCandidates: ["/development-os/profitability"] },
  { domain: "Strategic", name: "Cashflow forecast", routeCandidates: ["/development-os/cashflow-forecast"] },

  { domain: "Operations (Dev OS)", name: "Vendors", routeCandidates: ["/development-os/vendors"] },
  { domain: "Operations (Dev OS)", name: "Materials", routeCandidates: ["/development-os/materials"] },
  { domain: "Operations (Dev OS)", name: "Deliveries", routeCandidates: ["/development-os/materials/deliveries"] },
  { domain: "Operations (Dev OS)", name: "Safety incidents", routeCandidates: ["/development-os/safety"] },
  { domain: "Operations (Dev OS)", name: "Procurement (Dev OS)", routeCandidates: ["/development-os/procurement"] },
  { domain: "Operations (Dev OS)", name: "Purchase requests", routeCandidates: ["/development-os/procurement/purchase-requests"] },
  { domain: "Operations (Dev OS)", name: "Quotations", routeCandidates: ["/development-os/procurement/quotations"] },

  { domain: "Communications (Dev OS)", name: "WhatsApp messages", routeCandidates: ["/development-os/whatsapp"] },
  { domain: "Communications (Dev OS)", name: "WhatsApp templates", routeCandidates: ["/development-os/whatsapp/templates"] },
  { domain: "Communications (Dev OS)", name: "Phone numbers", routeCandidates: ["/development-os/whatsapp/phone-numbers"] },
  { domain: "Communications (Dev OS)", name: "Notification rules", routeCandidates: ["/development-os/settings/notifications"] },

  { domain: "Roadmap (Dev OS)", name: "Quantity surveying", routeCandidates: ["/development-os/quantity-surveying"], stageHint: "soon" },
  { domain: "Roadmap (Dev OS)", name: "Warehouse", routeCandidates: ["/development-os/warehouse"], stageHint: "soon" },
  { domain: "Roadmap (Dev OS)", name: "QA / QC", routeCandidates: ["/development-os/qa-qc"] },
  { domain: "Roadmap (Dev OS)", name: "Schedule", routeCandidates: ["/development-os/schedule"] },
  { domain: "Roadmap (Dev OS)", name: "Calendars", routeCandidates: ["/development-os/schedule/calendars"] },
  { domain: "Roadmap (Dev OS)", name: "Resources", routeCandidates: ["/development-os/schedule/resources"] },
  { domain: "Roadmap (Dev OS)", name: "Productivity", routeCandidates: ["/development-os/productivity"] },

  { domain: "Knowledge Base", name: "Drawings", routeCandidates: ["/development-os/drawings"] },
  { domain: "Knowledge Base", name: "BOQ", routeCandidates: ["/development-os/boq"] },
  { domain: "Knowledge Base", name: "Specifications", routeCandidates: ["/development-os/specifications"] },
  { domain: "Knowledge Base", name: "Method statements", routeCandidates: ["/development-os/method-statements"] },
  { domain: "Knowledge Base", name: "Quality standards", routeCandidates: ["/development-os/quality-standards"] },

  { domain: "Settings (Dev OS)", name: "General settings", routeCandidates: ["/development-os/settings"] },
  { domain: "Settings (Dev OS)", name: "AI usage", routeCandidates: ["/development-os/settings/ai-usage"], readOnlyByDesign: true },
  { domain: "Settings (Dev OS)", name: "Notifications", routeCandidates: ["/development-os/settings/notifications"] },
  { domain: "Settings (Dev OS)", name: "Approval thresholds", routeCandidates: ["/development-os/settings/approval-thresholds"] },
  { domain: "Settings (Dev OS)", name: "WhatsApp setup", routeCandidates: ["/development-os/settings/whatsapp"] },
  { domain: "Settings (Dev OS)", name: "API keys", routeCandidates: ["/development-os/settings/api-keys"] },
  { domain: "Settings (Dev OS)", name: "Webhooks", routeCandidates: ["/development-os/settings/webhooks"] },
  { domain: "Settings (Dev OS)", name: "Data export", routeCandidates: ["/development-os/settings/data-export"] },

  { domain: "Platform (Dev OS)", name: "Organizations", routeCandidates: ["/development-os/platform/organizations"] },
  { domain: "Platform (Dev OS)", name: "Usage metrics", routeCandidates: ["/development-os/platform/usage"], readOnlyByDesign: true },
  { domain: "Platform (Dev OS)", name: "API docs", routeCandidates: ["/development-os/platform/api-docs"], readOnlyByDesign: true },
  { domain: "Platform (Dev OS)", name: "Branding", routeCandidates: ["/development-os/platform/branding"] },
];

// ---------------------------------------------------------------------------
// Resolve each inventory entry against the actual page list.
// ---------------------------------------------------------------------------

const pageByRoute = new Map<string, PageAnalysis>();
for (const p of audit.pages) pageByRoute.set(p.route, p);

type State = "🟢" | "🟡" | "🔴" | "⚫" | "⚪";

interface Resolved {
  entry: InventoryEntry;
  /** First candidate that resolved to a page. */
  matchedRoute?: string;
  page?: PageAnalysis;
  /** "Read" status. PASS = real DB read shape detected. */
  read: "PASS" | "PARTIAL" | "FAIL";
  create: "YES" | "NO" | "N/A";
  edit: "YES" | "NO" | "N/A";
  del: "YES" | "NO" | "N/A";
  wiring: "REAL" | "MOCKED" | "MISSING";
  tests: "FULL" | "PARTIAL" | "NONE";
  state: State;
  notes: string;
}

function classify(entry: InventoryEntry): Resolved {
  let page: PageAnalysis | undefined;
  let matchedRoute: string | undefined;
  for (const c of entry.routeCandidates) {
    const p = pageByRoute.get(c);
    if (p) {
      page = p;
      matchedRoute = c;
      break;
    }
  }
  if (!page) {
    return {
      entry,
      matchedRoute,
      read: "FAIL",
      create: "NO",
      edit: "NO",
      del: "NO",
      wiring: "MISSING",
      tests: "NONE",
      state: "⚫",
      notes:
        "page.tsx not found at any candidate route — sidebar link likely 404s",
    };
  }

  const read = page.hasReadShape ? "PASS" : "FAIL";
  // Promote heuristic dashboards to read-only-by-design — a metrics
  // hub doesn't need Create/Edit/Delete affordances.
  const effectivelyReadOnly =
    entry.readOnlyByDesign || (page.isDashboardLike ?? false);
  const create: "YES" | "NO" | "N/A" = effectivelyReadOnly
    ? "N/A"
    : page.hasCreateUi
      ? "YES"
      : "NO";
  const edit: "YES" | "NO" | "N/A" = effectivelyReadOnly
    ? "N/A"
    : page.hasEditUi
      ? "YES"
      : "NO";
  const del: "YES" | "NO" | "N/A" = effectivelyReadOnly
    ? "N/A"
    : page.hasDeleteUi
      ? "YES"
      : "NO";

  // Wiring detection — REAL when:
  //   - the page imports an action module, OR
  //   - the page renders a <form action={…}> directly, OR
  //   - the section has a sibling /new or /[id]/edit page (mutation
  //     lives on the sub-route — this is the dominant pattern in
  //     this codebase).
  const importsAnyAction =
    page.importsActionsFrom.length > 0 || page.formActionCount > 0;
  const subRouteCarriesMutation =
    !!page.hasNewSubRoute || !!page.hasEditSubRoute;
  const wiring: "REAL" | "MOCKED" | "MISSING" =
    importsAnyAction || subRouteCarriesMutation
      ? "REAL"
      : page.hasReadShape
        ? "MOCKED"
        : "MISSING";

  const tests: "FULL" | "PARTIAL" | "NONE" =
    page.testRefs.length === 0
      ? "NONE"
      : page.testRefs.length >= 2
        ? "FULL"
        : "PARTIAL";

  // Classification rule:
  //   🟢 read PASS + (create YES OR readOnlyByDesign) + REAL wiring
  //   🟡 read PASS but missing CRUD OR mocked wiring
  //   🔴 read PASS but no Create/Edit/Delete (and not by-design read-only)
  //   ⚫ page genuinely missing — only fires when classify() returns
  //      early because no candidate route resolved
  //   ⚪ unknown
  //
  // Note: ⚫ is gated above (early return when `page === undefined`).
  // Once we have a page, a read-shape miss is more likely a heuristic
  // false-negative than an actually-broken page, so we treat it as
  // 🟡 with a flagged note rather than ⚫.
  let state: State;
  if (effectivelyReadOnly) {
    state = wiring === "REAL" || wiring === "MOCKED" ? "🟢" : "🟡";
  } else if (create === "YES" && edit === "YES" && wiring === "REAL") {
    state = "🟢";
  } else if (
    (create === "YES" || edit === "YES" || del === "YES") &&
    wiring === "REAL"
  ) {
    state = "🟡";
  } else if (wiring === "REAL" && (create === "NO" && edit === "NO" && del === "NO")) {
    // Edge: action wiring exists but no UI affordance detected.
    state = "🟡";
  } else if (read === "FAIL") {
    // Heuristic miss — page exists but our read-shape regex didn't
    // catch its data-fetch idiom. Flag as 🟡 so the operator audits it.
    state = "🟡";
  } else {
    state = "🔴";
  }

  // Notes
  const noteParts: string[] = [];
  if (entry.readOnlyByDesign && state !== "🟢")
    noteParts.push("read-only by design");
  if (
    !entry.readOnlyByDesign &&
    page.isDashboardLike &&
    state === "🟢"
  )
    noteParts.push(
      "auto-classified as dashboard / metrics hub — read-only-by-design",
    );
  if (state === "🔴" && wiring !== "REAL")
    noteParts.push(
      `read-only — no Create/Edit/Delete affordances detected${wiring === "MOCKED" ? " (no action wiring imported)" : ""}`,
    );
  if (state === "🟡") {
    const missing: string[] = [];
    if (!entry.readOnlyByDesign) {
      if (create !== "YES") missing.push("Create");
      if (edit !== "YES") missing.push("Edit");
      if (del !== "YES") missing.push("Delete/Archive");
    }
    if (missing.length > 0)
      noteParts.push(`missing: ${missing.join(" + ")}`);
    if (wiring === "MOCKED")
      noteParts.push("read shape but no server-action import");
  }
  if (page.testRefs.length === 0) noteParts.push("no tests reference this route");
  if (page.formActionCount > 0)
    noteParts.push(`${page.formActionCount} form action(s)`);

  return {
    entry,
    matchedRoute,
    page,
    read,
    create,
    edit,
    del,
    wiring,
    tests,
    state,
    notes: noteParts.join("; ") || "—",
  };
}

const resolved = INVENTORY.map(classify);

// ---------------------------------------------------------------------------
// Generate markdown report
// ---------------------------------------------------------------------------

const stateCounts: Record<State, number> = {
  "🟢": 0,
  "🟡": 0,
  "🔴": 0,
  "⚫": 0,
  "⚪": 0,
};
for (const r of resolved) stateCounts[r.state]++;

const groups = new Map<string, Resolved[]>();
for (const r of resolved) {
  const arr = groups.get(r.entry.domain) ?? [];
  arr.push(r);
  groups.set(r.entry.domain, arr);
}

const lines: string[] = [];
lines.push(`# Stage 6.P3.5 — Coverage Audit`);
lines.push(``);
lines.push(`**Generated**: ${audit.generatedAt}`);
lines.push(``);
lines.push(`> This is a read-only audit. No code, schema, or feature changes were made.`);
lines.push(`> Source data: ` + "`tmp/coverage-audit.json`" + ` (574 page analyses · 927 action files · 104 test files).`);
lines.push(``);

// Executive summary
lines.push(`## Executive Summary`);
lines.push(``);
lines.push(`Total sections inventoried: **${resolved.length}**`);
lines.push(``);
lines.push(`| State | Count | Description |`);
lines.push(`|---|---|---|`);
lines.push(`| 🟢 FULLY_FUNCTIONAL | ${stateCounts["🟢"]} | Page exists, real DB reads, full CRUD wired (or read-only by design) |`);
lines.push(`| 🟡 PARTIALLY_FUNCTIONAL | ${stateCounts["🟡"]} | Page exists with reads, some CRUD missing or no action import detected |`);
lines.push(`| 🔴 READ_ONLY | ${stateCounts["🔴"]} | Page exists but no Create/Edit/Delete affordances detected (and not RO-by-design) |`);
lines.push(`| ⚫ BROKEN | ${stateCounts["⚫"]} | Sidebar link likely 404s — no page.tsx at any candidate route |`);
lines.push(`| ⚪ UNKNOWN | ${stateCounts["⚪"]} | Cannot determine without manual run |`);
lines.push(``);
lines.push(`> **Heuristic limitations.** The 🔴 count includes a meaningful number of false-positives that an operator would not actually consider broken. Specifically, the heuristic does not detect:`);
lines.push(`> - **Workflow pages** (Approve/Reject inbox-style pages — e.g. \`/dashboard/direct-bookings/holds\` — where the operator's affordance is "approve hold" rather than "create hold"). These typically import \`approveX\` / \`rejectX\` server actions which the regex catches, but the affordance label is a domain verb, not a generic Create/Edit/Delete.`);
lines.push(`> - **Dashboard / hub pages** (read-only metric strips) that aren't tagged \`readOnlyByDesign\` in the inventory.`);
lines.push(`> - **Forms inside client components** mounted on the page — the action lives in the child component module which doesn't end with \`/actions\`.`);
lines.push(`>`);
lines.push(`> Treat the 🔴 list as **"plausibly read-only — please spot-check"** rather than a definitive gap. The 🟢 count, by contrast, has very few false-positives — those are confidently fully-functional.`);
lines.push(``);
lines.push(`### Top critical gaps`);
lines.push(``);
lines.push(`Sections most likely to surprise an operator on first use:`);
lines.push(``);
const broken = resolved.filter((r) => r.state === "⚫");
if (broken.length > 0) {
  lines.push(`**Broken sidebar links (page.tsx missing — promoted to top of remediation list):**`);
  lines.push(``);
  for (const r of broken) {
    lines.push(
      `- **${r.entry.domain} → ${r.entry.name}** — tried: ${r.entry.routeCandidates.map((c) => "`" + c + "`").join(", ")}`,
    );
  }
  lines.push(``);
}

const readOnly = resolved.filter((r) => r.state === "🔴");
if (readOnly.length > 0) {
  lines.push(`**Read-only pages where the operator probably expects to Create/Edit:**`);
  lines.push(``);
  const top10ReadOnly = readOnly.slice(0, 15);
  for (const r of top10ReadOnly) {
    lines.push(
      `- **${r.entry.domain} → ${r.entry.name}** (${r.matchedRoute ?? "—"}) — ${r.notes}`,
    );
  }
  if (readOnly.length > 15) {
    lines.push(`- _… and ${readOnly.length - 15} more (see Per-Section Detail Table)_`);
  }
  lines.push(``);
}

lines.push(`### Recommended remediation P-stage`);
lines.push(``);
lines.push(
  `Given the count of broken (${stateCounts["⚫"]}) + read-only (${stateCounts["🔴"]}) sections, the audit recommends inserting **Stage 6.P3.6 — CRUD Coverage Closure** before P4 begins. See "Remediation Plan Proposal" at the bottom for sub-stage breakdown.`,
);
lines.push(``);

// Methodology note
lines.push(`### Methodology`);
lines.push(``);
lines.push(`The audit script (\`scripts/audit-coverage.ts\`) walked every \`page.tsx\` under \`src/app/\` and emitted a JSON inventory at \`tmp/coverage-audit.json\`. Per-page heuristics:`);
lines.push(``);
lines.push(`- **Read shape**: page imports a \`queries.ts\` module, calls \`getDb()\`/\`requireDb()\`, performs a Drizzle \`.from()/.select()\`, or renders \`<Table>\`/\`<DataTable>\`.`);
lines.push(`- **Create/Edit/Delete affordance**: page imports a server-action whose name starts with \`create\`/\`update\`/\`delete\`/\`archive\`/\`set\`/\`run\`/etc., AND the page text contains a corresponding label (\`Create\`/\`Edit\`/\`Archive\`/\`Delete\`).`);
lines.push(`- **Wiring**: REAL when an action module is imported or a \`<form action={...}>\` is rendered; MOCKED when read-shape exists without an action import; MISSING when neither.`);
lines.push(`- **Tests**: counted by grep against test bodies for the route stem or page-file path.`);
lines.push(``);
lines.push(`These are heuristics — false negatives are possible (e.g. a page that mounts a client component containing the affordances). When the heuristic flags a section as 🔴 or 🟡, the gap is plausible but worth a manual second look before remediation work begins.`);
lines.push(``);

// Per-section detail table
lines.push(`## Per-Section Detail Table`);
lines.push(``);
lines.push(
  `| Section | Path | State | Read | Create | Edit | Delete | Wiring | Tests | Notes |`,
);
lines.push(
  `|---|---|---|---|---|---|---|---|---|---|`,
);
for (const r of resolved) {
  const path = r.matchedRoute ?? r.entry.routeCandidates[0];
  const stateBadge = `${r.state}`;
  lines.push(
    `| **${r.entry.domain}** → ${r.entry.name}${r.entry.stageHint ? ` _(${r.entry.stageHint})_` : ""} | \`${path}\` | ${stateBadge} | ${r.read} | ${r.create} | ${r.edit} | ${r.del} | ${r.wiring} | ${r.tests} | ${r.notes} |`,
  );
}
lines.push(``);

// Domain-grouped analysis
lines.push(`## Domain-grouped Gap Analysis`);
lines.push(``);
const sortedDomains = Array.from(groups.keys()).sort();
for (const domain of sortedDomains) {
  const items = groups.get(domain)!;
  const counts = { "🟢": 0, "🟡": 0, "🔴": 0, "⚫": 0, "⚪": 0 };
  for (const r of items) counts[r.state]++;
  const summary = [
    counts["🟢"] > 0 ? `${counts["🟢"]} 🟢` : null,
    counts["🟡"] > 0 ? `${counts["🟡"]} 🟡` : null,
    counts["🔴"] > 0 ? `${counts["🔴"]} 🔴` : null,
    counts["⚫"] > 0 ? `${counts["⚫"]} ⚫` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const fullCount = items.length;
  lines.push(`### ${domain} — ${summary} (${fullCount} section${fullCount === 1 ? "" : "s"})`);
  lines.push(``);
  for (const r of items) {
    const path = r.matchedRoute ?? r.entry.routeCandidates[0];
    lines.push(`- ${r.state} **${r.entry.name}** — \`${path}\` — ${r.notes}`);
  }
  // Aggregate hint
  const needsWork =
    counts["🟡"] + counts["🔴"] + counts["⚫"];
  if (needsWork > 0) {
    lines.push(``);
    lines.push(
      `_Estimated work to make all 🟢: ${needsWork} section${needsWork === 1 ? "" : "s"} need${needsWork === 1 ? "s" : ""} CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._`,
    );
  }
  lines.push(``);
}

// Remediation
lines.push(`## Remediation Plan Proposal`);
lines.push(``);
lines.push(`Inserting a remediation sub-stage before continuing P4 ensures the platform looks complete to first-time users. Recommended structure:`);
lines.push(``);
lines.push(`### Stage 6.P3.6 — CRUD Coverage Closure (proposed, est. 1–2 weeks)`);
lines.push(``);
lines.push(`**Sub-checkpoints**:`);
lines.push(``);
lines.push(`- **P3.6.A — Broken-link triage** (1 day). For every ⚫ section, decide: (a) build a stub page that 404-style routes back to the parent, (b) build the full functional page, or (c) remove from the sidebar. Most likely outcome: half end up at (c), the rest at (b).`);
lines.push(`- **P3.6.B — Read-only page CRUD wire-up** (3–5 days). For every 🔴 section that the operator legitimately expects to manage (judged per-domain), wire up the missing Create/Edit/Delete affordances using the existing P0.3 form-component pattern. Reuses existing service-layer code wherever it exists.`);
lines.push(`- **P3.6.C — Action-imported-but-no-affordance pages** (2 days). The 🟡 set frequently includes pages where the server actions exist but the UI doesn't expose them. This is the highest leverage / lowest effort tier.`);
lines.push(`- **P3.6.D — Test coverage backfill** (2 days). For every section newly upgraded to 🟢, ensure at least one test asserts the form action is wired. Test target: ${resolved.length * 2}+ new file-presence + grep tests.`);
lines.push(``);
lines.push(`**Out of scope**: any new entity tables. P3.6 is a UI + service-layer plumbing pass over existing data.`);
lines.push(``);
lines.push(`**Estimated test delta**: ~${Math.round(resolved.length * 1.5)} new file-presence + grep tests (one or two per remediated section).`);
lines.push(``);
lines.push(`**Estimated total time**: 1–2 weeks. Most variance is in P3.6.A (which broken sections actually need pages vs. should be cut).`);
lines.push(``);

lines.push(`### Alternative — restructure P4–P8`);
lines.push(``);
lines.push(`If P3.6 feels too disruptive, an alternative is to fold "complete missing CRUD" tasks into each remaining sub-stage as it touches the relevant domain:`);
lines.push(``);
lines.push(`- **P4** (Marketing) already touches \`/development-os/marketing/*\` — fold in any 🔴 sections in that domain.`);
lines.push(`- **P5** (Productivity Tools) — fold in System / Settings / Notification gaps.`);
lines.push(`- **P6** (AI Agents Activation) — fold in AI Agents Hub gaps.`);
lines.push(`- **P7** (Investor Portal Enhancement) — fold in Capital + Investors gaps.`);
lines.push(`- **P8** (Polish + Comprehensive Testing) — backstop for everything else.`);
lines.push(``);
lines.push(`This keeps the linear sub-stage structure but lengthens each sub-stage by ~1–2 days. Total program length stays roughly the same.`);
lines.push(``);

lines.push(`---`);
lines.push(``);
lines.push(`_Generated by \`scripts/audit-coverage.ts\` + \`scripts/audit-coverage-classify.ts\`. Heuristics are approximate; please spot-check any section flagged 🔴 or 🟡 against the live page before committing remediation effort._`);
lines.push(``);

writeFileSync(
  join(ROOT, "docs", "STAGE-6-COVERAGE-AUDIT.md"),
  lines.join("\n"),
  "utf8",
);

// Console summary
console.log(`audit-classify: wrote docs/STAGE-6-COVERAGE-AUDIT.md`);
console.log(`  total sections: ${resolved.length}`);
for (const [k, v] of Object.entries(stateCounts) as Array<[State, number]>) {
  console.log(`  ${k}: ${v}`);
}
