# Template Request Manager

A single-screen tool for building author checklists / pre-acceptance (AIP)
letters from reusable request templates. You flag the problems in a manuscript,
adapt the wording, and export a ready-to-send letter. No build step, no
dependencies — plain HTML, CSS and JavaScript with a small Python file server.

## Two layers (the model)

- **Master Library** — the journal-wide foundation a chief editor defines once:
  the **sections** and the standard **system requests**. Authored in **Setup**.
  Keep several (one per journal) and start a new one from zero.
- **Working Library** — your own layer on top of the active master:
  which requests are **preselected**, your **adaptations** of system requests,
  **hidden** requests, and your own **custom requests**. Edited in **Settings**.

Every editor starts from the same standard package and is nudged to use it,
while still able to add or adapt for field-specific nuance — without ever
touching the shared foundation.

## Run — the easy way (no install, Mac or Windows)

Open **`dist/AIPChecks.html`** by double-clicking it. That's it — it runs in any
browser, on any computer, with **no Python and no install**. It's a single file you
can email or drop on a shared drive. Data is saved in the browser; you move it
between machines with the library / working files below.

> Regenerate that single file after editing the source with `python3 build.py`
> (writes `dist/AIPChecks.html`). End users never run the build.

## Run — the developer way (optional)

For editing the separate source files with on-disk `archive/` storage and
server-side DOCX:

```bash
python3 server.py        # → http://localhost:4173
```

or double-click **`run.command`** on macOS, then open <http://localhost:4173>.
Requires **Python 3**. Data (libraries, settings, session, exports) is written as
real files under `archive/`.

## Sharing libraries · saving & resuming work

Two kinds of `.json` file move data in and out — both via the in-app buttons, no
hand-editing:

- **Library file** (Setup ▸ **Export / Import library file**) — the journal
  foundation a chief editor builds, plus your personal layer. Send it to another
  editor; **Import** adds/updates it **without touching their current work**.
- **Working file** (top bar ▸ **Save / Open working file**) — your in-progress
  assessment. Save it to stop mid-manuscript and **Open** it later (even on another
  computer) to continue exactly where you left off.

**Export DOCX** works everywhere — the standalone file builds the Word document in
the browser; the dev server builds it in Python and also keeps a copy in
`archive/exports/`.

## Layout

Three panes:

1. **Manuscript** — load a PDF to preview alongside the checklist (collapsible).
2. **Checks** — the request picker, grouped into house sections.
3. **Letter** — the requests you flagged, as an editable stack or a structured
   preview.

## Features

### Picking checks
- **Tabs** filter the request library by audience: *EA Requests* and
  *Editor Requests*, plus *All* and *(Custom)*. Each tab
  shows a **flagged count** badge so you always know how many you've ticked.
- **Sections / Quick list** toggle: collapsible sections with descriptions, or a
  flat, dense title-only list for fast repeat work. Both respect the active tab.
- **Search** filters checks by title and text.
- **Custom request** box adds a one-off request (optionally saved to your library).

### Building the letter
- **Edit stack** — one card per request. Edit the title and text inline, with a
  **💾 save-to-library** and **✕ remove** action on each card.
- **Locked by default** (🔒). Untick the lock to edit; the icon tracks the state.
- **Order** sorts the cards into the standard section order to find items fast.
- **needs entry** — requests with a `[bracket]` fill-in (or flagged as needing a
  custom title/abstract) show a *needs entry* tick. They stay expanded until you
  tick them, so nothing gets exported half-written.
- **Structured** — read-only preview in final letter order; reorder/remove there
  too when unlocked.
- **Undo Removal** restores the last removed card; **Undo reset** restores the
  whole session after a Reset.

### Exporting
- **Copy letter** — plain-text letter to the clipboard.
- **Save working file / Open working file** — save your in-progress assessment to a
  `.json` and reopen it later to resume (see *Sharing* above). On the dev server a
  copy is also kept in `archive/`.
- **Export DOCX** — a Word table per section. Works in both the standalone file
  (built in-browser) and the dev server. The **⚠** marker lights when a *needs
  entry* request isn't ticked; click it to jump straight to that card.

### Keyboard (mouse-first, light shortcuts)
- `/` focus search · `↑`/`↓` move between visible checks · `space`/`enter` toggle
  a check · `esc` close overlays / blur a field.

### Setup, Settings & Dev mode
- **Setup** (chief-editor role) builds the **Master Library**: pick/create/rename
  libraries, edit sections, and author **system requests**. Start a library from 0.
- **Settings** (editor role) edits your **working library**: which requests are
  **preselected**, audience tags, **adaptations** of system text, hidden requests,
  your **custom requests**, and the letter intro override.
- **Dev** is a soft lock guarding protected edits — available in the top bar and
  inside Setup/Settings. It is not encryption; it just prevents accidental changes.
- **Reset** clears the selected requests and manuscript number (libraries are kept).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup and overlays |
| `app.js` | All UI logic and rendering |
| `data.js` | Code seed for the first Master Library (sections + system requests) |
| `storage.js` | Persistence (server API with `localStorage` fallback) + in-browser DOCX |
| `styles.css` | Styling |
| `server.py` | Static server + JSON store + DOCX builder (dev only) |
| `build.py` | Bundles everything into `dist/AIPChecks.html` (the no-install file) |
| `dist/AIPChecks.html` | The single self-contained app you share — runs anywhere |
| `archive/` | `masterLibraries.json`, `working.json`, sessions, checklists, exports |
