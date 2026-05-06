import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listGuestMessagesByHoldToken, createGuestMessageByToken } from "@/features/direct-booking/guest-messages";
import { hashPublicIp } from "@/features/direct-booking/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  body: z.string().min(2).max(4000),
});

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const messages = await listGuestMessagesByHoldToken(token);
  return NextResponse.json(
    {
      messages: messages.map((m) => ({
        id: m.id,
        authorType: m.authorType,
        bodyRedacted: m.bodyRedacted,
        createdAt:
          m.createdAt instanceof Date
            ? m.createdAt.toISOString()
            : (m.createdAt as unknown as string),
      })),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_input" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_input",
        errors: parsed.error.issues
          .slice(0, 3)
          .map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ipHash =
    hashPublicIp(
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null,
    ) ?? null;
  const out = await createGuestMessageByToken(token, parsed.data.body, {
    ipHash,
  });
  if (!out.ok) {
    let status = 400;
    if (out.reason === "not_found") status = 404;
    else if (out.reason === "rate_limited") status = 429;
    else if (out.reason === "messaging_disabled" || out.reason === "thread_closed")
      status = 409;
    else if (out.reason === "no_db") status = 500;
    return NextResponse.json(
      { ok: false, reason: out.reason ?? "unknown" },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 429 ? { "Retry-After": "3600" } : {}),
        },
      },
    );
  }
  return NextResponse.json(
    { ok: true, threadId: out.threadId, messageId: out.messageId },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
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
