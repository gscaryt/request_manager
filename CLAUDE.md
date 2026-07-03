# CLAUDE.md — Template Request Manager

Tool for journal editorial staff: flag problems in a manuscript, pick/adapt
reusable request templates, export an author letter (DOCX/clipboard).
~300 target users, install-free, zero backend — everything runs in the browser
and all data stays on the user's computer.

## Hard constraints

- **Vanilla JS/HTML/CSS only. No frameworks, no npm, no build toolchain.**
  The dev machine has python3 (3.9) but no node and no brew.
- **No publisher/journal identifiers in any committed file.** The repo is
  public (GitHub Pages). Use "journal" generically. Real journal libraries are
  distributed as `.json` files and live only in the gitignored `archive/`.
- `archive/` is runtime/user data — never commit it.
- The app must keep working in three modes with the same code:
  1. GitHub Pages / any static server → localStorage persistence,
     in-browser DOCX ("offline (no server)" mode).
  2. `python3 server.py` (dev) → real files under `archive/`, server DOCX.
  3. `dist/AIPChecks.html` — single self-contained file, double-clicked
     from disk. Regenerate with `python3 build.py` after ANY src change.
- Keep code style: plain functions, event delegation, innerHTML renders,
  `escapeHtml()` on all interpolated user data.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup + Settings/Setup overlays |
| `state.js` | Constants, persisted state, migrations, library/selected-item accessors and mutations |
| `checklist.js` | Middle pane: tab bar, category/quick list, custom-request add form |
| `letter.js` | Right pane: Edit-stack/Structured letter, footer, export text (letterText/letterGroups) |
| `overlays.js` | Settings overlay, Setup overlay, role picker, top "⋯" menu |
| `main.js` | Entry point: `el` DOM-ref cache, `render()` orchestrator, init, PDF pane, global shortcuts |
| `data.js` | Small generic example seed library (18 requests) |
| `storage.js` | Persistence (server API w/ localStorage fallback) + in-browser DOCX/ZIP |
| `styles.css` | Styling |
| `server.py` | Dev-only static server + JSON store + DOCX builder |
| `build.py` | Inlines everything into `dist/AIPChecks.html` |

## Data model (two layers)

- **Master Library** = journal foundation: `{ id, name, intro, sections[],
  requests[] }`. Requests: `{ id, section, title, body, groups[] }` where
  `groups` ⊆ `["ea","editor"]` (who uses it: Assistant Editor or Editor).
  `[bracketed]` tokens in bodies are fill-ins ("needs entry").
  Edited in **Setup** (Director role). "Reporting Summary" is a SECTION,
  not a tab — `migrateMaster()` in state.js converts old data.
- **Working Layer** (one per master, in `working.layers[masterId]`):
  `preselected[]`, `adaptations{}` + `adaptationTitles{}` (personal rewording
  of system requests — original never lost), `hidden[]`, `tagOverrides{}`,
  `personalRequests[]` (custom requests), `introOverride`.
  Edited in **Settings** (each user's own layer).
- **Session** = current letter: `selected[]` cards, manuscript no.
- File exchange: **Library file** (Setup export/import — the foundation a
  Director distributes), **Working file** (full-state handoff between
  Assistant Editor and Editor).

## Roles (the vision — being implemented in chunks)

- **Director/Manager**: authors the Master Library, distributes it.
- **Editor**: never edits the foundation; adapts wording, saves personal
  custom requests, preselects their usual set.
- **Assistant Editor (EA)**: own standardized request set; runs the first
  check pass, hands off a working file to the Editor.
- Roles are UI decluttering, NOT security (client-side app; none possible).

## Refactor roadmap (do in order, one chunk per session is fine)

0. ✅ Git + GitHub Pages (live at gscaryt.github.io/request_manager).
1. ✅ RS-tab → section; generic example seed; migrations.
2. ✅ Role picker (Director/Editor/AE) replaces the Dev-password soft lock
   entirely; default tab + Setup visibility by role; Settings never locked.
3. ✅ Top bar cleanup: Setup/Reset/role into a "⋯" menu; add "data is saved in
   this browser — keep a library file as backup" note.
4. ✅ Adaptation UX: editor shows journal original read-only + Revert inline.
5. ✅ Letter pane: cards grouped under collapsible section headers, collapsed
   by default except needs-entry.
6. ✅ Split app.js into modules (state/checklist/letter/overlays/main);
   extend build.py accordingly.

## Working on this repo

- Dev server: `.claude/launch.json` → `aip` (server.py :4173, writes
  `archive/`) and `static` (:8099, mimics the Pages/no-server mode).
- Verify both modes after changes; check the browser console for errors.
- After changing src: `python3 build.py`, commit `dist/` along with src.
- Before any push: `grep -ri` committed files for journal/publisher names.
- gh CLI lives at `~/bin/gh` (not on PATH).
