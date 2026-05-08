/**
 * Stage 9.D — HTTP wrapper around inviteTeamMemberAction.
 *
 * The form posts directly to the server action (typed RPC), but the
 * plan also calls for a JSON-friendly POST endpoint so the same flow
 * is reachable from external automations / curl / a future API key.
 *
 * The action enforces RBAC, so this is a thin wrapper.
 */

import { NextResponse, type NextRequest } from "next/server";
import { inviteTeamMemberAction } from "@/features/team/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON." },
      { status: 400 },
    );
  }

  const result = await inviteTeamMemberAction(
    body as Parameters<typeof inviteTeamMemberAction>[0],
  );
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(
    {
      ok: true,
      invitationId: result.invitationId,
      emailQueued: result.emailQueued,
      // We deliberately do NOT echo the token. The token is delivered
      // via the email; surfacing it via the API would break audit-trail
      // expectations.
    },
    { status: 201 },
  );
}
