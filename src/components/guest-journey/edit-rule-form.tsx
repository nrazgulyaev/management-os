"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateGuestJourneyRuleAction } from "@/features/guest-journey/actions";

const STAGE_OPTIONS = [
  "pre_arrival",
  "arrival_day",
  "in_stay",
  "pre_checkout",
  "checkout_day",
  "post_stay",
];
const ANCHOR_OPTIONS = [
  "booking_created",
  "check_in",
  "check_out",
  "stay_token_issued",
  "guest_arrived",
  "guest_checked_out",
];
const SUGGESTION_OPTIONS = [
  "airport_transfer",
  "breakfast",
  "private_chef",
  "massage",
  "driver",
  "restaurant",
  "late_checkout",
  "review_request",
  "guide",
  "concierge",
  "info",
];
const CHANNEL_OPTIONS = ["in_app", "email", "sms", "whatsapp", "none"];
const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];

export interface EditRuleInitial {
  id: string;
  name: string;
  description: string | null;
  journeyStage: string;
  triggerAnchor: string;
  offsetMinutes: number;
  channel: string;
  suggestionType: string | null;
  priority: string;
  templateKey: string | null;
  appliesToChannel: string | null;
}

export function EditGuestJourneyRuleForm({
  rule,
}: {
  rule: EditRuleInitial;
}) {
  const [state, dispatch] = useActionState(updateGuestJourneyRuleAction, null);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      action={dispatch}
      className="flex flex-col gap-4 rounded-md border border-line-soft bg-surface p-5 mt-5"
    >
      <input type="hidden" name="id" value={rule.id} />
      <Input name="name" label="Name" defaultValue={rule.name} required />
      <Textarea
        name="description"
        label="Description"
        defaultValue={rule.description ?? ""}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select
          name="journeyStage"
          label="Stage"
          options={STAGE_OPTIONS}
          defaultValue={rule.journeyStage}
        />
        <Select
          name="triggerAnchor"
          label="Trigger anchor"
          options={ANCHOR_OPTIONS}
          defaultValue={rule.triggerAnchor}
        />
        <Input
          name="offsetMinutes"
          type="number"
          label="Offset (minutes)"
          required
          defaultValue={String(rule.offsetMinutes)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select
          name="channel"
          label="Channel"
          options={CHANNEL_OPTIONS}
          defaultValue={rule.channel}
        />
        <Select
          name="suggestionType"
          label="Suggestion type"
          options={["", ...SUGGESTION_OPTIONS]}
          defaultValue={rule.suggestionType ?? ""}
        />
        <Select
          name="priority"
          label="Priority"
          options={PRIORITY_OPTIONS}
          defaultValue={rule.priority}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          name="templateKey"
          label="Template key"
          defaultValue={rule.templateKey ?? ""}
        />
        <Input
          name="appliesToChannel"
          label="Booking channel filter"
          placeholder="any / direct / airbnb / booking_com"
          defaultValue={rule.appliesToChannel ?? ""}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-4 rounded-full border border-line-soft text-xs text-ink hover:bg-muted"
        >
          Cancel
        </button>
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function Input(props: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      />
    </label>
  );
}

function Textarea(props: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <textarea
        name={props.name}
        rows={3}
        defaultValue={props.defaultValue}
        className="px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      />
    </label>
  );
}

function Select(props: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <select
        name={props.name}
        defaultValue={props.defaultValue ?? props.options[0]}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
