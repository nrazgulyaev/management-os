# 11 confirmed Dev OS 500 errors — diagnoses (3 hypotheses each)

Per Q6 framework: AI-coder diagnoses from codebase against 3
hypotheses; operator reproduces 1-2 in browser + pastes Vercel log
to confirm which hypothesis is actually firing.

All 11 confirmed in `tmp/audit-production-results-checkpoint2.json`
(audit-bot session, 2026-05-10) AND screenshot captured to
`screenshots/{slug}.png` from the harness.

---

## 1. `/development-os/banking` — 500

**Source**: `src/app/(development-app)/development-os/banking/page.tsx`
**Direct deps**: `bankConnections` table; `getOrganizationByCode("ARCONIQUE_DEFAULT")`
**Screenshot**: [`screenshots/_development-os_banking.png`](../../screenshots/_development-os_banking.png)

### 3 hypotheses
1. **Schema drift on `bankConnections`** — table exists but a column the
   query expects (e.g., `last_synced_at`, `provider_metadata`) is
   missing in production. Stage 6.P3.A or later migration not applied.
2. **`getOrganizationByCode("ARCONIQUE_DEFAULT")` returns null** — the
   audit-bot's resolved org isn't ARCONIQUE_DEFAULT (RLS / org-context
   mismatch). The page then attempts to query bank connections with
   `org.id` of null; throws.
3. **Drizzle import-time failure** — the schema file
   `@/lib/db/schema/banking` references a column constraint that
   conflicts with the deployed DB (e.g., enum value not in DB).

### Operator browser-reproduction recipe
1. Open `/development-os/banking` in production
2. Note the exact error message
3. Open Vercel logs at the request timestamp
4. Paste error + first 30 lines of stack into this section under "Operator finding"

---

## 2. `/development-os/banking/new` — 500

**Source**: `src/app/(development-app)/development-os/banking/new/page.tsx`

### 3 hypotheses
1. **Same root cause as `/banking`** — the new-page imports the same
   list-page layout component or shares a parent layout.tsx that
   throws on the bankConnections query.
2. **Form prefill query** — the new page may load reference data (e.g.,
   list of supported bank providers) that fails.
3. **Missing form schema** — Drizzle schema referenced by the form's
   zod validator throws at import time.

### Likely fix
Same patch as `/banking`. Often a single root cause cascades.

---

## 3. `/development-os/marketing/connections` — 500

**Source**: `src/app/(development-app)/development-os/marketing/connections/page.tsx`
**Direct deps**: `listConnectionsForUi()` from `@/lib/marketing/queries`
**Screenshot**: [`screenshots/_development-os_marketing_connections.png`](../../screenshots/_development-os_marketing_connections.png)

### 3 hypotheses
1. **`marketing_connections` table missing** — Stage 6.P4 / 7.0 area.
   Migration not applied OR table exists but schema expects column
   that's been renamed/dropped.
2. **`listConnectionsForUi()` throws on missing org context** — same
   pattern as banking. Function probably calls `getCurrentOrgId()` or
   reads from request context; if null, throws.
3. **OAuth-token decryption fails** — connections store encrypted
   OAuth tokens; if `STAY_LINK_KMS_SECRET` rotated and old rows can't
   decrypt, the loader throws (per the Stage 6.P1.B crypto pattern).

---

## 4. `/development-os/marketing/connections/new` — 500

**Source**: `src/app/(development-app)/development-os/marketing/connections/new/page.tsx`

### 3 hypotheses
1. Same root cause as `/marketing/connections`.
2. Provider catalog query (list of supported providers — Mailchimp,
   HubSpot, Klaviyo etc.) fails.
3. Form prefill fetches the user's existing connections; same throw.

---

## 5. `/development-os/platform/branding` — 500

**Source**: `src/app/(development-app)/development-os/platform/branding/page.tsx`
**Direct deps**: `listOrganizations()` + `renderBrandingCss()`
**Screenshot**: [`screenshots/_development-os_platform_branding.png`](../../screenshots/_development-os_platform_branding.png)

### 3 hypotheses
1. **Branding column drift** — `organizations` table missing a column
   `renderBrandingCss()` expects (e.g., `branding_primary_color`,
   `branding_logo_url`). Migration drift between environments.
2. **`renderBrandingCss()` throws on invalid hex** — server-side hex
   validation rejects an existing DB value (e.g., legacy `#FFF` short
   form). Defensive throw cascades to 500.
3. **Platform-admin gate** — the page has no explicit
   `requirePlatformAdmin()` call, but the layout might. If the
   audit-bot lacks platform-admin role, gate throws redirect/error.

---

## 6. `/development-os/platform/organizations` — 500

**Source**: `src/app/(development-app)/development-os/platform/organizations/page.tsx`
**Direct deps**: `listOrganizations()`
**Screenshot**: [`screenshots/_development-os_platform_organizations.png`](../../screenshots/_development-os_platform_organizations.png)

### 3 hypotheses
1. **Same as #5** — likely same root cause (both pages import from
   organization-queries; both depend on the organizations table
   schema).
2. **Layout-level platform gate** — `(development-app)/development-os/platform/layout.tsx`
   may run a platform-admin check that throws.
3. **Organizations table column drift** — `listOrganizations()` reads
   `is_active` + `name` (verified). If schema dropped one, throws.

---

## 7. `/development-os/settings/api-keys` — 500

**Source**: `src/app/(development-app)/development-os/settings/api-keys/page.tsx`
**Direct deps**: `listApiKeysForOrg()` from `@/lib/development/server/api/api-key-queries`
**Screenshot**: [`screenshots/_development-os_settings_api-keys.png`](../../screenshots/_development-os_settings_api-keys.png)

### 3 hypotheses
1. **`api_keys` table schema drift** — Stage 5.J or earlier added the
   table; migration may not match prod.
2. **Decryption failure** — API keys are likely encrypted at rest (per
   Stage 10.5.B crypto pattern). Stale rows may decrypt-fail and
   throw.
3. **`requirePermission("api_keys.read")` throws unhandled redirect**
   — page lacks try/catch; permission throw cascades.

---

## 8. `/development-os/settings/data-export` — 500

**Source**: `src/app/(development-app)/development-os/settings/data-export/page.tsx`
**Direct deps**: `listExportRequestsForOrg()` from `@/lib/development/server/data-export/data-export-actions`
**Screenshot**: [`screenshots/_development-os_settings_data-export.png`](../../screenshots/_development-os_settings_data-export.png)

### 3 hypotheses
1. **`export_requests` table missing** — feature partially shipped;
   table never created in prod.
2. **`listExportRequestsForOrg` throws on missing org** — same pattern.
3. **Storage backend init throws** — function may instantiate S3 / R2
   client at top-level; missing env vars throw.

---

## 9. `/development-os/settings/google-workspace` — 500

**Source**: `src/app/(development-app)/development-os/settings/google-workspace/page.tsx`
**Direct deps**: `listGoogleConnectionsForOrg()` + `isGoogleWorkspaceConfigured()`
**Screenshot**: [`screenshots/_development-os_settings_google-workspace.png`](../../screenshots/_development-os_settings_google-workspace.png)

### 3 hypotheses
1. **OAuth-config missing** — `isGoogleWorkspaceConfigured()` likely
   returns false but the page proceeds to read the table anyway and
   throws on missing schema.
2. **`google_oauth_connections` table absent** — feature scaffolded;
   table never migrated to prod.
3. **Token decryption throws** — same KMS-rotation hypothesis as #3 / #7.

---

## 10. `/development-os/settings/webhooks` — 500

**Source**: `src/app/(development-app)/development-os/settings/webhooks/page.tsx`
**Direct deps**: `listWebhookSubscriptions()` + Promise.all wrapping `getCurrentAppUser` + `getOrganizationByCode`
**Screenshot**: [`screenshots/_development-os_settings_webhooks.png`](../../screenshots/_development-os_settings_webhooks.png)

### 3 hypotheses
1. **`webhook_subscriptions` table schema drift** — Stage 5.J area.
2. **Promise.all rethrows** — `getCurrentAppUser()` failing at the
   await point cascades through Promise.all.
3. **`webhook_subscriptions.payload_schema_jsonb` column** — if the
   page renders the column raw and it's NULL on legacy rows, JSON.stringify
   may throw.

---

## 11. `/development-os/settings/whatsapp` — 500

**Source**: `src/app/(development-app)/development-os/settings/whatsapp/page.tsx`
**Direct deps**: `getWhatsappPhoneNumbers()` + `getWhatsappTemplates()` + `getWhatsAppProvider()` + `oauthConnections` table
**Screenshot**: [`screenshots/_development-os_settings_whatsapp.png`](../../screenshots/_development-os_settings_whatsapp.png)

### 3 hypotheses
1. **`getWhatsAppProvider()` throws when no provider configured** —
   the function likely throws `WhatsAppProviderUnavailableError` if
   no `WHATSAPP_API_KEY` env var, instead of returning null.
2. **`oauthConnections` table query** — page imports from
   `@/lib/db/schema/bulk-import` (unusual location for WhatsApp
   creds); schema mismatch between import path and actual DB.
3. **`safeQuery()` not catching** — page uses safeQuery for the
   numbers/templates queries but the top-level Promise.all is
   unwrapped — one rejection propagates.

---

## Pattern across all 11

The repeated theme is **single root cause × multiple pages**:
- Pages 1+2 (banking, banking/new) likely share root cause
- Pages 3+4 (marketing/connections, .../new) share
- Pages 5+6 (platform/branding, platform/organizations) share
- Pages 7+10 (api-keys, webhooks — both Stage 5.J area) likely share
- Pages 8+9 (data-export, google-workspace) likely share (both
  scaffolded features that may not have full migration applied)
- Page 11 (whatsapp) standalone

**Estimated unique fixes**: 5-7, not 11. Phase 10.6.B effort:
~10-15h instead of 11×3h naive estimate.

---

## Common fix pattern

Each loader currently throws on missing data. The defensive contract
should be:

```typescript
export async function listX(orgId: string) {
  const db = getDb();
  if (!db) return [];                    // already correct in most loaders
  if (!orgId) return [];                  // ADD: defensive against null org
  try {
    const rows = await db.select()...;
    return rows;
  } catch (err) {
    console.warn("[listX] failed; returning empty:", err);
    return [];                            // ADD: degrade gracefully
  }
}
```

This single pattern applied across the 5-7 unique loaders closes all
11 pages. Pages then render their EmptyState instead of 500.

A regression test per loader: "returns empty array when DB query
throws" would prevent recurrence.
