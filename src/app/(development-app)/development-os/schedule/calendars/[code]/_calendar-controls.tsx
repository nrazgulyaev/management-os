"use client";

/**
 * MISSING_CRUD — calendar detail row/page actions.
 *
 * The calendar detail page was read-only. addHoliday / editWorkingCalendar /
 * archiveWorkingCalendar already exist as org-scoped "use server" actions —
 * these self-contained modal islands mount the missing UI. Follows the
 * project-cycle/_input-forms.tsx modal pattern (modal-overlay + useTransition
 * + router.refresh on success). No client-supplied organizationId is passed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addHoliday } from "@/lib/development/server/calendar/calendar-actions";
import {
  editWorkingCalendar,
  archiveWorkingCalendar,
} from "@/lib/development/server/schedule/resource-pool-actions";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

const HOLIDAY_TYPES = [
  ["national_holiday", "National holiday"],
  ["regional_holiday", "Regional holiday"],
  ["religious_observance", "Religious observance"],
  ["company_holiday", "Company holiday"],
  ["project_specific", "Project-specific"],
  ["site_unavailable", "Site unavailable"],
  ["weather_closure", "Weather closure"],
  ["other_non_working", "Other non-working"],
] as const;

const DAY_LABELS = [
  ["0", "Sun"],
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
] as const;

type HolidayType = (typeof HOLIDAY_TYPES)[number][0];

export interface CalendarControlsProps {
  calendar: {
    id: string;
    name: string;
    workingDaysOfWeek: number[];
    workingHoursPerDay: string;
    description: string | null;
    isDefault: boolean;
    notes: string | null;
  };
}

export function CalendarControls({ calendar }: CalendarControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AddHolidayButton calendarId={calendar.id} />
      <EditCalendarButton calendar={calendar} />
      <ArchiveCalendarButton id={calendar.id} name={calendar.name} />
    </div>
  );
}

function AddHolidayButton({ calendarId }: { calendarId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    start(async () => {
      const r = await addHoliday({
        calendarId,
        holidayDate: str("holidayDate"),
        holidayName: str("holidayName"),
        holidayType: str("holidayType") as HolidayType,
        isFullDay: fd.get("isFullDay") != null,
        source: str("source") || undefined,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => { setErr(null); setOpen(true); }}>
        Add holiday
      </Button>
      {open && (
        <ModalShell title="Add holiday" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L label="Date">
                <input type="date" name="holidayDate" required className={inputCls} />
              </L>
              <L label="Type">
                <select name="holidayType" className={inputCls} defaultValue="company_holiday">
                  {HOLIDAY_TYPES.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </L>
              <L label="Name" span2>
                <input name="holidayName" required minLength={2} className={inputCls} placeholder="Nyepi, site closure…" />
              </L>
              <L label="Source" span2>
                <input name="source" className={inputCls} placeholder="optional — e.g. national gazette" />
              </L>
              <label className="col-span-2 flex items-center gap-2 text-xs text-ink-secondary">
                <input type="checkbox" name="isFullDay" defaultChecked />
                Full day (non-working)
              </label>
            </div>
            <FormFooter pending={pending} err={err} onCancel={() => setOpen(false)} submitLabel="Add holiday" busyLabel="Adding…" />
          </form>
        </ModalShell>
      )}
    </>
  );
}

function EditCalendarButton({
  calendar,
}: {
  calendar: CalendarControlsProps["calendar"];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const days = fd
      .getAll("workingDaysOfWeek")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));
    start(async () => {
      const r = await editWorkingCalendar({
        id: calendar.id,
        name: str("name"),
        description: str("description") || null,
        workingDaysOfWeek: days.length > 0 ? days : undefined,
        workingHoursPerDay: Number(fd.get("workingHoursPerDay") ?? 0),
        isDefault: fd.get("isDefault") != null,
        notes: str("notes") || null,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setErr(null); setOpen(true); }}>
        Edit
      </Button>
      {open && (
        <ModalShell title="Edit calendar" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L label="Name" span2>
                <input name="name" required minLength={2} defaultValue={calendar.name} className={inputCls} />
              </L>
              <L label="Hours per day">
                <input
                  type="number"
                  name="workingHoursPerDay"
                  min={0}
                  max={24}
                  step="any"
                  defaultValue={calendar.workingHoursPerDay}
                  className={inputCls}
                />
              </L>
              <label className="flex items-center gap-2 text-xs text-ink-secondary self-end pb-1.5">
                <input type="checkbox" name="isDefault" defaultChecked={calendar.isDefault} />
                Default calendar
              </label>
              <L label="Working days" span2>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map(([v, label]) => (
                    <label key={v} className="flex items-center gap-1 text-xs text-ink-secondary">
                      <input
                        type="checkbox"
                        name="workingDaysOfWeek"
                        value={v}
                        defaultChecked={calendar.workingDaysOfWeek.includes(Number(v))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </L>
              <L label="Description" span2>
                <input name="description" defaultValue={calendar.description ?? ""} className={inputCls} />
              </L>
              <L label="Notes" span2>
                <input name="notes" defaultValue={calendar.notes ?? ""} className={inputCls} />
              </L>
            </div>
            <FormFooter pending={pending} err={err} onCancel={() => setOpen(false)} submitLabel="Save changes" busyLabel="Saving…" />
          </form>
        </ModalShell>
      )}
    </>
  );
}

function ArchiveCalendarButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await archiveWorkingCalendar({ id });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(null); setOpen(true); }}
        className="text-sm px-3 py-1.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5"
      >
        Archive
      </button>
      {open && (
        <ModalShell title="Archive calendar" onClose={() => setOpen(false)}>
          <p className="text-sm text-ink-secondary mb-4">
            Archive <span className="font-medium text-ink">{name}</span>? It will
            be marked inactive and hidden from active calendar lists.
          </p>
          <FormFooter
            pending={pending}
            err={err}
            onCancel={() => setOpen(false)}
            onSubmit={confirm}
            submitLabel="Archive"
            busyLabel="Archiving…"
            danger
          />
        </ModalShell>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared modal primitives (local — mirrors _input-forms.tsx markup).
// ---------------------------------------------------------------------------

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function FormFooter({
  pending,
  err,
  onCancel,
  onSubmit,
  submitLabel,
  busyLabel,
  danger,
}: {
  pending: boolean;
  err: string | null;
  onCancel: () => void;
  onSubmit?: () => void;
  submitLabel: string;
  busyLabel: string;
  danger?: boolean;
}) {
  return (
    <>
      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type={onSubmit ? "button" : "submit"}
          onClick={onSubmit}
          disabled={pending}
          className={
            danger
              ? "text-sm px-3 py-1.5 rounded bg-danger text-white hover:opacity-90 disabled:opacity-50"
              : "text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
          }
        >
          {pending ? busyLabel : submitLabel}
        </button>
      </div>
    </>
  );
}

function L({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
