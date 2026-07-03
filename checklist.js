import {
  state, sections, templates, TABS, GROUP_IDS, $, escapeHtml,
  L, selected, isHidden, isSelected, isTplEdited, overrideTitle, overrideBody, templateGroups, libGroups,
  hasBrackets, saveToLibrary, saveSession, saveSettings, setExpandedCard, isDirector,
  addById, removeSelected
} from "./state.js";
import { focusCard, mode } from "./letter.js";
import { render, el } from "./main.js";

// Middle pane: tab bar, category/quick list, custom-request add form.
const openSections = new Set();
const openQuick = new Set();          // quick-list rows showing their description
let checklistView = "sections";       // "sections" (collapsible) | "quick" (flat titles)

// Flagged (selected) count for a tab — "all" is the grand total, others count by membership.
function tabFlagged(id) {
  const sel = selected();
  if (id === "all") return sel.length;
  if (id === "custom") return sel.filter((i) => i.custom).length;
  return sel.filter((i) => (i.groups?.length ? i.groups : ["ea"]).includes(id)).length;
}

export function renderTabs() {
  el.tabbar.innerHTML = TABS.map((tab) => {
    const active = state.session.activeTab === tab.id ? "active" : "";
    const toggle = tab.real && isDirector()
      ? `<input type="checkbox" class="tab-active" data-tab="${tab.id}" ${state.settings.activeChecklists[tab.id] ? "checked" : ""} title="Activate checklist">`
      : "";
    const n = tabFlagged(tab.id);
    const badge = n ? `<span class="tab-flagged" title="${n} flagged">${n}</span>` : "";
    return `<button type="button" class="tab ${active}" data-tab="${tab.id}">${toggle}${escapeHtml(tab.label)}${badge}</button>`;
  }).join("");
}

export function renderLocations() {
  el.customLocation.innerHTML = sections
    .map((s, i) => `<option value="${s.id}">${i + 1}. ${s.label}</option>`)
    .join("");
}

export function renderChecklist() {
  const query = el.searchInput.value.trim().toLowerCase();
  const tab = state.session.activeTab;

  if (GROUP_IDS.includes(tab) && !state.settings.activeChecklists[tab]) {
    el.categoryList.innerHTML = `<div class="empty-state">Checklist “${TABS.find((t) => t.id === tab).label}” is off. ${isDirector() ? "Tick its box in the tab bar to activate." : "Switch to the Director role (top bar) to activate it."}</div>`;
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

export function setChecklistView(next) {
  checklistView = next;
  $("#viewSectionsBtn").classList.toggle("active", next === "sections");
  $("#viewQuickBtn").classList.toggle("active", next === "quick");
  el.customBox.hidden = next === "quick";   // no custom field in quick view
  renderChecklist();
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
    custom: true,
    savedToLibrary: false,
    needsCustom: hasBrackets(text),
    customConfirmed: false,
    addedAt: Date.now()
  };
  if (el.customSaveLib.checked) { saveToLibrary(item); item.savedToLibrary = true; }
  selected().push(item);
  setExpandedCard(item.id);
  el.customText.value = "";
  el.customTitle.value = "";
  el.customSaveLib.checked = false;
  saveSession();
  render();
  if (mode === "edit") focusCard(item.id);
}

export function wireChecklist() {
  el.tabbar.addEventListener("click", (e) => {
    const cb = e.target.closest(".tab-active");
    if (cb) {
      e.stopPropagation();
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

  $("#addCustomBtn").addEventListener("click", addCustom);
  $("#viewSectionsBtn").addEventListener("click", () => setChecklistView("sections"));
  $("#viewQuickBtn").addEventListener("click", () => setChecklistView("quick"));

  el.searchInput.addEventListener("input", renderChecklist);
}
