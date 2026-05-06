import { NextResponse, type NextRequest } from "next/server";
import { markGuestNotificationRead } from "@/features/direct-booking/guest-status-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ token: string; notificationId: string }> },
) {
  const { token, notificationId } = await params;
  if (!token || !notificationId) {
    return NextResponse.json(
      { ok: false, reason: "invalid_input" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const out = await markGuestNotificationRead(token, notificationId);
  if (!out.ok) {
    return NextResponse.json(
      { ok: false, reason: out.reason ?? "unknown" },
      {
        status: out.reason === "not_found" ? 404 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  return methodNotAllowed();
}
export async function PUT() {
  return methodNotAllowed();
}
export async function PATCH() {
  return methodNotAllowed();
}
export async function DELETE() {
  return methodNotAllowed();
}
