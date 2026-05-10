# Slim per-page report — for 🟢 Working / 🆕 Empty pages

Used for pages that pass the audit cleanly OR are placeholders with
nothing more to inspect. Reduces audit-doc volume without losing
visibility.

If a page surfaces ANY 🔴/🟡 finding during the walk, switch to the
full template instead.

```markdown
## `/dashboard/{path}/{page}`

**Status**: 🟢 Working | 🆕 Empty
**Severity**: P3 (polish-only) | n/a (not built)
**Source**: `src/app/(dashboard)/dashboard/{path}/{page}/page.tsx`

- Production: `200` · console errors `0` · CTAs `[+Add, ...]`
- Layout: `[uses 10.D primitives | legacy PageHeader+MetricCard]`
- Add / Edit / Delete: `[modal | /new | works | missing | n/a]`
- Demo data: `[rich | minimal | empty]`
- Vibe vs reference: `[match | partial | no | n/a]`
- Notes: 1-2 sentences if anything noteworthy; otherwise omit.
```

Use the full template
([`_per-page-report-template.md`](_per-page-report-template.md)) for
🔴 Broken / 🟡 Half-built / pages with any operator-flagged behavior.
