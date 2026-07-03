import * as store from "./storage.js";
import {
  state, sections, $, escapeHtml, groupBy,
  selected, L, curIntro, displayText, isEdited, isCardOpen, openCardId, itemNeedsCustom, isLetterSectionOpen,
  letterSectionOpen, collapsedCards, undoStack, setExpandedCard, saveSession, saveSettings,
  move, orderCards, removeSelected, undoRemoval, revertCardToOriginal, saveSelectedToLibrary
} from "./state.js";
import { el, resetSnapshot } from "./main.js";

// Right pane: the letter being built (Edit-stack / Preview), its footer, and export text.
export let mode = "edit";

export function renderLetter() {
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
  const groups = groupBy(selected(), (i) => i.location);
  el.letterBody.innerHTML = heading + sections.filter((s) => groups.has(s.id)).map((section) => {
    const items = groups.get(section.id);
    const open = isLetterSectionOpen(section.id, items);
    const needsN = items.filter((i) => itemNeedsCustom(i) && !i.customConfirmed).length;
    return `<details class="letter-section" data-section="${section.id}" ${open ? "open" : ""}>
      <summary><span>${escapeHtml(section.label)}</span>
        <span class="count">${needsN ? `<span class="flagged">${needsN} need${needsN === 1 ? "s" : ""} entry</span> · ` : ""}${items.length}</span></summary>
      <div class="letter-section-body">${items.map((item) => {
        const edited = isEdited(item);
        const collapsed = !isCardOpen(item);
        const needsCustom = itemNeedsCustom(item);
        return `<article class="card ${item.custom ? "custom" : ""} ${needsCustom ? "needs-entry" : ""} ${collapsed ? "collapsed" : ""}" data-id="${item.id}">
          <div class="card-head">
            <button class="card-toggle" type="button" data-toggle="${item.id}" title="${collapsed ? "Expand" : "Collapse"}">${collapsed ? "▸" : "▾"}</button>
            <div class="card-headmain"><div class="card-titlerow">
              <input class="card-title-input" type="text" data-title="${item.id}" value="${escapeHtml(item.title)}" ${locked ? "readonly" : ""}>
              ${item.custom ? '<span class="tag">Custom</span>' : ""}</div>
              <div class="meta">${item.custom ? "custom" : "system"}${item.savedToLibrary ? " · saved" : ""}</div></div>
            <div class="card-actions">
              ${needsCustom ? `<label class="custom-confirm ${item.customConfirmed ? "done" : ""}" title="Tick once you have filled in this request"><input type="checkbox" data-confirm="${item.id}" ${item.customConfirmed ? "checked" : ""}> needs entry</label>` : ""}
              ${item.savedToLibrary ? "" : `<button class="ghost-btn icon-btn" type="button" data-savelib="${item.id}" title="Save to your library" aria-label="Save to your library">💾</button>`}
              <button class="remove-btn icon-btn" type="button" data-remove="${item.id}" title="Remove" aria-label="Remove">✕</button></div>
          </div>
          <textarea rows="4" data-edit="${item.id}" ${locked ? "readonly" : ""}>${escapeHtml(displayText(item))}</textarea>
          ${edited ? `<div class="original-box">
            <div class="original-label">Journal original</div>
            <div class="original-text">${escapeHtml(item.originalBody)}</div>
            ${locked ? "" : `<button type="button" class="revert-btn" data-revertcard="${item.id}">Revert to journal original</button>`}
          </div>` : ""}
        </article>`;
      }).join("")}</div>
    </details>`;
  }).join("");
  updateFoot();
}

export function updateFoot() {
  const n = selected().length;
  const preN = selected().filter((i) => L().preselected.includes(i.templateId)).length;
  const needN = selected().filter((i) => itemNeedsCustom(i) && !i.customConfirmed).length;
  el.footInfo.textContent =
    (n ? `${preN} preselected, ${needN} need${needN === 1 ? "s" : ""} entry` : "") +
    (store.isOnline() ? "" : "  ·  offline (no server)");
  el.undoBtn.hidden = undoStack.length === 0;
  el.undoResetBtn.hidden = resetSnapshot === null;
  el.docxWarn.hidden = needN === 0;
  el.docxWarn.title = needN ? `${needN} request(s) needing customisation not marked done` : "";
}

let flashTimer;
export function flash(msg) {
  el.footInfo.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateFoot, 2500);
}

export function focusCard(id) {
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

export function syncLock() {
  const locked = mode === "preview" ? state.settings.structuredLocked : state.settings.letterLocked;
  el.lockToggle.checked = locked;
  el.lockLabel.textContent = (locked ? "🔒" : "🔓") + " Locked";
  el.orderBtn.hidden = mode !== "edit";
}

export function setMode(next) {
  mode = next;
  $("#editModeBtn").classList.toggle("active", next === "edit");
  $("#previewModeBtn").classList.toggle("active", next === "preview");
  syncLock();
  renderLetter();
}

export function letterGroups() {
  const groups = groupBy(selected(), (i) => i.location);
  return sections.filter((s) => groups.has(s.id))
    .map((s) => ({ label: s.label, items: groups.get(s.id).map(displayText) }));
}

export function letterText() {
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
export function exportBase() {
  const base = (state.session.manuscript.trim() ? `${state.session.manuscript.trim()} ` : "") + "Author Checklist";
  if (state.session.exportName !== base) { state.session.exportName = base; state.session.exportCount = 1; }
  else state.session.exportCount += 1;
  const suffix = state.session.exportCount > 1 ? ` ${state.session.exportCount}` : "";
  saveSession();
  return base + suffix;
}

// Guard exports when the Manuscript Number is blank.
export function confirmExport() {
  if (state.session.manuscript.trim()) return true;
  return confirm("No Manuscript Number set. Export anyway?");
}

export function wireLetter() {
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
        if (openCardId() === id) setExpandedCard("__none__");
      } else {                                   // expand
        collapsedCards.delete(id);
        setExpandedCard(id);
      }
      return renderLetter();
    }
    const rm = e.target.closest("button[data-remove]"); if (rm) return removeSelected(rm.dataset.remove);
    const mv = e.target.closest("button[data-move]"); if (mv) return move(mv.dataset.id, mv.dataset.move === "up" ? -1 : 1);
    const sv = e.target.closest("button[data-savelib]"); if (sv) return saveSelectedToLibrary(sv.dataset.savelib);
    const rv = e.target.closest("button[data-revertcard]"); if (rv) return revertCardToOriginal(rv.dataset.revertcard);
  });
  el.letterBody.addEventListener("change", (e) => {
    const cf = e.target.closest("input[data-confirm]");
    if (!cf) return;
    const item = selected().find((x) => x.id === cf.dataset.confirm);
    if (item) { item.customConfirmed = cf.checked; saveSession(); renderLetter(); }
  });
  el.letterBody.addEventListener("toggle", (e) => {
    const d = e.target.closest("details.letter-section");
    if (!d) return;
    letterSectionOpen.set(d.dataset.section, d.open);
  }, true);

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

  $("#editModeBtn").addEventListener("click", () => setMode("edit"));
  $("#previewModeBtn").addEventListener("click", () => setMode("preview"));
  el.orderBtn.addEventListener("click", orderCards);

  // ⚠ on the DOCX button: jump to the first request still needing entry, don't trigger an export.
  el.docxWarn.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = selected().find((i) => itemNeedsCustom(i) && !i.customConfirmed);
    if (!item) return;
    if (mode !== "edit") setMode("edit");
    collapsedCards.delete(item.id);
    setExpandedCard(item.id);
    renderLetter();
    focusCard(item.id);
  });
}
