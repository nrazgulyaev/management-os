import { NextResponse, type NextRequest } from "next/server";
import { handleSubmitHold } from "@/features/direct-booking/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let input: unknown;
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      input = await request.json();
    } else {
      const fd = await request.formData();
      input = Object.fromEntries(fd.entries());
    }
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_input" },
      { status: 400 },
    );
  }
  const out = await handleSubmitHold({ token, input });
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
