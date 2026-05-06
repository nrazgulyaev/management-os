import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  getCabinetPreferences,
  getUserPrimaryRole,
  listUserRoles,
} from "@/lib/development/server/roles/role-queries";
import { getDefaultCabinetForRole } from "@/lib/development/server/roles/role-helpers";

export const metadata: Metadata = { title: "My cabinet settings" };
export const dynamic = "force-dynamic";

export default async function MyCabinetSettingsPage() {
  const me = await getCurrentAppUser();
  if (!me) {
    return (
      <DevelopmentShell>
        <PageHeader title="My cabinet" />
        <EmptyState title="Sign in" description="Log in to customize." />
      </DevelopmentShell>
    );
  }
  const [primaryRole, prefs, roles] = await Promise.all([
    getUserPrimaryRole(me.id),
    getCabinetPreferences(me.id),
    listUserRoles(me.id),
  ]);
  const roleDefault = primaryRole ? getDefaultCabinetForRole(primaryRole) : null;

  return (
    <DevelopmentShell>
      <PageHeader
        title="My cabinet"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "My cabinet" },
        ]}
        description="Customize your default cabinet and widget visibility."
      />
      <Section title="My roles">
        {roles.length === 0 ? (
          <EmptyState
            title="No roles assigned"
            description="Ask your admin to grant you a role."
          />
        ) : (
          <ul className="text-sm space-y-1">
            {roles.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between border-b border-line-soft py-2"
              >
                <span>{r.roleKey}</span>
                <span className="flex gap-2">
                  {r.isPrimary && <Badge tone="success">primary</Badge>}
                  <Badge tone="neutral">{r.scope}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Default cabinet">
        <p className="text-sm leading-relaxed">
          Custom default:{" "}
          <code>
            {prefs?.defaultCabinetKey ?? "(none — using role default)"}
          </code>
        </p>
        <p className="text-sm leading-relaxed mt-2">
          Role default:{" "}
          <code>{roleDefault ?? "/development-os/dashboard"}</code>
        </p>
        <p className="text-xs text-ink-tertiary mt-3 leading-relaxed">
          Wire to <code>saveCabinetPreferences</code> to update via form.
        </p>
      </Section>
      <Section title="Widget preferences">
        <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
          {JSON.stringify(prefs?.cabinetWidgetPreferences ?? {}, null, 2)}
        </pre>
      </Section>
    </DevelopmentShell>
  );
}
