import type { GuestConciergeContext } from "./context";

/**
 * Pure deterministic fallback for the guest concierge. Used when:
 *   - ANTHROPIC_API_KEY is missing (dev / unconfigured).
 *   - AI_DRY_RUN=1 (default).
 *   - The Anthropic call failed / timed out.
 *
 * Strategy: shallow keyword routing into the configured context.
 * Never invents content. When nothing matches, points the guest at
 * the right portal page.
 */

export function buildFallbackAnswer(
  message: string,
  c: GuestConciergeContext,
): { text: string; usedKeys: string[] } {
  const m = message.toLowerCase();
  const used: string[] = [];

  // Wi-Fi / lock are intentionally NOT answered by the fallback —
  // those are caught upstream by the safety guard. If a user's
  // message somehow reaches here with those keywords, defer to the
  // portal pages.
  if (
    m.includes("wifi") ||
    m.includes("wi-fi") ||
    m.includes("internet") ||
    m.includes("password")
  ) {
    return {
      text:
        "I can't share the Wi-Fi password from chat. Open the **Wi-Fi** page from your stay menu and tap **Show password** — your stay is verified, so it'll appear instantly.",
      usedKeys: [],
    };
  }
  if (
    m.includes("door") ||
    m.includes("lock") ||
    m.includes("check in") ||
    m.includes("check-in")
  ) {
    if (
      m.includes("code") ||
      m.includes("pin") ||
      m.includes("open") ||
      m.includes("unlock")
    ) {
      return {
        text:
          "I can't show the door code in chat. Open **Check-in** from your stay menu and tap **Show door code** — it's available 24 hours before arrival.",
        usedKeys: [],
      };
    }
    const checkInSection = c.sections.find(
      (s) => s.sectionKey === "check_in" || s.sectionKey === "checkin",
    );
    if (checkInSection) {
      used.push("guide_sections");
      return {
        text: `Here's how check-in works at ${c.villaName}:\n\n${truncate(checkInSection.summary, 600)}`,
        usedKeys: used,
      };
    }
  }

  if (m.includes("rules") || m.includes("rule") || m.includes("policy")) {
    if (c.houseRules.length > 0) {
      used.push("house_rules");
      const rules = c.houseRules.slice(0, 8).map((r) => `• ${r}`).join("\n");
      return {
        text: `House rules for ${c.villaName}:\n\n${rules}`,
        usedKeys: used,
      };
    }
  }

  if (
    m.includes("eat") ||
    m.includes("food") ||
    m.includes("restaurant") ||
    m.includes("dinner") ||
    m.includes("lunch") ||
    m.includes("breakfast") ||
    m.includes("cafe") ||
    m.includes("coffee")
  ) {
    const food = c.neighborhood.filter(
      (n) =>
        n.category.toLowerCase().includes("restaurant") ||
        n.category.toLowerCase().includes("cafe") ||
        n.category.toLowerCase().includes("food"),
    );
    if (food.length > 0) {
      used.push("neighborhood");
      const list = food
        .slice(0, 5)
        .map(
          (p) =>
            `• ${p.name}${p.distanceLabel ? ` · ${p.distanceLabel}` : ""}${p.description ? ` — ${truncate(p.description, 120)}` : ""}`,
        )
        .join("\n");
      return {
        text: `A few nearby places we recommend:\n\n${list}`,
        usedKeys: used,
      };
    }
  }

  if (
    m.includes("beach") ||
    m.includes("surf") ||
    m.includes("swim") ||
    m.includes("activity") ||
    m.includes("things to do") ||
    m.includes("plan")
  ) {
    if (c.neighborhood.length > 0) {
      used.push("neighborhood");
      const list = c.neighborhood
        .slice(0, 5)
        .map(
          (p) =>
            `• ${p.name} (${p.category})${p.distanceLabel ? ` · ${p.distanceLabel}` : ""}`,
        )
        .join("\n");
      return {
        text: `Nearby spots from your villa guide:\n\n${list}`,
        usedKeys: used,
      };
    }
  }

  if (
    m.includes("emergency") ||
    m.includes("help") ||
    m.includes("doctor") ||
    m.includes("ambulance") ||
    m.includes("safety")
  ) {
    if (c.emergency.length > 0) {
      used.push("emergency_contacts");
      const list = c.emergency
        .slice(0, 6)
        .map((e) => `• ${e.label} (${e.contactType})`)
        .join("\n");
      return {
        text: `Emergency contacts on file — open the **Emergency** page in your stay menu to see numbers:\n\n${list}`,
        usedKeys: used,
      };
    }
  }

  if (
    m.includes("massage") ||
    m.includes("spa") ||
    m.includes("chef") ||
    m.includes("breakfast") ||
    m.includes("transfer") ||
    m.includes("airport") ||
    m.includes("driver") ||
    m.includes("laundry") ||
    m.includes("housekeeping") ||
    m.includes("clean") ||
    m.includes("service")
  ) {
    if (c.services.length > 0) {
      used.push("services_catalog");
      const matches = c.services
        .filter(
          (s) =>
            m.includes(s.serviceType) ||
            s.name.toLowerCase().includes(m.split(/\s+/)[0]) ||
            (s.shortDescription &&
              m
                .split(/\s+/)
                .some((w) => w.length > 3 && s.shortDescription!
                  .toLowerCase()
                  .includes(w))),
        )
        .slice(0, 4);
      const picked = matches.length > 0 ? matches : c.services.slice(0, 4);
      const list = picked
        .map(
          (s) =>
            `• **${s.name}** — ${s.shortDescription ?? s.serviceType}`,
        )
        .join("\n");
      return {
        text: `Open the **Concierge & services** page from your stay menu to request any of these:\n\n${list}\n\nYou'll see prices and confirm before submitting.`,
        usedKeys: used,
      };
    }
  }

  // Stay-info default.
  if (c.sections.length > 0) {
    used.push("guide_sections");
    const headers = c.sections
      .slice(0, 6)
      .map((s) => `• ${s.title}`)
      .join("\n");
    return {
      text: `I'm running in offline mode right now (no AI key configured), but I can point you at what's documented for ${c.villaName}:\n\n${headers}\n\nOpen the relevant page from your stay menu, or use the Concierge & services form for anything else.`,
      usedKeys: used,
    };
  }

  return {
    text: "I'm running in offline mode and don't have detailed info loaded for this villa yet. Use the Concierge & services page to send a request — staff will follow up directly.",
    usedKeys: used,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
