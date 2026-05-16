"use client";

import * as React from "react";

/**
 * Sprint _handoff/ Task 2 — IntersectionObserver-driven reveal.
 *
 * Replaces the inline `<script>` that the prototypes ship with. Auto-
 * tags every `[data-reveal]` element with the `.in` class on first
 * intersection. CSS lives in `src/app/globals.css` (the `[data-reveal]`
 * + `[data-reveal-delay="…"]` block).
 *
 * Mount once near the top of the public layout — it's a no-op on the
 * server and runs a single effect on the client. Honors
 * `prefers-reduced-motion: reduce` by short-circuiting (CSS already
 * neutralises the transform/opacity, but skipping the observer too
 * saves a `requestAnimationFrame` storm on long pages).
 *
 * `rootMargin` of "-12% 0px" trips the reveal slightly before the
 * element actually enters the viewport — matches the prototype's
 * "feels alive before you scroll to it" cadence.
 */
export function RevealOnScroll(): null {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.classList.add("in");
      });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "-12% 0px", threshold: 0.01 },
    );
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
