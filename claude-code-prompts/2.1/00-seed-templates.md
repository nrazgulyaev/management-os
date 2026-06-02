# PR 0 · Seed templates

# Task — Phase 2.1 PR 0 — Seed templates as reference

Copy the 8 design template HTML files from the app.arconique.com design project into the repo as reference material for the following PRs. No code logic — just adds files.

Source files (design project):

I'll attach 9 files (8 templates + chrome.css). Save them under:

  _handoff/templates/index.html
  _handoff/templates/chrome.css
  _handoff/templates/mobile-tabbar.html
  _handoff/templates/empty-state.html
  _handoff/templates/pagination.html
  _handoff/templates/list-filter.html
  _handoff/templates/detail-page.html
  _handoff/templates/modal.html
  _handoff/templates/ai-agent.html
  _handoff/templates/cmd-k.html

These files contain:
- The full visual spec for each template (HTML/CSS rendering the design at 1400px)
- A "Spec" table at the bottom of each with exact sizes, behavior contracts, breakpoints
- A "For Claude Code" table at the bottom of each with: exact file paths to create, prop shapes, CSS module to extend, where to apply first

For each subsequent PR (1–4), open the matching `_handoff/templates/<name>.html` and treat the "Spec" + "For Claude Code" sections as the contract.

Validation:
- All 9 files present in _handoff/templates/
- `npm run typecheck` still clean (no code changed)

Commit: `phase-2.1(seed): import 8 universal templates as reference material`
```

**Прежде чем отдавать промт — приложи файлы вручную:** в Claude Code drag-and-drop из этого проекта 9 файлов:

```
templates/index.html
templates/chrome.css
templates/mobile-tabbar.html
templates/empty-state.html
templates/pagination.html
templates/list-filter.html
templates/detail-page.html
templates/modal.html
templates/ai-agent.html
templates/cmd-k.html

(или Claude Code может скачать их из тебя через `get_public_file_url` если у вас есть mechanism — но проще просто drop'нуть).

---
