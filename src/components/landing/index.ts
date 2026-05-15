/**
 * Sprint LD-1 — Landing primitives barrel.
 *
 * Public-facing landing-page primitives that intentionally sit
 * outside `src/components/award/` (which is reserved for cabinet
 * apex composition). Both /products/management-os and
 * /products/development-os consume these.
 */

export { PhotographicHero } from "./photographic-hero";
export type {
  PhotographicHeroProps,
  PhotographicFloatingCard,
  FloatingCardTone,
} from "./photographic-hero";

export { ActionPillButton } from "./action-pill-button";
export type {
  ActionPillButtonProps,
  ActionPillVariant,
} from "./action-pill-button";

export { ConcentricRings } from "./concentric-rings";
export type {
  ConcentricRingsProps,
  ConcentricRing,
  RingFillToken,
} from "./concentric-rings";

export { DotGridStreak } from "./dot-grid-streak";
export type {
  DotGridStreakProps,
  DotGridTone,
} from "./dot-grid-streak";

// Sprint LD-2 — feature deep-dive primitives.
export { FeatureDeepDive } from "./feature-deep-dive";
export type { FeatureDeepDiveProps } from "./feature-deep-dive";

export { FeatureTOC } from "./feature-toc";
export type { FeatureTOCProps, FeatureTOCItem } from "./feature-toc";
