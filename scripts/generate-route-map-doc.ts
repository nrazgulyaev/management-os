/**
 * Prompt 115 — Generate `docs/MANAGEMENT_OS_ROUTE_MAP.md` from the
 * P114 route inventory.
 *
 * Pure file walk — no DB / network.  Run via:
 *   npm run docs:route-map
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRoutes } from "../src/features/smoke-tests/route-inventory";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const appDir = join(repoRoot, "src/app");
const outFile = join(repoRoot, "docs/MANAGEMENT_OS_ROUTE_MAP.md");

const routes = discoverRoutes(appDir);

const audienceModule: Record<string, string> = {
  public: "Marketing / public",
  auth: "Auth + setup",
  internal: "Admin dashboard",
  owner: "Owner portal",
  guest: "Guest stay",
  field: "Field app",
  vendor: "Vendor portal",
  development: "Development OS",
  "api-public": "Public booking API",
  "api-cron": "Cron",
  "api-internal": "Internal API",
  "api-token": "Token-scoped API",
};

function audienceAuth(audience: string): {
  authRequired: string;
  tokenRequired: string;
} {
  switch (audience) {
    case "public":
      return { authRequired: "no", tokenRequired: "no" };
    case "auth":
      return { authRequired: "no (pre-login)", tokenRequired: "no" };
    case "internal":
    case "development":
      return { authRequired: "yes", tokenRequired: "no" };
    case "owner":
      return { authRequired: "yes (owner)", tokenRequired: "no" };
    case "field":
      return { authRequired: "yes (field)", tokenRequired: "no" };
    case "guest":
    case "vendor":
    case "api-token":
      return { authRequired: "no", tokenRequired: "yes" };
    case "api-public":
      return {
        authRequired: "no",
        tokenRequired: "yes (hold token where applicable)",
      };
    case "api-cron":
      return { authRequired: "Bearer CRON_SECRET", tokenRequired: "no" };
    case "api-internal":
      return { authRequired: "yes", tokenRequired: "no" };
    default:
      return { authRequired: "—", tokenRequired: "—" };
  }
}

function moduleFor(file: string, audience: string): string {
  if (audience === "api-cron") return "Jobs / cron";
  if (file.includes("system/deployment")) return "Deployment readiness";
  if (file.includes("system/health")) return "Deployment readiness";
  if (file.includes("system/storage")) return "Storage";
  if (file.includes("/finance/")) return "Finance";
  if (file.includes("/security/")) return "Security";
  if (file.includes("/operations/")) return "Operations";
  if (file.includes("/maintenance-intelligence/")) return "Maintenance intelligence";
  if (file.includes("/utilities/")) return "Utilities";
  if (file.includes("/inventory/")) return "Inventory";
  if (file.includes("/procurement/")) return "Procurement";
  if (file.includes("/guest-services/")) return "Guest services";
  if (file.includes("/service-fulfilment/")) return "Service fulfilment";
  if (file.includes("/guest-ai/")) return "Guest AI concierge";
  if (file.includes("/guest-stays/")) return "Guest stays (admin)";
  if (file.includes("/guest-journey/")) return "Guest journey";
  if (file.includes("/notifications/")) return "Notifications";
  if (file.includes("/jobs/")) return "Jobs / cron";
  if (file.includes("/pricing/")) return "Dynamic pricing";
  if (file.includes("/integrations/")) return "Integrations";
  if (file.includes("/ai/")) return "AI Operations Co-pilot";
  if (file.includes("/direct-bookings/")) return "Direct booking (admin)";
  if (file.includes("/bookings/")) return "Bookings";
  if (file.includes("/owners/")) return "Owners (admin)";
  if (file.includes("/villas/")) return "Villas (admin)";
  if (file.includes("/owner-stays/")) return "Owner stays (admin)";
  if (file.includes("/owner-intelligence/")) return "Owner intelligence";
  if (file.includes("/villa-guides/")) return "Villa guides";
  if (file.includes("/front-office/")) return "Front office";
  if (file.includes("/audit/")) return "Audit";
  if (file.includes("/availability/")) return "Availability";
  if (file.includes("/payments/")) return "Payments";
  if (file.includes("/projects/")) return "Projects";
  if (file.includes("/readiness/")) return "Readiness";
  if (file.includes("/shares/")) return "Shares";
  if (file.includes("/settings/")) return "Settings";
  if (file.includes("/documents/")) return "Documents";
  if (file.includes("/channels/")) return "Channels";
  if (file.includes("/demo/")) return "Demo";
  if (file.includes("/guests/")) return "Guests";
  if (audience === "owner") return "Owner portal";
  if (audience === "guest") return "Guest stay";
  if (audience === "field") return "Field app";
  if (audience === "vendor") return "Vendor portal";
  if (audience === "api-public") return "Public booking API";
  if (audience === "auth") return "Auth + setup";
  if (audience === "public") return "Marketing";
  if (audience === "development") return "Development OS";
  return audienceModule[audience] ?? "—";
}

const lines: string[] = [];
lines.push("# Management OS — Route Map");
lines.push("");
lines.push(
  `> Generated by \`scripts/generate-route-map-doc.ts\` from the P114 route inventory. Run \`npm run docs:route-map\` to refresh.`,
);
lines.push("");
lines.push(`Total routes: **${routes.length}**`);
lines.push("");

const grouped = new Map<string, typeof routes>();
for (const r of routes) {
  const list = grouped.get(r.audience) ?? [];
  list.push(r);
  grouped.set(r.audience, list);
}

const audienceOrder = [
  "public",
  "auth",
  "internal",
  "owner",
  "guest",
  "field",
  "vendor",
  "api-public",
  "api-cron",
  "api-internal",
  "api-token",
  "development",
];

for (const audience of audienceOrder) {
  const list = grouped.get(audience as never);
  if (!list || list.length === 0) continue;
  lines.push(`## ${audienceModule[audience] ?? audience} (${list.length})`);
  lines.push("");
  lines.push(
    `| Route | Kind | Auth | Token | Module | Expected status | Notes |`,
  );
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const r of list) {
    const auth = audienceAuth(r.audience);
    lines.push(
      `| \`${r.path}\` | ${r.kind} | ${auth.authRequired} | ${auth.tokenRequired} | ${moduleFor(r.file, r.audience)} | ${r.expectedStatus} | ${r.parameterised ? "param" : ""} |`,
    );
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push(
  "Audience semantics: see `docs/SMOKE-TEST-ROUTE-MATRIX.md`.  Module assignments are heuristic — consult `docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md` for the canonical module map.",
);
lines.push("");

writeFileSync(outFile, lines.join("\n"), "utf-8");
console.log(`Wrote ${outFile} — ${routes.length} routes.`);
process.exit(0);

export {};
