import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { listApiKeysForOrg } from "@/lib/development/server/api/api-key-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { ApiKeyModalForm } from "@/components/development/platform/api-key-modal-form";

export const metadata: Metadata = { title: "API keys · Settings" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const me = await getCurrentAppUser();
  const orgId = await requireOrgId();
  const keys = await safeQuery(
    "settings-api-keys.listApiKeysForOrg",
    listApiKeysForOrg(orgId),
    [] as Awaited<ReturnType<typeof listApiKeysForOrg>>,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>API keys</span>
          </div>
          <h1>API keys</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-organization keys for the public REST API. The plaintext key is
            shown only at creation time — the server stores a SHA-256 hash.
          </p>
        </div>
        {me ? (
          <div className="actions">
            <ApiKeyModalForm organizationId={orgId} currentUserId={me.id} />
          </div>
        ) : null}
      </div>

      {!me ? (
        <div>
          <div className="label mb-2.5">API keys</div>
          <Card padding="default">
            <EmptyState title="Sign in" description="Log in to manage API keys." />
          </Card>
        </div>
      ) : (
        <div>
          <div className="label mb-2.5">{keys.length} key(s) on file</div>
          {keys.length === 0 ? (
            <Card padding="default">
              <EmptyState
                title="No API keys yet"
                description="Create one via the createApiKey server action (UI form coming next iteration)."
              />
            </Card>
          ) : (
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Label</th>
                    <th scope="col">Prefix</th>
                    <th scope="col">Last 4</th>
                    <th scope="col">Type</th>
                    <th scope="col">Scopes</th>
                    <th scope="col" className="num">Rate / min</th>
                    <th scope="col">Last used</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td className="row-title">{k.keyLabel}</td>
                      <td className="mono text-xs">{k.keyPrefix}…</td>
                      <td className="mono text-xs">…{k.keyLast4}</td>
                      <td className="text-xs">{k.keyType}</td>
                      <td className="text-xs text-ink-3">
                        {(k.scopes ?? []).join(", ") || "—"}
                      </td>
                      <td className="num mono text-xs">
                        {k.rateLimitPerMinute}
                      </td>
                      <td className="text-xs text-ink-3">
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleString()
                          : "never"}
                      </td>
                      <td>
                        <HandoffBadge tone={k.isActive ? "ok" : "soft"}>
                          {k.isActive ? "active" : "revoked"}
                        </HandoffBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </DevelopmentShell>
  );
}
