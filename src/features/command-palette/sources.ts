/**
 * Phase 2.1 PR 3 — palette source resolver.
 *
 * Walks the dynamic per-cabinet `_command-actions.ts` modules to
 * build the contextual actions group, then merges with the static
 * navigation jumps (read from the dashboard nav config so the two
 * stay in sync).
 *
 * The dynamic import path is matched by `routeKey` (= the first two
 * path segments of the current URL). When no actions module exists
 * for a given route the resolver returns an empty list — the
 * palette still renders its other groups.
 */

import type { CommandAction, CommandNavigation, CommandSources } from "./types";
import { MGMT_DASHBOARD_NAV } from "@/config/navigation/management";
import { DEV_DASHBOARD_NAV } from "@/config/navigation/development";
import { cabinetForNavHref, canSeeFromAccess } from "@/features/keystone/matrix";
import type { VisibleCabinetAccess } from "@/features/keystone/matrix";

interface ResolveSourcesInput {
  /** Current pathname. */
  pathname: string;
  /** "management" | "development" — drives which nav tree to use. */
  product: "management" | "development" | "owner" | null;
  /**
   * Keystone cabinet-access snapshot (mgmt nav only). When provided, gated
   * "jump to cabinet" entries the user can't see are dropped, mirroring the
   * sidebar + mobile tabbar. `null`/`undefined` ⇒ show everything (fail-open).
   */
  access?: VisibleCabinetAccess | null;
}

const DYNAMIC_IMPORTERS: Record<string, () => Promise<{ commandActions?: CommandAction[] }>> = {
  // Mgmt OS
  "dashboard.bookings": () => import("@/app/(dashboard)/dashboard/bookings/_command-actions"),
};

function routeKeyFromPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean).slice(0, 2);
  return segs.join(".") || "root";
}

function navigationFromProduct(
  product: ResolveSourcesInput["product"],
  access: VisibleCabinetAccess | null,
): CommandNavigation[] {
  // Owner Portal isn't wired in 2.1 — fall through to Mgmt for now.
  const isMgmt = product !== "development";
  const tree = product === "development" ? DEV_DASHBOARD_NAV : MGMT_DASHBOARD_NAV;
  const out: CommandNavigation[] = [];
  for (const group of tree) {
    // Keystone gating (mgmt only — the dev nav has no matrix mapping). Drop
    // items whose cabinet the role was un-ticked for; the group disappears
    // only when every item is gated, mirroring the sidebar.
    const visibleItems = isMgmt
      ? group.items.filter((item) => {
          const cabinet = cabinetForNavHref(item.href);
          return cabinet === null || canSeeFromAccess(access, cabinet);
        })
      : group.items;
    // Use the first VISIBLE item of each group as the "jump to cabinet"
    // entry; the rest are detail-level routes that already match
    // record search.
    const first = visibleItems[0];
    if (!first) continue;
    out.push({
      id: `nav-${first.href}`,
      label: `${capitalize(group.title.toLowerCase())} · ${first.label}`,
      href: first.href,
      meta: visibleItems.length > 1 ? `${visibleItems.length} cabinets` : undefined,
    });
  }
  return out;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export async function getCommandSources(
  ctx: ResolveSourcesInput,
): Promise<CommandSources> {
  const key = routeKeyFromPath(ctx.pathname);
  const importer = DYNAMIC_IMPORTERS[key];
  let actions: CommandAction[] = [];
  if (importer) {
    try {
      const mod = await importer();
      actions = mod.commandActions ?? [];
    } catch {
      actions = [];
    }
  }
  return {
    actions,
    navigation: navigationFromProduct(ctx.product, ctx.access ?? null),
  };
}
