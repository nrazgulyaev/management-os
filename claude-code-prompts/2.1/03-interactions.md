# PR 3 · Interactions

# Task — Phase 2.1 PR 3 — Modal + Command palette

Two interaction primitives. References:
- _handoff/templates/modal.html
- _handoff/templates/cmd-k.html

## A — Modal

### Files
- `src/components/ui/modal.tsx` — wraps `@radix-ui/react-dialog` (already a dep)
- Exports: `<Modal>`, `<ModalHeader>`, `<ModalBody>`, `<ModalFooter>`, `<ModalSteps>` (multi-step indicator)
- Convenience: `<ConfirmModal>`, `<DestructiveConfirmModal>`

### Props

```typescript
type ModalProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  size?: "sm" | "md" | "lg";   // default md
  dirty?: boolean;             // enables discard-guard
  onDiscard?(): void;
  children: ReactNode;
};

type ConfirmModalProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;        // default "Cancel"
  intent?: "confirm" | "destructive";  // default "confirm"
  onConfirm(): void | Promise<void>;
};
```

### Behavior
- Default focus: form intent → first input, confirm → confirm button, destructive → Cancel button. Use Radix's `onOpenAutoFocus` + a ref.
- Dirty guard: intercept Radix's `onPointerDownOutside` + `onEscapeKeyDown`. If `dirty`, `preventDefault()` and show internal sub-confirm "Discard 3 unsaved changes?"
- Sizes: sm 400, md 560, lg 760. Mobile: full-width minus 16px margin, max-height 92vh.
- Open animation: backdrop fade 180ms, dialog scale 0.96 → 1 + fade 220ms cubic-bezier(.22,1,.36,1). Honor prefers-reduced-motion.

### CSS
New section in `src/styles/components.css`:
- `.modal-overlay` (backdrop)
- `.modal`, `.modal.sm/.md/.lg`
- `.modal-head`, `.modal-head .glyph` (with `.warn`/`.danger`/`.accent` tones)
- `.modal-body`, `.modal-foot`, `.modal-steps`
All scoped `[data-product]`.

### Apply (proof-of-life)
- Wire "New booking" CTA in `src/app/(dashboard)/dashboard/bookings/page.tsx` to open a `<Modal size="md">` form (5 fields, ⌘+Enter shortcut).
- Wire "Cancel booking" action in bulk bar to open `<DestructiveConfirmModal>`.

## B — Command palette (⌘K)

### Files
- `src/components/command-palette.tsx` — client (keyboard handler + Radix Dialog wrapper)
- `src/components/command-palette-provider.tsx` — mounts global ⌘K listener once
- `src/features/command-palette/sources.ts` — `getCommandSources(ctx) => { records, actions, navigation }`
- `src/features/command-palette/use-search-index.ts` — FlexSearch hook, fetches `/api/command-palette/index`
- `src/app/api/command-palette/index/route.ts` — returns tenant-visible records (villas, bookings, owners, statements, projects). Cap 10k newest.

Add FlexSearch to deps: `npm install flexsearch` (small, ~13kb gzip).

### Per-page action registry
Each cabinet exports `commandActions` from a co-located file. Pattern:

```typescript
// src/app/(dashboard)/dashboard/bookings/_command-actions.ts
import type { CommandAction } from "@/features/command-palette/types";
export const commandActions: CommandAction[] = [
  { id: "new-booking", label: "New booking", kbd: "⌘N",
    run: (router) => router.push("/dashboard/bookings/new") },
  { id: "export", label: "Export current view", kbd: "⌘E",
    run: (ctx) => ctx.exportCsv() },
];
```

`getCommandSources` dynamically imports these based on current pathname.

### Mount
In `src/app/layout.tsx` root: `<CommandPaletteProvider>{children}</CommandPaletteProvider>`.

### CSS
New section in `src/styles/components.css`:
- `.ck` (palette container), `.ck-input`, `.ck-body`
- `.ck-group`, `.ck-gt` (group title)
- `.ck-item`, `.ck-item.on`
- `.ck-foot`
All scoped `[data-product]`.

### Behavior
- Trigger: `⌘K` (Mac) / `Ctrl+K` (others). Also bind to topbar search input click.
- Keys: ↑↓ navigate, ↵ open, ⌘↵ open in new tab, Esc close, ⇧+↑↓ skip across groups.
- Prefixes: `>` actions only, `@` records only, `/` nav only.
- Search latency target: ≤30ms for ≤10k records (FlexSearch handles this).
- Highlight: wrap matched substrings in `<mark>` with accent-tint bg.
- Recents: localStorage `arconique.recents.{userId}`, max 20, pushed on every detail-page open.
- Telemetry: emit `command_palette_opened` + `command_palette_action_chosen` via existing `src/lib/telemetry.ts`.

### Apply (proof-of-life)
- Mounted in root layout — works on every route.
- Add `_command-actions.ts` for `dashboard/bookings` (2 actions: New booking, Export).
- Test by pressing ⌘K on `/dashboard/bookings`: should see those 2 actions in "In this view".

## Validation

- `npm run typecheck` clean
- `npm run lint` clean
- `npm run smoke:routes` clean
- Open `/dashboard/bookings` → press ⌘K → palette opens centered, idle state shows actions + recents.
- Type "whit" → should see fuzzy results across records (after backend index populated; if empty in dev, mock 5 entries).
- Click "New booking" in bookings page → modal opens centered with backdrop. Esc closes. Click outside closes.

## Commit

PR title: `phase-2.1(interactions): modal (Radix) + ⌘K command palette (FlexSearch)`

---
