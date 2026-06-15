import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { vendors } from "@/lib/db/schema/site-operations";
import { createMaterialPO } from "@/lib/development/server/material-actions";
import {
  COMMON_MATERIAL_CATEGORIES,
  COMMON_UNITS_OF_MEASURE,
} from "@/lib/development/constants/material-constants";

export const metadata: Metadata = { title: "New PO · Development OS" };
export const dynamic = "force-dynamic";

const MAX_LINES = 8;

export default async function NewMaterialPoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>New PO</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);
  const vendorList = await db
    .select({ id: vendors.id, code: vendors.vendorCode, name: vendors.legalName })
    .from(vendors)
    .orderBy(vendors.vendorCode);

  async function handleSubmit(formData: FormData) {
    "use server";
    const poCode = String(formData.get("poCode") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const orderDate = String(formData.get("orderDate") ?? "");
    const expectedDeliveryDate =
      String(formData.get("expectedDeliveryDate") ?? "") || null;
    const currency = String(formData.get("currency") ?? "USD") as
      | "USD"
      | "IDR"
      | "RUB"
      | "EUR"
      | "USDT"
      | "CNY";
    const fxRate = String(formData.get("fxRate") ?? "1.0");
    const notes = String(formData.get("notes") ?? "") || null;

    type LineInput = {
      lineNumber: number;
      materialName: string;
      materialCategory: string | null;
      unitOfMeasure: string;
      quantityOrdered: number;
      unitPriceUsdMinor: bigint;
      unitPriceOriginalMinor: bigint;
    };
    const lines: LineInput[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      const name = String(formData.get(`line-${i}-name`) ?? "");
      const qty = Number(formData.get(`line-${i}-qty`) ?? 0);
      const priceUsdMajor = Number(formData.get(`line-${i}-priceUsd`) ?? 0);
      if (!name || qty <= 0) continue;
      const priceOriginalMajor = Number(
        formData.get(`line-${i}-priceOriginal`) ?? priceUsdMajor,
      );
      lines.push({
        lineNumber: i + 1,
        materialName: name,
        materialCategory: String(formData.get(`line-${i}-category`) ?? "") || null,
        unitOfMeasure: String(formData.get(`line-${i}-uom`) ?? "pcs"),
        quantityOrdered: qty,
        unitPriceUsdMinor: BigInt(Math.round(priceUsdMajor * 100)),
        unitPriceOriginalMinor: BigInt(Math.round(priceOriginalMajor * 100)),
      });
    }

    if (lines.length === 0) {
      redirect(
        `/development-os/materials/new?error=${encodeURIComponent("At least one line item is required")}`,
      );
    }

    try {
      const result = await createMaterialPO({
        poCode,
        projectId,
        vendorId,
        orderDate,
        expectedDeliveryDate,
        totalAmountCurrency: currency,
        fxRateAtOrder: fxRate,
        notes,
        lines,
      });
      redirect(`/development-os/materials/${result.poCode}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/development-os/materials/new?error=${encodeURIComponent(msg)}`);
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/materials">Materials</Link> /{" "}
            <span>New PO</span>
          </div>
          <h1>New material PO</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Server computes totals from line items — never trust client-asserted
            totals.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/materials">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All POs
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
            <Field label="PO code">
              <input
                type="text"
                name="poCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="PO-2026-0001"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Project">
              <select
                name="projectId"
                required
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select…
                </option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vendor">
              <select
                name="vendorId"
                required
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select…
                </option>
                {vendorList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order date">
              <input
                type="date"
                name="orderDate"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Expected delivery">
              <input
                type="date"
                name="expectedDeliveryDate"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Currency">
              <select
                name="currency"
                defaultValue="IDR"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {["USD", "IDR", "RUB", "EUR", "USDT", "CNY"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="FX rate (1 USD = N currency)">
              <input
                type="text"
                name="fxRate"
                required
                pattern="\d+(\.\d+)?"
                defaultValue="16400"
                placeholder="16400"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Notes" full>
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
            {Array.from({ length: MAX_LINES }, (_, i) => i).map((i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/40"
              >
                <Field label={i === 0 ? "Material" : ""} className="md:col-span-3">
                  <input
                    type="text"
                    name={`line-${i}-name`}
                    placeholder="Cement, steel, etc."
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label={i === 0 ? "Category" : ""} className="md:col-span-2">
                  <select
                    name={`line-${i}-category`}
                    defaultValue=""
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {COMMON_MATERIAL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={i === 0 ? "UoM" : ""} className="md:col-span-1">
                  <select
                    name={`line-${i}-uom`}
                    defaultValue="pcs"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  >
                    {COMMON_UNITS_OF_MEASURE.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={i === 0 ? "Qty" : ""} className="md:col-span-2">
                  <input
                    type="number"
                    name={`line-${i}-qty`}
                    step="0.01"
                    min="0"
                    defaultValue="0"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label={i === 0 ? "Unit USD" : ""} className="md:col-span-2">
                  <input
                    type="number"
                    name={`line-${i}-priceUsd`}
                    step="0.01"
                    min="0"
                    defaultValue="0"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label={i === 0 ? "Unit (orig)" : ""} className="md:col-span-2">
                  <input
                    type="number"
                    name={`line-${i}-priceOriginal`}
                    step="0.01"
                    min="0"
                    defaultValue="0"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-tertiary mt-2">
            Empty lines are skipped. Server computes the PO total from the
            sum of (unit_price × quantity).
          </p>
          </Card>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit">Create PO</Button>
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
      className={`flex flex-col gap-1.5 ${full ? "md:col-span-3" : ""} ${className ?? ""}`}
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
