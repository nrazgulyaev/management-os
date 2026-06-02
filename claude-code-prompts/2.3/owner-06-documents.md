# Task — Phase 2.3 PR 6 — Owner · Documents

**Reference doc:** `_handoff/cabinets/owner-p1/06-documents.html`

## Files

ROUTE:
- `src/app/(owner-portal)/owner/documents/page.tsx` · single page with grouped lists

PRIMITIVES:
- `src/components/owner-portal/doc-row.tsx` · reusable doc row with icon + name + sub + type pill + status
- `src/components/owner-portal/doc-group.tsx` · group wrapper with h3 title

SCHEMA:
- `documents` · FK owner_id, villa_id?, kind enum (msa / annex / legal / tax_summary / tax_cert / statement_pdf / policy), name, file_url, signed_at?, signed_hash?, expires_at?, visible_to_owner=true

GROUPS (4 in scope):
- Agreements (MSA + Annexes + POA)
- Tax (Annual summary + PHR certs + WHT statement)
- Statements PDF archive (per-month + year-end bundle)
- Property & insurance (building + public liability)

BUNDLE GENERATION:
- "Year-end pack ZIP" + "Monthly tax certs ZIP" generated on-demand
- Cached 24h · regenerated when underlying docs change
- Use existing pdf-stitcher infra in `src/lib/pdf/`

PERMISSIONS:
- Read-only · owner sees only `visible_to_owner=true`
- Mgmt internal docs (anomaly reports, internal memos) stay hidden

## Commit

`phase-2.3(owner-documents): single page with 4 grouped lists + 2 primitives + bundle generation`
