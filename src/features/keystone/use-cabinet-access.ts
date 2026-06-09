"use client";

/**
 * Client hook — fetches the current user's cabinet-access snapshot once and
 * caches it module-wide, so the mobile tabbar and the ⌘K command palette mirror
 * the sidebar's keystone gating without each re-hitting the server action.
 *
 * Fail-open: until the snapshot resolves (or if it fails) the returned access
 * is `null`, which `canSeeFromAccess` treats as "show everything" — the nav is
 * never blanked while the snapshot is in flight.
 */

import * as React from "react";
import { getVisibleCabinetKeysAction } from "./actions";
import type { VisibleCabinetAccess } from "./matrix";

let cached: VisibleCabinetAccess | null = null;
let inflight: Promise<VisibleCabinetAccess> | null = null;

async function load(): Promise<VisibleCabinetAccess> {
  if (cached) return cached;
  if (!inflight) {
    inflight = getVisibleCabinetKeysAction()
      .then((res) => {
        cached = res;
        return res;
      })
      .catch(() => {
        // Fail-open — treat as all-access so a failed fetch never hides nav.
        const fallback: VisibleCabinetAccess = { allAccess: true, visibleKeys: [] };
        cached = fallback;
        return fallback;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Returns the cabinet-access snapshot, or `null` until it has loaded. */
export function useCabinetAccess(): VisibleCabinetAccess | null {
  const [access, setAccess] = React.useState<VisibleCabinetAccess | null>(cached);

  React.useEffect(() => {
    if (access) return;
    let cancelled = false;
    void load().then((res) => {
      if (!cancelled) setAccess(res);
    });
    return () => {
      cancelled = true;
    };
  }, [access]);

  return access;
}
