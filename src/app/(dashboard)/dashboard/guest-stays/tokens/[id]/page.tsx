import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import {
  getGuestStayTokenById,
} from "@/features/guest-stays/services";
import { RevokeTokenButton } from "@/components/guest-stays/revoke-token-button";

export const metadata = { title: "Guest stay token" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  revoked: "warning",
  expired: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Tokens", href: "/dashboard/guest-stays/tokens" },
          { label: t.tokenPrefix + "…" },
        ]}
        title={`Token · ${t.tokenPrefix}…`}
        description={`Booking ${t.bookingCode ?? t.bookingId.slice(0, 8)} · ${t.villaCode ?? "villa"}`}
        actions={
          t.status === "active" ? <RevokeTokenButton id={t.id} /> : undefined
        }
      />

      <Section eyebrow="Status" title="Token">
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={STATUS_TONES[t.status] ?? "neutral"}>{t.status}</Badge>
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
      </Section>

      <Section
        eyebrow="Public URL"
        title="Where the guest goes"
        description="The raw token is shown only at issue time. After that, the prefix is the only identifier — share the URL via the issued email/phone path."
      >
        <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm">
          <p className="text-ink-secondary">
            <span className="font-mono text-[12px]">/stay/&lt;token&gt;</span> — full token never logged.
          </p>
          <p className="text-xs text-ink-tertiary mt-2">
            To re-issue: visit the booking detail page and use "Issue new token".
          </p>
        </div>
      </Section>
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
