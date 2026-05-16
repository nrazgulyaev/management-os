"use client";

import * as React from "react";

/**
 * Sprint _handoff/ Task 9 — Motion + mobile layer.
 *
 * Single client island that orchestrates all the scroll/cursor/text
 * animations for the redesigned surfaces. Ported from
 * `_handoff/_shared/motion-mobile.html`'s `motion-mobile-js` IIFE
 * into a React useEffect. Mounted ONCE in `src/app/layout.tsx`
 * after `{children}` — App Router keeps the root layout alive across
 * navigations so the effect runs a single time per page load.
 *
 * What it does:
 *   1. Custom cursor (dot + ring + optional label) on
 *      `(pointer: fine)` devices only. Mobile gets the system
 *      cursor back via the CSS `(pointer: coarse)` reset.
 *   2. Scroll progress bar pinned to top of viewport.
 *   3. Auto-tags every `<section>` with `data-reveal="up"` so all
 *      ported cabinets/landings fade in on enter without per-page
 *      annotation. IntersectionObserver applies `.in`.
 *   4. Splits `[data-text-reveal]` elements word-by-word for the
 *      cascading hero reveal, and `[data-text-reveal-char]` for
 *      shorter labels.
 *   5. Parallax — applies `translate3d(0, dy, 0)` to
 *      `[data-parallax]` elements on scroll using the data-parallax
 *      number as a speed multiplier.
 *   6. Count-up — animates `[data-count]` numbers from 0 to target
 *      with cubic-ease-out, prefix/suffix preserved.
 *   7. Magnetic hover — the prototype's signature button micro-
 *      interaction. Binds to `.btn-primary`, `.btn-amber`,
 *      `.btn-terra`, `.ra-btn`. Translates the button toward the
 *      mouse cursor within ±16px of its centre.
 *
 * `prefers-reduced-motion: reduce` is fully respected — the CSS in
 * `src/app/globals.css` neutralises every animation/transition; the
 * JS still runs but its visual output disappears. We additionally
 * skip the cursor creation when reduced motion is on, since the
 * cursor IS the animation here.
 *
 * Coexistence with the existing `<RevealOnScroll />` from Task 2
 * (mounted on apex picker / subscription landing / Mgmt + Dev
 * landings): both observers add `.in` and unobserve. Duplicate
 * observation is harmless — first one to fire wins.
 */

declare global {
  interface Window {
    __motionInit?: boolean;
    __motionDebounce?: ReturnType<typeof setTimeout>;
  }
}

export function MotionLayer(): null {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__motionInit) return;
    window.__motionInit = true;

    const prefersReduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isFinePointer =
      window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    /* ---- Custom cursor ---- */
    let dot: HTMLDivElement | null = null;
    let ring: HTMLDivElement | null = null;
    let label: HTMLDivElement | null = null;
    let rafCursor: number | null = null;
    if (isFinePointer && !prefersReduced) {
      dot = document.createElement("div");
      dot.className = "cursor-dot";
      ring = document.createElement("div");
      ring.className = "cursor-ring";
      label = document.createElement("div");
      label.className = "cursor-label";
      document.body.append(dot, ring, label);

      let mx = -100;
      let my = -100;
      let rx = -100;
      let ry = -100;

      const onMove = (e: MouseEvent) => {
        mx = e.clientX;
        my = e.clientY;
        if (dot)
          dot.style.transform = `translate3d(${mx}px,${my}px,0) translate(-50%,-50%)`;
        if (label)
          label.style.transform = `translate3d(${mx}px,${my}px,0) translate(-50%, calc(-50% + 40px))`;
      };
      window.addEventListener("mousemove", onMove, { passive: true });

      const follow = () => {
        rx += (mx - rx) * 0.18;
        ry += (my - ry) * 0.18;
        if (ring)
          ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0) translate(-50%,-50%)`;
        rafCursor = requestAnimationFrame(follow);
      };
      rafCursor = requestAnimationFrame(follow);

      const onEnter = () => {
        if (dot) dot.style.opacity = "1";
        if (ring) ring.style.opacity = "1";
      };
      const onLeave = () => {
        if (dot) dot.style.opacity = "0";
        if (ring) ring.style.opacity = "0";
      };
      document.addEventListener("mouseenter", onEnter);
      document.addEventListener("mouseleave", onLeave);

      const onOver = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null;
        if (!t || !t.closest) return;
        const interactive = t.closest(
          'a, button, [role="button"], input, textarea, select, [data-cursor-hover]',
        ) as HTMLElement | null;
        if (interactive) {
          dot?.classList.add("cursor-hover");
          ring?.classList.add("cursor-hover");
          if (interactive.matches("input, textarea, select")) {
            ring?.classList.add("cursor-text");
          }
          const labelText = interactive.dataset?.cursorLabel;
          if (labelText && label) {
            label.textContent = labelText;
            label.classList.add("cursor-show");
          }
        }
      };
      const onOut = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null;
        if (!t || !t.closest) return;
        const interactive = t.closest(
          'a, button, [role="button"], input, textarea, select, [data-cursor-hover]',
        );
        if (interactive) {
          dot?.classList.remove("cursor-hover");
          ring?.classList.remove("cursor-hover");
          ring?.classList.remove("cursor-text");
          label?.classList.remove("cursor-show");
        }
      };
      document.addEventListener("mouseover", onOver);
      document.addEventListener("mouseout", onOut);
    }

    /* ---- Scroll progress bar ---- */
    const progress = document.createElement("div");
    progress.className = "scroll-progress";
    document.body.appendChild(progress);
    const updateProgress = () => {
      const h = document.documentElement;
      const pct =
        (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100;
      progress.style.width = `${Math.min(100, pct)}%`;
    };

    /* ---- Auto-tag sections + reveal ---- */
    const autoTagSections = () => {
      document.querySelectorAll("section").forEach((s) => {
        if (
          !s.hasAttribute("data-reveal") &&
          !s.closest("[data-no-reveal]")
        ) {
          s.setAttribute("data-reveal", "up");
        }
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );

    const scanReveal = () => {
      autoTagSections();
      document
        .querySelectorAll(
          "[data-reveal]:not(.in), [data-reveal-mask]:not(.in), [data-text-reveal]:not(.in), [data-text-reveal-char]:not(.in)",
        )
        .forEach((el) => io.observe(el));
    };

    /* ---- Word & char splitting ---- */
    const splitWords = (node: Node, idx = { i: 0 }) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent ?? "";
          if (!text.trim()) continue;
          const frag = document.createDocumentFragment();
          text.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (!w.trim()) {
              frag.appendChild(document.createTextNode(w));
              return;
            }
            const wrap = document.createElement("span");
            wrap.className = "word";
            const inner = document.createElement("span");
            inner.textContent = w;
            inner.style.transitionDelay = `${idx.i * 0.05}s`;
            idx.i++;
            wrap.appendChild(inner);
            frag.appendChild(wrap);
          });
          (child as ChildNode).replaceWith(frag);
        } else if (
          child.nodeType === Node.ELEMENT_NODE &&
          !(child as HTMLElement).classList.contains("word")
        ) {
          splitWords(child, idx);
        }
      }
    };
    const splitChars = (node: HTMLElement) => {
      const text = node.textContent ?? "";
      node.textContent = "";
      [...text].forEach((c, i) => {
        const s = document.createElement("span");
        s.className = "char";
        s.textContent = c === " " ? " " : c;
        s.style.transitionDelay = `${i * 0.025}s`;
        node.appendChild(s);
      });
    };
    const scanTextReveal = () => {
      document
        .querySelectorAll<HTMLElement>(
          "[data-text-reveal]:not([data-text-reveal-done])",
        )
        .forEach((el) => {
          el.dataset.textRevealDone = "1";
          splitWords(el);
        });
      document
        .querySelectorAll<HTMLElement>(
          "[data-text-reveal-char]:not([data-text-reveal-done])",
        )
        .forEach((el) => {
          el.dataset.textRevealDone = "1";
          splitChars(el);
        });
    };

    /* ---- Parallax ---- */
    type ParallaxEntry = { el: HTMLElement; speed: number; anchor: number };
    let parallaxEls: ParallaxEntry[] = [];
    const refreshParallax = () => {
      parallaxEls = [];
      document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        parallaxEls.push({
          el,
          speed: parseFloat(el.dataset.parallax ?? "") || 0.2,
          anchor: rect.top + window.scrollY + rect.height / 2,
        });
      });
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const vh = window.innerHeight;
        parallaxEls.forEach((p) => {
          const dy = (y + vh / 2 - p.anchor) * p.speed;
          p.el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)`;
        });
        updateProgress();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => {
      refreshParallax();
      updateProgress();
    };
    window.addEventListener("resize", onResize, { passive: true });

    /* ---- Count-up ---- */
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const formatNum = (n: number, raw: string) => {
      if (raw.includes(",") && n >= 1000) return Math.round(n).toLocaleString();
      if (n % 1 !== 0) return n.toFixed(1);
      return Math.round(n).toString();
    };
    const animateCount = (el: HTMLElement) => {
      const target = parseFloat(el.dataset.count ?? "");
      if (isNaN(target)) return;
      const prefix = el.dataset.countPrefix ?? "";
      const suffix = el.dataset.countSuffix ?? "";
      const dur = 1500;
      const t0 = performance.now();
      const raw = el.textContent?.trim() ?? "";
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const v = target * easeOutCubic(t);
        el.textContent = prefix + formatNum(v, raw) + suffix;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          animateCount(e.target as HTMLElement);
          cio.unobserve(e.target);
        });
      },
      { threshold: 0.5 },
    );
    const scanCounts = () => {
      document
        .querySelectorAll<HTMLElement>("[data-count]:not([data-count-done])")
        .forEach((el) => {
          el.dataset.countDone = "1";
          cio.observe(el);
        });
    };

    /* ---- Magnetic hover ---- */
    const bindMagnetic = () => {
      document
        .querySelectorAll<HTMLElement>(
          ".ra-btn, .btn-amber, .btn-primary, .btn-terra",
        )
        .forEach((el) => {
          if (el.dataset.magBound) return;
          el.dataset.magBound = "1";
          el.style.transition =
            (el.style.transition || "") + ", transform .2s cubic-bezier(.22,1,.36,1)";
          el.addEventListener("mousemove", (e) => {
            const r = el.getBoundingClientRect();
            const x = ((e.clientX - r.left - r.width / 2) / r.width) * 16;
            const y = ((e.clientY - r.top - r.height / 2) / r.height) * 16;
            el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
          });
          el.addEventListener("mouseleave", () => {
            el.style.transform = "";
          });
        });
    };

    const tick = () => {
      scanTextReveal();
      scanReveal();
      scanCounts();
      refreshParallax();
      bindMagnetic();
      updateProgress();
    };

    // Defer the first scan slightly so React has finished hydrating
    // the page tree — splitting words on partially-hydrated nodes is
    // benign but cleaner after the first paint settles.
    const initTimer = window.setTimeout(tick, 120);

    // Re-scan on any DOM change (e.g. App Router route transitions
    // mounting new sections). Debounced to dodge React's rapid
    // commit bursts.
    const mo = new MutationObserver(() => {
      if (window.__motionDebounce) clearTimeout(window.__motionDebounce);
      window.__motionDebounce = setTimeout(tick, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Cleanup — root layout doesn't unmount in App Router so this
    // mostly matters for Fast Refresh during dev.
    return () => {
      window.clearTimeout(initTimer);
      if (window.__motionDebounce) clearTimeout(window.__motionDebounce);
      if (rafCursor !== null) cancelAnimationFrame(rafCursor);
      mo.disconnect();
      io.disconnect();
      cio.disconnect();
      progress.remove();
      dot?.remove();
      ring?.remove();
      label?.remove();
      window.__motionInit = false;
    };
  }, []);
  return null;
}
