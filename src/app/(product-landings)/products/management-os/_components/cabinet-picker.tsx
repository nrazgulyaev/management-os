"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Sprint _handoff/ Task 3 — cabinet picker client island.
 *
 * Port of `CabinetsSection` + `CabinetPreview` from
 * `_handoff/management.html` (landing.js). The interactive picker keeps
 * `useState` on the client; everything else on /products/management-os
 * stays server-rendered.
 */

type Cabinet = {
  key: "front" | "housekeeping" | "concierge" | "finance" | "owner";
  name: string;
  desc: string;
  icon: React.ReactNode;
  accent: string;
  to?: string;
};

const CABINETS: Cabinet[] = [
  {
    key: "front",
    name: "Front Office",
    desc:
      "Tonight, arrivals, departures, readiness — the morning briefing every operator needs.",
    icon: <KeyIcon />,
    accent: "var(--forest)",
    to: "/dashboard",
  },
  {
    key: "housekeeping",
    name: "Housekeeping",
    desc:
      "Today's turnovers, photo evidence, supply runs. Mobile-first, offline-capable.",
    icon: <SparkIcon />,
    accent: "var(--terra)",
    to: "/dashboard/housekeeping",
  },
  {
    key: "concierge",
    name: "Concierge",
    desc:
      "All guest conversations, the AI's handoffs, every service request in one inbox.",
    icon: <MsgIcon />,
    accent: "var(--gold)",
    to: "/dashboard/concierge",
  },
  {
    key: "finance",
    name: "Finance",
    desc:
      "Bookings, channel fees, ops costs, owner statements, distributions — reconciled.",
    icon: <ReceiptIcon />,
    accent: "var(--forest)",
    to: "/dashboard/finance",
  },
  {
    key: "owner",
    name: "Owner Portal",
    desc:
      "What owners see: statements, distributions, owner-stay quotas, transparency.",
    icon: <UserIcon />,
    accent: "var(--terra)",
    to: "/owner",
  },
];

const PREVIEW_BG: Record<Cabinet["key"], string> = {
  front:
    "radial-gradient(120% 80% at 50% 80%, rgba(31,58,51,0.45), transparent 60%), linear-gradient(180deg, #c89e6c 0%, #a17a4a 45%, #5e4628 100%)",
  housekeeping:
    "linear-gradient(160deg, #e5d2b2 0%, #b78f5d 100%)",
  concierge:
    "linear-gradient(180deg, #4a7264 0%, #2c4a40 100%)",
  finance:
    "linear-gradient(160deg, #d8c19a 0%, #c2986a 38%, #a07645 100%)",
  owner:
    "radial-gradient(120% 80% at 50% 80%, rgba(31,58,51,0.45), transparent 60%), linear-gradient(180deg, #c89e6c 0%, #a17a4a 45%, #5e4628 100%)",
};

const TILE_DATA: Record<Cabinet["key"], [string, string, string][]> = {
  front: [
    ["Tonight", "23/28", "82%"],
    ["Arrivals", "6", "100% ready"],
    ["VIP", "2", "in-house"],
  ],
  housekeeping: [
    ["Open tasks", "14", "↓ 3 vs yest."],
    ["Photo missed", "0", "—"],
    ["Supplies", "6", "to procure"],
  ],
  concierge: [
    ["AI sessions", "18", "live"],
    ["Handoffs", "3", "queue"],
    ["CSAT", "4.9", "30-day"],
  ],
  finance: [
    ["MTD revenue", "$214K", "+12%"],
    ["To owners", "$138K", "Oct prep"],
    ["Net margin", "27%", "YTD"],
  ],
  owner: [
    ["Net to me", "$11,800", "Oct"],
    ["Occupancy", "78%", "30-day"],
    ["Owner nights", "4/14", "used"],
  ],
};

export function CabinetPicker() {
  const [active, setActive] = React.useState(0);
  const a = CABINETS[active];
  const tiles = TILE_DATA[a.key];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 32 }}>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {CABINETS.map((c, i) => {
          const isActive = i === active;
          return (
            <li key={c.key}>
              <button
                onClick={() => setActive(i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "18px 20px",
                  border: "1px solid",
                  borderColor: isActive ? "var(--ink)" : "var(--line-soft)",
                  background: isActive ? "var(--paper)" : "transparent",
                  borderRadius: 12,
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  transition: "all .15s ease",
                  cursor: "pointer",
                  font: "inherit",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    background: isActive ? c.accent : "var(--cream-deep)",
                    color: isActive ? "var(--cream-warm)" : "var(--ink-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-newsreader), serif",
                      fontSize: 20,
                      lineHeight: 1.1,
                      marginBottom: 4,
                    }}
                  >
                    {c.name}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: "var(--ink-3)",
                      lineHeight: 1.4,
                    }}
                  >
                    {c.desc}
                  </span>
                </span>
                {c.to && isActive && (
                  <span style={{ color: "var(--terra)" }}>
                    <ArrowIcon width={18} height={18} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div
        style={{
          position: "relative",
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid var(--line)",
          minHeight: 520,
          background: "var(--paper)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: PREVIEW_BG[a.key],
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 40%, rgba(20,32,28,0.85) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 32,
            left: 32,
            right: 32,
            display: "flex",
            gap: 12,
          }}
        >
          {tiles.map((t) => (
            <div
              key={t[0]}
              style={{
                flex: 1,
                background: "rgba(255,252,247,0.92)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(218,210,192,0.5)",
                borderRadius: 14,
                padding: "14px 16px",
                boxShadow: "0 16px 40px -20px rgba(20,32,28,0.4)",
              }}
            >
              <div className="label">{t[0]}</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span className="num" style={{ fontSize: 22, color: "var(--ink)" }}>
                  {t[1]}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t[2]}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 32,
            right: 32,
            bottom: 32,
            color: "var(--cream-warm)",
          }}
        >
          <div className="label" style={{ color: "rgba(255,252,247,0.7)" }}>
            Cabinet — {a.name}
          </div>
          <h3
            className="display"
            style={{ fontSize: 42, margin: "6px 0 14px", maxWidth: 520 }}
          >
            {a.desc.split(".")[0]}.
          </h3>
          {a.to && (
            <Link href={a.to} className="btn btn-terra">
              Open {a.name} demo <ArrowIcon width={15} height={15} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// Local inline icons (keeping this island self-contained so the page.tsx
// doesn't have to export its private Icons object).
type IconProps = { width?: number | string; height?: number | string };
function ArrowIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function KeyIcon(p: IconProps = {}) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 13l9-9m-3 3l2 2" />
    </svg>
  );
}
function SparkIcon(p: IconProps = {}) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    </svg>
  );
}
function MsgIcon(p: IconProps = {}) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M21 12a8 8 0 0 1-12.2 6.8L3 20l1.2-5.8A8 8 0 1 1 21 12z" />
    </svg>
  );
}
function ReceiptIcon(p: IconProps = {}) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M5 3v18l3-2 3 2 3-2 3 2 3-2V3l-3 2-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" />
    </svg>
  );
}
function UserIcon(p: IconProps = {}) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c2-4 6-5 8-5s6 1 8 5" />
    </svg>
  );
}
