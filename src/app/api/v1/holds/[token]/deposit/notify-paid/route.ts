import { NextResponse, type NextRequest } from "next/server";
import { handleNotifyDepositPaid } from "@/features/direct-booking/public-api";

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
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const out = await handleNotifyDepositPaid(token);
  return NextResponse.json(out.body, {
    status: out.status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
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
