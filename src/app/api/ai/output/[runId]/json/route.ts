import { NextResponse } from "next/server";
import { requirePermission } from "@/features/auth/permissions";
import { getRunPayload } from "@/features/ai-agents/agent-detail-queries";

/**
 * AI Cabinet depth pass — agent output JSON download.
 *
 * Returns the structured run payload from ai_assistant_runs as a
 * downloadable JSON file. Gated on `ai.run` (same surface that can
 * trigger runs). Product access is already enforced by the dashboard
 * layout; this is the defensive belt-and-braces gate for the raw route.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    await requirePermission("ai.run");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { runId } = await ctx.params;
  const payload = await getRunPayload(runId);
  if (!payload) return new NextResponse("Not found", { status: 404 });

  const body = JSON.stringify(payload, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="agent-run-${runId.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
