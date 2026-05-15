# /public/landing — landing-page asset registry

These files are **placeholder gradients** rendered by
`scripts/gen-landing-placeholders.js` (sharp + SVG → webp). They give
the layout something to lay out against while the operator sources
real photography (likely via Seedance-style AI image generation or
on-site shoots).

## Swap workflow

Drop a new file with the same name into this folder. Next.js
hot-reloads dev (`next dev`) and rebuilds prod (`next build`) — no
code change required. Filenames are referenced directly by the
`/products/management-os` and `/products/development-os` pages.

## Asset table

| File | Dimensions | Purpose | Recommended real content |
| --- | ---: | --- | --- |
| `hero-villa-golden.webp` | 2400 × 1600 | Management-OS hero background | Aerial dusk shot of a Bali pool villa with golden-hour sky |
| `hero-construction-sunrise.webp` | 2400 × 1600 | Development-OS hero background | Construction site at sunrise with cranes / framing visible |
| `bg-clouds-loop.mp4` | n/a | Optional muted/looped hero video fallback | 6–8s loop, ≤2 MB, time-lapse cloud or water shot |
| `phone-housekeeping.webp` | 480 × 980 | Phone mockup screenshot in the management mid-band | Real screenshot of the housekeeping mobile PWA |
| `laptop-investor.webp` | 1200 × 800 | Laptop mockup in the development mid-band | Real screenshot of the investor-portal dashboard |
| `cabinet-preview-frontoffice.webp` | 320 × 480 | Cabinet rail card (Mgmt) | Front-office cabinet apex screenshot |
| `cabinet-preview-concierge.webp` | 320 × 480 | Cabinet rail card (Mgmt) | Concierge cabinet apex screenshot |
| `cabinet-preview-owner.webp` | 320 × 480 | Cabinet rail card (Mgmt) | Owner portal screenshot |
| `cabinet-preview-housekeeping.webp` | 320 × 480 | Cabinet rail card (Mgmt) | Housekeeping cabinet apex screenshot |
| `cabinet-preview-security.webp` | 320 × 480 | Cabinet rail card (Mgmt) | Security cabinet apex screenshot |
| `cabinet-preview-cfo.webp` | 320 × 480 | Cabinet rail card (Dev) | CFO bookkeeper cabinet apex screenshot |
| `cabinet-preview-qs.webp` | 320 × 480 | Cabinet rail card (Dev) | QS / Cost Analyst cabinet apex screenshot |
| `cabinet-preview-pm.webp` | 320 × 480 | Cabinet rail card (Dev) | Project Manager cabinet apex screenshot |
| `cabinet-preview-procurement.webp` | 320 × 480 | Cabinet rail card (Dev) | Procurement Manager cabinet apex screenshot |
| `cabinet-preview-sitesupervisor.webp` | 320 × 480 | Cabinet rail card (Dev) | Site Supervisor cabinet apex screenshot |
| `cabinet-preview-investor.webp` | 320 × 480 | Cabinet rail card (Dev) | Investor Portal dashboard screenshot |
| `feature-channel-manager.webp` | 1200 × 800 | Mgmt feature page mockup | Booking + Airbnb inbox screenshot |
| `feature-owner-statements.webp` | 1200 × 800 | Mgmt feature page mockup | Sample monthly owner statement PDF preview |
| `feature-concierge-ai.webp` | 1200 × 800 | Mgmt feature page mockup | Guest WhatsApp thread with concierge AI |
| `feature-cleaner-pwa.webp` | 1200 × 800 | Mgmt feature page mockup | Mobile PWA on a phone with photo upload state |
| `feature-direct-booking.webp` | 1200 × 800 | Mgmt feature page mockup | Branded direct-booking site checkout view |
| `feature-security.webp` | 1200 × 800 | Mgmt feature page mockup | Security patrol log + camera registry view |
| `feature-boq-tracking.webp` | 1200 × 800 | Dev feature page mockup | BOQ spreadsheet with variance flag |
| `feature-ai-cost-analyst.webp` | 1200 × 800 | Dev feature page mockup | qs-cost-analyst output card with anomaly call-out |
| `feature-qa-qc.webp` | 1200 × 800 | Dev feature page mockup | Photo-evidence QA inspection thread |
| `feature-procurement-rfq.webp` | 1200 × 800 | Dev feature page mockup | RFQ matrix with 5 supplier columns |
| `feature-investor-portal.webp` | 1200 × 800 | Dev feature page mockup | Investor portal capital-flow waterfall screenshot |
| `feature-site-supervisor-pwa.webp` | 1200 × 800 | Dev feature page mockup | Site supervisor PWA with voice-note + photo state |

## Format guidance

- **Preferred:** `webp`, quality 70–85, no animation
- **Fallback:** `jpg`, quality 80 (only if a webp encoder is
  unavailable — Next/Image will serve the same file)
- **No PNGs** at hero scale (LCP cost too high)

## Regenerating placeholders

```sh
node scripts/gen-landing-placeholders.js
```

The script is idempotent — it overwrites whatever is in this folder
with fresh gradient placeholders. Real assets dropped on top stay
until the script is re-run.
