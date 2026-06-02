# Feature inventory · Platform Admin + Auth

Mark **Status**: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ Skip. Tags: `[core] [detail] [ai] [mobile] [design-only] [cross]`.

---

## PLATFORM ADMIN — `/platform` (dark cool-blue theme · super_admin only) `[mobile]`

### Organizations — `/platform/organizations`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Org list `[core]` | all customer orgs, plan, status, MRR, period-ends, products | |
| 2 | Status filter pills | active/trial/grace/cancelled | |
| 3 | Org detail `[orgCode]` `[detail]` | per-org subscription state + actions | |
| 4 | Comp flag | internal-comp orgs | |
| 5 | Read-only impersonation `[cross]` | "view as customer" | |

### Revenue — `/platform/revenue`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | MRR / ARR hero `[core]` | sum of active monthly price; ×12 | |
| 2 | Active / trial / total counts | customer breakdown | |
| 3 | Trial→paid conversion (30d) | indicative % | |
| 4 | Churn (30d) | cancellations % | |
| 5 | Per-tier table | active/trial/price/MRR contribution per plan | |

### Usage — `/platform/usage`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Total orgs + product split `[core]` | mgmt-only / dev-only / both | |
| 2 | Per-org products + plan | customer table | |
| 3 | AI usage deep-link `[cross]` | → Dev OS AI usage analytics | |

### AI agents — `/platform/agents`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Agent registry `[core][ai]` | platform_agent_configs: provider/model/scope | |
| 2 | Subscriber count + 30d cost | per agent roll-up from agent_runs | |
| 3 | Agent detail `[id]` `[detail]` | 39kb: config + knowledge + test-chat | |
| 4 | New agent | provider/model/prompt/budget | |
| 5 | Knowledge base upload | per-agent KB (pgvector) | |
| 6 | API key via Vault | encrypted at rest, configured/missing badge | |
| 7 | Org subscriptions | enable agent per customer org | |

### Audit log — `/platform/audit`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Admin audit log `[core]` | who/when/what/before-after, every operator action | |
| 2 | Impersonation logging | read-only views logged | |
| 3 | Plan-change log | comp grants, upgrades | |
| 4 | Search + export | filter by operator/org | |

### Platform — not built (design drafts only, `cabinets/super-admin/`)
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Users management `[design-only]` | platform-user admin (no `/platform/users` route) | |
| 2 | Feature flags `[design-only]` | per-org flag toggles | |
| 3 | Support inbox `[design-only]` | ticket triage (or stay external: Plain/Linear/Intercom) | |
| 4 | Stripe billing collection | per-org portal links (after Stripe Connect) | |

---

## AUTH SUITE — `auth/Auth Suite.html` (6 platforms × 8 screens) `[mobile]`

### Per-platform sign-in (bespoke theme + copy)
| # | Platform | Theme | Status |
|---|---|---|---|
| 1 | Management `[core]` | cream/terra, staff | |
| 2 | Owner | calm mgmt | |
| 3 | Development | sand/amber, staff | |
| 4 | Investor | steel/finance | |
| 5 | Buyer | aspirational | |
| 6 | Platform | dark cool-blue, restricted | |

### Screens (shared, themed per platform)
| # | Screen | What it does | Status |
|---|---|---|---|
| 1 | Sign in `[core]` | email + password + keep-signed-in + SSO | |
| 2 | Sign up | org creation: name/email/pwd/org/slug/plan, 14-day trial | |
| 3 | Forgot password | send reset link (30-min expiry) | |
| 4 | Reset password | new password + strength reqs | |
| 5 | MFA verify | 6-digit OTP + resend + recovery code | |
| 6 | Admin bootstrap | first-run system-owner creation | |
| 7 | SSO option | continue with SSO (where enabled) | |
| 8 | Success / redirect | "you're in" → workspace | |

### Panel tones (explore)
| # | Tone | What it does | Status |
|---|---|---|---|
| 1 | Warm | gradient + testimonial (default) | |
| 2 | Premium dark | dark panel + grid + accent | |
| 3 | Editorial | villa-photo + quote overlay | |

### Auth — design vs built notes
| # | Item | Note | Status |
|---|---|---|---|
| 1 | Built screens | `/login`, `/sign-up`, `/setup/admin-bootstrap`, `/setup/mfa`(+verify+recovery) exist in `main` | |
| 2 | Design upgrade | the built pages predate Layer B — design re-skins them + adds owner/investor/buyer bespoke logins | |
| 3 | MFA enroll/recovery screens | built in app; design covers verify (enroll/recovery were out of v1 design scope) | |

---

## App-only extras (Platform / Auth)
> Anything your live platform/auth does that no design covers:
- …
