"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-07 — Toggle.
 *
 * Accessible on/off switch. Uses an internal hidden checkbox so it
 * works inside <form> elements without extra wiring.
 */

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onCheckedChange, ariaLabel, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`toggle${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <span className="toggle-knob" aria-hidden />
    </button>
  );
}
