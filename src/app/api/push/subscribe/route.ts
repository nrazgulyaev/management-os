import { type NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { subscribePush } from "@/lib/development/server/push/subscription-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SubscribePayload {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  deviceLabel?: string;
  userAgent?: string;
  deviceType?: "mobile" | "tablet" | "desktop" | "unknown";
  enabledNotificationTypes?: string[];
}

export async function POST(request: NextRequest) {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: SubscribePayload;
  try {
    body = (await request.json()) as SubscribePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const result = await subscribePush({
    userId: me.id,
    endpoint: body.endpoint,
    p256dhKey: body.p256dhKey,
    authKey: body.authKey,
    deviceLabel: body.deviceLabel,
    userAgent:
      body.userAgent ?? request.headers.get("user-agent") ?? undefined,
    deviceType: body.deviceType,
    enabledNotificationTypes: body.enabledNotificationTypes ?? [],
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
