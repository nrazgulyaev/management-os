# Arconique — pixel-fidelity build prompts for Claude Code

This folder turns every design in the workspace into a **paste-ready Claude Code prompt** that drives
**pixel-for-pixel** implementation in the live repo `nrazgulyaev/management-os@main`, using the real
Layer-B tokens and primitives.

## How to use (every session)

1. Open **`00-MASTER.md`** — the global contract (token tables, primitive map, hard rules, pixel-verify loop).
2. Pick the one per-screen prompt for the cabinet you're building.
3. Paste **`00-MASTER.md` + that one prompt** into Claude Code together.
4. Claude Code opens the named **mockup HTML** (the pixel source of truth), reads its in-page
   `anchor-nav` + `#spec`, implements with primitives/tokens, then runs the **screenshot-diff loop**
   (build → screenshot at 1366px / 390px → diff against the mockup → iterate).
5. One cabinet per PR. Done = MASTER §7 checklist passes.

> **Why this gets pixel-perfect where raw HTML didn't:** Claude Code wasn't matching because it had to
> *translate* a one-off HTML mockup into the repo's component/token system and was free-guessing the gaps.
> These prompts close every gap: the exact token values (§2), the exact primitive each block maps to (§3),
> the real route, and a screenshot-diff acceptance loop (§6). The mockup stays the visual truth; the system
> stays the implementation truth.

## The visual target = the mockup files themselves
No separate reference PNGs. The **mockup HTML is the pixel target** — Claude Code opens it at the exact
reference width (desktop 1366px, mobile 390px) and diffs against its own build. Live HTML beats a flat
screenshot because it can be inspected at 1:1 and its computed values read directly.

## Index (48 prompts)

### Foundations — the system itself (read before any cabinet)
- `foundations/01-design-system.md` — tokens + all base primitives (canonical reference)
- `foundations/02-ds-2.4-primitives.md` — ChannelGrid · PricingCurve · StoryboardLog · PipelineBoard · WaterfallChart
- `templates/01-templates.md` — the 8 universal Phase-2.1 template primitives

### Management OS (18) — `[data-product="management"]`
P1: `01-bookings` · `02-finance` · `03-operations` · `04-owners`
P2: `05-channels` · `06-dynamic-pricing` · `07-front-office` · `08-concierge`
P3 clusters: `09-cluster-guest-stays` · `10-cluster-distribution-payments` · `11-cluster-portfolio` · `12-cluster-security-system` · `13-cluster-availability-intelligence`
New: `14-workspace` · `15-documents` · `16-inventory-procurement` · `17-owner-intelligence` · `18-utilities`

### Development OS (15) — `[data-product="development"]`
P1: `01-projects` · `02-cfo` · `03-boq-qs` · `04-procurement`
P2: `05-sales` · `06-investors` · `07-site-supervisor`
P3 clusters: `08-cluster-dev-finance` · `09-cluster-dev-contracts` · `10-cluster-dev-knowledge` · `11-cluster-dev-ops`
New: `12-workspace` · `13-executive` · `14-marketing` · `15-warehouse`

### Owner Portal (7) — `[data-product="owner"]`
`01-home` · `02-statements` · `03-villas` · `04-calendar` · `05-inbox` · `06-documents` · `07-settings`

### Other systems
- `platform/01-platform-console.md` — Platform Admin (dark cool-blue theme)
- `auth/01-auth-suite.md` — Auth Suite (6 platforms, 8 screen types)
- `mobile/01-mobile-passes.md` — the 9 mobile passes (first-class mobile targets)

### New surfaces — out-of-scope wave (confirm greenlight first)
- `guest/01-stay-portal.md` — Guest Stay Portal (public, mobile-first, 8 screens)
- `investor/01-investor-portal.md` — Investor Portal (LP-facing, 7 screens)

## Notes
- **Almost everything is already built** in `main` (mgmt 299 files, dev 58 roots, owner 21 pages). These
  are **redesign** prompts — restyle to the mockup, keep the existing data wiring.
- Routes come from `feature-gaps/_ground-truth-2026-05-29.md` (GitHub-verified).
- Agent fiction: several design docs named agents that don't exist as `agent_configurations` rows. Each
  prompt flags the fictional ones — use the real roster (see MASTER / ground-truth).
- Tables now exist for the deferred data (`drizzle/0112–0115`) — prompts point at them where relevant.
