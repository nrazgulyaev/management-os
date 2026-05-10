import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { listGoogleConnectionsForOrg } from "@/lib/google-workspace/service";
import { isGoogleWorkspaceConfigured } from "@/lib/env";
import { safeQuery } from "@/lib/development/safe-query";
import { GoogleWorkspaceActions } from "@/components/settings/google-workspace-connection";

export const metadata: Metadata = {
  title: "Google Workspace · Settings",
};
export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/calendar.events": "Calendar (events)",
  "https://www.googleapis.com/auth/calendar.readonly": "Calendar (read)",
  "https://www.googleapis.com/auth/gmail.readonly": "Gmail (read)",
  "https://www.googleapis.com/auth/gmail.send": "Gmail (send)",
  "https://www.googleapis.com/auth/gmail.modify": "Gmail (modify)",
  "https://www.googleapis.com/auth/spreadsheets": "Sheets (read+write)",
  "https://www.googleapis.com/auth/spreadsheets.readonly": "Sheets (read)",
  "https://www.googleapis.com/auth/drive.file": "Drive (created files)",
  "https://www.googleapis.com/auth/drive.readonly": "Drive (read all)",
  "https://www.googleapis.com/auth/userinfo.email": "User info — email",
  "https://www.googleapis.com/auth/userinfo.profile": "User info — profile",
};

export default async function GoogleWorkspaceSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Google Workspace" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const me = await getCurrentAppUser();
  const org = await safeQuery(
    "settings-google-workspace.getOrganizationByCode",
    getOrganizationByCode("ARCONIQUE_DEFAULT"),
    null,
  );
  const connections = org
    ? await safeQuery(
        "settings-google-workspace.listGoogleConnectionsForOrg",
        listGoogleConnectionsForOrg({ organizationId: org.id }),
        [] as Awaited<ReturnType<typeof listGoogleConnectionsForOrg>>,
      )
    : [];

  const myConnection = me
    ? (connections.find((c) => c.userId === me.id && c.isActive) ?? null)
    : null;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings", href: "/development-os/settings" },
          { label: "Google Workspace" },
        ]}
        title="Google Workspace"
        description="One OAuth grant unlocks Calendar, Sheets, Drive, and Gmail. Tokens are encrypted at rest. Per-user scope — each operator authorizes their own Google account."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/settings">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Settings
            </Link>
          </Button>
        }
      />

      {sp.ok === "connected" && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google Workspace connected ✓
        </div>
      )}
      {sp.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          OAuth error: <span className="font-mono">{sp.error}</span>
        </div>
      )}

      {!isGoogleWorkspaceConfigured() && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Not configured.</strong> Set
          <code className="font-mono mx-1">GOOGLE_WORKSPACE_OAUTH_CLIENT_ID</code>,
          <code className="font-mono mx-1">GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET</code>,
          and
          <code className="font-mono mx-1">GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI</code>
          on the deployment to enable the OAuth flow.
        </div>
      )}

      <Section
        eyebrow={me ? `Signed in as ${me.email}` : "Sign-in required"}
        title="Your connection"
        description="OAuth grants are per-user. Connecting here authorizes the currently-signed-in operator's Google account."
      >
        {!me ? (
          <EmptyState
            title="Sign in first"
            description="You need to be signed in to authorize a Google account."
          />
        ) : (
          <div className="space-y-4">
            {myConnection ? (
              <div className="rounded border border-stone-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge tone={myConnection.isActive ? "success" : "neutral"}>
                    {myConnection.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="font-mono text-sm">
                    {myConnection.accountEmail ?? "—"}
                  </span>
                  {myConnection.lastUsedAt && (
                    <span className="text-xs text-stone-500">
                      last used {new Date(myConnection.lastUsedAt).toISOString().slice(0, 10)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {myConnection.scopes.map((s) => (
                    <Badge key={s} tone="outline">
                      {SCOPE_LABELS[s] ?? s.replace("https://www.googleapis.com/auth/", "")}
                    </Badge>
                  ))}
                </div>
                <GoogleWorkspaceActions
                  connectionId={myConnection.id}
                  organizationId={org?.id ?? null}
                />
              </div>
            ) : (
              <div className="rounded border border-dashed border-stone-300 p-6 space-y-3">
                <div>
                  <p className="text-sm text-stone-700">
                    Not connected yet. Click below to authorize Google
                    Workspace for Calendar, Sheets, Drive, and Gmail in
                    one go.
                  </p>
                </div>
                <GoogleWorkspaceActions
                  connectionId={null}
                  organizationId={org?.id ?? null}
                />
              </div>
            )}
          </div>
        )}
      </Section>

      {connections.length > 1 && (
        <Section title="All connections in this organization">
          <div className="rounded border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">User</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Scopes</th>
                  <th className="text-left px-3 py-2">Last used</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-t border-stone-200">
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.accountEmail ?? c.userId}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={c.isActive ? "success" : "neutral"}>
                        {c.isActive ? "active" : "inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.scopes.length} scopes</td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toISOString().slice(0, 10)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
