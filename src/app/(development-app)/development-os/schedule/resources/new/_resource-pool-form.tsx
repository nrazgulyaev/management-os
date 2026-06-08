"use client";

/**
 * Wire-up sweep — create resource pool. createResourcePool ("use server")
 * existed; the /new page was an instructional stub.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createResourcePool } from "@/lib/development/server/schedule/resource-pool-actions";

const TYPES = [
  "vendor_team",
  "internal_team",
  "individual",
  "equipment",
  "subcontractor",
] as const;
type ResourceType = (typeof TYPES)[number];

const inputCls = "w-full rounded border border-line-soft bg-surface px-2.5 py-1.5 text-sm";

export function ResourcePoolForm({
  vendors,
}: {
  vendors: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [resourceType, setResourceType] = React.useState<ResourceType>("vendor_team");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  const vendorRelevant = resourceType === "vendor_team" || resourceType === "subcontractor";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const capRaw = (fd.get("totalCapacityPerDay") ?? "").toString();
    const skills = (fd.get("skills") ?? "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    start(async () => {
      const r = await createResourcePool({
        resourceCode: (fd.get("resourceCode") ?? "").toString().trim(),
        displayName: (fd.get("displayName") ?? "").toString().trim(),
        resourceType,
        vendorId: vendorRelevant ? (fd.get("vendorId") ?? "").toString() || undefined : undefined,
        totalCapacityPerDay: capRaw === "" ? undefined : Number(capRaw),
        capacityUnit: (fd.get("capacityUnit") ?? "hours").toString() as "hours" | "days" | "units",
        skills,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create resource pool.");
        return;
      }
      router.push("/development-os/schedule/resources");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <L label="Resource code" required>
          <input name="resourceCode" required minLength={2} className={inputCls} placeholder="CREW_A" />
        </L>
        <L label="Display name" required>
          <input name="displayName" required minLength={2} className={inputCls} placeholder="Concrete crew A" />
        </L>
        <L label="Resource type">
          <select className={inputCls} value={resourceType} onChange={(e) => setResourceType(e.target.value as ResourceType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </L>
        {vendorRelevant && (
          <L label="Vendor">
            <select name="vendorId" className={inputCls} defaultValue="">
              <option value="">— None</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </L>
        )}
        <L label="Capacity / day">
          <input type="number" name="totalCapacityPerDay" min={0} step="any" className={inputCls} placeholder="optional" />
        </L>
        <L label="Capacity unit">
          <select name="capacityUnit" className={inputCls} defaultValue="hours">
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="units">units</option>
          </select>
        </L>
        <L label="Skills (comma-separated)">
          <input name="skills" className={inputCls} placeholder="concrete, formwork" />
        </L>
      </div>
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create resource pool"}</Button>
    </form>
  );
}

function L({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
      <span>{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
    </label>
  );
}
