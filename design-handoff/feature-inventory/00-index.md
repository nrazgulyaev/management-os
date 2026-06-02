# Feature inventory — design → checklist

**Purpose.** Every function visible in the Arconique design set, written as a checklist you can diff against your live app. For each feature, mark the **Status** column:

- `✅ Have` — already built, matches the design
- `🟡 Partial` — exists but differs / incomplete
- `🔴 Missing` — not in the app yet
- `➖ Skip` — don't want it

Then hand the marked files back and we'll fold the gaps into the designs / Claude-Code prompts.

## How this was derived

Features are extracted from the **design artifacts** (what's visually specified), cross-checked against the **ground-truth route inventory** (`feature-gaps/_ground-truth-2026-05-29.md`) so the list reflects real, buildable surfaces — not fiction. Where a design feature has no backing in `main`, it's tagged `[design-only]`.

## Files

| File | Scope | Cabinets |
|---|---|---|
| `01-management-os.md` | Management OS | P1 (4) · P2 (4) · P3 (20) · new (5) |
| `02-development-os.md` | Development OS | P1 (4) · P2 (3) · P3 (16) · new (4) |
| `03-owner-portal.md` | Owner Portal | 7 |
| `04-platform-and-auth.md` | Platform Admin + Auth suite | 5 + 6 |

## Legend for tags

- `[core]` — primary workflow of the cabinet
- `[detail]` — drill-in / detail page feature
- `[ai]` — AI-agent-driven
- `[mobile]` — has a first-class mobile variant in the mobile-pass files
- `[design-only]` — specified in design, not yet backed in `main`
- `[cross]` — depends on / writes to another cabinet

## Suggested workflow

1. Open a product file (start with `01-management-os.md`).
2. Go cabinet by cabinet, mark each row's Status against your app.
3. Note anything your app does that the design **doesn't** cover (bottom "App-only extras" slot per cabinet).
4. Return the files → we reconcile: add missing-but-wanted to designs, drop skips, document deltas.
