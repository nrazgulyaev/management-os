/**
 * P116A — Static content for /stay/demo subroutes.
 *
 * Pure module — no DB, no env, no network. Drives every demo subroute
 * so the operator can click through the guest-stay portal without any
 * backend, token, or authentication.
 */

export interface DemoServiceItem {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  category: "transport" | "food" | "wellness" | "rental" | "housekeeping";
}

export const DEMO_STAY = {
  villaName: "Enso Villa S5",
  villaCode: "ES-S5",
  area: "Berawa, Canggu",
  bedrooms: 4,
  guests: 4,
  checkInLabel: "Saturday, 25 April · from 15:00 WITA",
  checkOutLabel: "Wednesday, 29 April · by 11:00 WITA",
  guestSalutation: "Mr. Martin",
  // Demo-only smart-lock placeholder. Real codes are minted server-side
  // during the active window only.
  demoLockCode: "123456",
  wifi: {
    network: "Enso-Villa-S5",
    password: "demo-bali-2026",
    note: "In production, Wi-Fi passwords are encrypted at rest and decrypted only inside this page.",
  },
  driverPhrase: {
    en: "Please take me to Enso Villa S5, Jalan Pantai Berawa, Canggu.",
    id: "Mohon antar saya ke Enso Villa S5, Jalan Pantai Berawa, Canggu.",
  },
};

export const DEMO_GUIDE_SECTIONS = [
  {
    id: "appliances",
    title: "Appliances",
    bullets: [
      "Coffee machine — capsule-based; capsules are stocked daily.",
      "Induction hob — cookware is in the lower drawer left of the sink.",
      "Oven — 200°C dial is the bake setting; convection is the fan icon.",
      "Pool pump — runs 06:00–22:00; manual override on the equipment box.",
    ],
  },
  {
    id: "ac",
    title: "Air conditioning",
    bullets: [
      "Each room has its own remote — the small icon on the bottom right toggles eco mode.",
      "Set 24°C for sleeping; lower draws disproportionate power without a measurable comfort gain.",
      "Close windows when AC is on — humidity rises fast in Bali.",
    ],
  },
  {
    id: "pool",
    title: "Pool & outdoor",
    bullets: [
      "Pool is chemically balanced daily before 09:00; please don't enter during service.",
      "Use the pool towels in the cabana — beach towels stay inside the villa.",
      "After-dark swimming is fine; underwater light switch is by the sliding door.",
    ],
  },
  {
    id: "quirks",
    title: "Bali villa quirks",
    bullets: [
      "Water pressure dips when irrigation runs (06:30–07:00). Plan showers around it.",
      "The fridge ice maker takes ~12 hours to refill after a heavy fill.",
      "Geckos are a feature, not a bug — they're harmless and eat mosquitos.",
      "Quiet hours are 22:00–07:00 — sound carries over the rice fields.",
    ],
  },
];

export const DEMO_HOUSE_RULES = [
  { title: "Smoking", body: "Outside only. Please use the ashtrays on the patio." },
  {
    title: "Parties / events",
    body: "No events without written approval. Quiet hours are 22:00–07:00.",
  },
  {
    title: "Pool safety",
    body: "Children must be supervised. The villa has no lifeguard. No glass by the pool.",
  },
  {
    title: "Staff access",
    body:
      "Housekeeping enters daily for service. Please leave the bedroom doors open if you would like service that day.",
  },
  {
    title: "Checkout",
    body: "By 11:00 WITA. Please leave keys in the lockbox; the cleaning team will reset the codes.",
  },
];

export const DEMO_NEIGHBORHOOD = [
  {
    name: "La Brisa",
    type: "Beach club",
    walkMins: 7,
    note: "Sunset cocktails — book ahead on weekends.",
  },
  {
    name: "Berawa Market",
    type: "Supermarket",
    walkMins: 4,
    note: "Open 07:00–22:00 — fresh produce, water, basics.",
  },
  {
    name: "Apotik Kimia Farma",
    type: "Pharmacy",
    walkMins: 6,
    note: "24-hour pharmacy with English-speaking staff.",
  },
  {
    name: "BCA ATM (Berawa)",
    type: "ATM",
    walkMins: 5,
    note: "Up to Rp 2.5M per withdrawal; low fee.",
  },
  {
    name: "Echo Beach",
    type: "Beach",
    walkMins: 12,
    note: "Surf-friendly beach — strong currents at low tide.",
  },
  {
    name: "Mason Berawa",
    type: "Restaurant",
    walkMins: 8,
    note: "Wood-fired Mediterranean — book the chef's counter.",
  },
  {
    name: "Crate Cafe",
    type: "Cafe",
    walkMins: 10,
    note: "Best breakfast in Berawa. Cash-friendly.",
  },
];

export const DEMO_EMERGENCY_CONTACTS = [
  { label: "Villa manager (24/7)", value: "+62 ••• ••• 12" },
  { label: "Concierge desk", value: "+62 ••• ••• 33" },
  { label: "Local police (Polsek Kuta Utara)", value: "110" },
  { label: "Ambulance", value: "118" },
  { label: "BIMC Hospital Nusa Dua", value: "+62 361 3000 911" },
];

export const DEMO_SERVICES: DemoServiceItem[] = [
  {
    id: "airport-transfer",
    name: "Airport transfer",
    description: "Premium SUV, English-speaking driver, flight tracking.",
    priceLabel: "Rp 650k",
    category: "transport",
  },
  {
    id: "private-chef",
    name: "Private chef",
    description: "4-course set menu or à la carte; book 24h ahead.",
    priceLabel: "from Rp 1.2M / pax",
    category: "food",
  },
  {
    id: "breakfast",
    name: "Breakfast in villa",
    description: "Continental, Indonesian, or plant-based.",
    priceLabel: "Rp 220k / pax",
    category: "food",
  },
  {
    id: "in-villa-massage",
    name: "In-villa massage",
    description: "Two practitioners; book 3 hours ahead.",
    priceLabel: "from Rp 450k / hr",
    category: "wellness",
  },
  {
    id: "driver-day",
    name: "Driver for the day",
    description: "10 hours, up to 100 km.",
    priceLabel: "Rp 850k",
    category: "transport",
  },
  {
    id: "playstation",
    name: "PlayStation rental",
    description: "PS5 + 4 controllers + game pack.",
    priceLabel: "Rp 250k / day",
    category: "rental",
  },
  {
    id: "extra-cleaning",
    name: "Extra cleaning",
    description: "On-demand mid-stay turnover.",
    priceLabel: "Rp 380k",
    category: "housekeeping",
  },
  {
    id: "laundry",
    name: "Laundry",
    description: "Same-day if before 10:00.",
    priceLabel: "Rp 18k / kg",
    category: "housekeeping",
  },
];

export const DEMO_REQUESTS = [
  {
    code: "REQ-A21",
    title: "Airport transfer",
    status: "Pending",
    timeline: [
      { at: "Today · 09:12", note: "You requested airport pickup for 16:30 (4 pax + 2 surfboards)." },
      { at: "Today · 09:18", note: "Concierge: confirming with driver, will revert in 15 min." },
    ],
  },
  {
    code: "REQ-B07",
    title: "Breakfast in villa",
    status: "Scheduled",
    timeline: [
      { at: "Yesterday · 18:40", note: "You ordered Indonesian breakfast for 4 at 08:30." },
      { at: "Yesterday · 18:42", note: "Concierge: scheduled. Chef arrives 07:30 to prep." },
    ],
  },
  {
    code: "REQ-C14",
    title: "AC issue — master bedroom",
    status: "Resolved",
    timeline: [
      { at: "2 days ago · 14:02", note: "You reported the master AC not cooling." },
      { at: "2 days ago · 14:30", note: "Technician arrived; cleaned filter, recharged refrigerant." },
      { at: "2 days ago · 15:10", note: "Resolved. Please let us know if the issue returns." },
    ],
  },
];

export const DEMO_CONCIERGE_PROMPTS = [
  "Where should we have dinner tonight?",
  "Can we book breakfast for 4 tomorrow at 08:30?",
  "What is the checkout time?",
  "How do I get from the airport to the villa?",
  "Is there a doctor on call?",
];

export const DEMO_CONCIERGE_REPLIES: Record<string, string> = {
  default:
    "Demo concierge response. In production this is answered by Claude with retrieval over the villa guide, neighborhood, services catalog, and your stay context.",
  dinner:
    "Mason Berawa is 8 minutes by foot — wood-fired Mediterranean, great chef's counter. Crate is closer (10 min) and better for casual / cash. Want me to book?",
  breakfast:
    "Indonesian breakfast for 4 at 08:30 tomorrow — got it. The chef will arrive at 07:30 to prep. I'll send a confirmation in a moment.",
  checkout:
    "Checkout is 11:00 WITA. Late checkout (until 14:00) is sometimes available — want me to ask?",
  airport:
    "Drive to Berawa — about 50 min in light traffic, 90 min during peak. Your driver phrase: \"Mohon antar saya ke Enso Villa S5, Jalan Pantai Berawa, Canggu.\"",
  doctor:
    "BIMC Nusa Dua has 24/7 English-speaking staff (+62 361 3000 911). For non-urgent, the apotek across the road can refer.",
};
