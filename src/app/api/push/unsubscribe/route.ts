import { type NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { unsubscribePush } from "@/lib/development/server/push/subscription-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 });
  }
  const result = await unsubscribePush({ endpoint: body.endpoint });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
