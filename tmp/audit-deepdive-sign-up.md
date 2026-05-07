# /sign-up — console + network errors deep-dive

**Audit run**: 2026-05-07
**Verdict**: 🟡 PARTIAL
**Symptom**: page loads (200 OK) but emits 2 console errors and 2 network 404s on first paint.

## Root cause

The sign-up page (or its layout) prefetches two RSC routes that don't exist:

```
GET /legal/terms?_rsc=1pk7s   → 404
GET /legal/privacy?_rsc=1pk7s → 404
```

The `?_rsc=` query string is Next.js's React Server Component prefetch mechanism — `<Link prefetch>` triggers a fetch as soon as the link enters the viewport. The links live in the sign-up page's footer or terms checkbox label, pointing at routes that were never built.

```
Failed to load resource: the server responded with a status of 404 ()
Failed to load resource: the server responded with a status of 404 ()
```

These are not blocking — the page renders fully and the form is interactive. But:
1. Operators see "There were errors on this page" in the browser DevTools console.
2. Compliance posture: a sign-up flow that points at "Terms" and "Privacy" links that 404 is a legal/regulatory red flag.

## Fix complexity: QUICK (≤1h)

Two options, both small:

**Option A — add the legal pages**
Create `src/app/(public)/legal/terms/page.tsx` and `src/app/(public)/legal/privacy/page.tsx`. Boilerplate Markdown→JSX. Link tag stays unchanged. Right call once Arconique has signed-off legal copy.

**Option B — replace the links with placeholders**
Until legal copy lands, change the terms/privacy `<Link href>` to `#` or remove the prefetch. Eliminates the 404 noise; signals "these will exist before launch".

Stage 8 scope-fit: include real Terms + Privacy pages alongside the rest of the public marketing surface.

## Reproduction

Open https://management-os-fawn.vercel.app/sign-up in a browser, open DevTools Console — two 404 errors logged immediately on page load.
