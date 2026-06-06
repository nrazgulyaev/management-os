"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { createChannelAction, updateChannelAction } from "@/features/channels/actions";

export interface ChannelData {
  id: string;
  key: string;
  name: string;
  type: string;
  commissionModel: string | null;
  defaultCommissionPct: number | null;
  status: string;
}

export function ChannelModalButton({
  mode,
  channel,
  triggerClassName,
  triggerLabel,
}: {
  mode: "create" | "edit";
  channel?: ChannelData;
  triggerClassName?: string;
  triggerLabel: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[] | undefined>>({});
  const formRef = React.useRef<HTMLFormElement>(null);
  const isEdit = mode === "edit";

  function openModal() {
    setError(null);
    setFieldErrors({});
    setOpen(true);
  }

  function submit() {
    const formEl = formRef.current;
    if (!formEl) return;
    setError(null);
    setFieldErrors({});
    const fd = new FormData(formEl);
    start(async () => {
      const res =
        isEdit && channel
          ? await updateChannelAction(channel.id, null, fd)
          : await createChannelAction(null, fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Save failed");
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={openModal}>
        {triggerLabel}
      </button>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <ModalHeader
          title={isEdit ? "Edit channel" : "New channel"}
          description={
            isEdit
              ? "Commission defaults apply to incoming bookings. The key is fixed."
              : "Channels capture commission defaults applied to incoming bookings."
          }
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink mb-3">
              {error}
            </div>
          )}
          <form ref={formRef}>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" name="name" required defaultValue={channel?.name} placeholder="Booking.com" />
                {fieldErrors.name?.[0] && (
                  <span className="text-[11px] text-danger">{fieldErrors.name[0]}</span>
                )}
              </label>
              <label className="field">
                <span className="field-label">
                  Key {isEdit && <span className="text-ink-4">· fixed</span>}
                </span>
                <input
                  className={`input${isEdit ? " opacity-60 cursor-not-allowed" : ""}`}
                  name="key"
                  required={!isEdit}
                  readOnly={isEdit}
                  defaultValue={channel?.key}
                  placeholder="booking"
                />
                {fieldErrors.key?.[0] && (
                  <span className="text-[11px] text-danger">{fieldErrors.key[0]}</span>
                )}
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Type</span>
                <select className="select" name="type" defaultValue={channel?.type ?? "ota"}>
                  <option value="ota">OTA</option>
                  <option value="direct">Direct</option>
                  <option value="agent">Agent</option>
                  <option value="social">Social</option>
                  <option value="corporate">Corporate</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Commission model</span>
                <select
                  className="select"
                  name="commissionModel"
                  defaultValue={channel?.commissionModel ?? ""}
                >
                  <option value="">—</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                  <option value="tiered">Tiered</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Default commission %</span>
                <input
                  className="input mono"
                  name="defaultCommissionPct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={channel?.defaultCommissionPct ?? undefined}
                  placeholder="15"
                />
              </label>
              <label className="field">
                <span className="field-label">Status</span>
                <select className="select" name="status" defaultValue={channel?.status ?? "active"}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create channel"}
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
