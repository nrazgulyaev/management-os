# Feature inventory · Platform Admin + Auth — FILLED 2026-05-29

Status: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ N/A. Verdicts cite real files. See `../_current-app-routes.md`.

> **Headline:** Platform's **agents console is richer than the design** (deep `[id]` config + test-chat + KB + Vault). The design's net-new platform screens (users / feature-flags / support-inbox / Stripe billing) are deliberately **not built**. Auth is built but **un-designed** (the single highest-visibility design gap) and is missing forgot/reset + wired SSO.

---

## PLATFORM ADMIN — `/platform`

### Organizations — `/platform/organizations`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Org list `[core]` | ✅ Have | `platform/organizations/page.tsx:61` (plan/status/MRR/period-ends/products) |
| 2 | Status filter pills | ✅ Have | `organizations/page.tsx:67-75` (trial/active/grace/cancelled/archived/purged) |
| 3 | Org detail `[orgCode]` `[detail]` | ✅ Have | `platform/[orgCode]/page.tsx` |
| 4 | Comp flag | 🔴 Missing | No internal-comp toggle surfaced in org detail |
| 5 | Read-only impersonation `[cross]` | 🟡 Partial | `components/subscription-os/impersonation-start-button.tsx` exists but **disabled** (read-only; action lands in a follow-up stage) |

### Revenue — `/platform/revenue`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | MRR / ARR hero `[core]` | ✅ Have | `platform/revenue/page.tsx:71` |
| 2 | Active / trial / total counts | ✅ Have | `revenue/page.tsx` |
| 3 | Trial→paid conversion (30d) | ✅ Have | `revenue/page.tsx:45-49` |
| 4 | Churn (30d) | ✅ Have | `revenue/page.tsx:52-57` |
| 5 | Per-tier table | ✅ Have | `revenue/page.tsx` perTier rows |

### Usage — `/platform/usage`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Total orgs + product split `[core]` | ✅ Have | `platform/usage/page.tsx` (mgmt/dev/both) |
| 2 | Per-org products + plan | ✅ Have | `usage/page.tsx` |
| 3 | AI usage deep-link `[cross]` | ✅ Have | `usage/page.tsx` references agent_runs/cost |

### AI agents — `/platform/agents`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Agent registry `[core][ai]` | ✅ Have | `platform/agents/page.tsx:66-93` reads `platform_agent_configs` |
| 2 | Subscriber count + 30d cost | ✅ Have | `agents/page.tsx:79-89` (org_agent_subscriptions + agent_runs) |
| 3 | Agent detail `[id]` `[detail]` | ✅ Have | `agents/[id]/page.tsx` — config + AgentTestChat + KnowledgePoller (richer than design) |
| 4 | New agent | ✅ Have | `agents/new/page.tsx` |
| 5 | Knowledge base upload | ✅ Have | `agents/[id]/page.tsx` uploadAgentDocumentFromForm + `agent_knowledge_documents`/`_chunks` pgvector (0109) |
| 6 | API key via Vault | ✅ Have | `agents/[id]/page.tsx` vault_secret_name + rotateAgentApiKeyFromForm |
| 7 | Org subscriptions | ✅ Have | `agents/[id]/page.tsx` toggleSubscriptionFromForm |
| — | Seeding caveat | 🟡 | `platform_agent_configs` (0109) has **no seed rows** — configs created at runtime via `/platform/agents/new` |

### Audit log — `/platform/audit`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Admin audit log `[core]` | 🟡 Partial | `platform/audit/page.tsx` exists but minimal (~3.6kb) |
| 2 | Impersonation logging | 🟡 Partial | Schema supports it; UI surfacing unverified (and impersonation itself is disabled) |
| 3 | Plan-change log | 🟡 Partial | Audit infra exists; dedicated plan-change view not confirmed |
| 4 | Search + export | 🔴 Missing | No filter/export on the audit page |

### Platform — not built (design drafts only)
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Users management `[design-only]` | 🔴 Missing | No `/platform/users` route |
| 2 | Feature flags `[design-only]` | 🔴 Missing | No `/platform/flags` route |
| 3 | Support inbox `[design-only]` | ➖ N/A | `platform/page.tsx` comment: tickets stay external (Plain/Linear/Intercom) by decision |
| 4 | Stripe billing collection | 🔴 Missing | Marked "ships after Stripe Connect" — per-org portal links not built |

---

## AUTH SUITE — built but **un-designed** (Layer B re-skin target)

### Per-platform sign-in
| # | Platform | Status | Note (file checked) |
|---|---|---|---|
| 1 | Management `[core]` | ✅ Have | `/login` shared, PRODUCT_COPY["management"], x-product routing |
| 2 | Owner | 🟡 Partial | **No bespoke owner login** — uses shared `/login` |
| 3 | Development | ✅ Have | shared `/login`, PRODUCT_COPY["development"] |
| 4 | Investor | ✅ Have | `(investor-portal)/login/page.tsx` (separate form) |
| 5 | Buyer | ✅ Have | `(buyer-portal)/login/page.tsx` (separate form) |
| 6 | Platform | ✅ Have | shared `/login`, PRODUCT_COPY["platform"] |

### Screens (shared, themed per platform)
| # | Screen | Status | Note (file checked) |
|---|---|---|---|
| 1 | Sign in `[core]` | 🟡 Partial | `/login` email+password+keep-signed-in; **SSO button not wired** |
| 2 | Sign up | ✅ Have | `/sign-up` (org name/email/pwd/org/slug/plan + 14-day trial) |
| 3 | Forgot password | 🔴 Missing | No `/forgot-password` route (Supabase reset flow only) |
| 4 | Reset password | 🔴 Missing | No dedicated `/reset-password` page |
| 5 | MFA verify | ✅ Have | `/setup/mfa/verify` (6-digit OTP + resend + recovery) |
| 6 | Admin bootstrap | ✅ Have | `/setup/admin-bootstrap` (first-run super_admin) |
| 7 | SSO option | 🔴 Missing | No "continue with SSO" wired |
| 8 | Success / redirect | ✅ Have | x-product redirect to workspace |

### Auth — design vs built notes
| # | Item | Status | Note (file checked) |
|---|---|---|---|
| 1 | Built screens | ✅ Have | `/login`, `/sign-up`, `/setup/admin-bootstrap`, `/setup/mfa`(+`verify`+`recovery-codes`) all exist |
| 2 | Design upgrade (Layer B re-skin + bespoke owner/investor/buyer logins) | 🔴 Missing | Built pages predate Layer B; no design file exists for any auth screen — **design-side gap, not a code gap** |
| 3 | MFA enroll/recovery screens | ✅ Have | `/setup/mfa` (enroll) + `/setup/mfa/recovery-codes` both built |

---

## App-only extras (Platform / Auth) — built, no design coverage → send back to design
- **Platform agents `[id]` depth** — config + live **test-chat** + KB upload (pgvector) + **Vault** key rotation + per-org subscription toggles. Design's `09-ai-overview` is far thinner; this is a "design should catch up to the build" item.
- **`/platform/usage`** as a distinct AI-usage/product-split surface (design merges into system-health).
- **`(investor-portal)/login` + `(buyer-portal)/login`** bespoke forms already exist (design's auth suite proposes them as new).
- **MFA enroll + recovery-codes** screens exist in-app though the v1 auth design only specified MFA *verify*.
