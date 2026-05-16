/**
 * HF-12 regression fixture — DO NOT IMPORT FROM src/.
 *
 * Synthetic server component that exhibits the two HF-12 patterns the
 * audit:rsc scanner must catch:
 *
 *   1. Direct  — `<FixtureClient icon={Home} />` passes a forwardRef
 *      component reference straight across the RSC boundary.
 *   2. Indirect — `<FixtureClient items={FIXTURE_ITEMS} />` passes an
 *      array whose source module (./icon-as-data.ts) bakes
 *      `{ icon: Home }` into the export.
 *
 * The companion test `tests/sprint-hotfix-4-no-function-prop-on-rsc-
 * boundary.test.ts` runs the scanner against this file with a
 * synthetic "FixtureClient" in its client registry and asserts both
 * violation kinds fire. Living outside src/ keeps it invisible to
 * the production audit, Next compile, and ESLint scans.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Home, Sparkles } from "lucide-react";
import { FIXTURE_ITEMS } from "./icon-as-data";

// Hand-written stub of a `"use client"` component — the test injects
// "FixtureClient" into the client registry so the scanner treats
// these as RSC-crossing props.
declare function FixtureClient(props: {
  icon?: unknown;
  items?: unknown;
}): JSX.Element;

export default function FixturePage(): JSX.Element {
  return (
    <div>
      {/* Direct component-ref — should flag as component-ref=Home */}
      <FixtureClient icon={Home} />
      {/* Direct nested in object literal — should flag as
          component-ref=Sparkles */}
      <FixtureClient items={[{ icon: Sparkles, label: "Hi" }]} />
      {/* Indirect via config — should flag as component-via-config */}
      <FixtureClient items={FIXTURE_ITEMS} />
    </div>
  );
}
