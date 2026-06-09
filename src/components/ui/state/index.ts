/**
 * STATE-KIT — the 7 state primitives, one consistent kit.
 *
 * Block 01. A view is in exactly one of these states at a time; this barrel
 * is the single import surface so cabinets stop hand-rolling each one:
 *
 *   1. empty      → <EmptyState>            (already shipped; re-exported here)
 *   2. loading    → <LoadingState>          (spinner + label)
 *   3. skeleton   → <Skeleton> / <SkeletonText> / <SkeletonGroup>
 *   4. error      → <ErrorState>            (in-surface; NOT the route boundary)
 *   5. forbidden  → <Forbidden>             (authenticated-but-unauthorised)
 *   6. degraded   → <DegradedState>         (offline / db-null / service down)
 *   7. partial    → <PartialDataNotice>     (rendered but knowingly incomplete)
 *
 * Plus <ComingSoon> — the affordance that closes the "disabled button"
 * debt ("no disabled button without a reason").
 *
 * The route-level error boundary lives separately as
 * `@/components/system/route-error-boundary` (RouteErrorBoundary), wired by
 * each portal's error.tsx — use <ErrorState> for sub-page failures.
 *
 *   import { ErrorState, Forbidden, Skeleton } from "@/components/ui/state";
 */

export { EmptyState } from "@/components/ui/empty-state";
export type {
  EmptyStateProps,
  EmptyStateVariant,
  EmptyStateTone,
} from "@/components/ui/empty-state";

export { LoadingState } from "./loading-state";
export type { LoadingStateProps } from "./loading-state";

export { Skeleton, SkeletonText, SkeletonGroup } from "./skeleton";
export type { SkeletonProps } from "./skeleton";

export { ErrorState } from "./error-state";
export type { ErrorStateProps } from "./error-state";

export { Forbidden } from "./forbidden";
export type { ForbiddenProps } from "./forbidden";

export { DegradedState } from "./degraded-state";
export type { DegradedStateProps } from "./degraded-state";

export { PartialDataNotice } from "./partial-data-notice";
export type { PartialDataNoticeProps } from "./partial-data-notice";

export { ComingSoon } from "./coming-soon";
export type { ComingSoonProps } from "./coming-soon";
