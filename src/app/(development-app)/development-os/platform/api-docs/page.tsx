import type { Metadata } from "next";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "API docs · Platform" };
export const dynamic = "force-dynamic";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/projects",
    scope: "projects:read",
    description: "List projects in the authenticated organization.",
    params: "limit (1–200, default 50), cursor (project id)",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}",
    scope: "projects:read",
    description: "Get one project by id, including its villas.",
    params: "id (UUID, path)",
  },
  {
    method: "GET",
    path: "/api/v1/investors",
    scope: "investors:read",
    description: "List investors in the authenticated organization.",
    params: "limit (1–200, default 50)",
  },
  {
    method: "GET",
    path: "/api/v1/leads",
    scope: "leads:read",
    description: "List leads in the authenticated organization.",
    params: "limit (1–200, default 50), status",
  },
  {
    method: "POST",
    path: "/api/v1/leads",
    scope: "leads:write",
    description:
      "Create a new lead. Emits a `lead.created` webhook event on success.",
    params: "JSON body — see schema below",
  },
  {
    method: "GET",
    path: "/api/v1/transactions",
    scope: "transactions:read",
    description: "List financial transactions for the org.",
    params: "limit (1–200, default 50), project_id, direction",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/test",
    scope: "webhooks:write",
    description:
      "Synchronously fire a `test.ping` event to a subscription endpoint.",
    params: "JSON body: { subscriptionId: UUID }",
  },
];

const TONES: Record<string, "info" | "ok" | "warn" | "soft"> = {
  GET: "info",
  POST: "ok",
  PUT: "warn",
  DELETE: "soft",
};

export default async function ApiDocsPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Platform</span> / <span>API docs</span>
          </div>
          <h1>Public API · v1</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Authenticate every request with `Authorization: Bearer ak_live_…`.
            Per-key rate limits are enforced (per-minute / per-hour / per-day
            buckets).
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Authentication</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary">
            Send the API key as <code>Authorization: Bearer &lt;key&gt;</code>.
            Keys are scoped to one organization and one or more action scopes
            (e.g. <code>projects:read</code>). Rate limits return HTTP{" "}
            <code>429</code> with a <code>Retry-After</code> header. All write
            operations may emit webhook events to subscribed endpoints.
          </p>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Endpoints</div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Path</th>
              <th scope="col">Scope</th>
              <th scope="col">Description</th>
              <th scope="col">Params</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.method + e.path}>
                <td>
                  <HandoffBadge tone={TONES[e.method] ?? "soft"}>
                    {e.method}
                  </HandoffBadge>
                </td>
                <td className="mono text-xs">{e.path}</td>
                <td className="mono text-xs">{e.scope}</td>
                <td className="text-xs">{e.description}</td>
                <td className="text-xs text-ink-3">{e.params}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="label mb-2.5">Webhook signatures</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary">
            Outbound deliveries set{" "}
            <code>X-Arconique-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>{" "}
            where <code>v1</code> is HMAC-SHA256 of{" "}
            <code>&lt;timestamp&gt;.&lt;raw_body&gt;</code> using your
            subscription's signing secret. Verify with a 5-minute tolerance
            window to allow clock skew. Retry schedule on failure: 30s, 60s, 5m,
            30m, 2h (5 attempts max). Subscriptions auto-disable after 10
            consecutive failures.
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
