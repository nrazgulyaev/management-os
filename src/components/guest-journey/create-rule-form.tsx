"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createGuestJourneyRuleAction } from "@/features/guest-journey/actions";

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

export function CreateGuestJourneyRuleForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const [state, dispatch] = useActionState(
    createGuestJourneyRuleAction,
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && state.id) {
      if (onSuccess) onSuccess();
      else router.push(`/dashboard/guest-journey/rules/${state.id}`);
    }
  }, [state, router, onSuccess]);

  return (
    <form
      action={dispatch}
      className="flex flex-col gap-4 rounded-md border border-line-soft bg-surface p-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="ruleKey" label="Rule key" required />
        <Input name="name" label="Name" required />
      </div>
      <Textarea name="description" label="Description" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select name="journeyStage" label="Stage" options={STAGE_OPTIONS} />
        <Select
          name="triggerAnchor"
          label="Trigger anchor"
          options={ANCHOR_OPTIONS}
        />
        <Input
          name="offsetMinutes"
          type="number"
          label="Offset (minutes)"
          required
          defaultValue="0"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select
          name="channel"
          label="Channel"
          options={["in_app", "email", "sms", "whatsapp", "none"]}
        />
        <Select
          name="suggestionType"
          label="Suggestion type"
          options={["", ...SUGGESTION_OPTIONS]}
        />
        <Select
          name="priority"
          label="Priority"
          options={["low", "normal", "high", "urgent"]}
          defaultValue="normal"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input name="templateKey" label="Template key" />
        <Input
          name="appliesToChannel"
          label="Booking channel filter"
          placeholder="any / direct / airbnb / booking_com"
        />
        <Input name="serviceId" label="Service ID (optional)" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="villaId" label="Villa scope (optional)" />
        <Input name="projectId" label="Project scope (optional)" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Create rule
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-full border border-line-soft text-xs text-ink hover:bg-muted"
          >
            Cancel
          </button>
        )}
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

function Textarea(props: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <textarea
        name={props.name}
        rows={3}
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
