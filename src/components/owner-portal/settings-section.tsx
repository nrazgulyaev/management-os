import * as React from "react";

/**
 * Phase 2.3 owner-07 — SettingsSection.
 *
 * Wrapper for a logical group of settings rows. Title + helper +
 * rows inside a rounded surface.
 */

export interface SettingsSectionProps {
  title: string;
  helper?: string;
  children?: React.ReactNode;
  /** Optional warning tone (terra border) — used for the termination card. */
  tone?: "default" | "warn";
  className?: string;
}

export function SettingsSection({ title, helper, children, tone = "default", className }: SettingsSectionProps) {
  return (
    <section className={`settings-section ss-${tone}${className ? ` ${className}` : ""}`}>
      <header className="ss-head">
        <h3 className="ss-title">{title}</h3>
        {helper && <p className="ss-helper">{helper}</p>}
      </header>
      <div className="ss-rows">{children}</div>
    </section>
  );
}
