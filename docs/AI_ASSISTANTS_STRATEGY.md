# Arconique Management OS — AI Assistants Strategy

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This is the authoritative plan for the AI layer. It defines eight permission-aware assistants, their data boundaries, prompt architecture, tool privileges, UX placement, escalation logic, safety rules, and phased rollout.

**Core AI principles (binding):**

1. **Permission-aware by construction.** The AI runs *as* the user. Retrieval queries use the same DB session with RLS. Tools are gated by `can()`. There is no "AI service role" for reading user data.
2. **Retrieve-then-answer.** Every answer about Arconique data must cite retrieved rows. Free-form answers without grounding are disallowed for finance, operations, access, and ownership questions.
3. **No invented numbers.** If retrieval is empty, the assistant says *"I don't have access to that data"* or *"I can't find it in your data"*. Fabrication is a P0 incident.
4. **Write only with confirmation.** Any mutating tool shows a confirmation UI with the exact payload before execution.
5. **Full auditability.** Every turn logs prompt, retrieved refs, tools called, response, provider, tokens, latency, safety flags.
6. **Provider-agnostic.** Primary: Anthropic Claude. Fallback: OpenAI. Residency option: Vertex (Singapore). Swappable via feature flag.
7. **Human escalation is a feature, not a failure.** Every assistant knows how to hand off to a named human — that handoff is shown clearly in the UI.

---

## 1. Shared Architecture

### 1.1 Request flow
```
UI ──▶ /api/v1/ai/chat (SSE)
         │
         ▼
   Orchestrator (small, deterministic)
         │
         ├─▶ Assistant registry (system prompt, tools, retrieval scope)
         ├─▶ Retrieval layer (vector + SQL, RLS-enforced)
         ├─▶ Tool router (each tool = named function, permission-gated)
         └─▶ LLM provider (streaming)
         │
         ▼
    Safety / citation check
         │
         ▼
    ai.assistant_events log  ──▶  audit.events on write tools
```

### 1.2 Retrieval layer
- **Sources:**
  - `ai.embeddings` (pgvector) over villa guides, house rules, policies, past statement narratives, maintenance playbooks, supplier catalogs, messages.
  - **Structured SQL retrievers** for bookings, revenue, expenses, statements, tasks, inventory, access events — queried through Drizzle with the user's auth.
  - `documents` full-text search (pg_trgm).
- Retrievers return typed snippets: `{ source: 'revenue_line', id, text, fields }`. The orchestrator passes them into the prompt as `<context>…</context>` with explicit citation IDs.

### 1.3 Tool framework
- Tools declared in `ai.tool_registry`: `{ name, description, input_schema (Zod), required_permissions[], side_effect_level }`.
- `side_effect_level`: `read_only`, `suggest_only`, `mutating`.
- `mutating` tools never execute directly; the orchestrator returns a "proposed action" to the UI; user confirms; UI calls the tool endpoint; the tool endpoint enforces `can()` again.

### 1.4 System prompt composition
Each assistant's system prompt is composed from:
- **Role preamble** (who the assistant is and who it serves).
- **Scope statement** (allowed / forbidden data classes).
- **Grounding rules** (cite or refuse).
- **Tone and brand voice** (calm, precise, no emojis unless guest surface).
- **Escalation rules** (when to hand off).
- **Output format** (plain text by default; JSON for structured outputs; citations in `【source#id】` style).

All prompts live in `lib/ai/prompts/<assistant>.md`, version-controlled. Prompt version is stored on every event for reproducibility.

### 1.5 Safety & guardrails
- **Input side:** PII scrubbing for logs, prompt-injection detection (policy terms like "ignore previous instructions"), rate limiting per user.
- **Output side:** for finance/operations answers, run a verifier pass that checks every numeric claim against the retrieval set. If a number is produced that does not appear in any retrieved row, the response is suppressed and a guardrail incident logged.
- **Moderation:** provider moderation + internal policy classifier.
- **Hallucination classifier:** async evaluator samples 5% of responses and scores grounded/ungrounded.

### 1.6 Observability
- Latency, tokens, provider, model version per turn.
- User feedback (thumbs) fed into an evals dataset.
- Weekly evals run against a held-out question set per assistant; regressions block release.

### 1.7 Privacy defaults
- Guest PII (full name, ID, phone beyond masked) is excluded from retrieval unless the assistant is authorized *and* the user has `guests.pii.read`.
- Camera feeds are never sent to an LLM. AI can reference camera *events* (someone entered at 14:02) but never stream or screenshot video to a model.
- Financial statements are never sent as raw attachments to any provider without the user's explicit consent flag.

---

## 2. The Eight Assistants

Every section below follows the same template.

---

## 2.1 AI Guest Concierge

**Target user:** Guest, via tokenized stay page (`/stay/[token]/concierge`).

**Surface:** Chat widget in stay page. Also embeddable into WhatsApp handoff flow.

**Allowed data access:**
- The current booking (dates, villa name, party size).
- Villa guide (amenities, Wi-Fi display, house rules, directions).
- Upsell catalog for this villa / project.
- FAQ knowledge base (tourism, taxis, restaurants, basic Bali info).
- Check-in/checkout times.
- This booking's service requests and messages with staff.

**Forbidden data access:**
- Other bookings (same or other guest).
- Owner PII or finance.
- Other villas beyond the booked one.
- Internal pricing, margins, or staff schedules.
- Cameras, access codes for other villas, internal tickets.
- The smart-lock code itself — shown only in the UI after T-24h, never surfaced through chat.

**Example tasks:**
- "What time is checkout?"
- "Can I request extra towels?" → creates a service request via `create_service_request` tool.
- "Book me a private chef for tomorrow at 7pm for 4 people." → suggests catalog item, confirms, triggers `create_upsell_order` with user confirmation.
- "How do I use the air conditioning in the master bedroom?" → pulls from villa guide.
- "Recommend a restaurant nearby." → FAQ knowledge base or safe external recommendations.

**Tools:**
- `create_service_request(booking_id, type, note)` — suggest_only + confirm.
- `create_upsell_order(booking_id, upsell_id, quantity, preferred_time)` — mutating + confirm.
- `request_whatsapp_handoff(reason)` — creates a thread with concierge, signals urgency.
- `search_villa_guide(query)` — read_only.
- `search_faq(query)` — read_only.

**Escalation rules:**
- Any mention of injury, medical, fire, security, or flooding → immediate WhatsApp handoff + SMS to on-duty concierge + alert in admin inbox.
- Anything about refunds, disputes, complaints → handoff to human concierge.
- Request outside upsell catalog → handoff.
- Language other than EN / ID → still respond in language, but mark thread for review by concierge.

**Safety / privacy rules:**
- Never confirm presence of other guests at neighboring villas.
- Never quote internal prices or margins; only guest-facing prices.
- Never reveal smart-lock code.
- PII collected in chat is stored inside the booking thread only; not used for training.

**UI placement:**
- Floating button on `/stay/[token]` after check-in link is active.
- Chat uses the calm editorial design language, not a "pink robot". Suggestions surfaced as quiet chips.

**Implementation notes (future):**
- v1 ships with read-only Q&A and `create_service_request` tool.
- v2 adds `create_upsell_order`.
- v3 adds voice concierge on WhatsApp via WhatsApp Business API.

**Required database entities:**
- `bookings`, `villa_guides`, `upsells_catalog`, `booking_upsells`, `threads`, `messages`, `ai.embeddings` (FAQ + guide), `ai.assistant_events`.

---

## 2.2 AI Investor Assistant

**Target user:** `investor_owner`, `investor_viewer` (delegate).

**Surface:** `/owner/assistant` and a floating helper inside statement detail pages.

**Allowed data access:**
- Villas they own / share in, active for the time range of the question.
- Statements, revenue lines, fee lines, expense allocations, reserves, taxes, payouts — all filtered to their ownership.
- Pool aggregates for projects they participate in (anonymized at the expense-source level).
- Documents they are authorized to read.
- Historical occupancy, ADR, RevPAR for their villas.

**Forbidden data access:**
- Any villa or owner they do not own a share in.
- Other investors' names, amounts, payouts.
- Guest PII beyond initials and dates.
- Internal staff performance, supplier identities beyond category (unless contract says otherwise), access codes.
- Cameras: the assistant may reference that a camera exists on a villa they own, but cannot stream content.
- Raw margins, internal costs that are not charged to them.

**Example tasks:**
- "Explain my March 2026 statement."
- "Why did my February payout drop 18% vs January?"
- "What is my annualized yield YTD on Eternal Villa 07?"
- "Show me all maintenance I was charged for in Q1."
- "When should I expect my next payout?"
- "Can you draft an approval for the pool-deck renovation?" → generates an `owner_approval` request for human review.

**Tools:**
- `get_owner_statement(period, villa_id|pool_id)` — read_only.
- `drilldown_line(statement_line_id)` — read_only.
- `compare_periods(a, b)` — read_only.
- `download_statement_pdf(statement_id)` — read_only.
- `request_clarification(statement_id, line_id, question)` — creates a clarification ticket to the Finance Manager.
- `approve_pending(approval_id, decision, note)` — mutating + confirm; requires `owner_approvals.decide`.

**Escalation rules:**
- If the investor asks something the assistant cannot answer from their scope, it says so clearly and offers to create a ticket to the Finance Manager (`request_clarification`).
- Any sentiment indicating distrust (dispute, escalate, lawyer) → assistant adds a note to the thread and pings the Director.
- Multiple repeated questions about the same line → suggest a 15-minute call with the Property Manager.

**Safety / privacy rules:**
- Every numeric claim cites the specific statement line or revenue/expense row.
- The assistant always shows the period and scope it used ("For Eternal Villa 07, period March 1–31, 2026").
- Never discloses the identity of fellow pool members.
- Never discusses other owners' shares, even aggregates that could expose them.
- Refuses to speculate on future returns in definitive terms; offers "historical trend" framing with citations.

**UI placement:**
- Full page at `/owner/assistant`.
- Context-aware drawer inside `/owner/statements/[id]` ("ask about this statement").
- Mobile-friendly chat. No chatbot clichés; the assistant is presented as "Your reporting assistant".

**Implementation notes:**
- v3 ships with retrieval over statements, revenue, expenses, reserves.
- v4 adds structured outputs for period comparisons.
- v7 adds approval workflow tool.

**Required database entities:**
- `ownership_shares`, `statements`, `statement_lines`, `revenue_lines`, `fee_lines`, `expense_lines`, `expense_allocations`, `reserves`, `payouts`, `taxes`, `owner_approvals`, `ai.embeddings` (statement narratives), `ai.assistant_events`.

---

## 2.3 AI Operations Copilot

**Target user:** Operations Manager, Property Manager, Housekeeping Supervisor (restricted surface), Director.

**Surface:** `/app/ai/operations` and context-aware drawer on `/app/operations/*`.

**Allowed data access:**
- Tasks, checklists, maintenance tickets, preventive schedules, villa statuses, staff rotas.
- Damage reports, complaints (non-PII summaries), lost & found.
- Staff performance metrics at role level; individual performance only when scope allows.
- Booking arrival/departure timing, occupancy.

**Forbidden data access:**
- Finance detail beyond task-linked expenses.
- Ownership information beyond villa ↔ owner link when necessary.
- Guest PII beyond what's on the booking card.
- Cameras (no streaming).
- Investor surface.

**Example tasks:**
- "What's the turnover plan for today across Eternal Villas?"
- "Which villas are at risk of late check-in?"
- "Assign the EV-07 turnover to the best-rated housekeeper available."
- "Summarize last week's complaints and group by category."
- "Create a preventive AC service schedule for all Enso villas quarterly."
- "Why is EV-03 still showing Cleaning In Progress at 3pm?"

**Tools:**
- `list_tasks(filter)` — read_only.
- `assign_task(task_id, user_id)` — mutating + confirm.
- `create_maintenance_ticket(villa_id, category, description, severity)` — mutating + confirm.
- `create_preventive_schedule(scope, cadence, checklist_template)` — mutating + confirm.
- `suggest_assignment(task_id)` — suggest_only (ranks staff by load + past rating).
- `summarize_complaints(period)` — read_only.
- `escalate(ticket_id, to_role, reason)` — mutating + confirm.

**Escalation rules:**
- If safety issue inferred (gas leak, electrical, flood, guest injury) → auto-escalate to Director + Ops Manager via notification *and* instruct user in response.
- SLA breach predicted → highlight in response; if already breached, escalation tool proposed.

**Safety / privacy rules:**
- Never expose staff personal phone numbers to other staff without reason.
- Performance critiques are framed with data, never subjective opinion.
- No scheduling changes that violate labor rules (configurable: max hours, min rest).

**UI placement:**
- Full chat page + inline "Ask about this task" button on task detail.
- Suggestion chips on status board ("Explain why three villas are delayed").

**Implementation notes:**
- v4 ships with read + summary; tool mutations added in v5.
- v7 adds predictive workload distribution.

**Required database entities:**
- `tasks`, `checklist_instances`, `maintenance_tickets`, `preventive_schedules`, `villa_status_events`, `bookings`, `staff_performance`, `rotas`, `complaints`, `damage_reports`, `ai.assistant_events`.

---

## 2.4 AI Finance Analyst

**Target user:** Finance Manager, Director, Accountant.

**Surface:** `/app/ai/finance` and drawer inside `/app/finance/*` pages.

**Allowed data access:**
- Full finance ledgers (scoped by company — no cross-company if multi-company later).
- All statements, payouts, taxes, reserves.
- Bank transactions, reconciliation state.
- Allocation rules and their versions.
- Historical metrics: GOP, NOI, occupancy, ADR, RevPAR, RevPAR index.

**Forbidden data access:**
- Guest PII beyond anonymized aggregates.
- Operational free-text that contains PII unless necessary.
- Camera content.
- Direct raw passport / KYC documents.

**Example tasks:**
- "Why is Enso Villa 04's GOP down 22% MoM?"
- "Show me top 10 expense categories YTD for Eternal Villas."
- "Draft the March statement narrative for EV-07."
- "Which OTA is most expensive per booked night for us this quarter?"
- "Find discrepancies between bank transactions and recorded revenue in March."
- "What's our reserve fund balance across all villas, grouped by project?"

**Tools:**
- `query_ledger(entity, filters, dims)` — read_only.
- `compute_metric(name, dims, period)` — read_only (occupancy, ADR, RevPAR, GOP, NOI).
- `draft_statement_narrative(statement_id)` — suggest_only (text drafted, human publishes).
- `flag_reconciliation_gap(date_range)` — read_only + attaches flags.
- `propose_allocation_rule_change(project_id, change)` — suggest_only.

**Escalation rules:**
- Anything touching closed-period writes requires Director override (not the assistant).
- Material variance (> configurable threshold) surfaced proactively with "propose investigation" action.

**Safety / privacy rules:**
- Every number cited with source row id.
- Compares against stored snapshots — never recomputes a historical statement from live data (which could drift with later adjustments).
- Tax advice framed as "subject to accountant confirmation". No absolutist tax claims.

**UI placement:**
- Full page + drawer.
- Executive summary cards on `/app` portfolio page generated by this assistant (read-only, cached).

**Implementation notes:**
- v3 ships with query + compute.
- v4 adds narrative drafting.
- v7 adds advanced variance detection.

**Required database entities:**
- All finance tables, `fx_rates`, `statements`, `statement_lines`, `bank_transactions`, `allocation_rules`, `ai.embeddings` (historical narratives), `ai.assistant_events`.

---

## 2.5 AI CRM Assistant

**Target user:** Sales / CRM Manager, Director, Concierge (limited surface).

**Surface:** `/app/ai/crm` and drawer inside `/app/crm/leads/[id]`, `/app/inbox/[threadId]`.

**Allowed data access:**
- Leads, pipeline, activities, owners (existing).
- Inbound messages across WhatsApp, email, Instagram, web form.
- Marketing UTM parameters.
- Owner-prospect documents the user is allowed to read.

**Forbidden data access:**
- Finance detail (summary only: deal size, expected commission).
- Villa operational issues unrelated to the lead's interest.
- Other agents' pipelines (unless Director).

**Example tasks:**
- "Draft a reply to this inquiry in the prospect's language."
- "Summarize this lead's journey from first contact."
- "Which leads haven't been touched in > 7 days?"
- "Match this inquiry to likely-fit villas."
- "Score this lead for investment intent."

**Tools:**
- `draft_reply(thread_id, style)` — suggest_only. Never auto-sends.
- `classify_lead(lead_id)` — suggest_only, adds tags.
- `match_villas(lead_id)` — read_only.
- `create_followup(lead_id, when, note)` — mutating + confirm.
- `log_activity(lead_id, type, note)` — mutating + confirm.

**Escalation rules:**
- Any lead flagged as VIP, press, or competitor intelligence → route to Director.
- Sentiment scored as angry/unhappy → route to human immediately.

**Safety / privacy rules:**
- No outbound copy uses invented social proof ("we've sold 20 this week").
- Every drafted reply carries a "draft — review before sending" flag.
- Never mentions other owners or investors in outbound copy.

**UI placement:**
- Drawer on lead detail.
- Inline "draft reply" button on inbox threads.

**Implementation notes:**
- v6 ships.
- v8 integrates with Meta leads and auto-classification.

**Required database entities:**
- `leads`, `threads`, `messages`, `templates`, `owners`, `documents`, `ai.embeddings` (brand voice corpus), `ai.assistant_events`.

---

## 2.6 AI Maintenance Assistant

**Target user:** Operations Manager, Property Manager, Technician.

**Surface:** `/app/ai/maintenance` and drawer inside ticket detail; also on `/field/maintenance/[id]` mobile.

**Allowed data access:**
- All maintenance tickets with history.
- Villa equipment registry, warranty info, past repairs.
- Supplier catalog for parts.
- Maintenance playbooks (embedded).
- Cost history per category.

**Forbidden data access:**
- Finance detail beyond maintenance costs.
- Guest PII.
- Owner PII beyond authorization chain for capex.

**Example tasks:**
- "What's the likely cause of 'AC not cold' in a tropical villa after 2 years?"
- "Which supplier did we use for the last pool pump replacement?"
- "Draft a resolution note for this ticket."
- "Create a preventive schedule for rooftop gutter clean-outs."
- "Estimate the cost to replace this model of AC unit."

**Tools:**
- `search_playbooks(query)` — read_only (embedded manuals).
- `lookup_equipment(villa_id)` — read_only.
- `draft_resolution(ticket_id)` — suggest_only.
- `create_purchase_request(items, reason, villa_id)` — mutating + confirm.
- `escalate_ticket(ticket_id, to_role)` — mutating + confirm.
- `estimate_cost(category, description)` — suggest_only (statistical).

**Escalation rules:**
- P1 severity (safety) always escalates to Director + Ops Manager.
- If ticket age > SLA → prompt escalation.

**Safety / privacy rules:**
- Never invents a warranty term; either retrieves from the document or says "I don't know — please check the warranty document".
- Cost estimates flagged as estimates.

**UI placement:**
- Drawer on ticket detail.
- Mobile inline "suggest next step" button.

**Implementation notes:**
- v4 ships with playbook search + resolution drafting.
- v7 adds cost prediction using historical data.

**Required database entities:**
- `maintenance_tickets`, `preventive_schedules`, `inventory_items` (for parts), `suppliers`, `documents` (warranties), `ai.embeddings` (playbooks), `ai.assistant_events`.

---

## 2.7 AI Procurement Assistant

**Target user:** Procurement Manager, Operations Manager, Director.

**Surface:** `/app/ai/procurement` and drawer inside PR / PO pages.

**Allowed data access:**
- Inventory items, stock, movements, minimum thresholds.
- Suppliers, past POs, unit-price history, payment terms, ratings.
- Usage patterns per villa/project.
- Procurement request history.

**Forbidden data access:**
- Owner finance detail.
- Guest PII.
- Staff personal data.

**Example tasks:**
- "Which toiletries are below par across Enso villas?"
- "Recommend a supplier for bamboo linen — prioritize lead time."
- "Why did towel write-offs spike last month on EV-07?"
- "Draft a PO for 200 bathrobes in two sizes."
- "Compare quotes on pool chlorine from our three suppliers."

**Tools:**
- `low_stock_report(scope)` — read_only.
- `suggest_supplier(category, criteria)` — suggest_only.
- `draft_purchase_order(items, supplier_id, notes)` — suggest_only; PO goes to human to approve/send.
- `price_history(item_id, period)` — read_only.
- `forecast_demand(item_id, horizon)` — read_only (simple statistical).

**Escalation rules:**
- PR amount over role threshold → prompt user to escalate to Director.
- Supplier rating low AND item critical → propose alternative.

**Safety / privacy rules:**
- Never auto-sends a PO. Always human-approved.
- Supplier recommendations cite our own historical data, not scraped internet prices unless flagged.

**UI placement:**
- Drawer on PR/PO pages and low-stock alert cards.

**Implementation notes:**
- v5 ships with low-stock + supplier suggest.
- v7 adds demand forecast.
- v8 adds external price intelligence via approved data feeds.

**Required database entities:**
- `inventory_items`, `inventory_stock`, `inventory_movements`, `suppliers`, `purchase_requests`, `purchase_orders`, `purchase_order_lines`, `ai.assistant_events`.

---

## 2.8 AI Report Writer

**Target user:** Director, Finance Manager, Operations Manager (scoped).

**Surface:** `/app/ai/report-writer` and "Compose with AI" button on `/app/reports/new`.

**Allowed data access:**
- Whatever the user can read: portfolio, finance, operations — scoped.
- Past reports (as style templates).
- Brand voice guidelines (embedded).

**Forbidden data access:**
- Beyond the user's scope.
- Guest PII and individual investor identities in generalized reports.

**Example tasks:**
- "Draft the Q1 investor letter."
- "Write a monthly operations report for Enso Villas with key stats, incidents, upcoming schedule."
- "Summarize portfolio performance this year for the board deck."
- "Create a one-pager for a prospective owner showing our track record."

**Tools:**
- `gather_facts(dims, period)` — read_only (structured query set).
- `draft_report(type, outline, facts)` — suggest_only (produces a draft; never publishes).
- `attach_figures(report_id, fig_specs)` — suggest_only.
- `format_pdf(report_id)` — mutating + confirm (calls PDF worker).

**Escalation rules:**
- Any sensitive figure (legal, dispute) → flagged; prompts the user to verify before publishing.
- Reports written for external distribution require a second-eye approval flag before `format_pdf`.

**Safety / privacy rules:**
- Every fact in the draft cites a source row.
- Drafts include a footer "AI-assisted draft — human review required".
- No outbound publication from the assistant — only draft + format.

**UI placement:**
- Full page composer with live preview.
- Side panel of suggested sections.

**Implementation notes:**
- v4 ships basic.
- v7 adds attached figure generation.
- v9 adds branded PDF template selection.

**Required database entities:**
- Read access to all report-relevant tables (scoped), `reports`, `report_runs`, `pdf_templates`, `ai.embeddings` (past reports), `ai.assistant_events`.

---

## 3. Cross-Cutting Behaviors

### 3.1 Citation format
Assistants use `【source:<table>#<id>】` inline — the UI renders these as clickable badges linking to the source row.

### 3.2 "Unknown" responses
If retrieval returns nothing:
- Do not speculate.
- Respond: *"I couldn't find that in your data. Here are three things I can do: 1) open a clarification ticket, 2) check a related report, 3) hand off to a human."*
- Log as `retrieval_empty` with the question.

### 3.3 Handoff protocol
A handoff creates a row in `threads` with `ai_generated=true` on the transcript excerpt, tagged to the appropriate role, and sends a notification. The user sees a confirmation.

### 3.4 Multilingual
- Detect language; respond in the same.
- For EN/ID, full fluency. Others — answer but flag thread for review.

### 3.5 Brand voice
- Calm, specific, never hype.
- Never uses emojis on operator-facing assistants.
- Guest concierge may use a single tasteful emoji on greetings (brand-approved set).

### 3.6 Feedback loop
- Every assistant turn shows a subtle thumbs-up / thumbs-down + optional note.
- Feedback stored on `ai.assistant_events.feedback`.
- Weekly evals aggregate signal.

---

## 4. Implementation Phases

| Phase (matches roadmap) | What ships |
|---|---|
| **v3** | Investor Assistant (read), Finance Analyst (read), retrieval layer, citation engine, safety verifier, evals harness. |
| **v4** | Operations Copilot (read + summarize), Maintenance Assistant (read + draft), Report Writer (basic drafts). |
| **v5** | Procurement Assistant (read + suggest). |
| **v6** | Guest Concierge read + `create_service_request`. |
| **v7** | All assistants' mutating tools enabled behind feature flags; cross-assistant routing; predictive features. |
| **v8** | External-data integrations (WhatsApp voice, Meta leads, price intelligence). |
| **v9** | PWA offline-friendly chat (queue + resume). |
| **v10** | Native app assistant UX (push + voice). |

---

## 5. Required Infrastructure

- **LLM providers:** Anthropic (primary), OpenAI (fallback), Vertex (residency).
- **Embeddings:** OpenAI `text-embedding-3-large` or Cohere embed v3 for multilingual.
- **pgvector:** >= 0.7, IVFFlat index tuned per source type.
- **Retrieval cache:** short-TTL Redis (Upstash) for recently fetched rows per user (cache key includes role + scope fingerprint).
- **Evals harness:** `/tests/ai/evals/*` with golden questions; CI runs on PRs that touch prompts or retrieval.
- **Secrets:** provider keys in Supabase Vault; no keys in Vercel env except for the gateway role.

---

## 6. Success Metrics for AI

- **Grounding rate:** ≥ 98% of numeric claims cite a valid source. Verified by sampling evaluator.
- **Hallucination incidents:** zero in finance/statement contexts (hard gate).
- **Response usefulness:** thumbs-up rate ≥ 70% on internal assistants; ≥ 85% on guest concierge.
- **Median latency:** first token < 1.5s; full response < 8s for retrieval-bound questions.
- **Escalation precision:** ≥ 90% of escalations lead to appropriate human action.
- **Adoption:** ≥ 60% of eligible internal users use their assistant weekly by end of v7.
- **Investor NPS lift:** +15 points on "reporting clarity" after Investor Assistant launch.

---

## 7. What AI Will Not Do (Hard Boundaries)

- Publish a statement.
- Send a payout.
- Change an access code.
- Grant a role.
- Stream camera video.
- Fire or rank staff publicly.
- Write to a closed period.
- Invent a price, a warranty, or a legal fact.
- Auto-send a reply to a guest or owner without human approval (except templated acknowledgement where flagged).
- Speculate on investment returns beyond historical citation.
