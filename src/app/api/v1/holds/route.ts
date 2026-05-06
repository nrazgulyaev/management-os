import { NextResponse, type NextRequest } from "next/server";
import { handleCreateHold } from "@/features/direct-booking/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipFromRequest(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip") ?? null;
}

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: NextRequest) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }
  const out = await handleCreateHold({
    input,
    ip: ipFromRequest(request),
    userAgent: request.headers.get("user-agent"),
  });
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
  if (out.status === 429 && typeof out.body.retryAfterSeconds === "number") {
    headers["Retry-After"] = String(out.body.retryAfterSeconds);
  }
  return NextResponse.json(out.body, { status: out.status, headers });
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
