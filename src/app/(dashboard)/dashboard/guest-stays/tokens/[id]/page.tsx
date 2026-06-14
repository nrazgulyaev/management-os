import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getGuestStayTokenById,
} from "@/features/guest-stays/services";
import { RevokeTokenButton } from "@/components/guest-stays/revoke-token-button";

export const metadata = { title: "Guest stay token" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  active: "ok",
  revoked: "warn",
  expired: "soft",
};

export default async function TokenDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getGuestStayTokenById(id);
  if (!t) notFound();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-stays/tokens">Tokens</Link> /{" "}
            <span>{t.tokenPrefix}…</span>
          </div>
          <h1>{`Token · ${t.tokenPrefix}…`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Booking ${t.bookingCode ?? t.bookingId.slice(0, 8)} · ${t.villaCode ?? "villa"}`}
          </p>
        </div>
        {t.status === "active" && (
          <div className="actions">
            <RevokeTokenButton id={t.id} />
          </div>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <HandoffBadge tone={STATUS_TONES[t.status] ?? "soft"}>{t.status}</HandoffBadge>
          </Field>
          <Field label="Issued to">
            {t.issuedToEmail ?? t.issuedToPhone ?? "—"}
          </Field>
          <Field label="Access count" value={String(t.accessCount)} />
          <Field
            label="Last accessed"
            value={t.lastAccessedAt?.slice(0, 16).replace("T", " ") ?? "never"}
          />
          <Field
            label="Expires"
            value={t.expiresAt.slice(0, 16).replace("T", " ")}
          />
          <Field
            label="Created"
            value={t.createdAt.slice(0, 16).replace("T", " ")}
          />
          {t.revokedAt && (
            <Field
              label="Revoked"
              value={t.revokedAt.slice(0, 16).replace("T", " ")}
            />
          )}
          {t.revokeReason && (
            <Field label="Revoke reason" value={t.revokeReason} />
          )}
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Public URL</div>
        <Card padding="default">
          <p className="text-[13px] text-ink-3 mb-2 max-w-[680px]">
            The raw token is shown only at issue time. After that, the prefix is
            the only identifier — share the URL via the issued email/phone path.
          </p>
          <p className="text-ink-2 text-sm">
            <span className="mono text-[12px]">/stay/&lt;token&gt;</span> — full token never logged.
          </p>
          <p className="text-[12px] text-ink-3 mt-2">
            To re-issue: visit the booking detail page and use "Issue new token".
          </p>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
