import { seedMasterLibrary, DEFAULT_INTRO } from "./data.js";
import * as store from "./storage.js";
import { renderChecklist } from "./checklist.js";
import { renderSettings } from "./overlays.js";
import { flash, focusCard, renderLetter, mode } from "./letter.js";
import { render } from "./main.js";

// Two layers:
//   Master Library  — the journal-wide foundation (sections + system requests), edited in Setup.
//   Working Library — one personal layer per master: preselected, adaptations, hidden, personal requests.
// `sections` and `templates` below are derived from the ACTIVE master library (see syncLibrary).

// Middle-pane tabs. 'all' and 'custom' are filter views, not real checklists.
// (id "custom"; label "(Custom)" — user-authored one-off requests.)
export const TABS = [
  { id: "all", label: "All", real: false },
  { id: "ea", label: "EA Requests", real: true },
  { id: "editor", label: "Editor Requests", real: true },
  { id: "custom", label: "(Custom)", real: false }
];
const SEED_PRESELECTED = ["section_order", "affiliation_check"];   // used only for a brand-new seeded library
const UNDO_MAX = 5;
// Roles declutter the UI (Setup is Director-only, default tab matches the checklist you
// run). They are NOT security — this is a client-side app, none is possible.
export const ROLE_LABELS = { director: "Director", editor: "Editor", ea: "Assistant Editor" };
export const ROLE_TAB = { director: "all", editor: "editor", ea: "ea" };   // default tab per role
export const GROUP_IDS = ["ea", "editor"];                            // taggable checklist memberships
export const GROUP_LABELS = { ea: "EA", editor: "Editor" };
// "Reporting Summary" used to be a tab (an audience); it is now a SECTION.
// migrateMaster() moves old reporting-tagged requests into it.
const RS_SECTION = { id: "reporting", label: "Reporting Summary" };

// Active master's requests, decorated with display order. Rebuilt by syncLibrary().
export let sections = [];
export let templates = [];

export const $ = (sel) => document.querySelector(sel);

export function escapeHtml(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
export function groupBy(items, getKey) {
  const groups = new Map();
  items.forEach((i) => { const k = getKey(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  return groups;
}

function defaults() {
  return {
    library: [],   // legacy personal-request store; folded into working on first run
    settings: {    // app-level prefs only (not library-specific)
      letterLocked: true,
      structuredLocked: true,
      activeChecklists: { ea: true, editor: true },
      role: null   // director | editor | ea — picked on first run
    },
    session: { manuscript: "", activeTab: "all", selected: [], exportName: "", exportCount: 0 },
    masterLibraries: [],
    working: { activeMasterId: null, layers: {} }
  };
}

export let state = defaults();
export let expandedCardId = null;            // Edit-stack card left open; others collapse ("__none__" = all collapsed)
export function setExpandedCard(id) { expandedCardId = id; }
export const collapsedCards = new Set();     // cards the user manually collapsed (override the needs-entry auto-expand)
export const letterSectionOpen = new Map();  // sectionId -> explicit open state, overrides the needs-entry auto-open default
export let undoStack = [];

// ---- library accessors ----
export function newLayer() {
  return { preselected: [], adaptations: {}, adaptationTitles: {}, hidden: [], tagOverrides: {}, personalRequests: [], introOverride: null };
}
export function activeMaster() {
  const ms = state.masterLibraries;
  return ms.find((m) => m.id === state.working.activeMasterId) || ms[0];
}
export function ensureLayer(id) {
  if (!state.working.layers[id]) state.working.layers[id] = newLayer();
  return state.working.layers[id];
}
export const L = () => ensureLayer(activeMaster().id);             // active working layer
export const curIntro = () => L().introOverride ?? (activeMaster()?.intro ?? DEFAULT_INTRO);

// Rebuild the module-level `sections`/`templates` from the active master library.
export function syncLibrary() {
  const m = activeMaster();
  sections = m?.sections || [];
  templates = (m?.requests || []).map((t, i) => ({ ...t, order: i + 1 }));
}

// ---- persistence ----
export const saveSession = () => store.save("session", state.session);
export const saveWorking = () => store.save("working", state.working);
export const saveMasters = () => store.save("masterLibraries", state.masterLibraries);
export const saveSettings = () => store.save("settings", state.settings);

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
    role: old.role || null
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

export function migrate() {
  const s = state.settings;
  if (typeof s.letterLocked !== "boolean") s.letterLocked = true;
  if (typeof s.structuredLocked !== "boolean") s.structuredLocked = true;
  delete s.devPassword;                                   // retired soft lock (replaced by roles)
  if (!ROLE_LABELS[s.role]) s.role = null;                // unknown role → re-pick on load
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

export const templateById = (id) => templates.find((x) => x.id === id);
// Which tabs a request appears in. Falls back to the template's own `groups`.
export const templateGroups = (id) =>
  L().tagOverrides[id]?.length ? L().tagOverrides[id] : (templateById(id)?.groups?.length ? templateById(id).groups : ["ea"]);
export const libGroups = (e) => e.groups?.length ? e.groups : ["ea"];
export const overrideBody = (t) => L().adaptations[t.id] ?? t.body;
export const overrideTitle = (t) => L().adaptationTitles[t.id] ?? t.title;
export const isTplEdited = (id) => L().adaptations[id] != null || L().adaptationTitles[id] != null;   // "adapted"
export const hasBrackets = (text) => /\[[^\]]+\]/.test(text || "");
export const isHidden = (id) => L().hidden.includes(id);

export function applyDefaults() {
  L().preselected.forEach((id) => {
    if (state.session.selected.some((sel) => sel.templateId === id)) return;
    const t = templates.find((x) => x.id === id);
    if (t) return state.session.selected.push(makeSelected(t));
    const e = L().personalRequests.find((x) => x.id === id);
    if (e) state.session.selected.push(makeSelectedFromLib(e));
  });
}

// ---- selected-item helpers ----
export function makeSelected(template) {
  const override = L().adaptations[template.id];   // adapted system request, if any
  return {
    id: crypto.randomUUID(),
    templateId: template.id,
    title: overrideTitle(template),
    location: template.section,
    groups: templateGroups(template.id),
    originalBody: template.body,
    customText: override ?? null,
    custom: false,
    savedToLibrary: override != null,
    needsCustom: template.needsCustom || hasBrackets(override ?? template.body),
    customConfirmed: false,
    addedAt: Date.now()
  };
}

export function makeSelectedFromLib(e) {
  return {
    id: crypto.randomUUID(),
    templateId: e.id,                 // reuse lib id so the middle-pane checkbox stays in sync
    title: e.title,
    location: e.section,
    groups: libGroups(e),
    originalBody: null,
    customText: e.body,
    custom: true,
    savedToLibrary: true,
    needsCustom: hasBrackets(e.body),
    customConfirmed: false,
    addedAt: Date.now()
  };
}
export const selected = () => state.session.selected;
export function displayText(item) {
  return item.customText != null ? item.customText : (item.originalBody || "");
}
export function isEdited(item) {
  return item.originalBody != null && item.customText != null &&
    item.customText.trim() !== item.originalBody.trim();
}
export const needsEntry = (item) => hasBrackets(displayText(item));
export const itemNeedsCustom = (item) => item.needsCustom ?? needsEntry(item);
export const isSelected = (tid) => selected().some((i) => i.templateId === tid);
export const openCardId = () => expandedCardId ?? selected()[selected().length - 1]?.id;
// A card stays open if it's the focused card, or it still needs entry and the user hasn't collapsed it.
export const isCardOpen = (item) =>
  item.id === openCardId() ||
  (itemNeedsCustom(item) && !item.customConfirmed && !collapsedCards.has(item.id));
// A letter section defaults open only while it holds an unconfirmed needs-entry card; the user's own
// toggle (letterSectionOpen) overrides that default in either direction.
export function isLetterSectionOpen(sectionId, items) {
  if (letterSectionOpen.has(sectionId)) return letterSectionOpen.get(sectionId);
  return items.some((i) => itemNeedsCustom(i) && !i.customConfirmed);
}

// ---- mutations ----
// Add by id from either store: system request or personal request.
export function addById(id) {
  if (isSelected(id)) return;
  const t = templates.find((x) => x.id === id);
  const e = !t && L().personalRequests.find((x) => x.id === id);
  if (!t && !e) return;
  selected().push(t ? makeSelected(t) : makeSelectedFromLib(e));
  setExpandedCard(selected()[selected().length - 1].id);
  saveSession();
  render();
  if (mode === "edit") focusCard(selected()[selected().length - 1].id);
}

export function removeSelected(id) {
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

export function undoRemoval() {
  const last = undoStack.pop();
  if (!last) return;
  selected().splice(Math.min(last.index, selected().length), 0, last.item);
  saveSession();
  render();
}

export function saveToLibrary(item) {
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

export function saveSelectedToLibrary(id) {
  const item = selected().find((x) => x.id === id);
  if (!item) return;
  // Edited system request → save as an adaptation that replaces the original in the middle pane.
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

// Drop this card's edit and go back to showing the journal's original text (session-local — doesn't touch the library adaptation).
export function revertCardToOriginal(id) {
  const item = selected().find((x) => x.id === id);
  if (!item || item.originalBody == null) return;
  item.customText = null;
  item.savedToLibrary = false;
  saveSession();
  renderLetter();
  flash("Reverted to journal original");
}

// Toggle which tabs a request shows in. Keeps at least one group so it stays reachable.
export function setTag(id, group, on) {
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

export function move(id, dir) {
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
export function orderCards() {
  const rank = (id) => { const i = sections.findIndex((s) => s.id === id); return i === -1 ? sections.length : i; };
  selected().sort((a, b) => rank(a.location) - rank(b.location));
  saveSession();
  renderLetter();
}

// ---- roles (UI decluttering, not security) ----
export const isDirector = () => state.settings.role === "director";

// ---- init: load persisted state, run migrations, apply defaults ----
export async function loadState() {
  const loaded = await store.loadStores(defaults());
  state = loaded;
  if (!state.masterLibraries.length) migrateToLibraries();   // first run: build the foundation from code
  migrate();
  saveMasters(); saveWorking(); saveSettings();   // persist whatever migrate() just normalised
  syncLibrary();
  if (!selected().length) applyDefaults();
  return state;
}
