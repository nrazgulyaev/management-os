# Feature gap · 22 · Owner · Settings (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> 🟡 **Partially built — the one owner cabinet where "thin" may be accurate.** Only `/owner/preferences/calendar` (2.5kb) is confirmed; there is **no broad `/owner/settings` route** in the tree (notification toggles, 2FA-gated payout edit, profile). The design's 2FA-gated payout + 6 notification toggles may genuinely be unbuilt. **This is the audit most likely to still hold** — verify the payout/notification surface against `owner-portal/` feature + drizzle; if absent, the design's settings spec is a real P1 build.

**Design sources**
- Desktop: `cabinets/owner-p1/07-settings.html`
- Phase: 2.3 owner-07 · commit `06688f2`

**Repo paths**
- Routes: `src/app/(owner)/owner/preferences/calendar/page.tsx` (2.5kb) — calendar preferences sub-page; main settings likely inline in `page.tsx`
- Components: `settings-row.tsx`, `settings-section.tsx`, `toggle.tsx`, `invite-portal-modal.tsx`, `portal-dot.tsx`, `tier-ring.tsx` (owner-portal scope)
- Feature: `src/features/owner-portal/get-settings.ts`
- Schema · uses owners + payout_methods (mig 0000), auth MFA (mig 0033 recovery codes)

## TL;DR

Owner Settings is **2FA-gated payout-method edit + 6 notification toggles** per CLAUDE.md. SettingsRow + SettingsSection + Toggle are the primitives. PayoutMethod edit requires 2FA via the auth MFA stack (mig 0033 recovery codes). InvitePortalModal handles inviting other owners (co-owners on the same villa). Tier ring visualizes owner tier from `derive-tier.ts` (cabinet 07 Owners). **0 P0** if 2FA challenge is wired to payout edit action.

---

## Section-by-section

### Profile + tier
| Element | Status |
|---|---|
| `tier-ring.tsx` | ✅ via cabinet 07 derive-tier.ts |
| Profile info | ✅ from owners table |

### Payout method · 2FA-gated edit
| Element | Status |
|---|---|
| Display from `payout_methods` | ✅ schema |
| Edit triggers 2FA via `auth_mfa_recovery_codes` (mig 0033) | 🟡 verify wiring |

### 6 notification toggles
| Element | Status |
|---|---|
| `toggle.tsx` × 6 (statement issued · P1 incident · comp offered · stay confirmed · payout sent · monthly summary) | ✅ likely |
| Backed by `notification_preferences` (assumed table; verify) | 🟡 |

### Co-owner invite
| Element | Status |
|---|---|
| `invite-portal-modal.tsx` | ✅ |
| Issues portal access via `ownership_shares` join | ✅ schema |

### Calendar preferences (sub-page)
| Element | Status |
|---|---|
| `preferences/calendar/page.tsx` (2.5kb) | ✅ |
| Quota / blackout configuration | ✅ |

---

## Recommended additions

### 🔥 P0
1. **Verify 2FA wiring on payout edit** — without it, owners can change payout details with just session auth — a real risk vector.

### ⭐ P1
2. **Notification preferences table** — confirm exists; if not, add.
3. **Co-owner permission scopes** — view-only vs co-decision; confirm model.

### 💭 P2
4. **Account deletion** flow.

## Open questions
- **Notification fan-out engine** — same as cabinet 20 inbox triggers? Or separate?
- **Co-owner invite expiry** — single-use link? Duration?
- **Payout-edit cool-down** — after change, lock for 24h to prevent fraud?
