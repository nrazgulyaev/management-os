/**
 * HF-12 regression fixture — pure-data config that bakes a forwardRef
 * component reference into an exported array. Paired with
 * `icon-as-prop.tsx` to verify the audit:rsc scanner follows imports
 * across files and flags the indirect crossing.
 */

import { Home } from "lucide-react";

export const FIXTURE_ITEMS = [{ icon: Home, label: "Home" }];
