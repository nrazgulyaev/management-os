# FC-AUTH-AUTH-SUITE — Auth suite (6 platforms)

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/auth/01-auth-suite.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/auth/01-auth-suite.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Auth suite (6 platforms) — `/login` |
| **Also covers** | sign-up · forgot · reset · mfa · admin-bootstrap |
| **Pixel truth** | `cc-pixel-prompts/auth/01-auth-suite.md` |
| **Cross-surface partners** | Platform Admin |
| **Tables** | `users` · `organizations` · `mfa_factors` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Per-platform sign-in | bespoke theme + copy: Management / Owner / Development / Investor / Buyer / Platform | [core] | Have/verify |
| 2 | Sign in | email + password + keep-signed-in + SSO | [core] | Have/verify |
| 3 | Sign up | org creation: name/email/pwd/org/slug/plan, 14-day trial | [cross] | Wire |
| 4 | Forgot password | send reset link (30-min expiry) |  | Have/verify |
| 5 | Reset password | new password + strength reqs |  | Have/verify |
| 6 | MFA verify | 6-digit OTP + resend + recovery code |  | Have/verify |
| 7 | Admin bootstrap | first-run system-owner creation |  | Have/verify |
| 8 | SSO option | continue with SSO (where enabled) |  | Have/verify |
| 9 | Success / redirect | "you're in" → workspace |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Sign up
- **Trigger:** org creation: name/email/pwd/org/slug/plan, 14-day trial (`/login`)
- **Partner surface:** Platform Admin
- **Event → effect:** a new org appears in the platform org list as trial.

## Acceptance (behavioral)

- [ ] Sign up: do the action on `/login` → assert the effect on Platform Admin with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Built screens exist (/login, /sign-up, /setup/*) but predate Layer B — confirm this is a re-skin + adding owner/investor/buyer bespoke logins.
