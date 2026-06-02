# Task — Phase 2.2 PR 2 — Mgmt · Finance/Statements (gold standard)

**Reference doc:** `_handoff/cabinets/mgmt-p1/finance.html`

The most consequential cabinet. Owner statements ARE the product from the owner's POV. Read the cabinet doc carefully — especially the 3 detail-states diagram and the approve-flow with default focus = Cancel.

## Files

ROUTES:
- `src/app/(dashboard)/dashboard/finance/statements/page.tsx` — new list
- `src/app/(dashboard)/dashboard/finance/statements/[id]/page.tsx` — REFACTOR (exists from 2.1)
- `src/app/(dashboard)/dashboard/finance/payouts/page.tsx` — new

PRIMITIVES:
- `src/components/finance/section-pill.tsx` — `<SectionPill kind="revenue"|"fees"|"taxes"|"expenses"|"shared"|"mgmt"|"reserves" />`. 7 tones. CSS in `src/styles/components.css` (see cabinet doc for exact colors).

STATE MACHINE:
- `src/features/statements/state-machine.ts` — exports:
  - `type StatementStatus = "draft" | "draft_revised" | "approved" | "sent" | "settled"`
  - `canApprove(status, role): boolean`
  - `canSend(status): boolean`
  - `canSettle(status, externalConfirm): boolean`
  - `getStatusActions(status, role): ActionButton[]` — drives detail action bar

SCHEMA:
- New migration: `statement_anomalies` table (FK statement_id, kind enum, severity, payload JSON, ack_by?, fired_at)
- Existing tables verified: `statements`, `statement_lines`, `payouts`

MODALS:
- `src/components/finance/prepare-modal.tsx` — form-md, period + villas + runtime estimate
- `src/components/finance/approve-modal.tsx` — confirm-sm, **default focus = Cancel**, anomaly-ack checkbox when statement has flagged anomalies
- `src/components/finance/send-modal.tsx` — confirm-sm, sends to owner + unlocks portal view
- (Defer `<StatementLineEditModal>` to follow-up after Accountant feedback)

AGENT:
- `src/features/ai-agents/statement-preparer/` — exists, no change
- `src/features/ai-agents/statement-anomaly/` — new stub. Runs after each prepare. Writes to statement_anomalies.

## Wiring example — detail page (3 states via state-machine)

```tsx
import { DetailPage, DetailHeader, DetailActionBar } from "@/components/dashboard/detail";
import { Card } from "@/components/dashboard/primitives";
import { SectionPill } from "@/components/finance/section-pill";
import { canApprove, canSend, getStatusActions } from "@/features/statements/state-machine";

const statement = await getStatement(id);
const lines = await getStatementLines(id);
const anomalies = await getStatementAnomalies(id);

return (
  <DetailPage>
    <DetailHeader
      breadcrumb={["Dashboard", "Finance", "Statements", statement.code]}
      title={`${statement.ownerName} · ${statement.villaCode} · ${statement.periodLabel}`}
      meta={
        <StatusMeta status={statement.status} hash={statement.hash} preparedBy={statement.preparedBy} />
      }
      actions={getStatusActions(statement.status, currentUser.role)}
    />
    <main className="px-7 py-6">
      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>…</thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.code} className={anomalies.some(a => a.lineRef === line.code) ? "row-anomaly" : ""}>
                <td><SectionPill kind={line.section} /></td>
                <td>{line.description}</td>
                <td className="mono">{line.note}</td>
                <td className="num">{formatIDR(line.amount, { signed: true })}</td>
              </tr>
            ))}
            <TotalRow netToOwner={statement.netToOwner} />
          </tbody>
        </table>
      </Card>
    </main>
    {(canApprove(statement.status, currentUser.role) || canSend(statement.status)) && (
      <DetailActionBar
        dirty={anomalies.length > 0}
        message={anomalies.length > 0 ? `${anomalies.length} anomaly flagged` : undefined}
        primaryAction={…}
        secondaryActions={…}
      />
    )}
  </DetailPage>
);
```

## Validation

- All 3 detail states render correctly: DRAFT (3-button action bar with Reject / Hold / Approve), APPROVED (hash sealed green, "Send to Emma" button), SETTLED (no action bar)
- approve-modal default focus = Cancel button (verify via DevTools `document.activeElement`)
- Anomaly checkbox blocks "Approve" button until ticked, when statement has flagged anomalies
- Filter chips persist to URL (`?status=draft&period=mar-2026`)
- Bulk action "Approve & queue payouts" works for multi-select

## Commit

`phase-2.2(mgmt-finance): statements list + 3-state detail + payouts + 3 modals + state machine + anomaly schema`
