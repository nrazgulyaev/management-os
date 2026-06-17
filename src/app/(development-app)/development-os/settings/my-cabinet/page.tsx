import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  getCabinetPreferences,
  getUserPrimaryRole,
  listUserRoles,
} from "@/lib/development/server/roles/role-queries";
import { getDefaultCabinetForRole } from "@/lib/development/server/roles/role-helpers";
import { CabinetPreferencesForm } from "./_cabinet-preferences-form";

export const metadata: Metadata = { title: "My cabinet settings" };
export const dynamic = "force-dynamic";

export default async function MyCabinetSettingsPage() {
  const me = await getCurrentAppUser();
  if (!me) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Settings</span> / <span>My cabinet</span>
            </div>
            <h1>My cabinet</h1>
          </div>
        </div>
        <Card padding="default">
          <EmptyState title="Sign in" description="Log in to customize." />
        </Card>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>My cabinet</span>
          </div>
          <h1>My cabinet</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Customize your default cabinet and widget visibility.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">My roles</div>
        <Card padding="default">
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
                    {r.isPrimary && <HandoffBadge tone="ok">primary</HandoffBadge>}
                    <HandoffBadge tone="soft">{r.scope}</HandoffBadge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Cabinet preferences</div>
        <Card padding="default">
          <CabinetPreferencesForm
            initialDefaultCabinetKey={prefs?.defaultCabinetKey ?? null}
            initialWidgetPreferences={
              (prefs?.cabinetWidgetPreferences as Record<string, unknown> | null) ??
              {}
            }
            roleDefaultLabel={roleDefault ?? "/development-os/dashboard"}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
