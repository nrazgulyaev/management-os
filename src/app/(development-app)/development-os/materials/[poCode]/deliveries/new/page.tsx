import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { siteZones } from "@/lib/db/schema/site-operations";
import { getMaterialPO } from "@/lib/development/server/materials";
import { recordMaterialDelivery } from "@/lib/development/server/material-actions";

export const metadata: Metadata = { title: "Record delivery · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewDeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ poCode: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { poCode } = await params;
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Record delivery</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const po = await getMaterialPO(decodeURIComponent(poCode));
  if (!po) notFound();

  const zones = await db
    .select({
      id: siteZones.id,
      code: siteZones.zoneCode,
      name: siteZones.zoneName,
    })
    .from(siteZones)
    .where(eq(siteZones.projectId, po.projectId))
    .orderBy(siteZones.displayOrder);

  async function handleSubmit(formData: FormData) {
    "use server";
    const deliveryCode = String(formData.get("deliveryCode") ?? "");
    const deliveryDate = String(formData.get("deliveryDate") ?? "");
    const qualityCheckStatus = String(
      formData.get("qualityCheckStatus") ?? "pending",
    ) as "pending" | "accepted" | "partial_acceptance" | "rejected";
    const qualityNotes = String(formData.get("qualityNotes") ?? "") || null;
    const notes = String(formData.get("notes") ?? "") || null;

    type DeliveryLineInput = {
      poLineId: string;
      quantityReceived: number;
      qualityCheckPassed: boolean;
      storedInZoneId: string | null;
    };
    const deliveryLines: DeliveryLineInput[] = [];
    for (const l of po!.lines) {
      const qty = Number(formData.get(`line-${l.id}-qty`) ?? 0);
      if (qty <= 0) continue;
      const passed = formData.get(`line-${l.id}-passed`) !== "off";
      const zoneId = String(formData.get(`line-${l.id}-zone`) ?? "") || null;
      deliveryLines.push({
        poLineId: l.id,
        quantityReceived: qty,
        qualityCheckPassed: passed,
        storedInZoneId: zoneId,
      });
    }

    if (deliveryLines.length === 0) {
      redirect(
        `/development-os/materials/${poCode}/deliveries/new?error=${encodeURIComponent("At least one line with quantity > 0 is required")}`,
      );
    }

    try {
      await recordMaterialDelivery({
        deliveryCode,
        poId: po!.id,
        deliveryDate,
        qualityCheckStatus,
        qualityNotes,
        notes,
        lines: deliveryLines,
      });
      redirect(`/development-os/materials/${poCode}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/materials/${poCode}/deliveries/new?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/materials">Materials</Link> /{" "}
            <Link href={`/development-os/materials/${po.poCode}`}>
              {po.poCode}
            </Link>{" "}
            / <span>Record delivery</span>
          </div>
          <h1>{`Record delivery — ${po.poCode}`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Quantities can&apos;t exceed remaining (ordered minus already
            delivered). The action atomically updates po_lines and recomputes PO
            status.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/materials/${po.poCode}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              PO
            </Link>
          </Button>
        </div>
      </div>

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {sp.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4 max-w-4xl">
        <div>
          <div className="label mb-2.5">Header</div>
          <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Delivery code">
              <input
                type="text"
                name="deliveryCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="DEL-2026-0001"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Delivery date">
              <input
                type="date"
                name="deliveryDate"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Quality check status">
              <select
                name="qualityCheckStatus"
                defaultValue="pending"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="partial_acceptance">Partial acceptance</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Quality notes" full>
              <input
                type="text"
                name="qualityNotes"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Notes">
              <input
                type="text"
                name="notes"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
          </Card>
        </div>

        <div>
          <div className="label mb-2.5">Lines</div>
          <Card padding="default">
          <div className="space-y-2">
            {po.lines.map((l) => {
              const remaining =
                Number(l.quantityOrdered) - Number(l.quantityDelivered);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/40"
                >
                  <div className="md:col-span-4 text-sm">
                    <div className="font-mono text-xs text-ink-tertiary">
                      Line #{l.lineNumber}
                    </div>
                    <div>{l.materialName}</div>
                    <div className="text-xs text-ink-tertiary">
                      Ordered {Number(l.quantityOrdered).toFixed(2)} {l.unitOfMeasure} ·{" "}
                      delivered {Number(l.quantityDelivered).toFixed(2)} ·{" "}
                      remaining {remaining.toFixed(2)}
                    </div>
                  </div>
                  <Field label="Qty received" className="md:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={remaining}
                      name={`line-${l.id}-qty`}
                      defaultValue="0"
                      className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                    />
                  </Field>
                  <Field label="Stored in zone" className="md:col-span-3">
                    <select
                      name={`line-${l.id}-zone`}
                      defaultValue=""
                      className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.code}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="md:col-span-3 flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      name={`line-${l.id}-passed`}
                      defaultChecked
                    />
                    Quality passed
                  </label>
                </div>
              );
            })}
          </div>
          </Card>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit">Record delivery</Button>
        </div>
      </form>
    </DevelopmentShell>
  );
}

function Field({
  label,
  children,
  className,
  full,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  full?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""} ${className ?? ""}`}
    >
      {label && (
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}
