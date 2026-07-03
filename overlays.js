import { DEFAULT_INTRO } from "./data.js";
import * as store from "./storage.js";
import {
  state, sections, templates, $, escapeHtml, GROUP_IDS, GROUP_LABELS, ROLE_LABELS, ROLE_TAB,
  L, activeMaster, ensureLayer, curIntro, syncLibrary, templateById, overrideTitle, overrideBody, templateGroups,
  isTplEdited, libGroups, isHidden, isDirector, setTag,
  saveSession, saveWorking, saveMasters, saveSettings, migrate
} from "./state.js";
import { renderChecklist } from "./checklist.js";
import { flash, mode, renderLetter } from "./letter.js";
import { render, el } from "./main.js";

// Settings overlay (personal layer) + Setup overlay (Master Libraries) + role picker + top "⋯" menu.
let editingSettingId = null;          // settings row currently open for inline text editing
let editingSetupReqId = null;         // setup system-request row open for inline editing

// ---- roles (UI decluttering, not security) ----
export function applyRole() {
  const r = state.settings.role;
  el.roleBtn.textContent = "👤 " + (ROLE_LABELS[r] || "Choose role");
  el.setupBtn.hidden = !isDirector();
}
export function closeTopMenu() {
  el.topMenu.hidden = true;
  el.menuBtn.setAttribute("aria-expanded", "false");
}
export function openRolePicker() {
  el.roleCloseBtn.hidden = !state.settings.role;   // first run: a role must be picked
  el.roleScreen.hidden = false;
}
function setRole(role) {
  if (!ROLE_LABELS[role]) return;
  state.settings.role = role;
  saveSettings();
  state.session.activeTab = ROLE_TAB[role];
  saveSession();
  el.roleScreen.hidden = true;
  if (!isDirector()) el.setupScreen.hidden = true;
  applyRole();
  render();
}

// ---- Settings overlay (personal layer) ----
function settingsRow({ id, title, rawTitle, body, groups, fromLib, edited, origBody }) {
  if (editingSettingId === id) {
    return `<div class="settings-row editing">
      <input class="settings-edit-title" type="text" data-edit-title="${id}" value="${escapeHtml(rawTitle ?? title)}" placeholder="Title">
      <textarea class="settings-edit" data-edit-id="${id}" rows="5">${escapeHtml(body)}</textarea>
      ${!fromLib ? `<div class="original-box">
        <div class="original-label">Journal original</div>
        <div class="original-text">${escapeHtml(origBody)}</div>
      </div>` : ""}
      <div class="settings-edit-actions">
        <button type="button" data-save="${id}">Save</button>
        ${!fromLib && edited ? `<button type="button" data-revert="${id}">Revert to system text</button>` : ""}
        <button type="button" data-canceledit="1">Cancel</button>
      </div></div>`;
  }
  const on = L().preselected.includes(id);
  const tags = GROUP_IDS.map((g) => `<label class="tag-check"><input type="checkbox" data-tag="${id}" data-group="${g}"
    ${groups.includes(g) ? "checked" : ""}> ${GROUP_LABELS[g]}</label>`).join("");
  return `<div class="settings-row">
    <label class="settings-default"><input type="checkbox" data-default="${id}" ${on ? "checked" : ""}> preselected</label>
    <button type="button" class="settings-name" data-editrow="${id}" title="${escapeHtml(body)}">${escapeHtml(title)}${edited ? ' <span class="tag custom-flag">adapted</span>' : ""}</button>
    <span class="settings-tags">${tags}</span>
    <button type="button" class="settings-del" data-del="${id}" data-lib="${fromLib ? 1 : 0}" title="${fromLib ? "Delete this custom request" : "Hide this system request (can be restored)"}">×</button>
  </div>`;
}

export function renderSettings() {
  if (!el.settingsList) return;
  el.introText.value = curIntro();
  let html = sections.map((section) => {
    const items = templates.filter((t) => t.section === section.id && !isHidden(t.id));
    if (!items.length) return "";
    return `<div class="settings-group"><h4>${escapeHtml(section.label)}</h4>${
      items.map((t) => settingsRow({ id: t.id, title: overrideTitle(t), rawTitle: overrideTitle(t), body: overrideBody(t), groups: templateGroups(t.id), fromLib: false, edited: isTplEdited(t.id), origBody: t.body })).join("")
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
        <button type="button" data-restore="${t.id}">Restore</button></div>`).join("")
    }</div>`;
  }
  el.settingsList.innerHTML = html;
}

// Inline personal-layer editing (Settings) — each user's own layer, never locked.
function startEditSetting(id) {
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

export function renderSetup() {
  if (!el.setupScreen || el.setupScreen.hidden) return;
  const m = activeMaster();
  // Library picker
  el.setupLibs.innerHTML = state.masterLibraries.map((lib) =>
    `<div class="setup-lib-row ${lib.id === m.id ? "active" : ""}">
      <label><input type="radio" name="activeLib" data-activate="${lib.id}" ${lib.id === m.id ? "checked" : ""}> <strong>${escapeHtml(lib.name)}</strong></label>
      <span class="muted">${(lib.requests || []).length} requests · ${(lib.sections || []).length} sections</span>
      <span class="setup-lib-actions">
        <button type="button" data-renamelib="${lib.id}">Rename</button>
        <button type="button" data-duplib="${lib.id}">Duplicate</button>
        <button type="button" data-dellib="${lib.id}" ${state.masterLibraries.length > 1 ? "" : "disabled"}>Delete</button>
      </span>
    </div>`).join("") +
    `<div class="setup-add"><button type="button" data-newlib="1">+ New empty library (start from 0)</button></div>`;

  // Intro (chief-editor default for this library)
  el.setupIntro.value = m.intro ?? DEFAULT_INTRO;

  // Sections
  el.setupSections.innerHTML = (m.sections || []).map((s, i) =>
    `<div class="setup-section-row">
      <input type="text" data-secname="${s.id}" value="${escapeHtml(s.label)}">
      <button type="button" data-secup="${s.id}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-secdown="${s.id}" ${i === m.sections.length - 1 ? "disabled" : ""}>↓</button>
      <button type="button" data-secdel="${s.id}">×</button>
    </div>`).join("") +
    `<div class="setup-add"><input id="newSectionName" type="text" placeholder="New section name">
      <button type="button" data-addsec="1">Add section</button></div>`;

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
  return `<div class="settings-row">
    <button type="button" class="settings-name" data-reqedit="${r.id}" title="${escapeHtml(r.body)}">${escapeHtml(r.title)}</button>
    <span class="muted">${libGroups(r).map((g) => GROUP_LABELS[g]).join(", ")}</span>
    <button type="button" class="settings-del" data-reqdel="${r.id}" title="Delete this system request">×</button>
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
  html += `<div class="settings-group setup-newreq"><h4>Add a system request</h4>
    <input id="newReqTitle" type="text" placeholder="Title">
    <textarea id="newReqBody" rows="3" placeholder="Request text. [bracketed] tokens become editor fill-ins."></textarea>
    <div class="setup-req-meta">
      <select id="newReqSection">${(m.sections || []).map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
      <span class="settings-tags">${groupChecksHtml(["ea"], "data-newreq-group")}</span>
      <button type="button" data-addreq="1">Add</button>
    </div></div>`;
  return html;
}

// Master-library mutations (Setup is only reachable in the Director role)
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
  const lib = state.masterLibraries.find((m) => m.id === id);
  if (!lib) return;
  const name = (prompt("Library name:", lib.name) || "").trim();
  if (!name) return;
  lib.name = name;
  afterMasterEdit();
}
function duplicateLibrary(id) {
  const lib = state.masterLibraries.find((m) => m.id === id);
  if (!lib) return;
  state.masterLibraries.push({ ...structuredClone(lib), id: crypto.randomUUID(), name: lib.name + " copy" });
  afterMasterEdit();
}
function deleteLibrary(id) {
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
  const arr = activeMaster().sections;
  const i = arr.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  afterMasterEdit();
}
function deleteSection(id) {
  if (activeMaster().requests.some((r) => r.section === id))
    return alert("This section has requests. Move or delete them first.");
  activeMaster().sections = activeMaster().sections.filter((s) => s.id !== id);
  afterMasterEdit();
}
function addRequest() {
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
  if (!confirm("Delete this system request from the library?")) return;
  activeMaster().requests = activeMaster().requests.filter((r) => r.id !== id);
  afterMasterEdit();
}

export function wireOverlays() {
  // "⋯" top-bar menu: Setup / Reset / role, closes on outside click, Escape, or picking an item.
  el.menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = el.topMenu.hidden;
    el.topMenu.hidden = !open;
    el.menuBtn.setAttribute("aria-expanded", String(open));
  });
  el.topMenu.addEventListener("click", (e) => { if (e.target.closest("button")) closeTopMenu(); });
  document.addEventListener("click", (e) => {
    if (!el.topMenu.hidden && !e.target.closest(".menu-wrap")) closeTopMenu();
  });

  // Role picker — first-run overlay, reopened any time from the top bar.
  el.roleBtn.addEventListener("click", openRolePicker);
  el.roleCloseBtn.addEventListener("click", () => { el.roleScreen.hidden = true; });
  el.roleScreen.addEventListener("click", (e) => {
    const opt = e.target.closest("button[data-role]");
    if (opt) setRole(opt.dataset.role);
  });

  // Settings overlay
  $("#settingsBtn").addEventListener("click", () => { renderSettings(); el.settingsScreen.hidden = false; });
  $("#settingsCloseBtn").addEventListener("click", () => { el.settingsScreen.hidden = true; });
  el.settingsList.addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-default]");
    if (cb) {
      const set = new Set(L().preselected);
      cb.checked ? set.add(cb.dataset.default) : set.delete(cb.dataset.default);
      L().preselected = [...set];
      saveWorking();
      return;
    }
    const tag = e.target.closest("input[data-tag]");
    if (tag) setTag(tag.dataset.tag, tag.dataset.group, tag.checked);
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
    L().introOverride = el.introText.value;
    saveWorking();
    if (mode === "preview") renderLetter();
  });
  el.introRevertBtn.addEventListener("click", () => {
    L().introOverride = null;                 // fall back to this library's default intro
    saveWorking();
    el.introText.value = curIntro();
    if (mode === "preview") renderLetter();
  });

  // Setup overlay
  $("#setupBtn").addEventListener("click", () => { el.setupScreen.hidden = false; renderSetup(); });
  $("#setupCloseBtn").addEventListener("click", () => { el.setupScreen.hidden = true; editingSetupReqId = null; });
  el.setupIntro.addEventListener("input", () => {
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
    const ed = e.target.closest("[data-reqedit]"); if (ed) { editingSetupReqId = ed.dataset.reqedit; return renderSetup(); }
    const sv = e.target.closest("[data-reqsave]"); if (sv) return saveRequest(sv.dataset.reqsave);
    if (e.target.closest("[data-reqcancel]")) { editingSetupReqId = null; return renderSetup(); }
    const del = e.target.closest("[data-reqdel]"); if (del) return deleteRequest(del.dataset.reqdel);
    if (e.target.closest("[data-addreq]")) return addRequest();
  });
}
