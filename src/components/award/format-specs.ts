/**
 * Hotfix HF-1 — Serializable format specs for RSC-safe primitives.
 *
 * The `"use client"` chart primitives (AreaChartCard,
 * HatchedBarChart, …) previously accepted a `formatValue: (v: number)
 * => string` function prop for the hover tooltip. Server-component
 * consumers passing such a function trigger the runtime error
 * "Functions cannot be passed directly to Client Components" — RSC
 * payload can only carry serialisable values across the boundary.
 *
 * This module replaces the function prop with a string-tagged
 * `FormatSpec` union + a pure resolver (`formatValueFromSpec`). The
 * resolver lives on the client side; consumers only pass the spec
 * string (+ optional prefix/suffix strings).
 *
 * Adding a new spec? Extend the union below, add a switch arm, and
 * the regression test in
 * `tests/sprint-hotfix-1-no-function-props.test.ts` keeps the rule
 * enforced.
 */

export type FormatSpec =
  | "number"
  | "number-compact"
  | "number-1dp"
  | "number-2dp"
  | "currency-usd"
  | "currency-usd-compact"
  | "currency-usdt-2dp"
  | "currency-usdt-6dp"
  | "percent"
  | "percent-1dp"
  | "duration-hms";

/**
 * Pure resolver — takes a numeric value + a spec string + optional
 * prefix/suffix wrappers, returns the formatted string. No DOM, no
 * I/O, no Date. Safe to call from both server and client.
 */
export function formatValueFromSpec(
  value: number,
  spec: FormatSpec = "number",
  options: { prefix?: string; suffix?: string } = {},
): string {
  let core: string;
  switch (spec) {
    case "currency-usd":
      core = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
      break;
    case "currency-usd-compact":
      core = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
      break;
    case "currency-usdt-2dp":
      core = `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)} USDT`;
      break;
    case "currency-usdt-6dp":
      core = `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      }).format(value)} USDT`;
      break;
    case "number-compact":
      core = new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
      break;
    case "number-1dp":
      core = value.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      break;
    case "number-2dp":
      core = value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      break;
    case "percent":
      core = `${value.toFixed(0)}%`;
      break;
    case "percent-1dp":
      core = `${value.toFixed(1)}%`;
      break;
    case "duration-hms": {
      const totalSeconds = Math.max(0, Math.round(value));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      core = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      break;
    }
    case "number":
    default:
      core = value.toLocaleString();
      break;
  }
  return `${options.prefix ?? ""}${core}${options.suffix ?? ""}`;
}
