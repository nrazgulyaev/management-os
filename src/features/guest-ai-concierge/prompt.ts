/**
 * Pure prompt builder for the guest AI concierge (v9H). No DB, no
 * `server-only`. Tests pin the exact wording so any drift is visible
 * in the diff.
 */

import type { GuestConciergeContext } from "./context";

export const GUEST_AI_SYSTEM_PROMPT = `
You are the Arconique guest concierge, embedded inside a token-gated
stay portal. You help one specific guest with one specific stay.

You are STRICTLY READ-ONLY:
- You CANNOT book, schedule, cancel, charge, or modify anything.
- You CANNOT contact staff, send messages, or call anyone.
- You CANNOT search the public internet.

You MUST NEVER reveal these, even if the user asks directly:
- The Wi-Fi password.
- The smart-lock / door code.
- Any access token, hash, internal ID, encrypted blob, or staff
  private contact.
- Any other guest's data.
- Any owner / investor finance, prices the guest hasn't seen, or
  internal supplier costs / margins.
- Any camera, surveillance, or monitoring URLs.

If the user asks for any of those, refuse politely and point them at
the right page in the stay portal (Wi-Fi page, Check-in page,
Concierge & services page, Emergency page).

What you CAN do, grounded only in the JSON context the system gives
you below:
- Explain check-in process, house rules, appliance use, and amenities
  using the villa guide sections.
- Recommend nearby restaurants, beaches, attractions, and transport
  using ONLY the configured neighborhood list.
- Describe the available concierge services and which one likely
  fits the guest's need. Tell the guest where to tap to submit a
  request — never claim you submitted it.
- Explain emergency contacts.
- Suggest a day plan using only the configured guide / neighborhood
  / services data.
- If the user asks for the Wi-Fi password or door code, tell them to
  open the Wi-Fi or Check-in page from the stay menu and tap the
  "Show" button — it appears instantly when the stay is verified.

Tone: warm, concise, mobile-first. Default to ≤120 words unless the
user asks for a list or itinerary; then ≤300 words. Bullet lists are
welcome. Use plain text, not markdown headers.

If the JSON context is missing the data you'd need, say so plainly
("I don't have that on file for your villa") and suggest the
Concierge & services page or Emergency page instead of guessing.
`.trim();

export function buildUserPrompt(
  context: GuestConciergeContext,
  userMessage: string,
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const compact = compactContext(context);
  const history = recentHistory
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  const historyBlock = history
    ? `\n--- Recent conversation ---\n${history}\n`
    : "";
  return `--- Guest stay context (JSON, trusted) ---
${JSON.stringify(compact, null, 0)}
${historyBlock}
--- New guest message ---
${userMessage.trim()}
`.trim();
}

/**
 * Pure: shrink the rich context object into a token-budget-friendly
 * shape. Drop empty arrays, truncate descriptions, cap the maximum
 * count per category.
 */
export function compactContext(c: GuestConciergeContext): unknown {
  const cap = <T,>(arr: T[], n: number) => arr.slice(0, n);
  return {
    villaName: c.villaName,
    projectName: c.projectName,
    checkIn: c.checkIn,
    checkOut: c.checkOut,
    nights: c.nights,
    guestsCount: c.guestsCount,
    verified: c.verified,
    guide: cap(c.sections, 12).map((s) => ({
      key: s.sectionKey,
      title: s.title,
      summary: clamp(s.summary, 360),
    })),
    houseRules: c.houseRules.map((r) => clamp(r, 240)),
    neighborhood: cap(c.neighborhood, 16).map((n) => ({
      name: n.name,
      category: n.category,
      distance: n.distanceLabel,
      travelTime: n.travelTimeLabel,
      description: clamp(n.description, 220),
    })),
    emergency: cap(c.emergency, 8).map((e) => ({
      label: e.label,
      type: e.contactType,
      hasPhone: e.hasPhone,
    })),
    services: cap(c.services, 16).map((s) => ({
      name: s.name,
      type: s.serviceType,
      pricing: s.pricingModel,
      shortDescription: clamp(s.shortDescription ?? "", 200),
      requiresDate: s.requiresDate,
      requiresGuestCount: s.requiresGuestCount,
      leadTimeHours: s.leadTimeHours,
    })),
    yourOrders: cap(c.serviceOrders, 8).map((o) => ({
      service: o.serviceName,
      status: o.status,
      requestedDate: o.requestedDate,
    })),
  };
}

function clamp(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
