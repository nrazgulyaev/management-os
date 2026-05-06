# ADR-0019 — Guest AI Concierge v0 (v9H)

Status: Accepted · 2026-04-29

## Context

V9E shipped the guest portal, V9F the upsell catalog, V9G the security
hardening (Wi-Fi encryption, verification gate, rate limits, reveal
buttons). Until now there was no guest-facing AI surface — only the
internal AI Operations Co-pilot (v8B).

Guests have been asking the same five questions over and over via the
free-text concierge form: "what's the check-in process?", "where's
good for dinner nearby?", "how do I request a chef?", etc. Those are
all answerable from data we already have: villa guide sections,
neighborhood places, services catalog. They don't need staff time.

V9H adds a token-scoped, **strictly read-only** AI concierge inside
`/stay/[token]/concierge`. It cannot book, charge, cancel, or message
staff — it just helps the guest navigate the portal and the
configured villa data.

Hard guardrails:

- **No write tools.** No tool-use loop yet. Context is prebuilt and
  flat.
- **Cannot reveal Wi-Fi password or smart-lock code.** Even if asked
  directly. The guest is told to tap the reveal button instead.
- **Cannot expose** internal notes, owner finance, supplier costs,
  margins, token hashes, encrypted blobs, camera URLs, or other
  guests' data.
- **No external web search.** All grounding is the configured villa
  guide / neighborhood / services data the platform already has.
- **No WhatsApp/Telegram outbound.**
- **No payments.**

## Decisions

### 1. Three new tables, internal-only

```
guest_ai_concierge_sessions    one chat thread per stay token
guest_ai_concierge_messages    append-only transcript with safety_status
guest_ai_concierge_runs        per-AI-invocation metrics + safety flags
```

All three are `ENABLE` + `FORCE ROW LEVEL SECURITY` with both
`internal_read` and `internal_write` policies. The guest portal never
queries them through an authenticated guest session — the server
action validates token + verification and uses the service-role
client. A partial unique index on
`guest_ai_concierge_sessions(guest_stay_token_id) WHERE status='active'`
keeps at most one active thread per stay; archiving releases the slot.

### 2. Context builder is the safety boundary

`buildGuestConciergeContext(token)` resolves the stay summary then
projects only guest-safe fields into the prompt:

```
✓  villa name (display), project name, check-in / out, nights, count
✓  guide sections (guest_visible only)
✓  house rules (parsed from the keyed section)
✓  neighborhood (guest_visible only)
✓  emergency contacts (label + type + has-phone flag, never the number)
✓  services catalog (guest_visible + active only)
✓  the guest's own service orders (status + service name only)

✗  Wi-Fi password (any form: ciphertext, key version, plaintext)
✗  smart-lock code or validity window
✗  token hash, raw token, prefix, IP hash
✗  encrypted blobs, internal notes, internal costs / margins
✗  staff private contacts unless guest_visible
✗  owner / investor finance, booking financial internals
✗  camera URLs
```

The test suite includes a static-source check that
`context.ts` does not even reference the forbidden field names — a
fast tripwire if a future refactor pulls them in.

### 3. Layered safety

```
[user message]
   │
   ├─► detectDisallowedIntent  →  refuse with canned copy + log
   │     (Wi-Fi password, door code, cameras, owner finance,
   │      other-guest data, ai_book/pay/cancel/call_staff,
   │      unsafe activity)
   │
   ├─► buildContext + system prompt + Anthropic call OR fallback
   │
   ├─► sanitizeGuestAIResponse
   │     - 6-digit standalone numbers → [code redacted]
   │     - 32+ char base64url tokens   → [token redacted]
   │     - "password is X" patterns    → [redacted]
   │
   ├─► assertNoSecretLeak
   │     last-line check against known forbidden literals; throws
   │     and the assistant message is replaced with a generic
   │     deferral if the model somehow regurgitated something.
   │
   └─► append message + record run + (maybe) queue safety notification
```

Disallowed-intent detection is keyword-based on a normalized
lowercased message. False positives are acceptable: any over-blocked
question can be rephrased, and the refusal copy directs the guest to
the right portal page anyway.

### 4. Anthropic single-shot, no tools

`provider.ts` calls `/v1/messages` with the system prompt + a single
user turn that bundles the JSON context, the recent (last 6) message
history, and the new question. **No tool definitions are exposed.**
This is intentional — adding tool use widens the trust boundary.

If `ANTHROPIC_API_KEY` is missing or `AI_DRY_RUN=1`, we never call
the API. The deterministic fallback (`fallback.ts`) keyword-routes
into the configured context: Wi-Fi → defer to page; check-in → guide
section; dinner → neighborhood; service-name → services catalog. The
fallback **never invents content** — when nothing matches, it points
the guest at the Concierge & services / Emergency pages.

Run rows record `model = 'deterministic-fallback'` so the admin
viewer can distinguish offline answers.

### 5. Limits

```
max user messages per session   12
context word budget             ~1,500 (after compaction)
output budget                   450 words / 700 tokens
request timeout                 15 s
rate limit (per token)
   minute                       5 messages, 1-min block
   hour                         20 messages, 1-hour block
```

The minute/hour counters are derived from the message log directly
(no separate counter row) — concierge traffic is light and the rates
are low. The v9G stay-token rate limiter is also applied so concierge
calls share the per-IP envelope as the rest of the portal.

### 6. Notifications — conservative

We do NOT notify staff for every AI message. The notification queue
fires `guest_ai.safety_attention` only on:

- `unsafe_activity` (drugs / weapons / etc.)
- `ai_call_staff` (guest tried to use the AI as a staff dispatcher).

Every safety event still lands in the dashboard at
`/dashboard/guest-ai/sessions/[id]`. The dedupe key includes the
session + intent so misclassified spam doesn't flood the inbox.

### 7. Permissions

Two new keys, owners + agents excluded everywhere:

```
guest_ai.read    super_admin, director, ops, property, concierge
guest_ai.manage  super_admin, director, ops, property
```

The guest route uses the token resolver, not the permission matrix —
permissions only gate the admin viewer.

## Trade-offs

- **Keyword-based intent detection** is fragile by nature. We chose
  it over a model-graded classifier because every false negative is
  a security regression and the keyword set is narrow + auditable.
  Future v9I+ can add a small classifier as a *second* layer.
- **Single-shot prompt** means no follow-up reasoning over fresh
  data. Good enough for v0; tool use can land later under a strict
  read-only allowlist.
- **No streaming** — `useActionState` round-trip is fine for short
  answers and keeps the action surface simple.
- **Conversation history is local to the active session.** Archiving
  the session resets context, which is by design — we don't want
  long-tail data piling up against a single token.
- **Fallback is keyword-routed.** It mirrors the safety guard and is
  intentionally narrow. If a phrase doesn't match, we point the
  guest at portal pages instead of guessing.

## Out of scope (deferred)

- Tool use (read-only allowlist over guide / catalog).
- Streaming responses.
- Fine-tuned classifier for safety.
- Voice input / TTS.
- AI-suggested service request drafts (still has to be a human submit).
- Multi-language; v9H assumes English in / English out.

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent).
- **Seed**: `npm run db:seed` adds a single notification template
  (`guest_ai.safety_attention`). No sample sessions are seeded —
  conversations only start when a verified guest hits
  `/stay/[token]/concierge`.
- **Set the API key (optional)**: `ANTHROPIC_API_KEY` + flip
  `AI_DRY_RUN=0` for live calls. Without these, the concierge runs
  in deterministic fallback mode and answers from configured villa
  data.
- **Monitor**: `/dashboard/guest-ai` for the latest sessions; click
  through for transcript + per-run metrics + safety flags. The
  `/security/events` page also shows `suspicious_access` rows fired
  by the AI safety guard.
- **Archive a session**: not yet exposed in the UI; admins can flip
  `status='archived'` directly. v9I exposes a button.
