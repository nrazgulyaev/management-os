# Feature gap · 21 · Owner · Documents (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Route `/owner/documents` → `page.tsx` 4.9kb. Backed by the shared `documents/` feature. **Discard "not built".** Surviving: design↔code deltas (bundle-generation, doc-grouping specifics) — verify against `documents/` + drizzle.

**Design sources**
- Desktop: `cabinets/owner-p1/06-documents.html`
- Phase: 2.3 owner-06 · commit `5ed827d`

**Repo paths**
- Route: `src/app/(owner)/owner/documents/page.tsx` (4.9kb)
- Components: `doc-row.tsx`, `doc-group.tsx`, `generate-bundle.ts` (owner-portal scope)
- Feature: `src/features/owner-portal/get-documents.ts`
- Schema · documents (mig 0000): `documents`; visibility widen (mig 0108)

## TL;DR

Owner Documents is a list + PDF bundle download flow. DocRow + DocGroup organise by category (statements, contracts, K-1s, etc). `generate-bundle.ts` handles PDF stitching for the multi-statement bundle requested by Tan Family Trust (support ticket #2418). Modest cabinet — 4.9kb route + 3 components + 1 helper. **0 P0** if bundle generation works server-side.

---

## Section-by-section

### Document list
| Element | Status |
|---|---|
| `doc-row.tsx`, `doc-group.tsx` | ✅ |
| Categories | ✅ |
| Per-document download | ✅ via `documents.file_url` |

### Bundle generation
| Element | Status |
|---|---|
| `generate-bundle.ts` — PDF stitcher | ✅ shipped |
| Select-then-bundle flow | ✅ |

### Documents visibility (mig 0108)
| Element | Status |
|---|---|
| Owner-visible documents filter | ✅ schema |

---

## Recommended additions

### 🔥 P0 — none

### ⭐ P1
1. **Owner upload** — owner-to-Mgmt document submission (e.g. proof of payment).
2. **Document version history** — when contracts revise.

## Open questions
- **Bundle generation infra** — pdf-lib server-side or external service?
- **Document categories** — fixed taxonomy or per-org configurable?
