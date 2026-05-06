"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { submitGuestOrderAction } from "@/features/guest-services/actions";
import {
  describePricingModel,
  formatMinorMoney,
  priceGuestService,
  type PricingModel,
} from "@/features/guest-services/pricing";

export interface CatalogOption {
  id: string;
  optionKey: string;
  label: string;
  description: string | null;
  priceDeltaMinor: bigint;
  isDefault: boolean;
  sortOrder: number;
}

export interface CatalogService {
  id: string;
  serviceKey: string;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  imageUrl: string | null;
  serviceType: string;
  pricingModel: PricingModel;
  basePriceMinor: bigint;
  currency: string;
  requiresDate: boolean;
  requiresTime: boolean;
  requiresGuestCount: boolean;
  requiresAdminConfirmation: boolean;
  allowMultipleDays: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  leadTimeHours: number | null;
  cancellationPolicyMd: string | null;
  category: { id: string; key: string; name: string; icon: string | null } | null;
  options: CatalogOption[];
}

export function ServicesCatalog({
  token,
  services,
}: {
  token: string;
  services: CatalogService[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Group by category for nicer browsing.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: CatalogService[] }>();
    for (const s of services) {
      const key = s.category?.id ?? "uncategorized";
      const name = s.category?.name ?? "Other";
      const cur = map.get(key);
      if (cur) cur.rows.push(s);
      else map.set(key, { name, rows: [s] });
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      id,
      name: v.name,
      rows: v.rows,
    }));
  }, [services]);

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-line-soft bg-surface p-8 text-center text-sm text-ink-tertiary">
        Your villa team hasn&apos;t set up any extras yet. Use the concierge
        free-text request below for anything you need.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {grouped.map((g) => (
        <section key={g.id} className="flex flex-col gap-3">
          <h2 className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            {g.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.rows.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {openId && (
        <ServiceModal
          token={token}
          service={services.find((s) => s.id === openId)!}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function ServiceCard({
  service,
  onOpen,
}: {
  service: CatalogService;
  onOpen: () => void;
}) {
  const priceLabel =
    service.pricingModel === "quote_required"
      ? "On request"
      : service.pricingModel === "free"
        ? "Complimentary"
        : `${formatMinorMoney(service.basePriceMinor, service.currency)} · ${describePricingModel(
            service.pricingModel,
          ).toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-xl border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-ink font-medium text-sm">{service.name}</span>
        <span className="text-[11px] text-ink-tertiary">
          {service.serviceType.replace(/_/g, " ")}
        </span>
      </div>
      {service.shortDescription && (
        <p className="text-xs text-ink-secondary leading-relaxed">
          {service.shortDescription}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-mono tabular-nums text-ink">
          {priceLabel}
        </span>
        <span className="text-[11px] text-ink-tertiary">Request →</span>
      </div>
    </button>
  );
}

function ServiceModal({
  token,
  service,
  onClose,
}: {
  token: string;
  service: CatalogService;
  onClose: () => void;
}) {
  const defaultOption =
    service.options.find((o) => o.isDefault) ?? service.options[0] ?? null;
  const [optionId, setOptionId] = useState<string | null>(
    defaultOption?.id ?? null,
  );
  const [quantity, setQuantity] = useState<number>(service.minQuantity);
  const [guestCount, setGuestCount] = useState<number>(2);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [state, dispatch] = useActionState(submitGuestOrderAction, null);

  const selectedOption =
    service.options.find((o) => o.id === optionId) ?? null;
  const priced = priceGuestService({
    pricingModel: service.pricingModel,
    basePriceMinor: service.basePriceMinor,
    optionPriceDeltaMinor: selectedOption?.priceDeltaMinor ?? 0n,
    quantity,
    guestCount,
  });

  if (state?.ok) {
    return (
      <Backdrop onClose={onClose}>
        <div className="rounded-xl border border-success/40 bg-surface p-6">
          <h3 className="text-lg font-medium text-ink">Request received</h3>
          <p className="text-sm text-ink-secondary mt-2">
            Reference {state.orderCode}. Our team will follow up shortly.
          </p>
          <button
            onClick={onClose}
            className="mt-4 h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
          >
            Close
          </button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <form
        action={dispatch}
        className="rounded-xl border border-line-soft bg-surface p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="serviceId" value={service.id} />
        {selectedOption && (
          <input
            type="hidden"
            name="selectedOptionId"
            value={selectedOption.id}
          />
        )}

        <div>
          <h3 className="text-xl font-medium text-ink">{service.name}</h3>
          <p className="text-xs text-ink-tertiary mt-1">
            {describePricingModel(service.pricingModel)} ·{" "}
            {service.pricingModel === "quote_required"
              ? "We'll quote a price after you submit."
              : `${service.currency}`}
          </p>
        </div>

        {service.descriptionMd && (
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {service.descriptionMd}
          </p>
        )}

        {service.options.length > 0 && (
          <Field label="Options">
            <div className="flex flex-col gap-2">
              {service.options.map((o) => (
                <label
                  key={o.id}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer ${
                    o.id === optionId
                      ? "border-ink bg-canvas"
                      : "border-line-soft"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="selectedOption"
                      value={o.id}
                      checked={o.id === optionId}
                      onChange={() => setOptionId(o.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm text-ink font-medium">
                        {o.label}
                      </span>
                      {o.description && (
                        <span className="block text-xs text-ink-tertiary mt-0.5">
                          {o.description}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-xs font-mono tabular-nums">
                    {o.priceDeltaMinor === 0n
                      ? "—"
                      : `+${formatMinorMoney(o.priceDeltaMinor, service.currency)}`}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          {service.requiresDate && (
            <Field label="Date">
              <input
                type="date"
                name="requestedDate"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
              />
            </Field>
          )}
          {service.requiresTime && (
            <Field label="Time">
              <input
                type="time"
                name="requestedTime"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
              />
            </Field>
          )}
          <Field label="Quantity">
            <input
              type="number"
              name="quantity"
              min={service.minQuantity}
              max={service.maxQuantity ?? 50}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
            />
          </Field>
          {service.requiresGuestCount && (
            <Field label="Guests">
              <input
                type="number"
                name="guestCount"
                min={1}
                max={50}
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value))}
                className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
              />
            </Field>
          )}
        </div>

        <Field label="Anything we should know?">
          <textarea
            name="guestNote"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm text-ink resize-none"
            placeholder="Allergies, preferences, pickup address…"
          />
        </Field>

        <div className="rounded-md border border-line-soft bg-canvas p-3 flex items-center justify-between text-sm">
          <span className="text-ink-secondary">Estimated total</span>
          <span className="font-mono tabular-nums text-ink">
            {priced.quoteRequired
              ? "On request"
              : formatMinorMoney(priced.guestPriceMinor, service.currency)}
          </span>
        </div>
        {service.cancellationPolicyMd && (
          <p className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2 whitespace-pre-wrap">
            {service.cancellationPolicyMd}
          </p>
        )}

        {state && !state.ok && (
          <p className="text-xs text-danger">{state.error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-full border border-line-soft text-sm hover:border-line-strong"
          >
            Back
          </button>
          <button
            type="submit"
            className="flex-1 h-11 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
          >
            Send request
          </button>
        </div>
      </form>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm p-3 md:p-6">
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 -z-10"
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
