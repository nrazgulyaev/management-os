"use client";

/**
 * client-tax: lazy loader for <MotionLayer />.
 *
 * MotionLayer is a client-only effect island (custom cursor, scroll
 * progress, reveal/parallax/count-up/magnetic). It renders `null` and
 * does all its work in a `useEffect`, so it never needs to run during
 * SSR or block first paint. Loading it via `next/dynamic({ ssr:false })`
 * keeps its (non-trivial) JS out of the critical path — the marketing
 * surfaces paint first, then the motion engine hydrates and attaches.
 *
 * `next/dynamic({ ssr:false })` can only be called from a Client
 * Component, which is why this thin wrapper exists: the marketing
 * layouts (Server Components) import THIS instead of MotionLayer
 * directly.
 */

import dynamic from "next/dynamic";

const MotionLayerDynamic = dynamic(
  () => import("./motion-layer").then((m) => m.MotionLayer),
  { ssr: false },
);

export function MotionLayerLazy() {
  return <MotionLayerDynamic />;
}
