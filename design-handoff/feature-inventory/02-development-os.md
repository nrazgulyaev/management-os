# Feature inventory · Development OS

Mark **Status**: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ Skip. Tags: `[core] [detail] [ai] [mobile] [design-only] [cross]`.

---

## P1 · CORE CABINETS

### Projects + PM — `/development-os/projects` (deepest cabinet, `[slug]` = 41kb hub)
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Projects list `[core]` | all dev projects | |
| 2 | Project hub `[slug]` `[detail]` | overview of one project | |
| 3 | BOQ per project `[cross]` | boq + [lineId] | |
| 4 | Change orders | list + [code] + new | |
| 5 | Company / org chart | company + [id] | |
| 6 | Decisions log | decisions + [code] + new | |
| 7 | Land + acquisition | land page | |
| 8 | Milestones | milestone editor | |
| 9 | Permits | permits + [id] | |
| 10 | Risks | risks + heatmap + [code] + new | |
| 11 | Schedule | schedule + lookahead + tasks (+[code]/new) | |
| 12 | Waterfall | waterfall + simulator | |
| 13 | Work packages | WP list + [code] + new | |

### CFO / Finance — `/development-os/cfo`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | CFO console `[core]` | cash / AR / AP / MTD spend / forecast burn KPIs | |
| 2 | Capital waterfall | commitments→called→costs→cash bars | |
| 3 | P&L by project | hard/soft/financing per project | |
| 4 | Cash position bars | 6–8 week runway | |
| 5 | Tax types (auto-categorised) `[ai]` | PPN/PPh/PBB MTD+YTD + filing status | |
| 6 | Shared-cost allocation | allocation rules across projects | |
| 7 | Capital calls `[cross]` | calls + [id] | |
| 8 | Distributions | distribution runs | |

### BOQ + QS — `/development-os/boq`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | BOQ list `[core]` | bills of quantities | |
| 2 | BOQ detail `[code]` `[detail]` | line items, virtualized | |
| 3 | Variance pills `[design-only]` | qty Δ + rate Δ (boq_revisions/actuals/variance_reviews 0113) | |
| 4 | QS variance review | review workspace | |
| 5 | Import wizard | 3-step BOQ import + quick-entry | |
| 6 | Export | BOQ export | |
| 7 | QS cost analyst `[ai]` | overrun + forecast-at-completion | |

### Procurement + Vendors — `/development-os/procurement`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Purchase requests `[core]` | list + [code] + new | |
| 2 | Quotation comparison matrix | [requestCode] + matrix island | |
| 3 | Quotations + import | quote list + import wizard (23kb) | |
| 4 | Vendor scoring `[ai][design-only]` | reliability + lead-time (vendor_scores 0113) | |
| 5 | Procurement analyst `[ai]` | supplier performance | |

---

## P2 · SALES & CAPITAL

### Sales — `/development-os/sales`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Sales pipeline `[core]` | 6-stage FSM (lead→qualified→tour→contract→won/lost) | |
| 2 | Contact/buyer detail `[contactRoleId]` `[detail]` | buyer record | |
| 3 | Offer policy + modal | offer with discount + approval | |
| 4 | Payment ladder | contract payment schedule | |
| 5 | Funnel chart | stage conversion | |
| 6 | Sales agents `[ai]` | offer-drafter · lead-scorer · pipeline-supervisor | |
| 7 | Pipeline-card storage `[design-only]` | design wants sales_pipeline_cards/stage_events/offers | |

### Investors — `/development-os/investors`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Investors list `[core]` | all investors | |
| 2 | Investor detail `[code]` `[detail]` | profile + commitments | |
| 3 | Capital account | per-investor account | |
| 4 | Grant access | investor portal access (12.9kb) | |
| 5 | Waterfall calculator `[core]` | canonical distribution waterfall | |
| 6 | XIRR / IRR tracker | per-investor return | |
| 7 | Capital-call issuer | pro-rata call generation | |
| 8 | Distributions + requests | distribution + investor-requests | |

### Site supervisor — `/development-os/site-reports`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Site report list `[core]` | daily reports | |
| 2 | Report detail `[id]` `[detail]` | 15kb · photos, zones, incidents | |
| 3 | New report (capture) | 19kb · camera + caption + tag flow | |
| 4 | Quick-photo `[mobile]` | `/operations/site-reports/quick-photo` | |
| 5 | Severity classifier `[ai]` | P1/P2/P3 rule-based first pass | |
| 6 | Weekly composer `[ai]` | picks 3 hero frames + drafts summary | |
| 7 | GPS + timestamp at source | photos without GPS flagged | |
| 8 | Voice note narration | voice_notes (0105) | |
| 9 | WhatsApp → site report `[cross]` | WA intent → draft | |
| 10 | Weekly report table `[design-only]` | design wants weekly_reports + site_frames view | |

---

## P3 · SECONDARY CLUSTERS (mobile: `mobile-pass-dev-p3-full.html`)

### C6 · Dev Finance
**CFO console** (above) · **Cashflow forecast** `/cfo/cashflow` · **Profitability** `/profitability` · **Banking** `/banking`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Cashflow 12-mo forecast `[core]` | net + cumulative, capital-call spike, reserve breach | |
| 2 | Cashflow-forecaster agent `[ai][design-only]` | live series from BOQ + capital calls | |
| 3 | Unit profitability table `[core]` | cost basis + expected margin + margin% (GENERATED STORED) | |
| 4 | Margin tone badges | ≥25 / ≥10 / ≥0 / negative | |
| 5 | Bank connections | Revolut/Wise (API) · Mandiri/BCA/manual (CSV) | |
| 6 | Bank detail + sync status | [id] last-sync result | |

### C7 · Dev Contracts
**Contracts** `/contracts` · **Invoices** `/invoices` · **Discounts** `/discounts` · **Commitments** `/commitments`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Contract groups `[core]` | per buyer-villa; 3 child contracts off-plan | |
| 2 | Group status FSM | draft→pending→partial→fully-signed→payment→completed | |
| 3 | Milestone invoices | issued on pre-invoice/due triggers | |
| 4 | Invoice status | draft/sent/viewed/paid/overdue/void | |
| 5 | Discount approval ladder `[core]` | role-tier authority + auto-escalation | |
| 6 | Authorization tiers | per-role max % + escalate-to | |
| 7 | Capital commitments | per investor×project, profit % + priority | |
| 8 | Drawdowns + wallets `[detail]` | commitment [id] | |

### C8 · Knowledge & Docs
**Knowledge** `/knowledge` · **Drawings** `/drawings` · **Method statements** `/method-statements` · **Materials** `/materials`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Knowledge hub `[core]` | drawings/specs/methods/quality counts | |
| 2 | Drawing revision control | Rev A/B…, one IFC per drawing (DB-enforced) | |
| 3 | Drawing detail `[code]` | upload revisions | |
| 4 | Method statements / SOPs | step-by-step, tools/PPE/hazards, JSONB steps | |
| 5 | Method versioning | draft→review→active→superseded | |
| 6 | Material POs `[cross]` | vendor POs + reconciliation gate | |
| 7 | Deliveries | delivery lines = received gate | |
| 8 | Specs + quality standards | catalogs | |

### C9 · Dev Ops
**Marketing** `/marketing` · **Inbox** `/inbox` · **Project cycle** `/project-cycle` · **Productivity** `/productivity`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Marketing pipeline `[core]` | leads/campaigns/content, 6 channels | |
| 2 | Lead-source attribution | leads/qualified/reservations/CPL per source | |
| 3 | Content calendar + approval | approval queue, backlog | |
| 4 | Marketing assistant `[ai]` | captions/hashtags/broadcast | |
| 5 | Unified inbox `[core][mobile]` | WA/Telegram/IG/Messenger/Email/SMS threads | |
| 6 | Inbox templates + auto-responses | reusable replies + rules | |
| 7 | Thread detail `[id]` | full conversation | |
| 8 | Project-cycle intelligence `[ai]` | "when to start next project" recommendations | |
| 9 | Capacity tracking | per-role utilization | |
| 10 | Payroll periods | commitment view | |
| 11 | Productivity per-trade | hours + quantity → rate (calibrates BOQ) | |
| 12 | Productivity log entry | log time + qty | |

---

## NEW CABINETS

### Dev workspace — `/development-os/dashboard` / overview `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Dev command center | portfolio overview, 12.9kb | |
| 2 | Cross-project KPIs | cost / schedule / risk roll-up | |

### Dev executive — `/development-os` (exec overview)
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Executive summary `[ai]` | strategic synthesis + weekly summary | |
| 2 | Portfolio + risk reports | desk-only review | |

### Dev marketing / warehouse
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Marketing (see C9) | — | |
| 2 | Warehouse / materials store | `/materials` + assets/asset-types | |
| 3 | Bulk import | `/bulk-import` CSV ingest | |

---

## App-only extras (Development)
> List anything your live Dev OS does that no design above covers:
- …
