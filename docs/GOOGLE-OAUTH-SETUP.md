# Google OAuth Setup (Deferred — Stage 6.P5)

## Status: NOT IMPLEMENTED in P0

The bulk-import wizard's **Google Sheets** tab is currently a placeholder. Selecting `google_sheets` as the source type accepts a CSV/JSON paste only — there is no live OAuth handshake.

## Why deferred from P0.7-D.5

P0 originally scoped a "basic, dry-run-default" Google OAuth path so an operator could paste a Sheets URL and pull rows. After foundation work landed, the right call is to defer the live OAuth flow to **Stage 6.P5 (Productivity Tools)**, where Google Workspace integration lives end-to-end (Calendar, Gmail, Drive, Sheets together). Three reasons:

1. **OAuth credentials require Google Cloud Console setup** — creating a project, enabling Sheets API, configuring an OAuth consent screen with verified domains, and provisioning client ID + secret. None of this can be done from the Claude session; it needs the user's Google Workspace admin to action.
2. **A "dry-run-only" OAuth path doesn't earn its keep** — the integration value comes from real data flow. Shipping a button that opens an OAuth screen but can never reach a real Sheet trains operators to ignore it.
3. **The pieces P0 *can* ship cleanly are already in place** — the migration carries an `oauth_connections` table with encrypted-token columns; the `bulk_import_jobs` table has `source_type='google_sheets'`; the wizard accepts pasted CSV from a manually-exported Sheet today.

## Workaround for P0 operators

Until P5 lands, importing from a Google Sheet is a two-click flow:

1. In Google Sheets: **File → Download → Comma Separated Values (.csv)**
2. In the bulk-import wizard: drag the downloaded CSV into the upload zone

This produces an identical end result to a live OAuth pull — same parser, same field-mapping UI, same validation, same dispatcher.

## What P5 will add

When P5 lands, the wizard's "Google Sheets" tab will:

1. Trigger Google Workspace OAuth (read-only Sheets scope: `https://www.googleapis.com/auth/spreadsheets.readonly`)
2. Persist refresh token to `oauth_connections` (encrypted via `SECURITY_ENCRYPTION_SECRET`)
3. Allow the operator to paste a Sheets URL → backend resolves sheet ID + tab name → fetches via Sheets API v4 → stores resolved CSV in `bulk_import_jobs.source_content`
4. Allow re-running an import from the same source (for incremental syncs)

## Required Google Cloud Console steps (when P5 begins)

The user (Google Workspace admin) will need to:

1. **Create or select a Google Cloud project** at https://console.cloud.google.com/
2. **Enable APIs**: Google Sheets API, Google Drive API (for sheet listing), Google Calendar API, Gmail API (latter two for full P5 scope)
3. **Configure OAuth consent screen**:
   - User type: Internal (Workspace) or External
   - App name, support email, developer email
   - Add scopes: `spreadsheets.readonly`, `drive.metadata.readonly`, `calendar.readonly`, `gmail.send` (mix per P5 scope)
   - Add test users during development; verify domain for production
4. **Create OAuth 2.0 Client ID**:
   - Application type: Web application
   - Authorized redirect URIs: `https://<deploy-host>/api/integrations/google/callback`
5. **Provide credentials to the app**:
   - `GOOGLE_OAUTH_CLIENT_ID=<from console>`
   - `GOOGLE_OAUTH_CLIENT_SECRET=<from console>`
   - Add to Vercel project env (Production + Preview)

## Cross-references

- **Migration 0075** — `oauth_connections` table (already created, idle until P5)
- **Stage 6 plan** — Phase P5 "Productivity Tools" (Google Workspace integration)
- **Architecture decision D3** — credential storage model (encrypted DB column with key derived from `SECURITY_ENCRYPTION_SECRET`)
