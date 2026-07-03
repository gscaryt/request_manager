import { seedMasterLibrary, DEFAULT_INTRO } from "./data.js";
import * as store from "./storage.js";

// Two layers:
//   Master Library  — the journal-wide foundation (sections + system requests), edited in Setup.
//   Working Library — one personal layer per master: preselected, adaptations, hidden, personal requests.
// `sections` and `templates` below are derived from the ACTIVE master library (see syncLibrary).

// Middle-pane tabs. 'all' and 'custom' are filter views, not real checklists.
// (id "custom"; label "(Custom)" — user-authored one-off requests.)
const TABS = [
  { id: "all", label: "All", real: false },
  { id: "ea", label: "EA Requests", real: true },
  { id: "editor", label: "Editor Requests", real: true },
  { id: "custom", label: "(Custom)", real: false }
];
const SEED_PRESELECTED = ["section_order", "affiliation_check"];   // used only for a brand-new seeded library
const UNDO_MAX = 5;
const GROUP_IDS = ["ea", "editor"];                            // taggable checklist memberships
const GROUP_LABELS = { ea: "EA", editor: "Editor" };
// "Reporting Summary" used to be a tab (an audience); it is now a SECTION.
// migrateMaster() moves old reporting-tagged requests into it.
const RS_SECTION = { id: "reporting", label: "Reporting Summary" };

// Active master's requests, decorated with display order. Rebuilt by syncLibrary().
let sections = [];
let templates = [];

function defaults() {
  return {
    library: [],   // legacy personal-request store; folded into working on first run
    settings: {    // app-level prefs only (not library-specific)
      letterLocked: true,
      structuredLocked: true,
      activeChecklists: { ea: true, editor: true },
      devPassword: ""
    },
    session: { manuscript: "", activeTab: "all", selected: [], exportName: "", exportCount: 0 },
    masterLibraries: [],
    working: { activeMasterId: null, layers: {} }
  };
}

let state = defaults();
let mode = "edit";
let devUnlocked = false;
let undoStack = [];
let resetSnapshot = null;             // whole-session snapshot taken on Reset, for "Undo reset"
let editingSettingId = null;          // settings row currently open for inline text editing
let editingSetupReqId = null;         // setup system-request row open for inline editing
let expandedCardId = null;            // Edit-stack card left open; others collapse ("__none__" = all collapsed)
const collapsedCards = new Set();     // cards the user manually collapsed (override the needs-entry auto-expand)
let checklistView = "sections";       // "sections" (collapsible) | "quick" (flat titles)
const openSections = new Set();
const openQuick = new Set();          // quick-list rows showing their description

const $ = (sel) => document.querySelector(sel);
let el = {};

// ---- library accessors ----
function newLayer() {
  return { preselected: [], adaptations: {}, adaptationTitles: {}, hidden: [], tagOverrides: {}, personalRequests: [], introOverride: null };
}
function activeMaster() {
  const ms = state.masterLibraries;
  return ms.find((m) => m.id === state.working.activeMasterId) || ms[0];
}
function ensureLayer(id) {
  if (!state.working.layers[id]) state.working.layers[id] = newLayer();
  return state.working.layers[id];
}
const L = () => ensureLayer(activeMaster().id);             // active working layer
const curIntro = () => L().introOverride ?? (activeMaster()?.intro ?? DEFAULT_INTRO);

// Rebuild the module-level `sections`/`templates` from the active master library.
function syncLibrary() {
  const m = activeMaster();
  sections = m?.sections || [];
  templates = (m?.requests || []).map((t, i) => ({ ...t, order: i + 1 }));
}

// ---- persistence ----
const saveSession = () => store.save("session", state.session);
const saveWorking = () => store.save("working", state.working);
const saveMasters = () => store.save("masterLibraries", state.masterLibraries);
const saveSettings = () => store.save("settings", state.settings);

// One-shot: build the first Master Library from code and fold legacy settings/library into its layer.
// ponytail: one-shot migration, delete after first run lands.
function migrateToLibraries() {
  const id = crypto.randomUUID();
  state.masterLibraries = [{ id, ...seedMasterLibrary() }];
  const old = state.settings || {};
  state.working = {
    activeMasterId: id,
    layers: {
      [id]: {
        preselected: old.defaults || [...SEED_PRESELECTED],
        adaptations: old.overrides || {},
        adaptationTitles: old.titleOverrides || {},
        hidden: old.removed || [],
        tagOverrides: old.tags || {},
        personalRequests: (state.library || []).map((e) => ({ ...e, groups: e.groups?.length ? e.groups : (e.group ? [e.group] : ["ea"]) })),
        introOverride: old.intro && old.intro !== DEFAULT_INTRO ? old.intro : null
      }
    }
  };
  state.settings = {
    letterLocked: typeof old.letterLocked === "boolean" ? old.letterLocked : true,
    structuredLocked: typeof old.structuredLocked === "boolean" ? old.structuredLocked : true,
    activeChecklists: old.activeChecklists || { ea: true, editor: true },
    devPassword: old.devPassword || ""
  };
  state.library = [];
  saveMasters(); saveWorking(); saveSettings();
}

// Old data model had a "reporting" audience tab. Move those requests into a
// real "Reporting Summary" section instead, in any stored or imported library.
function migrateMaster(m) {
  let moved = false;
  (m.requests || []).forEach((r) => {
    if (!r.groups?.includes("reporting")) return;
    r.section = RS_SECTION.id;
    r.groups = r.groups.filter((g) => g !== "reporting");
    if (!r.groups.length) r.groups = ["ea"];
    moved = true;
  });
  m.sections ||= [];
  if (moved && !m.sections.some((s) => s.id === RS_SECTION.id)) {
    const i = m.sections.findIndex((s) => s.id === "forms");
    m.sections.splice(i === -1 ? m.sections.length : i, 0, { ...RS_SECTION });
  }
}

function migrate() {
  const s = state.settings;
  if (typeof s.letterLocked !== "boolean") s.letterLocked = true;
  if (typeof s.structuredLocked !== "boolean") s.structuredLocked = true;
  s.devPassword ||= "";
  s.activeChecklists ||= { ea: true, editor: true };
  delete s.activeChecklists.reporting;
  state.session.selected ||= [];
  state.session.activeTab ||= "all";
  if (state.session.activeTab === "reporting") state.session.activeTab = "all";
  state.masterLibraries.forEach(migrateMaster);
  state.working ||= { activeMasterId: null, layers: {} };
  state.working.layers ||= {};
  if (!state.working.activeMasterId && state.masterLibraries[0]) state.working.activeMasterId = state.masterLibraries[0].id;
  const layer = L();
  layer.preselected ||= [];
  layer.adaptations ||= {};
  layer.adaptationTitles ||= {};
  layer.hidden ||= [];
  layer.tagOverrides ||= {};
  layer.personalRequests ||= [];
  if (!("introOverride" in layer)) layer.introOverride = null;
  layer.personalRequests.forEach((e) => { if (!Array.isArray(e.groups)) e.groups = e.group ? [e.group] : ["ea"]; });
  // Strip the retired "reporting" tag from every personal layer.
  Object.values(state.working.layers).forEach((ly) => {
    Object.keys(ly.tagOverrides || {}).forEach((k) => {
      ly.tagOverrides[k] = ly.tagOverrides[k].filter((g) => g !== "reporting");
      if (!ly.tagOverrides[k].length) delete ly.tagOverrides[k];
    });
    (ly.personalRequests || []).forEach((e) => {
      if (!Array.isArray(e.groups)) return;
      e.groups = e.groups.filter((g) => g !== "reporting");
      if (!e.groups.length) e.groups = ["ea"];
    });
  });
  // Selected cards keep their letter section in sync with the (possibly migrated) library.
  const reqs = activeMaster()?.requests || [];
  state.session.selected.forEach((it) => {
    const t = it.templateId && !it.custom && reqs.find((r) => r.id === it.templateId);
    if (t) it.location = t.section;
  });
}

const templateById = (id) => templates.find((x) => x.id === id);
// Which tabs a request appears in. Falls back to the template's own `groups`.
const templateGroups = (id) =>
  L().tagOverrides[id]?.length ? L().tagOverrides[id] : (templateById(id)?.groups?.length ? templateById(id).groups : ["ea"]);
const libGroups = (e) => e.groups?.length ? e.groups : ["ea"];
const overrideBody = (t) => L().adaptations[t.id] ?? t.body;
const overrideTitle = (t) => L().adaptationTitles[t.id] ?? t.title;
const isTplEdited = (id) => L().adaptations[id] != null || L().adaptationTitles[id] != null;   // "adapted"
const hasBrackets = (text) => /\[[^\]]+\]/.test(text || "");
const isHidden = (id) => L().hidden.includes(id);

function applyDefaults() {
  L().preselected.forEach((id) => {
    if (state.session.selected.some((sel) => sel.templateId === id)) return;
    const t = templates.find((x) => x.id === id);
    if (t) return state.session.selected.push(makeSelected(t));
    const e = L().personalRequests.find((x) => x.id === id);
    if (e) state.session.selected.push(makeSelectedFromLib(e));
  });
}

// ---- selected-item helpers ----
function makeSelected(template) {
  const override = L().adaptations[template.id];   // adapted system request, if any
  return {
    id: crypto.randomUUID(),
    templateId: template.id,
    title: overrideTitle(template),
    location: template.section,
    groups: templateGroups(template.id),
    originalBody: template.body,
    customText: override ?? null,
    useOriginal: false,
    custom: false,
    savedToLibrary: override != null,
    needsCustom: template.needsCustom || hasBrackets(override ?? template.body),
    customConfirmed: false,
    addedAt: Date.now()
  };
}

function makeSelectedFromLib(e) {
  return {
    id: crypto.randomUUID(),
    templateId: e.id,                 // reuse lib id so the middle-pane checkbox stays in sync
    title: e.title,
    location: e.section,
    groups: libGroups(e),
    originalBody: null,
    customText: e.body,
    useOriginal: false,
    custom: true,
    savedToLibrary: true,
    needsCustom: hasBrackets(e.body),
    customConfirmed: false,
    addedAt: Date.now()
  };
}
const selected = () => state.session.selected;
function displayText(item) {
  if (item.useOriginal && item.originalBody != null) return item.originalBody;
  return item.customText != null ? item.customText : (item.originalBody || "");
}
function isEdited(item) {
  return item.originalBody != null && item.customText != null &&
    item.customText.trim() !== item.originalBody.trim();
}
const needsEntry = (item) => hasBrackets(displayText(item));
const itemNeedsCustom = (item) => item.needsCustom ?? needsEntry(item);
const isSelected = (tid) => selected().some((i) => i.templateId === tid);
const openCardId = () => expandedCardId ?? selected()[selected().length - 1]?.id;
// A card stays open if it's the focused card, or it still needs entry and the user hasn't collapsed it.
const isCardOpen = (item) =>
  item.id === openCardId() ||
  (itemNeedsCustom(item) && !item.customConfirmed && !collapsedCards.has(item.id));

// ---- mutations ----
// Add by id from either store: system request or personal request.
function addById(id) {
  if (isSelected(id)) return;
  const t = templates.find((x) => x.id === id);
  const e = !t && L().personalRequests.find((x) => x.id === id);
  if (!t && !e) return;
  selected().push(t ? makeSelected(t) : makeSelectedFromLib(e));
  expandedCardId = selected()[selected().length - 1].id;
  saveSession();
  render();
  if (mode === "edit") focusCard(selected()[selected().length - 1].id);
}

function removeSelected(id) {
  const arr = selected();
  const index = arr.findIndex((i) => i.id === id || i.templateId === id);
  if (index === -1) return;
  const item = arr[index];
  if (isEdited(item) && !item.savedToLibrary &&
      !confirm("This request was edited and is not saved to your library. Remove anyway?")) return;
  undoStack.push({ item, index });
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  arr.splice(index, 1);
  saveSession();
  render();
}

function undoRemoval() {
  const last = undoStack.pop();
  if (!last) return;
  selected().splice(Math.min(last.index, selected().length), 0, last.item);
  saveSession();
  render();
}

function addCustom() {
  const text = el.customText.value.trim();
  if (!text) return;
  const tab = state.session.activeTab;
  const item = {
    id: crypto.randomUUID(),
    templateId: null,
    title: el.customTitle.value.trim() || "Custom request",
    location: el.customLocation.value,
    groups: [tab === "custom" ? "ea" : tab],
    originalBody: null,
    customText: text,
    useOriginal: false,
    custom: true,
    savedToLibrary: false,
    needsCustom: hasBrackets(text),
    customConfirmed: false,
    addedAt: Date.now()
  };
  if (el.customSaveLib.checked) { saveToLibrary(item); item.savedToLibrary = true; }
  selected().push(item);
  expandedCardId = item.id;
  el.customText.value = "";
  el.customTitle.value = "";
  el.customSaveLib.checked = false;
  saveSession();
  render();
  if (mode === "edit") focusCard(item.id);
}

function saveToLibrary(item) {
  const body = displayText(item);
  if (L().personalRequests.some((e) => e.body.trim() === body.trim())) return; // de-dupe
  L().personalRequests.push({
    id: crypto.randomUUID(),
    title: item.title || "Custom request",
    groups: item.groups || ["ea"],
    section: item.location,
    body
  });
  saveWorking();
}

function saveSelectedToLibrary(id) {
  const item = selected().find((x) => x.id === id);
  if (!item) return;
  // Edited system request → save as an adaptation that replaces the original in the middle pane
  // (the per-card "original" toggle still falls back to the system text).
  if (item.templateId && !item.custom) {
    L().adaptations[item.templateId] = displayText(item);
    item.savedToLibrary = true;
    saveWorking();
    saveSession();
    render();
    return flash("Saved — adapts the system request in your checklist");
  }
  saveToLibrary(item);
  item.savedToLibrary = true;
  saveSession();
  render();
  flash("Saved to your library");
}

// Toggle which tabs a request shows in. Keeps at least one group so it stays reachable.
function setTag(id, group, on) {
  const t = templates.find((x) => x.id === id);
  const e = !t && L().personalRequests.find((x) => x.id === id);
  const set = new Set(t ? templateGroups(id) : libGroups(e));
  on ? set.add(group) : set.delete(group);
  if (!set.size) set.add("ea");
  if (t) { L().tagOverrides[id] = [...set]; saveWorking(); }
  else if (e) { e.groups = [...set]; saveWorking(); }
  renderSettings();
  renderChecklist();
}

function move(id, dir) {
  const arr = selected();
  const item = arr.find((x) => x.id === id);
  if (!item) return;
  const siblings = arr.filter((x) => x.location === item.location);
  const swap = siblings[siblings.indexOf(item) + dir];
  if (!swap) return;
  const a = arr.indexOf(item), b = arr.indexOf(swap);
  [arr[a], arr[b]] = [arr[b], arr[a]];
  saveSession();
  renderLetter();
}

// Sort the cards into the standard section order (same order Structured uses). Stable: keeps within-section order.
function orderCards() {
  const rank = (id) => { const i = sections.findIndex((s) => s.id === id); return i === -1 ? sections.length : i; };
  selected().sort((a, b) => rank(a.location) - rank(b.location));
  saveSession();
  renderLetter();
}

// ---- dev mode (soft protection) ----
function toggleDev() {
  if (devUnlocked) { devUnlocked = false; updateDevButton(); renderSettings(); renderSetup(); return; }
  const pw = state.settings.devPassword;
  if (!pw) {
    const set = prompt("Set a developer password (soft lock — not encrypted):");
    if (set == null) return;
    if (set !== prompt("Confirm password:")) return alert("Passwords did not match.");
    state.settings.devPassword = set;
    saveSettings();
    devUnlocked = true;
  } else {
    if (prompt("Developer password:") !== pw) return alert("Wrong password.");
    devUnlocked = true;
  }
  updateDevButton();
  renderSettings();
  renderSetup();
}
function requireDev() {
  if (devUnlocked) return true;
  alert("Developer mode is locked. Unlock it (top bar) to change protected settings.");
  return false;
}
function updateDevButton() {
  [el.devBtn, el.settingsDevBtn, el.setupDevBtn].forEach((b) => {
    if (!b) return;
    b.textContent = devUnlocked ? "🔓 Dev" : "🔒 Dev";
    b.classList.toggle("on", devUnlocked);
  });
}

// ---- render ----
function render() {
  syncLibrary();
  renderTabs();
  renderLocations();
  renderChecklist();
  renderLetter();
  syncLock();
}

// Flagged (selected) count for a tab — "all" is the grand total, others count by membership.
function tabFlagged(id) {
  const sel = selected();
  if (id === "all") return sel.length;
  if (id === "custom") return sel.filter((i) => i.custom).length;
  return sel.filter((i) => (i.groups?.length ? i.groups : ["ea"]).includes(id)).length;
}

function renderTabs() {
  el.tabbar.innerHTML = TABS.map((tab) => {
    const active = state.session.activeTab === tab.id ? "active" : "";
    const toggle = tab.real
      ? `<input type="checkbox" class="tab-active" data-tab="${tab.id}" ${state.settings.activeChecklists[tab.id] ? "checked" : ""} title="Activate checklist (Dev)">`
      : "";
    const n = tabFlagged(tab.id);
    const badge = n ? `<span class="tab-flagged" title="${n} flagged">${n}</span>` : "";
    return `<button type="button" class="tab ${active}" data-tab="${tab.id}">${toggle}${escapeHtml(tab.label)}${badge}</button>`;
  }).join("");
}

function renderLocations() {
  el.customLocation.innerHTML = sections
    .map((s, i) => `<option value="${s.id}">${i + 1}. ${s.label}</option>`)
    .join("");
}

function renderChecklist() {
  const query = el.searchInput.value.trim().toLowerCase();
  const tab = state.session.activeTab;

  if (GROUP_IDS.includes(tab) && !state.settings.activeChecklists[tab]) {
    el.categoryList.innerHTML = `<div class="empty-state">Checklist “${TABS.find((t) => t.id === tab).label}” is off. Tick its box in the tab bar (Dev mode) to activate.</div>`;
    return;
  }

  let pool = templates.filter((t) => !isHidden(t.id)).map((t) =>
    ({ id: t.id, title: overrideTitle(t), section: t.section, body: overrideBody(t), groups: templateGroups(t.id), fromLib: false, edited: isTplEdited(t.id) }));
  L().personalRequests.forEach((e) => pool.push({ id: e.id, title: e.title + " (Custom)", section: e.section, body: e.body, groups: libGroups(e), fromLib: true }));

  const list = pool.filter((t) => {
    if (tab === "custom") { if (!t.fromLib) return false; }   // (Custom) tab = your custom requests, deduped
    else if (tab !== "all" && !t.groups.includes(tab)) return false;  // 'all' shows everything; tabs filter by membership
    const hay = `${t.title} ${t.body}`.toLowerCase();
    return !query || hay.includes(query);
  });

  if (checklistView === "quick") return renderQuickList(list, query);

  el.categoryList.innerHTML = "";
  sections.forEach((section) => {
    const items = list.filter((t) => t.section === section.id);
    if (!items.length) return;
    const selCount = items.filter((i) => isSelected(i.id)).length;
    const details = document.createElement("details");
    details.className = "category";
    details.dataset.section = section.id;
    details.open = openSections.has(section.id) || Boolean(query);
    details.innerHTML = `<summary><span>${escapeHtml(section.label)}</span>
      <span class="count">${selCount ? `<span class="flagged">${selCount} flagged</span> · ` : ""}${items.length}</span></summary>`;
    items.forEach((t) => {
      const label = document.createElement("label");
      label.className = "issue";
      label.innerHTML = `<input type="checkbox" ${isSelected(t.id) ? "checked" : ""} data-id="${t.id}">
        <span><span class="issue-title">${escapeHtml(t.title)}${t.edited ? '<span class="tag custom-flag">adapted</span>' : ""}</span>
        <span class="issue-template">${escapeHtml(t.body)}</span></span>`;
      details.append(label);
    });
    el.categoryList.append(details);
  });
  if (!el.categoryList.children.length) {
    el.categoryList.innerHTML = `<div class="empty-state">No requests in this checklist${query ? " match your search" : ""}.</div>`;
  }
}

// Flat, dense list: titles only, no per-row description until clicked. No custom box. For fast editors.
function renderQuickList(list, query) {
  el.categoryList.innerHTML = "";
  sections.forEach((section) => {
    const items = list.filter((t) => t.section === section.id);
    if (!items.length) return;
    const group = document.createElement("div");
    group.className = "quick-group";
    group.innerHTML = `<div class="quick-head">${escapeHtml(section.label)}</div>` +
      items.map((t) => `<div class="quick-row ${isSelected(t.id) ? "sel" : ""}">
        <input type="checkbox" ${isSelected(t.id) ? "checked" : ""} data-id="${t.id}">
        <button type="button" class="quick-title" data-desc="${t.id}">${escapeHtml(t.title)}${t.edited ? ' <span class="tag custom-flag">adapted</span>' : ""}</button>
        <div class="quick-body" data-body="${t.id}" ${openQuick.has(t.id) ? "" : "hidden"}>${escapeHtml(t.body)}</div>
      </div>`).join("");
    el.categoryList.append(group);
  });
  if (!el.categoryList.children.length) {
    el.categoryList.innerHTML = `<div class="empty-state">No requests in this checklist${query ? " match your search" : ""}.</div>`;
  }
}

function renderLetter() {
  const heading = state.session.manuscript
    ? `<p class="letter-ms">Manuscript: <strong>${escapeHtml(state.session.manuscript)}</strong></p>` : "";

  if (!selected().length) {
    el.letterBody.innerHTML = `${heading}<div class="empty-state">No requests yet. Tick an issue in the middle pane, or add a custom request.</div>`;
    return updateFoot();
  }

  if (mode === "preview") {
    const groups = groupBy(selected(), (i) => i.location);
    const locked = state.settings.structuredLocked;
    el.letterBody.innerHTML = `<article class="preview-doc">${heading}
      <p class="preview-intro">${escapeHtml(curIntro()).replaceAll("\n", "<br>")}</p>
      ${sections.filter((s) => groups.has(s.id)).map((section, i) => {
        const items = groups.get(section.id);
        return `<section class="preview-section"><h3>${i + 1}. ${escapeHtml(section.label)}</h3>
          <ul class="preview-list">${items.map((item, j) => `<li data-id="${item.id}">
            <span class="li-text">${escapeHtml(displayText(item))}</span>
            ${item.custom ? '<span class="tag">Custom</span>' : ""}
            ${locked ? "" : `<span class="li-actions">
              <button type="button" data-move="up" data-id="${item.id}" ${j === 0 ? "disabled" : ""}>↑</button>
              <button type="button" data-move="down" data-id="${item.id}" ${j === items.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="remove-btn" data-remove="${item.id}">✕</button></span>`}
          </li>`).join("")}</ul></section>`;
      }).join("")}</article>`;
    return updateFoot();
  }

  const locked = state.settings.letterLocked;
  el.letterBody.innerHTML = heading + selected().map((item) => {
    const section = sections.find((e) => e.id === item.location);
    const edited = isEdited(item);
    const collapsed = !isCardOpen(item);
    const needsCustom = itemNeedsCustom(item);
    return `<article class="card ${item.custom ? "custom" : ""} ${needsCustom ? "needs-entry" : ""} ${collapsed ? "collapsed" : ""}" data-id="${item.id}">
      <div class="card-head">
        <button class="card-toggle" type="button" data-toggle="${item.id}" title="${collapsed ? "Expand" : "Collapse"}">${collapsed ? "▸" : "▾"}</button>
        <div class="card-headmain"><div class="card-titlerow">
          <input class="card-title-input" type="text" data-title="${item.id}" value="${escapeHtml(item.title)}" ${locked ? "readonly" : ""}>
          ${item.custom ? '<span class="tag">Custom</span>' : ""}</div>
          <div class="meta">${escapeHtml(section?.label || "Other")} · ${item.custom ? "custom" : "system"}${item.savedToLibrary ? " · saved" : ""}</div></div>
        <div class="card-actions">
          ${needsCustom ? `<label class="custom-confirm ${item.customConfirmed ? "done" : ""}" title="Tick once you have filled in this request"><input type="checkbox" data-confirm="${item.id}" ${item.customConfirmed ? "checked" : ""}> needs entry</label>` : ""}
          ${edited ? `<label class="origtoggle"><input type="checkbox" data-orig="${item.id}" ${item.useOriginal ? "checked" : ""}> original</label>` : ""}
          ${item.savedToLibrary ? "" : `<button class="ghost-btn icon-btn" type="button" data-savelib="${item.id}" title="Save to your library" aria-label="Save to your library">💾</button>`}
          <button class="remove-btn icon-btn" type="button" data-remove="${item.id}" title="Remove" aria-label="Remove">✕</button></div>
      </div>
      <textarea rows="4" data-edit="${item.id}" ${locked ? "readonly" : ""}>${escapeHtml(displayText(item))}</textarea>
    </article>`;
  }).join("");
  updateFoot();
}

function updateFoot() {
  const n = selected().length;
  el.footInfo.textContent =
    (n ? `${n} request${n === 1 ? "" : "s"} · ${L().personalRequests.length} in your library` : "") +
    (store.isOnline() ? "" : "  ·  offline (no server)");
  el.undoBtn.hidden = undoStack.length === 0;
  el.undoResetBtn.hidden = resetSnapshot === null;
  const warnN = selected().filter((i) => itemNeedsCustom(i) && !i.customConfirmed).length;
  el.docxWarn.hidden = warnN === 0;
  el.docxWarn.title = warnN ? `${warnN} request(s) needing customisation not marked done` : "";
}

// ---- Settings overlay (personal layer) ----
function settingsRow({ id, title, rawTitle, body, groups, fromLib, edited }) {
  const dis = !devUnlocked ? "disabled" : "";
  if (editingSettingId === id) {
    return `<div class="settings-row editing">
      <input class="settings-edit-title" type="text" data-edit-title="${id}" value="${escapeHtml(rawTitle ?? title)}" placeholder="Title">
      <textarea class="settings-edit" data-edit-id="${id}" rows="5">${escapeHtml(body)}</textarea>
      <div class="settings-edit-actions">
        <button type="button" data-save="${id}">Save</button>
        ${!fromLib && edited ? `<button type="button" data-revert="${id}">Revert to system text</button>` : ""}
        <button type="button" data-canceledit="1">Cancel</button>
      </div></div>`;
  }
  const on = L().preselected.includes(id);
  const tags = GROUP_IDS.map((g) => `<label class="tag-check"><input type="checkbox" data-tag="${id}" data-group="${g}"
    ${groups.includes(g) ? "checked" : ""} ${dis}> ${GROUP_LABELS[g]}</label>`).join("");
  return `<div class="settings-row">
    <label class="settings-default"><input type="checkbox" data-default="${id}" ${on ? "checked" : ""} ${dis}> preselected</label>
    <button type="button" class="settings-name" data-editrow="${id}" title="${escapeHtml(body)}">${escapeHtml(title)}${edited ? ' <span class="tag custom-flag">adapted</span>' : ""}</button>
    <span class="settings-tags">${tags}</span>
    <button type="button" class="settings-del" data-del="${id}" data-lib="${fromLib ? 1 : 0}" ${dis} title="${fromLib ? "Delete this custom request" : "Hide this system request (can be restored)"}">×</button>
  </div>`;
}

function renderSettings() {
  if (!el.settingsList) return;
  el.settingsLockNote.hidden = devUnlocked;
  el.introText.value = curIntro();
  el.introText.disabled = !devUnlocked;
  el.introRevertBtn.disabled = !devUnlocked;
  let html = sections.map((section) => {
    const items = templates.filter((t) => t.section === section.id && !isHidden(t.id));
    if (!items.length) return "";
    return `<div class="settings-group"><h4>${escapeHtml(section.label)}</h4>${
      items.map((t) => settingsRow({ id: t.id, title: overrideTitle(t), rawTitle: overrideTitle(t), body: overrideBody(t), groups: templateGroups(t.id), fromLib: false, edited: isTplEdited(t.id) })).join("")
    }</div>`;
  }).join("");
  if (L().personalRequests.length) {
    html += `<div class="settings-group"><h4>Custom requests</h4>${
      L().personalRequests.map((e) => settingsRow({ id: e.id, title: e.title + " (Custom)", rawTitle: e.title, body: e.body, groups: libGroups(e), fromLib: true, edited: false })).join("")
    }</div>`;
  }
  const hidden = templates.filter((t) => isHidden(t.id));
  if (hidden.length) {
    html += `<div class="settings-group"><h4>Hidden system requests</h4>${
      hidden.map((t) => `<div class="settings-row"><span class="settings-name struck">${escapeHtml(t.title)}</span>
        <button type="button" data-restore="${t.id}" ${devUnlocked ? "" : "disabled"}>Restore</button></div>`).join("")
    }</div>`;
  }
  el.settingsList.innerHTML = html;
}

// Inline personal-layer editing (Settings). All dev-gated.
function startEditSetting(id) {
  if (!requireDev()) return;
  editingSettingId = id;
  renderSettings();
  const ta = el.settingsList.querySelector(`textarea[data-edit-id="${id}"]`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function saveEditSetting(id) {
  const ta = el.settingsList.querySelector(`textarea[data-edit-id="${id}"]`);
  if (!ta) return;
  const value = ta.value;
  const ti = el.settingsList.querySelector(`input[data-edit-title="${id}"]`);
  const title = ti ? ti.value.trim() : "";
  const t = templateById(id);
  if (t) {                                  // adapted system request → store in the layer (system source kept in the library)
    if (value.trim() === t.body.trim()) delete L().adaptations[id];
    else L().adaptations[id] = value;
    if (title && title !== t.title) L().adaptationTitles[id] = title;
    else delete L().adaptationTitles[id];
    saveWorking();
  } else {
    const e = L().personalRequests.find((x) => x.id === id);
    if (e) { e.body = value; if (title) e.title = title; saveWorking(); }
  }
  editingSettingId = null;
  renderSettings();
  renderChecklist();
  flash("Saved");
}
function revertSetting(id) {
  delete L().adaptations[id];
  delete L().adaptationTitles[id];
  saveWorking();
  editingSettingId = null;
  renderSettings();
  renderChecklist();
  flash("Reverted to system text");
}
function deleteSetting(id, fromLib) {
  if (!requireDev()) return;
  if (fromLib) {
    if (!confirm("Delete this custom request from your library?")) return;
    L().personalRequests = L().personalRequests.filter((e) => e.id !== id);
    saveWorking();
  } else {
    if (!confirm("Hide this system request? You can restore it later in Settings.")) return;
    if (!L().hidden.includes(id)) L().hidden.push(id);
    saveWorking();
  }
  renderSettings();
  renderChecklist();
}
function restoreSetting(id) {
  if (!requireDev()) return;
  L().hidden = L().hidden.filter((x) => x !== id);
  saveWorking();
  renderSettings();
  renderChecklist();
}

// ---- Setup overlay (Master Libraries — the foundation) ----
function groupChecksHtml(selectedGroups, attr) {
  return GROUP_IDS.map((g) => `<label class="tag-check"><input type="checkbox" ${attr}="${g}"
    ${selectedGroups.includes(g) ? "checked" : ""}> ${GROUP_LABELS[g]}</label>`).join("");
}

function renderSetup() {
  if (!el.setupScreen || el.setupScreen.hidden) return;
  el.setupLockNote.hidden = devUnlocked;
  const m = activeMaster();
  // Library picker
  el.setupLibs.innerHTML = state.masterLibraries.map((lib) =>
    `<div class="setup-lib-row ${lib.id === m.id ? "active" : ""}">
      <label><input type="radio" name="activeLib" data-activate="${lib.id}" ${lib.id === m.id ? "checked" : ""}> <strong>${escapeHtml(lib.name)}</strong></label>
      <span class="muted">${(lib.requests || []).length} requests · ${(lib.sections || []).length} sections</span>
      <span class="setup-lib-actions">
        <button type="button" data-renamelib="${lib.id}" ${devUnlocked ? "" : "disabled"}>Rename</button>
        <button type="button" data-duplib="${lib.id}" ${devUnlocked ? "" : "disabled"}>Duplicate</button>
        <button type="button" data-dellib="${lib.id}" ${devUnlocked && state.masterLibraries.length > 1 ? "" : "disabled"}>Delete</button>
      </span>
    </div>`).join("") +
    `<div class="setup-add"><button type="button" data-newlib="1" ${devUnlocked ? "" : "disabled"}>+ New empty library (start from 0)</button></div>`;

  // Intro (chief-editor default for this library)
  el.setupIntro.value = m.intro ?? DEFAULT_INTRO;
  el.setupIntro.disabled = !devUnlocked;

  // Sections
  const dis = devUnlocked ? "" : "disabled";
  el.setupSections.innerHTML = (m.sections || []).map((s, i) =>
    `<div class="setup-section-row">
      <input type="text" data-secname="${s.id}" value="${escapeHtml(s.label)}" ${dis}>
      <button type="button" data-secup="${s.id}" ${dis || (i === 0 ? "disabled" : "")}>↑</button>
      <button type="button" data-secdown="${s.id}" ${dis || (i === m.sections.length - 1 ? "disabled" : "")}>↓</button>
      <button type="button" data-secdel="${s.id}" ${dis}>×</button>
    </div>`).join("") +
    `<div class="setup-add"><input id="newSectionName" type="text" placeholder="New section name" ${dis}>
      <button type="button" data-addsec="1" ${dis}>Add section</button></div>`;

  // System requests
  el.setupRequests.innerHTML = renderSetupRequests(m);
}

function setupReqRow(r) {
  if (editingSetupReqId === r.id) {
    return `<div class="settings-row editing">
      <input class="settings-edit-title" type="text" data-req-title="${r.id}" value="${escapeHtml(r.title)}" placeholder="Title">
      <textarea class="settings-edit" data-req-body="${r.id}" rows="5">${escapeHtml(r.body)}</textarea>
      <div class="setup-req-meta">
        <select data-req-section="${r.id}">${sections.map((s) => `<option value="${s.id}" ${s.id === r.section ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}</select>
        <span class="settings-tags">${groupChecksHtml(libGroups(r), "data-req-group")}</span>
      </div>
      <div class="settings-edit-actions">
        <button type="button" data-reqsave="${r.id}">Save</button>
        <button type="button" data-reqcancel="1">Cancel</button>
      </div></div>`;
  }
  const dis = devUnlocked ? "" : "disabled";
  return `<div class="settings-row">
    <button type="button" class="settings-name" data-reqedit="${r.id}" title="${escapeHtml(r.body)}">${escapeHtml(r.title)}</button>
    <span class="muted">${libGroups(r).map((g) => GROUP_LABELS[g]).join(", ")}</span>
    <button type="button" class="settings-del" data-reqdel="${r.id}" ${dis} title="Delete this system request">×</button>
  </div>`;
}

function renderSetupRequests(m) {
  let html = (m.sections || []).map((section) => {
    const items = (m.requests || []).filter((r) => r.section === section.id);
    if (!items.length) return "";
    return `<div class="settings-group"><h4>${escapeHtml(section.label)}</h4>${items.map(setupReqRow).join("")}</div>`;
  }).join("");
  const orphans = (m.requests || []).filter((r) => !(m.sections || []).some((s) => s.id === r.section));
  if (orphans.length) html += `<div class="settings-group"><h4>Unassigned (section removed)</h4>${orphans.map(setupReqRow).join("")}</div>`;
  // Add-new form
  const dis = devUnlocked ? "" : "disabled";
  html += `<div class="settings-group setup-newreq"><h4>Add a system request</h4>
    <input id="newReqTitle" type="text" placeholder="Title" ${dis}>
    <textarea id="newReqBody" rows="3" placeholder="Request text. [bracketed] tokens become editor fill-ins." ${dis}></textarea>
    <div class="setup-req-meta">
      <select id="newReqSection" ${dis}>${(m.sections || []).map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
      <span class="settings-tags">${groupChecksHtml(["ea"], "data-newreq-group")}</span>
      <button type="button" data-addreq="1" ${dis}>Add</button>
    </div></div>`;
  return html;
}

// Master-library mutations (all dev-gated)
function setActiveMaster(id) {
  if (!state.masterLibraries.some((m) => m.id === id)) return;
  state.working.activeMasterId = id;
  ensureLayer(id);
  saveWorking();
  render();
  renderSettings();
  renderSetup();
}
function afterMasterEdit() {
  saveMasters();
  render();
  renderSetup();
}
function newLibrary() {
  if (!requireDev()) return;
  const name = (prompt("Name for the new (empty) library:", "New library") || "").trim();
  if (!name) return;
  const id = crypto.randomUUID();
  state.masterLibraries.push({ id, name, intro: DEFAULT_INTRO, sections: [], requests: [] });
  state.working.activeMasterId = id;
  ensureLayer(id);
  saveMasters(); saveWorking();
  render();
  renderSettings();
  renderSetup();
}
function renameLibrary(id) {
  if (!requireDev()) return;
  const lib = state.masterLibraries.find((m) => m.id === id);
  if (!lib) return;
  const name = (prompt("Library name:", lib.name) || "").trim();
  if (!name) return;
  lib.name = name;
  afterMasterEdit();
}
function duplicateLibrary(id) {
  if (!requireDev()) return;
  const lib = state.masterLibraries.find((m) => m.id === id);
  if (!lib) return;
  state.masterLibraries.push({ ...structuredClone(lib), id: crypto.randomUUID(), name: lib.name + " copy" });
  afterMasterEdit();
}
function deleteLibrary(id) {
  if (!requireDev()) return;
  if (state.masterLibraries.length <= 1) return alert("Keep at least one library.");
  if (!confirm("Delete this library and its personal layer? This cannot be undone.")) return;
  state.masterLibraries = state.masterLibraries.filter((m) => m.id !== id);
  delete state.working.layers[id];
  if (state.working.activeMasterId === id) state.working.activeMasterId = state.masterLibraries[0].id;
  ensureLayer(activeMaster().id);
  saveMasters(); saveWorking();
  render();
  renderSettings();
  renderSetup();
}
// Library file — the chief-editor / shared-setup package. Carries the active master
// library plus its working layer (preselected, adaptations, custom requests), so a
// recipient gets a ready-to-use library without touching their in-progress work.
function exportLibrary() {
  const m = activeMaster();
  const bundle = {
    kind: "library",
    masterLibraries: [structuredClone(m)],
    layers: { [m.id]: structuredClone(ensureLayer(m.id)) },
    savedAt: new Date().toISOString()
  };
  const safe = (m.name || "Library").replace(/[^A-Za-z0-9 ._-]+/g, " ").trim() || "Library";
  store.triggerDownload(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), `Library - ${safe}.json`);
  flash(`Exported library “${m.name}”.`);
}
function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const loaded = JSON.parse(reader.result);
      const libs = loaded.masterLibraries;
      if (!Array.isArray(libs) || !libs.length || !libs[0].id || !Array.isArray(libs[0].requests))
        throw new Error("not a library file");
      const names = libs.map((l) => l.name).join(", ");
      if (!confirm(`Import library “${names}”? It is added to your libraries (existing ones are updated); your current work is kept.`)) return;
      libs.forEach((lib) => {
        const i = state.masterLibraries.findIndex((m) => m.id === lib.id);
        if (i >= 0) state.masterLibraries[i] = lib; else state.masterLibraries.push(lib);
        if (loaded.layers && loaded.layers[lib.id]) state.working.layers[lib.id] = loaded.layers[lib.id];
        ensureLayer(lib.id);
      });
      state.working.activeMasterId = libs[0].id;
      migrate();
      saveMasters(); saveWorking();
      syncLibrary();
      render();
      renderSettings();
      renderSetup();
      flash(`Imported library “${names}”.`);
    } catch (err) {
      alert("Could not load library: " + err.message);
    }
  };
  reader.readAsText(file);
}
function addSection(label) {
  if (!requireDev()) return;
  label = (label || "").trim();
  if (!label) return;
  activeMaster().sections.push({ id: crypto.randomUUID().slice(0, 8), label });
  afterMasterEdit();
}
function renameSection(id, label) {
  const s = activeMaster().sections.find((x) => x.id === id);
  if (!s) return;
  s.label = label;
  saveMasters();   // light: don't full-rerender on every keystroke
}
function moveSection(id, dir) {
  if (!requireDev()) return;
  const arr = activeMaster().sections;
  const i = arr.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  afterMasterEdit();
}
function deleteSection(id) {
  if (!requireDev()) return;
  if (activeMaster().requests.some((r) => r.section === id))
    return alert("This section has requests. Move or delete them first.");
  activeMaster().sections = activeMaster().sections.filter((s) => s.id !== id);
  afterMasterEdit();
}
function addRequest() {
  if (!requireDev()) return;
  const title = $("#newReqTitle").value.trim();
  const body = $("#newReqBody").value.trim();
  const section = $("#newReqSection").value;
  if (!title || !body) return alert("Title and request text are required.");
  const groups = [...el.setupRequests.querySelectorAll("input[data-newreq-group]:checked")].map((c) => c.dataset.newreqGroup);
  activeMaster().requests.push({ id: crypto.randomUUID().slice(0, 12), section, title, body, groups: groups.length ? groups : ["ea"] });
  afterMasterEdit();
}
function saveRequest(id) {
  const r = activeMaster().requests.find((x) => x.id === id);
  if (!r) return;
  r.title = el.setupRequests.querySelector(`[data-req-title="${id}"]`).value.trim() || r.title;
  r.body = el.setupRequests.querySelector(`[data-req-body="${id}"]`).value;
  r.section = el.setupRequests.querySelector(`[data-req-section="${id}"]`).value;
  const groups = [...el.setupRequests.querySelectorAll(`input[data-req-group]:checked`)].map((c) => c.dataset.reqGroup);
  r.groups = groups.length ? groups : ["ea"];
  editingSetupReqId = null;
  afterMasterEdit();
  flash("System request saved");
}
function deleteRequest(id) {
  if (!requireDev()) return;
  if (!confirm("Delete this system request from the library?")) return;
  activeMaster().requests = activeMaster().requests.filter((r) => r.id !== id);
  afterMasterEdit();
}

// ---- misc ----
function focusCard(id) {
  if (mode !== "edit") return;
  const card = el.letterBody.querySelector(`.card[data-id="${id}"]`);
  if (!card) return;
  card.classList.add("flash");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  const ta = card.querySelector("textarea");
  if (!ta || ta.readOnly) return;
  ta.focus();
  const m = /\[[^\]]+\]/.exec(ta.value);
  if (m) ta.setSelectionRange(m.index, m.index + m[0].length);
}

function groupBy(items, getKey) {
  const groups = new Map();
  items.forEach((i) => { const k = getKey(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  return groups;
}

function letterGroups() {
  const groups = groupBy(selected(), (i) => i.location);
  return sections.filter((s) => groups.has(s.id))
    .map((s) => ({ label: s.label, items: groups.get(s.id).map(displayText) }));
}

function letterText() {
  const lines = [];
  if (state.session.manuscript) lines.push(`Manuscript: ${state.session.manuscript}`, "");
  lines.push(curIntro(), "");
  letterGroups().forEach((g, i) => {
    lines.push(`${i + 1}. ${g.label.toUpperCase()}`);
    g.items.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

// Build the export base name and bump 2,3,... on repeat (no overlap).
function exportBase() {
  const base = (state.session.manuscript.trim() ? `${state.session.manuscript.trim()} ` : "") + "Author Checklist";
  if (state.session.exportName !== base) { state.session.exportName = base; state.session.exportCount = 1; }
  else state.session.exportCount += 1;
  const suffix = state.session.exportCount > 1 ? ` ${state.session.exportCount}` : "";
  saveSession();
  return base + suffix;
}

// Guard exports when the Manuscript Number is blank.
function confirmExport() {
  if (state.session.manuscript.trim()) return true;
  return confirm("No Manuscript Number set. Export anyway?");
}

let flashTimer;
function flash(msg) {
  el.footInfo.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateFoot, 2500);
}

function escapeHtml(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function setPdfCollapsed(on) {
  document.querySelector(".workspace").classList.toggle("pdf-collapsed", on);
  el.pdfExpandBtn.hidden = !on;
}

function syncLock() {
  const locked = mode === "preview" ? state.settings.structuredLocked : state.settings.letterLocked;
  el.lockToggle.checked = locked;
  el.lockLabel.textContent = (locked ? "🔒" : "🔓") + " Locked";
  el.orderBtn.hidden = mode !== "edit";
}

function setChecklistView(next) {
  checklistView = next;
  $("#viewSectionsBtn").classList.toggle("active", next === "sections");
  $("#viewQuickBtn").classList.toggle("active", next === "quick");
  el.customBox.hidden = next === "quick";   // no custom field in quick view
  renderChecklist();
}

function setMode(next) {
  mode = next;
  $("#editModeBtn").classList.toggle("active", next === "edit");
  $("#previewModeBtn").classList.toggle("active", next === "preview");
  syncLock();
  renderLetter();
}

// ---- events ----
function wire() {
  el.tabbar.addEventListener("click", (e) => {
    const cb = e.target.closest(".tab-active");
    if (cb) {
      e.stopPropagation();
      if (!requireDev()) { cb.checked = state.settings.activeChecklists[cb.dataset.tab]; return; }
      state.settings.activeChecklists[cb.dataset.tab] = cb.checked;
      saveSettings();
      renderChecklist();
      return;
    }
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.session.activeTab = tab.dataset.tab;
    saveSession();
    renderTabs();
    renderChecklist();
  });

  el.categoryList.addEventListener("change", (e) => {
    const input = e.target.closest("input[type='checkbox']");
    if (!input) return;
    input.checked ? addById(input.dataset.id) : removeSelected(input.dataset.id);
  });
  el.categoryList.addEventListener("click", (e) => {
    const q = e.target.closest(".quick-title");
    if (!q) return;
    const body = el.categoryList.querySelector(`.quick-body[data-body="${q.dataset.desc}"]`);
    if (!body) return;
    body.hidden = !body.hidden;
    body.hidden ? openQuick.delete(q.dataset.desc) : openQuick.add(q.dataset.desc);
  });
  el.categoryList.addEventListener("toggle", (e) => {
    const d = e.target.closest("details.category");
    if (!d) return;
    d.open ? openSections.add(d.dataset.section) : openSections.delete(d.dataset.section);
  }, true);

  el.letterBody.addEventListener("input", (e) => {
    const ti = e.target.closest("input[data-title]");
    if (ti) {
      const item = selected().find((x) => x.id === ti.dataset.title);
      if (item) { item.title = ti.value; saveSession(); }
      return;
    }
    const ta = e.target.closest("textarea[data-edit]");
    if (!ta) return;
    const item = selected().find((x) => x.id === ta.dataset.edit);
    if (!item) return;
    item.customText = ta.value;
    item.useOriginal = false;
    item.savedToLibrary = false;
    saveSession();
    updateFoot();
  });
  el.letterBody.addEventListener("click", (e) => {
    const tg = e.target.closest("button[data-toggle]");
    if (tg) {
      const id = tg.dataset.toggle;
      const item = selected().find((x) => x.id === id);
      if (item && isCardOpen(item)) {            // collapse
        collapsedCards.add(id);
        if (openCardId() === id) expandedCardId = "__none__";
      } else {                                   // expand
        collapsedCards.delete(id);
        expandedCardId = id;
      }
      return renderLetter();
    }
    const rm = e.target.closest("button[data-remove]"); if (rm) return removeSelected(rm.dataset.remove);
    const mv = e.target.closest("button[data-move]"); if (mv) return move(mv.dataset.id, mv.dataset.move === "up" ? -1 : 1);
    const sv = e.target.closest("button[data-savelib]"); if (sv) return saveSelectedToLibrary(sv.dataset.savelib);
  });
  el.letterBody.addEventListener("change", (e) => {
    const cf = e.target.closest("input[data-confirm]");
    if (cf) {
      const item = selected().find((x) => x.id === cf.dataset.confirm);
      if (item) { item.customConfirmed = cf.checked; saveSession(); renderLetter(); }
      return;
    }
    const orig = e.target.closest("input[data-orig]");
    if (!orig) return;
    const item = selected().find((x) => x.id === orig.dataset.orig);
    if (!item) return;
    item.useOriginal = orig.checked;
    saveSession();
    renderLetter();
  });

  el.lockToggle.addEventListener("change", () => {
    if (mode === "preview") state.settings.structuredLocked = el.lockToggle.checked;
    else state.settings.letterLocked = el.lockToggle.checked;
    saveSettings();
    renderLetter();
  });
  el.undoBtn.addEventListener("click", undoRemoval);

  el.manuscriptInput.addEventListener("input", () => {
    state.session.manuscript = el.manuscriptInput.value;
    saveSession();
    renderLetter();
  });

  $("#addCustomBtn").addEventListener("click", addCustom);
  $("#viewSectionsBtn").addEventListener("click", () => setChecklistView("sections"));
  $("#viewQuickBtn").addEventListener("click", () => setChecklistView("quick"));
  $("#editModeBtn").addEventListener("click", () => setMode("edit"));
  $("#previewModeBtn").addEventListener("click", () => setMode("preview"));
  el.orderBtn.addEventListener("click", orderCards);
  el.devBtn.addEventListener("click", toggleDev);
  el.settingsDevBtn.addEventListener("click", toggleDev);
  el.setupDevBtn.addEventListener("click", toggleDev);

  // ⚠ on the DOCX button: jump to the first request still needing entry, don't trigger an export.
  el.docxWarn.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = selected().find((i) => itemNeedsCustom(i) && !i.customConfirmed);
    if (!item) return;
    if (mode !== "edit") setMode("edit");
    collapsedCards.delete(item.id);
    expandedCardId = item.id;
    renderLetter();
    focusCard(item.id);
  });

  // Settings overlay
  $("#settingsBtn").addEventListener("click", () => { renderSettings(); el.settingsScreen.hidden = false; });
  $("#settingsCloseBtn").addEventListener("click", () => { el.settingsScreen.hidden = true; });
  el.settingsList.addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-default]");
    if (cb) {
      if (!requireDev()) { cb.checked = L().preselected.includes(cb.dataset.default); return; }
      const set = new Set(L().preselected);
      cb.checked ? set.add(cb.dataset.default) : set.delete(cb.dataset.default);
      L().preselected = [...set];
      saveWorking();
      return;
    }
    const tag = e.target.closest("input[data-tag]");
    if (tag) {
      if (!requireDev()) return renderSettings();
      setTag(tag.dataset.tag, tag.dataset.group, tag.checked);
    }
  });
  el.settingsList.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-editrow]"); if (edit) return startEditSetting(edit.dataset.editrow);
    const save = e.target.closest("[data-save]"); if (save) return saveEditSetting(save.dataset.save);
    const rev = e.target.closest("[data-revert]"); if (rev) return revertSetting(rev.dataset.revert);
    if (e.target.closest("[data-canceledit]")) { editingSettingId = null; return renderSettings(); }
    const del = e.target.closest("[data-del]"); if (del) return deleteSetting(del.dataset.del, del.dataset.lib === "1");
    const res = e.target.closest("[data-restore]"); if (res) return restoreSetting(res.dataset.restore);
  });

  el.introText.addEventListener("input", () => {
    if (!devUnlocked) return;
    L().introOverride = el.introText.value;
    saveWorking();
    if (mode === "preview") renderLetter();
  });
  el.introRevertBtn.addEventListener("click", () => {
    if (!requireDev()) return;
    L().introOverride = null;                 // fall back to this library's default intro
    saveWorking();
    el.introText.value = curIntro();
    if (mode === "preview") renderLetter();
  });

  // Setup overlay
  $("#setupBtn").addEventListener("click", () => { el.setupScreen.hidden = false; renderSetup(); });
  $("#setupCloseBtn").addEventListener("click", () => { el.setupScreen.hidden = true; editingSetupReqId = null; });
  el.setupIntro.addEventListener("input", () => {
    if (!devUnlocked) return;
    activeMaster().intro = el.setupIntro.value;
    saveMasters();
    if (mode === "preview" && L().introOverride == null) renderLetter();
  });
  el.setupLibs.addEventListener("change", (e) => {
    const act = e.target.closest("input[data-activate]");
    if (act) return setActiveMaster(act.dataset.activate);
  });
  el.setupLibs.addEventListener("click", (e) => {
    const ren = e.target.closest("[data-renamelib]"); if (ren) return renameLibrary(ren.dataset.renamelib);
    const dup = e.target.closest("[data-duplib]"); if (dup) return duplicateLibrary(dup.dataset.duplib);
    const del = e.target.closest("[data-dellib]"); if (del) return deleteLibrary(del.dataset.dellib);
    if (e.target.closest("[data-newlib]")) return newLibrary();
  });
  el.exportLibBtn.addEventListener("click", exportLibrary);
  el.importLibInput.addEventListener("change", (e) => {
    if (e.target.files[0]) importLibrary(e.target.files[0]);
    e.target.value = "";
  });
  el.setupSections.addEventListener("input", (e) => {
    const nm = e.target.closest("input[data-secname]");
    if (nm) renameSection(nm.dataset.secname, nm.value);
  });
  el.setupSections.addEventListener("click", (e) => {
    const up = e.target.closest("[data-secup]"); if (up) return moveSection(up.dataset.secup, -1);
    const dn = e.target.closest("[data-secdown]"); if (dn) return moveSection(dn.dataset.secdown, 1);
    const del = e.target.closest("[data-secdel]"); if (del) return deleteSection(del.dataset.secdel);
    if (e.target.closest("[data-addsec]")) return addSection($("#newSectionName").value);
  });
  el.setupRequests.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-reqedit]"); if (ed) { if (!requireDev()) return; editingSetupReqId = ed.dataset.reqedit; return renderSetup(); }
    const sv = e.target.closest("[data-reqsave]"); if (sv) return saveRequest(sv.dataset.reqsave);
    if (e.target.closest("[data-reqcancel]")) { editingSetupReqId = null; return renderSetup(); }
    const del = e.target.closest("[data-reqdel]"); if (del) return deleteRequest(del.dataset.reqdel);
    if (e.target.closest("[data-addreq]")) return addRequest();
  });

  el.pdfCollapseBtn.addEventListener("click", () => setPdfCollapsed(true));
  el.pdfExpandBtn.addEventListener("click", () => setPdfCollapsed(false));

  $("#seedBtn").addEventListener("click", () => {
    if (!requireDev()) return;
    if (!confirm("Reset selected requests to the preselected set, and clear the Manuscript Number? (Your libraries are kept.)")) return;
    resetSnapshot = structuredClone(state.session);   // whole-session snapshot for "Undo reset"
    state.session.selected = [];
    state.session.manuscript = "";
    state.session.exportName = "";
    state.session.exportCount = 0;
    el.manuscriptInput.value = "";
    undoStack = [];
    expandedCardId = null;
    collapsedCards.clear();
    applyDefaults();
    saveSession();
    render();
  });

  el.undoResetBtn.addEventListener("click", () => {
    if (!resetSnapshot) return;
    state.session = resetSnapshot;
    resetSnapshot = null;
    el.manuscriptInput.value = state.session.manuscript || "";
    saveSession();
    render();
  });

  $("#copyBtn").addEventListener("click", async () => {
    if (!selected().length) return flash("Nothing to copy yet.");
    await navigator.clipboard.writeText(letterText());
    flash("Letter copied.");
  });

  // Working file — the resumable bundle: stop mid-assessment, reopen later (even on
  // another computer) and continue. Libraries are included so it opens correctly there.
  $("#exportBtn").addEventListener("click", async () => {
    if (!confirmExport()) return;
    const name = exportBase();
    const snapshot = { kind: "working", session: state.session, masterLibraries: state.masterLibraries, working: state.working, settings: state.settings, savedAt: new Date().toISOString() };
    await store.saveChecklist(name, snapshot);                       // archive/checklists/<name>.json (server only)
    store.triggerDownload(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }), name + ".json");
    flash(`Saved working file “${name}”.`);
  });

  $("#docxBtn").addEventListener("click", async () => {
    if (!selected().length) return flash("Nothing to export yet.");
    if (!confirmExport()) return;
    const warnN = selected().filter((i) => itemNeedsCustom(i) && !i.customConfirmed).length;
    if (warnN && !confirm(`${warnN} request(s) needing customisation are not marked done. Export anyway?`)) return;
    const name = exportBase();
    await store.exportDocx(name, name, letterGroups(), curIntro());
    flash(`DOCX exported: ${name}.docx`);
  });

  // Open working file — restore a saved session and continue where it stopped.
  el.importInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded = JSON.parse(reader.result);
        if (loaded.kind === "library") throw new Error("that's a library file — load it via Setup ▸ Import library");
        const sess = loaded.session || loaded;          // accept snapshot or raw state
        if (!Array.isArray(sess.selected)) throw new Error("not a working file");
        if (!confirm("Open this working file? It replaces your current in-progress checklist.")) return;
        state.session = sess;
        if (Array.isArray(loaded.masterLibraries) && loaded.masterLibraries.length) state.masterLibraries = loaded.masterLibraries;
        if (loaded.working) state.working = loaded.working;
        if (loaded.settings) state.settings = loaded.settings;
        migrate();
        undoStack = [];
        resetSnapshot = null;
        collapsedCards.clear();
        saveSession(); saveWorking(); saveMasters(); saveSettings();
        el.manuscriptInput.value = state.session.manuscript || "";
        render();
        flash("Loaded.");
      } catch (err) {
        alert("Could not load file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("#pdfInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("#pdfFrame").innerHTML = `<object data="${URL.createObjectURL(file)}" type="application/pdf"></object>`;
  });

  el.searchInput.addEventListener("input", renderChecklist);

  // Mouse-first tool, light keyboard help: / search, ↑↓ move between checks, space/enter toggle, esc close.
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") {
      if (!el.setupScreen.hidden) { el.setupScreen.hidden = true; return; }
      if (!el.settingsScreen.hidden) { el.settingsScreen.hidden = true; return; }
      if (inField) { e.target.blur(); return; }
      return;
    }
    if (e.key === "/" && !inField) { e.preventDefault(); el.searchInput.focus(); el.searchInput.select(); return; }
    // only visible checks (those in open sections / quick list) are focusable
    const boxes = [...el.categoryList.querySelectorAll("input[type='checkbox'][data-id]")].filter((b) => b.offsetParent !== null);
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && boxes.length) {
      const i = boxes.indexOf(document.activeElement);
      if (i === -1) { if (!inField) { e.preventDefault(); boxes[0].focus(); } return; }
      e.preventDefault();
      boxes[(i + (e.key === "ArrowDown" ? 1 : -1) + boxes.length) % boxes.length].focus();
      return;
    }
    if (e.key === "Enter" && document.activeElement?.matches?.("input[type='checkbox'][data-id]")) {
      e.preventDefault();
      document.activeElement.click();   // space already toggles natively
    }
  });
}

// ---- init ----
async function init() {
  el = {
    categoryList: $("#categoryList"), letterBody: $("#letterBody"), customText: $("#customText"),
    customTitle: $("#customTitle"),
    customLocation: $("#customLocation"), customSaveLib: $("#customSaveLib"), searchInput: $("#searchInput"),
    customBox: $("#customBox"), docxWarn: $("#docxWarn"),
    manuscriptInput: $("#manuscriptInput"), tabbar: $("#tabbar"), lockToggle: $("#lockToggle"),
    lockLabel: $("#lockLabel"),
    footInfo: $("#footInfo"), undoBtn: $("#undoBtn"), undoResetBtn: $("#undoResetBtn"), devBtn: $("#devBtn"),
    orderBtn: $("#orderBtn"), settingsDevBtn: $("#settingsDevBtn"),
    settingsScreen: $("#settingsScreen"), settingsList: $("#settingsList"), settingsLockNote: $("#settingsLockNote"),
    introText: $("#introText"), introRevertBtn: $("#introRevertBtn"),
    setupScreen: $("#setupScreen"), setupDevBtn: $("#setupDevBtn"), setupLockNote: $("#setupLockNote"),
    setupLibs: $("#setupLibs"), setupIntro: $("#setupIntro"), setupSections: $("#setupSections"), setupRequests: $("#setupRequests"),
    exportLibBtn: $("#exportLibBtn"), importLibInput: $("#importLibInput"),
    pdfCollapseBtn: $("#pdfCollapseBtn"), pdfExpandBtn: $("#pdfExpandBtn"),
    importInput: $("#importInput")
  };
  const loaded = await store.loadStores(defaults());
  state = loaded;
  if (!state.masterLibraries.length) migrateToLibraries();   // first run: build the foundation from code
  migrate();
  saveMasters(); saveWorking(); saveSettings();   // persist whatever migrate() just normalised
  syncLibrary();
  if (!selected().length) applyDefaults();
  el.manuscriptInput.value = state.session.manuscript || "";
  updateDevButton();
  wire();
  render();
}

// Surface startup failures instead of dying silently — a silent throw here looks
// like "the page loads but no button works" (init wires every click at its end).
init().catch((err) => {
  console.error(err);
  const b = document.createElement("div");
  b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#b00020;color:#fff;font:14px/1.4 system-ui;padding:10px 14px";
  b.textContent = "This tool couldn't start in this browser (" + (err && err.message ? err.message : err) +
    "). Please open it in an up-to-date Chrome or Edge.";
  document.body.appendChild(b);
});
