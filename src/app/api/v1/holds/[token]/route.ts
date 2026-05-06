import { NextResponse, type NextRequest } from "next/server";
import { handleGetHold } from "@/features/direct-booking/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const out = await handleGetHold(token);
  return NextResponse.json(out.body, {
    status: out.status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST() {
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
