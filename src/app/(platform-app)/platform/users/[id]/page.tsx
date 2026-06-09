/**
 * Platform Admin OS — per-user detail.
 *
 * Profile, auth / MFA posture, and org-membership (role grants) for a
 * single app_user, with the three admin actions (view dashboard / send
 * password reset / reset MFA). Reads across orgs; gated to super_admin by
 * the (platform-app) layout. Mutating actions live in
 * lib/platform-users/actions.ts and are audit-logged.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DetailPageHero, ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getUserDetail } from "@/lib/platform-users/queries";
import { UserDetailActions } from "@/components/platform-users/user-detail-actions";

export const metadata: Metadata = { title: "User · Platform Admin OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  invited: "info",
  suspended: "warning",
  archived: "neutral",
};

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtRelative(d: Date | null): string {
  if (!d) return "never";
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
        {label}
      </span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

export default async function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await getUserDetail(id);
  if (!u) notFound();

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <DetailPageHero
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Users", href: "/platform/users" },
          { label: u.fullName },
        ]}
        eyebrow={u.organizationName ?? u.organizationCode ?? "Unassigned org"}
        title={u.fullName}
        description={u.email}
        statusRow={
          <>
            <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>{u.status}</Badge>
            {u.mfa.enrolled ? (
              <Badge tone="success">MFA on</Badge>
            ) : (
              <Badge tone="warning">MFA off</Badge>
            )}
            {u.memberships.some((m) => m.roleKey === "super_admin") && (
              <Badge tone="gold">super_admin</Badge>
            )}
          </>
        }
        actions={
          <UserDetailActions
            userId={u.id}
            email={u.email}
            organizationCode={u.organizationCode}
            mfaEnrolled={u.mfa.enrolled || u.mfa.pending}
          />
        }
        summaryStrip={[
          {
            label: "Last sign-in",
            value: fmtRelative(u.lastSignInAt),
            hint: u.lastSignInAt ? fmtDateTime(u.lastSignInAt) : undefined,
          },
          { label: "MFA", value: u.mfa.enrolled ? "Enrolled" : u.mfa.pending ? "Pending" : "Not enrolled" },
          { label: "Role grants", value: String(u.memberships.length) },
          { label: "Member since", value: u.createdAt.toISOString().slice(0, 10) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <ListTableCard
            eyebrow="Identity"
            title="Org memberships"
            count={u.memberships.length}
          >
            {u.memberships.length === 0 ? (
              <div className="px-7 py-12 text-center text-sm text-ink-tertiary">
                No role grants. This user belongs to{" "}
                {u.organizationName ?? u.organizationCode ?? "an org"} but has
                no roles assigned.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Role</TH>
                    <TH>Key</TH>
                    <TH>Scope</TH>
                  </TR>
                </THead>
                <TBody>
                  {u.memberships.map((m, i) => (
                    <TR key={`${m.roleKey}-${m.scopeId ?? "global"}-${i}`}>
                      <TD className="text-ink">{m.roleName}</TD>
                      <TD>
                        <Badge
                          tone={m.roleKey === "super_admin" ? "gold" : "outline"}
                        >
                          {m.roleKey}
                        </Badge>
                      </TD>
                      <TD className="text-ink-secondary text-sm">
                        {m.scopeType
                          ? `${m.scopeType}${m.scopeId ? ` · ${m.scopeId.slice(0, 8)}` : ""}`
                          : "global"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </ListTableCard>

          <ListTableCard
            eyebrow="Auth"
            title="Recent sign-in attempts"
            count={u.recentLogins.length}
          >
            {u.recentLogins.length === 0 ? (
              <div className="px-7 py-12 text-center text-sm text-ink-tertiary">
                No sign-in attempts recorded.
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {u.recentLogins.map((l, i) => (
                  <li
                    key={i}
                    className="px-7 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Badge tone={l.succeeded ? "success" : "danger"}>
                        {l.succeeded ? "success" : "failed"}
                      </Badge>
                      {!l.succeeded && l.failureReason && (
                        <span className="text-ink-tertiary text-xs">
                          {l.failureReason}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                      {fmtDateTime(l.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ListTableCard>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 flex flex-col gap-4">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Profile
            </span>
            <Field label="Full name">{u.fullName}</Field>
            <Field label="Email">{u.email}</Field>
            <Field label="Phone">{u.phone ?? "—"}</Field>
            <Field label="WhatsApp">{u.whatsappPhone ?? "—"}</Field>
            <Field label="Timezone">{u.timezone}</Field>
            <Field label="Organization">
              {u.organizationName ?? "—"}
              {u.organizationCode && (
                <span className="text-ink-tertiary font-mono text-xs">
                  {" "}
                  ({u.organizationCode})
                </span>
              )}
            </Field>
            <Field label="Auth linked">
              {u.authUserId ? "Yes" : "No (pre-created)"}
            </Field>
          </div>

          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 flex flex-col gap-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              MFA
            </span>
            <Field label="Status">
              {u.mfa.enrolled
                ? "Enrolled (TOTP)"
                : u.mfa.pending
                  ? "Pending enrolment"
                  : "Not enrolled"}
            </Field>
            <Field label="Verified at">{fmtDateTime(u.mfa.verifiedAt)}</Field>
            <Field label="Last used">{fmtDateTime(u.mfa.lastUsedAt)}</Field>
          </div>
        </aside>
      </div>
    </div>
  );
}
