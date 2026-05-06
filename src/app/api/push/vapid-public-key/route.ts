import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/development/server/push/vapid-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const keys = getVapidKeys();
  if (!keys) {
    return NextResponse.json(
      { ok: false, error: "VAPID keys not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, publicKey: keys.publicKey });
}
