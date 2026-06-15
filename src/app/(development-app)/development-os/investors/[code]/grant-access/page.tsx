import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestor } from "@/lib/development/server/investors";
import {
  getInvestorAccessStatus,
  grantInvestorPortalAccess,
  revokeInvestorPortalAccess,
} from "@/lib/development/server/investor-access-actions";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  REPORTING_LANGUAGES,
  REPORTING_LANGUAGE_LABEL,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Grant portal access · Development OS",
};
export const dynamic = "force-dynamic";

export default async function GrantAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/investors">Investors</Link> /{" "}
              <span>{code}</span> / <span>Grant access</span>
            </div>
            <h1>Grant portal access</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to manage portal access."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const investor = await getInvestor(decodeURIComponent(code));
  if (!investor) notFound();

  const access = await getInvestorAccessStatus(investor.id);
  const adminConfigured = isSupabaseAdminConfigured();

  async function handleGrant(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const authMethod = String(formData.get("authMethod") ?? "magic_link") as
      | "magic_link"
      | "password";
    const initialPassword = String(formData.get("initialPassword") ?? "") || null;
    const welcomeMessage = String(formData.get("welcomeMessage") ?? "") || null;
    const language = String(formData.get("language") ?? "en") as
      | "en"
      | "ru"
      | "id"
      | "zh";

    try {
      const result = await grantInvestorPortalAccess({
        investorId: investor!.id,
        email,
        authMethod,
        initialPassword,
        welcomeMessage,
        language,
      });
      revalidatePath(`/development-os/investors/${code}/grant-access`);
      redirect(
        `/development-os/investors/${code}/grant-access?success=${encodeURIComponent(result.notes)}`,
      );
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/investors/${code}/grant-access?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  async function handleRevoke(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "Revoked via admin UI");
    try {
      const result = await revokeInvestorPortalAccess({
        investorId: investor!.id,
        reason,
      });
      revalidatePath(`/development-os/investors/${code}/grant-access`);
      redirect(
        `/development-os/investors/${code}/grant-access?success=${encodeURIComponent(result.notes)}`,
      );
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/investors/${code}/grant-access?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/investors">Investors</Link> /{" "}
            <Link href={`/development-os/investors/${investor.investorCode}`}>
              {investor.investorCode}
            </Link>{" "}
            / <span>Grant access</span>
          </div>
          <h1>Portal access — {investor.legalName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Onboard this investor to the read-only portal. Grants create a
            Supabase auth user (when service key is configured) and link the
            app_users row to the investor.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/investors/${investor.investorCode}`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Investor detail
          </Link>
        </div>
      </div>

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          <strong>Failed:</strong> {sp.error}
        </div>
      )}
      {sp.success && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <strong>OK:</strong> {sp.success}
        </div>
      )}

      {!adminConfigured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>DRY-RUN mode</strong> — <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          is not set. The grant flow will create the <code>app_users</code>{" "}
          mapping but cannot create the Supabase auth user. After granting,
          create the auth user via the Supabase Dashboard and update{" "}
          <code>app_users.auth_user_id</code> manually.
        </div>
      )}

      {access.hasAccess ? (
        <div>
          <div className="label mb-2.5">Status</div>
          <Card padding="default">
            <div className="rounded-lg border border-line-soft bg-surface p-4 text-sm">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Email" value={access.email ?? "—"} mono />
                <Field label="App user ID" value={access.appUserId ?? "—"} mono />
                <Field label="Status" value={access.status ?? "—"} />
                <Field
                  label="Auth user linked"
                  value={access.authUserId ? "Yes" : "Not yet"}
                />
              </div>
              <div className="mt-2 text-xs text-ink-tertiary">
                Granted at {access.grantedAt}
              </div>
            </div>

            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <h3 className="font-medium mb-2">Revoke portal access</h3>
              <p className="text-xs mb-3">
                Sets <code>investor_id = NULL</code>, sets{" "}
                <code>status = &quot;suspended&quot;</code>, and (if admin SDK is
                configured) bans the Supabase auth user. The audit trail
                persists in <code>dev_notification_delivery_log</code>.
              </p>
              <form action={handleRevoke} className="flex items-center gap-2">
                <input
                  type="text"
                  name="reason"
                  placeholder="Revocation reason (required, ≥3 chars)"
                  required
                  minLength={3}
                  className="flex-1 rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
                />
                <button type="submit" className="btn btn-secondary">
                  Revoke
                </button>
              </form>
            </div>
          </Card>
        </div>
      ) : (
        <div>
          <div className="label mb-2.5">Grant</div>
          <Card padding="default">
          <form
            action={handleGrant}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <FormField label="Email">
              <input
                type="email"
                name="email"
                required
                defaultValue={investor.contactEmail ?? ""}
                placeholder="investor@example.com"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Auth method">
              <select
                name="authMethod"
                defaultValue="magic_link"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="magic_link">Magic link (Supabase)</option>
                <option value="password">Initial password</option>
              </select>
            </FormField>
            <FormField label="Initial password (only if password method)">
              <input
                type="text"
                name="initialPassword"
                minLength={12}
                placeholder="≥12 chars, mixed case + number"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </FormField>
            <FormField label="Reporting language">
              <select
                name="language"
                defaultValue={investor.reportingLanguage}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {REPORTING_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {REPORTING_LANGUAGE_LABEL[l]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Welcome message (optional)" full>
              <textarea
                name="welcomeMessage"
                rows={3}
                maxLength={2000}
                placeholder="Personal note included in the welcome email…"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </FormField>
            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <div className="text-xs text-ink-tertiary">
                Rate limit: 5 grants per staff member per hour.
              </div>
              <button type="submit" className="btn btn-accent">
                Grant access
              </button>
            </div>
          </form>

          <div className="mt-6 rounded-md border border-line-soft bg-muted/40 p-4 text-xs text-ink-secondary">
            <h3 className="text-ink font-medium mb-2 text-sm">What happens</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Verifies you have an internal staff role (
                <code>requireInternalUser</code>).
              </li>
              <li>Checks rate limit (5 grants per hour per staff).</li>
              <li>
                Upserts <code>app_users</code> with{" "}
                <code>investor_id = {investor.investorCode}</code>,{" "}
                <code>role = investor_viewer</code>.
              </li>
              <li>
                If <code>SUPABASE_SERVICE_ROLE_KEY</code> is set: creates the
                Supabase auth user and links{" "}
                <code>auth_user_id</code>.
              </li>
              <li>
                Sends welcome email via{" "}
                <code>sendDevOsEmail</code> (respects{" "}
                <code>EMAIL_DRY_RUN</code>).
              </li>
              <li>
                Audit-logs the action to{" "}
                <code>dev_notification_delivery_log</code> with template{" "}
                <code>grant_access_audit</code>.
              </li>
            </ol>
          </div>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}

function FormField({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <span className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
