import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWhatsappPhoneNumbers } from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "WhatsApp phones · Development OS",
};
export const dynamic = "force-dynamic";

const TYPE_TONE: Record<
  string,
  "info" | "ok" | "warn" | "soft"
> = {
  arconique_outbound: "ok",
  arconique_inbound: "ok",
  recipient: "info",
  unknown: "warn",
};

export default async function WhatsappPhoneNumbersPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>WhatsApp phones</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const phones = await safeQuery(
    "getWhatsappPhoneNumbers",
    getWhatsappPhoneNumbers(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/whatsapp">WhatsApp</Link> /{" "}
            <span>Phone numbers</span>
          </div>
          <h1>WhatsApp phone registry</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every phone number Arconique knows about — outbound numbers we send
            from, recipient numbers we send to (vendors / investors / staff),
            and unknown inbound numbers awaiting operator resolution.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/whatsapp"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            WhatsApp
          </Link>
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="label mb-2.5">Registry</div>
        {phones.length === 0 ? (
          <EmptyState
            title="No phones registered"
            description="Phones land here automatically when inbound messages arrive, or you can register Arconique outbound numbers manually."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Phone</th>
                  <th scope="col">Display name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Resolves to</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Last message</th>
                  <th scope="col" className="num">In</th>
                  <th scope="col" className="num">Out</th>
                </tr>
              </thead>
              <tbody>
                {phones.map((p) => (
                  <tr key={p.id}>
                    <td className="mono text-xs">{p.phoneNumber}</td>
                    <td className="text-sm">{p.displayName ?? "—"}</td>
                    <td>
                      <HandoffBadge tone={TYPE_TONE[p.numberType] ?? "soft"}>
                        {p.numberType}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs">
                      {p.resolvedEntityType
                        ? `${p.resolvedEntityType} ${p.resolvedEntityId?.slice(0, 8) ?? ""}`
                        : "—"}
                    </td>
                    <td className="text-xs text-ink-secondary">{p.provider}</td>
                    <td className="text-xs">{p.isVerified ? "✓" : "—"}</td>
                    <td className="text-xs">
                      {p.lastMessageAt
                        ? p.lastMessageAt
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")
                        : "—"}
                    </td>
                    <td className="num">{p.totalMessagesReceived}</td>
                    <td className="num">{p.totalMessagesSent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
