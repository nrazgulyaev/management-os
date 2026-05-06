import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateApiRequest,
  logApiRequest,
  type AuthenticatedApiContext,
} from "./api-auth";

export interface V1HandlerOptions {
  scope: string;
  endpointName: string;
  handler: (ctx: {
    req: NextRequest;
    auth: AuthenticatedApiContext;
  }) => Promise<{ status: number; body: unknown } | Response>;
}

/**
 * Wrap a v1 API route handler with authentication, scope check, rate
 * limiting, and request logging. Every public API route should funnel
 * through this helper so cross-cutting concerns live in one spot.
 */
export function buildV1Route(opts: V1HandlerOptions) {
  return async function route(req: NextRequest) {
    const start = Date.now();
    const url = new URL(req.url);
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const auth = await authenticateApiRequest({
      authorizationHeader: req.headers.get("authorization"),
      requiredScope: opts.scope,
    });

    if (!auth.ok) {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (auth.status === 429 && auth.retryAfterSeconds) {
        (headers as Record<string, string>)["Retry-After"] = String(
          auth.retryAfterSeconds,
        );
      }
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers,
      });
    }

    let response: Response;
    let statusCode = 500;
    let errorMessage: string | null = null;
    try {
      const result = await opts.handler({ req, auth: auth.ctx });
      if (result instanceof Response) {
        response = result;
        statusCode = result.status;
      } else {
        statusCode = result.status;
        response = NextResponse.json(result.body, { status: result.status });
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Unhandled error";
      statusCode = 500;
      response = NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const durationMs = Date.now() - start;
    // Fire-and-forget audit log; failures must not block the response.
    void logApiRequest({
      apiKeyId: auth.ctx.apiKeyId,
      organizationId: auth.ctx.organizationId,
      method: req.method,
      endpoint: opts.endpointName + url.pathname.replace(/\/api\/v1/, ""),
      statusCode,
      durationMs,
      ipAddress,
      userAgent,
      errorMessage: errorMessage ?? undefined,
    }).catch(() => {});

    return response;
  };
}
