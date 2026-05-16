# Next.js runtime config — operator reference

Production-relevant settings in `next.config.mjs`. Run `npm run audit:runtime-config` to validate they're at safe values.

## Settings

### `experimental.serverActions.bodySizeLimit`

**Current value**: `"10mb"`
**Safe minimum**: 5mb
**Why**: Receipt OCR ships the receipt image inline (base64 in FormData) to the `extractReceipt` server action. The Next.js 15 default is 1 MB. Phone JPEGs are typically 2–5 MB, so the default silently 413's every receipt upload (digest `4033951084` — see HF-8).

**Breaks if reverted below 5 MB**: all receipt uploads fail with `Body exceeded 1 MB limit`.

### `reactStrictMode`

**Current value**: `true`
**Why**: Catches double-render bugs + deprecated lifecycle usage during dev.

### `outputFileTracingRoot`

**Current value**: `__dirname` (the package root)
**Why**: Prevents Next from walking up to parent `package.json` / lockfiles when building inside a monorepo or Vercel CI. Without it the trace may include unrelated files and the deployment grows.

### Redirects (`redirects()`)

50+ permanent 308 redirects defined as `STAGE_10_C_REDIRECTS`. They map operator mental-model URLs (`/dashboard/maintenance`) to canonical routes (`/dashboard/maintenance-intelligence`). Don't remove a redirect without checking the route triage doc.

## Audit

`npm run audit:runtime-config` enforces:

- `bodySizeLimit` ≥ 5 MB.
- `reactStrictMode === true`.
- `outputFileTracingRoot` is set.

Exit code 1 on any failure. Wire into CI before any future Next.js upgrade.
