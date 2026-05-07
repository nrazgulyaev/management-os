import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GA4 doesn't push webhooks — analytics ingestion is pull-only via
 * the Reporting Data API. This route exists as a placeholder so the
 * sidebar's "webhook URL" field has a destination operators can
 * paste; we always return 200 OK + ignored.
 *
 * Real-time-export-style webhooks would land alongside BigQuery
 * Export, which is out of P4 scope.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    ignored: true,
    note: "GA4 is pull-only via Reporting Data API. No webhook payload is processed here.",
  });
}
