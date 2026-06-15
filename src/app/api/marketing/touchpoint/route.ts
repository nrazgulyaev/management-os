import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects, villas } from "@/lib/db/schema/projects";
import { ingestTouchpoint } from "@/lib/marketing/service";
import { parseUtmParams } from "@/lib/marketing/utm-tracker";
import { getHoldByTokenHash } from "@/features/direct-booking/services";
import { hashHoldToken } from "@/features/direct-booking/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// Public marketing touchpoint ingestion edge.
//
// Stage 6.P4.F closed the attribution loop on the read side, but nothing
// ever WROTE touchpoints — the engine ran over an empty table. This is the
// missing write edge: a lightweight, UNAUTHENTICATED tracking endpoint a
// public site/booking page (or a JS tag) hits per session.
//
// ORG RESOLUTION (critical — this is a public, unauthenticated endpoint):
// there is NO host→org mapping in this codebase. Every other public flow
// resolves the tenant from an explicit identifier carried in the request:
//   • a hold token            → direct_booking_holds.organization_id
//   • a villa id              → villas → projects.organization_id
//   • a project id            → projects.organization_id
// We mirror that exactly. If we CANNOT resolve an org safely we NO-OP
// (204) rather than guess and mis-attribute a touchpoint to the wrong
// tenant. Org is NEVER taken from the request body directly.
// =============================================================================

// --- Per-IP, per-minute in-memory token bucket (mirrors /api/v1/quote). ----
const RATE_LIMIT_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

type Bucket = { count: number; windowStart: number };
const buckets: Map<string, Bucket> = new Map();

function ipFromRequest(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.windowStart > RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { ok: true };
  }
  b.count++;
  if (b.count > RATE_LIMIT_PER_MINUTE) {
    const elapsed = now - b.windowStart;
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000)),
    };
  }
  return { ok: true };
}

// --- Body schema. The three org-resolving ids are all optional; at least
//     one must resolve a tenant or we NO-OP. ----------------------------------
const touchpointBodySchema = z.object({
  // Org-resolving identifiers (one is required to attribute safely).
  holdToken: z.string().min(8).max(200).optional(),
  villaId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  // Visit signals.
  landingUrl: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  sessionId: z.string().max(200).optional(),
  clientId: z.string().max(200).optional(),
  deviceType: z.string().max(40).optional(),
});

const NO_OP = () =>
  new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });

/**
 * Resolve the tenant org from an explicit, request-carried identifier the
 * SAME way the public booking pages do. Returns null when nothing resolves
 * (→ caller NO-OPs). Never trusts an org id from the body.
 */
async function resolveOrgId(
  input: z.infer<typeof touchpointBodySchema>,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  // 1. Hold token — same path as handleGetHold / handleSubmitHold.
  if (input.holdToken) {
    const hold = await getHoldByTokenHash(hashHoldToken(input.holdToken));
    if (hold?.organizationId) return hold.organizationId;
  }

  // 2. Villa id → project → org (the public quote/hold flow keys off villaId).
  if (input.villaId) {
    const [row] = await db
      .select({ organizationId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, input.villaId))
      .limit(1);
    if (row?.organizationId) return row.organizationId;
  }

  // 3. Project id → org directly.
  if (input.projectId) {
    const [row] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (row?.organizationId) return row.organizationId;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const ip = ipFromRequest(request);
  const limited = rateLimit(ip);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfter: limited.retryAfter },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // Malformed body — nothing safe to attribute. NO-OP.
    return NO_OP();
  }

  const parsed = touchpointBodySchema.safeParse(raw);
  if (!parsed.success) {
    // Bad shape — never record. NO-OP rather than 400 so a noisy tag can't
    // be used to probe the endpoint.
    return NO_OP();
  }
  const data = parsed.data;

  // ORG RESOLUTION — if we can't pin a tenant, do NOT record (no cross-org).
  const organizationId = await resolveOrgId(data);
  if (!organizationId) return NO_OP();

  // Parse UTM from the landing URL (the util accepts a full URL or a bare
  // query string). Referrer drives channel classification when no UTM.
  const utm = data.landingUrl ? parseUtmParams(data.landingUrl) : {};
  const userAgent = request.headers.get("user-agent") ?? undefined;

  try {
    await ingestTouchpoint({
      organizationId,
      serializeInput: {
        utm,
        referrer: data.referrer,
        landingUrl: data.landingUrl,
        sessionId: data.sessionId,
        clientId: data.clientId,
        userAgent,
        deviceType: data.deviceType,
        touchpointAt: new Date(),
        rawPayload: {
          via: "public_touchpoint_endpoint",
          ...(data.holdToken ? { holdLinked: true } : {}),
          ...(data.villaId ? { villaId: data.villaId } : {}),
          ...(data.projectId ? { projectId: data.projectId } : {}),
        },
      },
    });
  } catch {
    // Never surface ingestion failures to an anonymous client; the attribution
    // engine tolerates gaps. Treat as a silent NO-OP.
    return NO_OP();
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
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
