import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { verifyCronAuthFromRequest } from "@/features/jobs/auth";
import { generateStatementForOwnerVilla } from "@/features/finance/statement-generation";
import { ownerStatements } from "@/lib/db/schema/finance";
import { owners } from "@/lib/db/schema/ownership";
import { isEmailConfigured, sendEmail } from "@/features/email/email-service";
import { statementReady } from "@/features/email/templates";

/**
 * STATEMENT-1 — Monthly statement generation cron.
 *
 * Schedule: 09:00 UTC on day 1 of every month (Vercel Cron). For each
 * organization with at least one booking in the previous month,
 * iterates every owner × villa with an active ownership share and a
 * booking in that month, generating a draft statement.
 *
 * CRON-TENANT-1: explicit per-org loop — never assumes a single tenant.
 * Statements stay in `draft` state; the operator approves manually via
 * the Finance cabinet. Auto-send is intentionally NOT wired this
 * sprint — STATEMENT-1 halt condition mandates manual sign-off.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RunResult {
  organizationId: string;
  organizationName: string | null;
  periodMonth: string;
  generated: number;
  approved: number;
  sent: number;
  errors: string[];
}

/**
 * EMAIL-1-CRON: auto-approve + auto-send when both env flags are set.
 * Hardcoded env flags chosen instead of per-org settings to keep the
 * demo cron safe by default (opt-in via Vercel env, not a forgettable
 * UI toggle). UI-driven per-org control lands in EMAIL-1-CRON-UI.
 *
 *   STATEMENTS_AUTO_APPROVE=true     auto-approve newly-generated drafts
 *   STATEMENTS_AUTO_SEND=true        auto-send approved statements via Resend
 *
 * Either flag absent → cron stops at "draft" or "approved" as appropriate.
 * STATEMENTS_AUTO_SEND requires RESEND_API_KEY to actually deliver — if
 * Resend is unconfigured, statements stay 'approved' (operator can send
 * manually later via the Finance cabinet).
 */
function shouldAutoApprove(): boolean {
  return process.env.STATEMENTS_AUTO_APPROVE === "true";
}
function shouldAutoSend(): boolean {
  return process.env.STATEMENTS_AUTO_SEND === "true";
}

async function runOnce(periodMonth: string): Promise<RunResult[]> {
  const db = getDb();
  if (!db) return [];
  const orgRows = await db.execute<{ id: string; name: string | null }>(sql`
    SELECT DISTINCT o.id::text AS id, o.name
      FROM organizations o
      JOIN projects p ON p.organization_id = o.id
      JOIN villas v ON v.project_id = p.id
      JOIN bookings b ON b.villa_id = v.id
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
  `);
  const orgs = rowsOf<{ id: string; name: string | null }>(orgRows);

  const results: RunResult[] = [];
  for (const org of orgs) {
    const targets = await db.execute<{ owner_id: string; villa_id: string }>(sql`
      SELECT DISTINCT os.owner_id::text AS owner_id, b.villa_id::text AS villa_id
        FROM ownership_shares os
        JOIN bookings b ON b.villa_id = os.villa_id
        JOIN villas v ON v.id = b.villa_id
        JOIN projects p ON p.id = v.project_id
       WHERE p.organization_id = ${org.id}::uuid
         AND os.status = 'active'
         AND b.status IN ('confirmed','checked_in','checked_out')
         AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
    `);
    const rows = rowsOf<{ owner_id: string; villa_id: string }>(targets);
    const result: RunResult = {
      organizationId: org.id,
      organizationName: org.name,
      periodMonth,
      generated: 0,
      approved: 0,
      sent: 0,
      errors: [],
    };
    for (const t of rows) {
      try {
        const r = await generateStatementForOwnerVilla(
          org.id,
          t.owner_id,
          t.villa_id,
          periodMonth,
          { createdBy: null },
        );
        if (!r) continue;
        result.generated++;

        // EMAIL-1-CRON: optional auto-approve + auto-send.
        if (shouldAutoApprove()) {
          await db
            .update(ownerStatements)
            .set({
              status: "approved",
              approvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(ownerStatements.id, r.statementId));
          result.approved++;

          if (shouldAutoSend() && isEmailConfigured()) {
            const [ownerRow] = await db
              .select({ name: owners.displayName, email: owners.email })
              .from(owners)
              .where(eq(owners.id, t.owner_id))
              .limit(1);
            if (ownerRow?.email && ownerRow.email.includes("@")) {
              const monthLabel = new Date(periodMonth + "T00:00:00Z").toLocaleString(
                "en",
                { month: "long", year: "numeric", timeZone: "UTC" },
              );
              const tpl = statementReady({
                ownerFirstName: ownerRow.name?.split(" ")[0] ?? "there",
                monthLabel,
                villaCode: null,
                netToOwnerUsdMinor: r.netToOwnerUsdMinor,
                portalUrl: "https://management.arconique.com/owner/statements",
              });
              const send = await sendEmail({
                to: ownerRow.email,
                subject: tpl.subject,
                html: tpl.html,
                text: tpl.text,
              });
              if (send.ok) {
                await db
                  .update(ownerStatements)
                  .set({
                    status: "sent",
                    sentAt: new Date(),
                    sentToEmail: ownerRow.email,
                    updatedAt: new Date(),
                  })
                  .where(eq(ownerStatements.id, r.statementId));
                result.sent++;
              } else {
                result.errors.push(
                  `email send failed for ${t.owner_id}: ${send.error?.slice(0, 80)}`,
                );
              }
            }
          }
        }
      } catch (e) {
        result.errors.push(
          `${t.owner_id}/${t.villa_id}: ${(e as Error).message}`.slice(0, 200),
        );
      }
    }
    results.push(result);
  }
  return results;
}

function previousMonthIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason ?? "unauthorised" }, { status: 401 });
  }
  // DB-down guard: runOnce() returns [] when the DB is unconfigured, which
  // would report ok:true / totalGenerated:0 — masking the outage on the
  // highest-financial-impact cron. Fail loudly instead.
  if (!getDb()) {
    return NextResponse.json(
      { ok: false, error: "Database is not configured." },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  const periodMonth = url.searchParams.get("period") ?? previousMonthIso();
  try {
    const results = await runOnce(periodMonth);
    const totalGenerated = results.reduce((s, r) => s + r.generated, 0);
    return NextResponse.json({
      ok: true,
      periodMonth,
      orgs: results.length,
      totalGenerated,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
