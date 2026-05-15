# Contributing

Short notes that catch the bugs we keep relearning. The full architecture
guide lives in `docs/`. This file is for the small handful of rules that,
when violated, take production down.

## React Server Components — don't pass functions across the boundary

A Server Component (any `.tsx` file in `src/app/` or `src/components/`
without a `"use client"` directive) **cannot** pass a function prop to a
`"use client"` component. The RSC payload serializer will throw with a
digest hash and a `React.createElement: type is invalid` / `Functions
cannot be passed as Server Component → Client Component props` error.

This caused HF-1 (`AreaChartCard.formatValue`) and is the bug class
HF-4 added a regression scanner for.

### What's safe to pass across the boundary

- Primitives — `string`, `number`, `boolean`, `null`, `undefined`
- `BigInt`, `Date`, `Map`, `Set` — supported by React 19's wire format
- Plain objects + arrays of the above
- Other server-rendered JSX (passed as `children` or other `ReactNode` slots)
- Promises (streamed)
- Server actions (functions defined in a file with `"use server"`)

### What's NOT safe to pass

- Inline arrow functions: `<Modal onClose={() => setOpen(false)} />`
  rendered from a server component
- Inline function expressions: `<Card format={function(v) { ... }} />`
- References to a function defined in the server file
- Class instances (the prototype methods don't survive serialization;
  the object reaches the client as a plain `{...}` and method calls crash)
- Symbols, regexes

### Three fix patterns

1. **Format-spec union** — replace a `(v) => string` formatter prop with
   a string-union `format: "currency-usd" | "percent" | ...` resolved
   inside the client component. See `src/components/award/format-specs.ts`.

2. **ReactNode slot** — accept pre-rendered JSX from the server caller
   instead of a render-prop function. The server renders the slot; the
   client component just inserts it.

3. **Move the function into the client component** — if the function
   only describes client-side behavior (`onClick`, validators, etc.),
   it should be defined inside the `"use client"` component, not passed
   in. The parent can pass primitive identifiers (a slug, an enum value)
   if the function needs context.

### Regression test

`tests/sprint-hotfix-4-no-function-prop-on-rsc-boundary.test.ts` runs
on every `npm test`. It walks every server `.tsx` file, parses JSX with
the TypeScript compiler, and fails CI if it finds an inline arrow / inline
function / local-function reference passed as a prop to a known
`"use client"` component. Add new fixes to that file's allowlist only if
you can prove the prop is actually a server action.

You can also run the same scan as a one-shot CLI:

```
npm run audit:rsc
```

## Modal smoke tests

Every operator-facing "Add X" / "Create X" / "Edit X" modal needs a
Playwright smoke test in `tests/e2e/modal-smoke/`. The smoke test
opens the parent page, clicks the trigger, asserts the modal mounts,
and fails if any page-level error / console.error / 5xx response
fires during the open path.

Run locally against a prod-mode server on `:3101`:

```
npm run build
PORT=3101 npm start &
npm run test:e2e:modal-smoke
```

If you add a new modal:

1. Tag the trigger button with `data-testid="<entity>-add-trigger"`
   (or `-create-trigger`, `-edit-trigger`).
2. Add a row to the `MODALS` table in
   `tests/e2e/modal-smoke/priority-modals.spec.ts` with the route and
   testid.
3. Run the suite and confirm it passes against your local build.

Required for review: modal-smoke pass + a screenshot is fine — Playwright
catches the bug class STAB-2 was chartered for (modal mount triggers
a server-child crash that the page-level audit didn't catch — see
the `/development-os/reservations` hang fix in that sprint).

## Don't let queries hang the page

Server-component pages that fetch data through Drizzle should wrap
the call in `safeQuery(label, promise, fallback, timeoutMs)` from
`@/lib/development/safe-query`. Without a timeout, a slow or
deadlocked query blocks the entire RSC response and the page never
returns — exactly what crashed `/development-os/reservations` before
STAB-2. The convention on existing pages is 4000ms for primary
fetches and a sensible fallback (usually `[]` or `null`).
