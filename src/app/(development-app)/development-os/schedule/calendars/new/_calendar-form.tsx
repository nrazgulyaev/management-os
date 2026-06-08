"use client";

/**
 * Wire-up sweep — create working calendar. createCalendar ("use server")
 * existed; the /new page was an instructional stub.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createCalendar } from "@/lib/development/server/calendar/calendar-actions";

const DOW = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

const inputCls = "w-full rounded border border-line-soft bg-surface px-2.5 py-1.5 text-sm";

export function CalendarForm({
  projects,
  vendors,
}: {
  projects: { id: string; name: string }[];
  vendors: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [scope, setScope] = React.useState<"company_wide" | "project" | "vendor">("company_wide");
  const [days, setDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function toggleDay(v: number) {
    setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (days.length === 0) {
      setErr("Select at least one working day.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const projectId = scope === "project" ? (fd.get("projectId") ?? "").toString() : undefined;
    const vendorId = scope === "vendor" ? (fd.get("vendorId") ?? "").toString() : undefined;
    if (scope === "project" && !projectId) return setErr("Pick a project.");
    if (scope === "vendor" && !vendorId) return setErr("Pick a vendor.");
    start(async () => {
      const r = await createCalendar({
        calendarCode: (fd.get("calendarCode") ?? "").toString().trim().toUpperCase(),
        name: (fd.get("name") ?? "").toString().trim(),
        scope,
        workingDaysOfWeek: days,
        workingHoursPerDay: Number(fd.get("workingHoursPerDay") ?? 8),
        projectId: projectId || undefined,
        vendorId: vendorId || undefined,
        countryCode: (fd.get("countryCode") ?? "ID").toString().trim() || "ID",
        regionCode: (fd.get("regionCode") ?? "").toString().trim() || undefined,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create calendar.");
        return;
      }
      router.push("/development-os/schedule/calendars");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <L label="Calendar code" required>
          <input name="calendarCode" required className={`${inputCls} uppercase`} placeholder="BALI_CONTRACTOR" />
        </L>
        <L label="Name" required>
          <input name="name" required minLength={2} className={inputCls} placeholder="Bali contractor calendar" />
        </L>
        <L label="Scope">
          <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="company_wide">Company-wide</option>
            <option value="project">Project</option>
            <option value="vendor">Vendor</option>
          </select>
        </L>
        {scope === "project" && (
          <L label="Project">
            <select name="projectId" className={inputCls} defaultValue="">
              <option value="" disabled>Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
        )}
        {scope === "vendor" && (
          <L label="Vendor">
            <select name="vendorId" className={inputCls} defaultValue="">
              <option value="" disabled>Select vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </L>
        )}
        <L label="Working hours / day" required>
          <input type="number" name="workingHoursPerDay" min={0.5} step={0.5} defaultValue={8} required className={inputCls} />
        </L>
        <L label="Country code">
          <input name="countryCode" defaultValue="ID" maxLength={2} className={`${inputCls} uppercase`} />
        </L>
        <L label="Region code">
          <input name="regionCode" className={inputCls} placeholder="optional" />
        </L>
      </div>
      <div>
        <span className="text-xs font-medium text-ink-secondary">Working days *</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DOW.map((d) => (
            <button
              key={d.v}
              type="button"
              onClick={() => toggleDay(d.v)}
              className={`text-xs px-2.5 py-1 rounded border ${
                days.includes(d.v)
                  ? "border-terra bg-terra/10 text-ink"
                  : "border-line-soft bg-surface text-ink-tertiary"
              }`}
            >
              {d.l}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create calendar"}</Button>
      </div>
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
