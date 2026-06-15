import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
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
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/settings">Settings</Link> /{" "}
              <span>Google Workspace</span>
            </div>
            <h1>Google Workspace</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const me = await getCurrentAppUser();
  const orgId = await requireOrgId();
  const connections = await safeQuery(
    "settings-google-workspace.listGoogleConnectionsForOrg",
    listGoogleConnectionsForOrg({ organizationId: orgId }),
    [] as Awaited<ReturnType<typeof listGoogleConnectionsForOrg>>,
  );

  const myConnection = me
    ? (connections.find((c) => c.userId === me.id && c.isActive) ?? null)
    : null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/settings">Settings</Link> /{" "}
            <span>Google Workspace</span>
          </div>
          <h1>Google Workspace</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            One OAuth grant unlocks Calendar, Sheets, Drive, and Gmail. Tokens
            are encrypted at rest. Per-user scope — each operator authorizes
            their own Google account.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/settings" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Settings
          </Link>
        </div>
      </div>

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

      <div>
        <div className="label mb-2.5">
          {me ? `Signed in as ${me.email}` : "Sign-in required"}
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          OAuth grants are per-user. Connecting here authorizes the
          currently-signed-in operator&apos;s Google account.
        </p>
        {!me ? (
          <Card padding="default">
            <EmptyState
              title="Sign in first"
              description="You need to be signed in to authorize a Google account."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {myConnection ? (
              <div className="rounded border border-stone-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <HandoffBadge tone={myConnection.isActive ? "ok" : "soft"}>
                    {myConnection.isActive ? "Active" : "Inactive"}
                  </HandoffBadge>
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
                    <HandoffBadge key={s} tone="soft">
                      {SCOPE_LABELS[s] ?? s.replace("https://www.googleapis.com/auth/", "")}
                    </HandoffBadge>
                  ))}
                </div>
                <GoogleWorkspaceActions
                  connectionId={myConnection.id}
                  organizationId={orgId}
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
                  organizationId={orgId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {connections.length > 1 && (
        <div>
          <div className="label mb-2.5">All connections in this organization</div>
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
                      <HandoffBadge tone={c.isActive ? "ok" : "soft"}>
                        {c.isActive ? "active" : "inactive"}
                      </HandoffBadge>
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
        </div>
      )}
    </DevelopmentShell>
  );
}
