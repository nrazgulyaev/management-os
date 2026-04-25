"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { StatusPill } from "@/components/ui/status-pill";
import { TrendingUp } from "lucide-react";

export function PlatformPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto max-w-[1200px]"
    >
      <div className="relative rounded-xl border border-line-soft bg-surface shadow-[var(--shadow-floating)] overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 h-9 border-b border-line-soft bg-muted/40">
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong/60" />
          <span className="ml-3 text-[11px] text-ink-tertiary">
            management.arconique.com / dashboard
          </span>
        </div>
        <div className="grid grid-cols-12 min-h-[420px]">
          <div className="hidden md:flex flex-col col-span-3 border-r border-line-soft p-4 gap-1 text-sm">
            {["Overview", "Projects", "Villas", "Bookings", "Finance", "Operations", "AI assistants"].map(
              (n, i) => (
                <div
                  key={n}
                  className={`px-3 py-2 rounded-sm ${
                    i === 4
                      ? "bg-canvas border border-line-soft text-ink"
                      : "text-ink-tertiary"
                  }`}
                >
                  {n}
                </div>
              )
            )}
          </div>
          <div className="col-span-12 md:col-span-9 p-6">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <span className="text-label">Finance · March 2026</span>
                <h3 className="text-display text-[24px] leading-tight font-medium mt-2">
                  Portfolio P&amp;L
                </h3>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-xs text-success font-medium">
                <TrendingUp className="w-3.5 h-3.5" />
                +12.4% YoY
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { l: "Gross revenue", v: "Rp 13.6B" },
                { l: "OTA fees", v: "−Rp 1.8B" },
                { l: "Net owner payout", v: "Rp 7.4B" },
                { l: "Occupancy", v: "83.2%" },
              ].map((k, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line-soft p-3"
                >
                  <div className="text-label">{k.l}</div>
                  <div className="text-ink font-mono tabular-nums text-lg mt-1.5">
                    {k.v}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-sm border border-line-soft overflow-hidden">
              {[
                { villa: "Enso S5", status: "ready" as const, rev: "Rp 204.6M" },
                { villa: "Eternal 07", status: "inspection" as const, rev: "Rp 164.0M" },
                { villa: "Ahau 02", status: "checkout_pending" as const, rev: "Rp 148.8M" },
              ].map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 border-line-soft"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-ink">{r.villa}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <span className="font-mono tabular-nums text-sm text-ink">
                    {r.rev}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute -inset-x-8 -bottom-6 h-16 rounded-full blur-2xl -z-10 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)",
        }}
      />
    </motion.div>
  );
}
