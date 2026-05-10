import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { listApiKeysForOrg } from "@/lib/development/server/api/api-key-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { ApiKeyModalForm } from "@/components/development/platform/api-key-modal-form";

export const metadata: Metadata = { title: "API keys · Settings" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const me = await getCurrentAppUser();
  const org = await safeQuery(
    "settings-api-keys.getOrganizationByCode",
    getOrganizationByCode("ARCONIQUE_DEFAULT"),
    null,
  );
  const keys = org
    ? await safeQuery(
        "settings-api-keys.listApiKeysForOrg",
        listApiKeysForOrg(org.id),
        [] as Awaited<ReturnType<typeof listApiKeysForOrg>>,
      )
    : [];

  return (
    <DevelopmentShell>
      <PageHeader
        title="API keys"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "API keys" },
        ]}
        description="Per-organization keys for the public REST API. The plaintext key is shown only at creation time — the server stores a SHA-256 hash."
        actions={
          me && org ? (
            <ApiKeyModalForm organizationId={org.id} currentUserId={me.id} />
          ) : null
        }
      />

      {!me ? (
        <Section>
          <EmptyState title="Sign in" description="Log in to manage API keys." />
        </Section>
      ) : (
        <Section title={`${keys.length} key(s) on file`}>
          {keys.length === 0 ? (
            <EmptyState
              title="No API keys yet"
              description="Create one via the createApiKey server action (UI form coming next iteration)."
            />
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-ink-tertiary border-b border-line-soft">
                  <th className="py-2">Label</th>
                  <th>Prefix</th>
                  <th>Last 4</th>
                  <th>Type</th>
                  <th>Scopes</th>
                  <th>Rate / min</th>
                  <th>Last used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-line-soft">
                    <td className="py-2">{k.keyLabel}</td>
                    <td className="font-mono text-xs">{k.keyPrefix}…</td>
                    <td className="font-mono text-xs">…{k.keyLast4}</td>
                    <td className="text-xs">{k.keyType}</td>
                    <td className="text-xs text-ink-tertiary">
                      {(k.scopes ?? []).join(", ") || "—"}
                    </td>
                    <td className="font-mono tabular-nums text-xs">
                      {k.rateLimitPerMinute}
                    </td>
                    <td className="text-xs text-ink-tertiary">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleString()
                        : "never"}
                    </td>
                    <td>
                      <Badge tone={k.isActive ? "success" : "neutral"}>
                        {k.isActive ? "active" : "revoked"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
    </DevelopmentShell>
  );
}
