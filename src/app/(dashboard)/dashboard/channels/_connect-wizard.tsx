"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { createCalendarFeedAction } from "@/features/integrations/calendar-sync/actions";

export interface WizardVilla {
  id: string;
  unitCode: string;
  projectName: string;
  projectId: string;
}
export interface WizardChannel {
  id: string;
  key: string;
  name: string;
  type: string;
  connectedCount: number;
}

const FEED_TYPES: { value: string; label: string }[] = [
  { value: "ical", label: "Generic iCal" },
  { value: "airbnb_ical", label: "Airbnb iCal" },
  { value: "booking_ical", label: "Booking.com iCal" },
  { value: "vrbo_ical", label: "Vrbo iCal" },
  { value: "manual_ics", label: "Manual .ics" },
];

function defaultFeedType(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("airbnb")) return "airbnb_ical";
  if (k.includes("booking")) return "booking_ical";
  if (k.includes("vrbo")) return "vrbo_ical";
  return "ical";
}

export function ConnectVillaWizardButton({
  villas,
  channels,
  triggerClassName,
  triggerLabel,
}: {
  villas: WizardVilla[];
  channels: WizardChannel[];
  triggerClassName?: string;
  triggerLabel: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [channelId, setChannelId] = React.useState<string | null>(null);
  const [villaId, setVillaId] = React.useState<string | null>(null);
  const [feedUrl, setFeedUrl] = React.useState("");
  const [feedType, setFeedType] = React.useState("ical");
  const [feedName, setFeedName] = React.useState("");
  const [interval, setIntervalMin] = React.useState("180");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const channel = channels.find((c) => c.id === channelId) ?? null;
  const villa = villas.find((v) => v.id === villaId) ?? null;

  function reset() {
    setStep(1);
    setChannelId(null);
    setVillaId(null);
    setFeedUrl("");
    setFeedType("ical");
    setFeedName("");
    setIntervalMin("180");
    setBusy(false);
    setError(null);
    setUrlError(null);
  }

  function openWizard() {
    reset();
    setOpen(true);
  }

  function pickChannel(c: WizardChannel) {
    setChannelId(c.id);
    setFeedType(defaultFeedType(c.key));
  }

  function toStep3() {
    if (channel && villa) {
      setFeedName(`${channel.name} · ${villa.unitCode}`);
    }
    setError(null);
    setUrlError(null);
    setStep(3);
  }

  async function connect() {
    if (!channel || !villa) return;
    if (!/^https?:\/\//i.test(feedUrl.trim())) {
      setUrlError("Enter a valid http(s) iCal URL.");
      return;
    }
    setBusy(true);
    setError(null);
    setUrlError(null);
    const fd = new FormData();
    fd.set("villaId", villa.id);
    fd.set("projectId", villa.projectId);
    fd.set("bookingChannelId", channel.id);
    fd.set("feedName", feedName.trim() || `${channel.name} · ${villa.unitCode}`);
    fd.set("feedUrl", feedUrl.trim());
    fd.set("feedType", feedType);
    fd.set("syncIntervalMinutes", interval);
    const res = await createCalendarFeedAction(null, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error ?? "Could not create the connection.");
      if (res.fieldErrors?.feedUrl?.[0]) setUrlError(res.fieldErrors.feedUrl[0]);
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={openWizard}>
        {triggerLabel}
      </button>
      <Modal open={open} onOpenChange={setOpen} size="lg">
        <ModalHeader
          title="Connect a villa to a channel"
          description="Links one villa to a channel via an iCal/ICS calendar feed."
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          <div className="connect-wizard">
            <ol className="cw-steps mono">
              <li className={step >= 1 ? "is-on" : ""}>1 · Channel</li>
              <li className={step >= 2 ? "is-on" : ""}>2 · Villa</li>
              <li className={step >= 3 ? "is-on" : ""}>3 · Feed</li>
            </ol>

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
                {error}
              </div>
            )}

            {step === 1 && (
              <section className="cw-step">
                <h3 className="cw-step-title">Pick a channel</h3>
                {channels.length === 0 ? (
                  <p className="cw-help">
                    No channels configured yet. Create one with “+ New channel”
                    first.
                  </p>
                ) : (
                  <div className="cw-channels">
                    {channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cw-channel-btn${channelId === c.id ? " is-on" : ""}`}
                        onClick={() => pickChannel(c)}
                      >
                        <span className="cw-channel-name">{c.name}</span>
                        <span className="cw-channel-auth mono">{c.type}</span>
                        {c.connectedCount > 0 && (
                          <span className="cw-channel-tag mono">
                            {c.connectedCount} connected
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <footer className="cw-foot">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!channelId}
                    onClick={() => setStep(2)}
                  >
                    Continue
                  </button>
                </footer>
              </section>
            )}

            {step === 2 && (
              <section className="cw-step">
                <h3 className="cw-step-title">
                  Which villa connects to {channel?.name}?
                </h3>
                {villas.length === 0 ? (
                  <p className="cw-help">No active villas to connect.</p>
                ) : (
                  <div className="cw-channels">
                    {villas.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`cw-channel-btn${villaId === v.id ? " is-on" : ""}`}
                        onClick={() => setVillaId(v.id)}
                      >
                        <span className="cw-channel-name">{v.unitCode}</span>
                        <span className="cw-channel-auth mono">{v.projectName}</span>
                      </button>
                    ))}
                  </div>
                )}
                <footer className="cw-foot">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!villaId}
                    onClick={toStep3}
                  >
                    Continue
                  </button>
                </footer>
              </section>
            )}

            {step === 3 && channel && villa && (
              <section className="cw-step">
                <h3 className="cw-step-title">Calendar feed</h3>
                <p className="cw-help">
                  Paste the iCal/ICS export URL from {channel.name} for{" "}
                  <strong>{villa.unitCode}</strong>. Bookings sync into the
                  platform on the interval you set.
                </p>
                <div className="field">
                  <label className="field-label">Feed URL</label>
                  <input
                    className="input"
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    placeholder="https://www.airbnb.com/calendar/ical/123.ics?s=…"
                  />
                  {urlError && (
                    <span className="text-[11px] text-danger">{urlError}</span>
                  )}
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">Feed name</span>
                    <input
                      className="input"
                      value={feedName}
                      onChange={(e) => setFeedName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Feed type</span>
                    <select
                      className="select"
                      value={feedType}
                      onChange={(e) => setFeedType(e.target.value)}
                    >
                      {FEED_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">Sync interval (minutes)</span>
                    <input
                      className="input mono"
                      type="number"
                      min={15}
                      max={1440}
                      step={15}
                      value={interval}
                      onChange={(e) => setIntervalMin(e.target.value)}
                    />
                  </label>
                  <div className="field" />
                </div>
                <footer className="cw-foot">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setStep(2)}
                    disabled={busy}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={connect}
                    disabled={busy || !feedUrl.trim()}
                  >
                    {busy ? "Connecting…" : "Connect villa"}
                  </button>
                </footer>
              </section>
            )}
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
