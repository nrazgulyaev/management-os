# Visual regression — public landings (Task 10)

Full-page screenshot diffing for the public marketing landings at three
viewports (desktop 1280 / tablet 768 / mobile 390), per the redesign plan
(`_handoff/CLAUDE-CODE-TASKS.md` → Task 10, item 5).

- Spec: `public-landings.spec.ts`
- Config: `../../playwright.visual.config.ts`
- Baselines: `public-landings.spec.ts-snapshots/<name>-<project>.png` (committed)
- CI: `.github/workflows/visual-regression.yml` — diffs on every PR that
  touches public pages / styles / components; generate baselines by running
  that workflow with `update = true` and committing the uploaded artifact.

## Why baselines aren't committed yet

Screenshots are rendering-environment specific (fonts via `next/font` need
network at build, antialiasing differs per OS). They must be generated against
a real prod server, not in the agent sandbox. Generate them once on the
reference machine / CI and commit the `*-snapshots/` directory.

## Generate / refresh baselines

```bash
# 1. Build + start the app (prod mode, fonts fetched)
npm run build
PORT=3101 npm start &        # or: npm run dev  (port 3000 → set BASE_URL accordingly)

# 2. Capture baselines
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:update

# 3. Review + commit the generated tests/visual/*-snapshots/ PNGs
```

## Run the comparison (CI / local)

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual
```

Tolerance: `maxDiffPixelRatio: 0.02` (set in the config) — small antialiasing
noise passes; real layout drift fails. Tighten once baselines are stable.

## Add a landing

Append `{ name, path }` to `LANDINGS` in `public-landings.spec.ts`, then
re-run `test:visual:update` to capture its baseline.
