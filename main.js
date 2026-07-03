import * as store from "./storage.js";
import {
  state, $, selected, itemNeedsCustom, syncLibrary, applyDefaults, loadState, migrate,
  saveSession, saveWorking, saveMasters, saveSettings,
  setExpandedCard, collapsedCards, letterSectionOpen, undoStack, curIntro
} from "./state.js";
import { renderTabs, renderLocations, renderChecklist, wireChecklist } from "./checklist.js";
import { renderLetter, syncLock, wireLetter, flash, letterGroups, letterText, exportBase, confirmExport } from "./letter.js";
import { wireOverlays, applyRole, openRolePicker, closeTopMenu } from "./overlays.js";

// Entry point: shared DOM-ref cache, the top-level render orchestrator, and everything
// that isn't specific to one pane (PDF viewer, Reset, top-bar export/import, shortcuts).
export let el = {};
export let resetSnapshot = null;      // whole-session snapshot taken on Reset, for "Undo reset"

export function render() {
  syncLibrary();
  renderTabs();
  renderLocations();
  renderChecklist();
  renderLetter();
  syncLock();
}

function setPdfCollapsed(on) {
  document.querySelector(".workspace").classList.toggle("pdf-collapsed", on);
  el.pdfExpandBtn.hidden = !on;
}

function wire() {
  wireChecklist();
  wireLetter();
  wireOverlays();

  el.pdfCollapseBtn.addEventListener("click", () => setPdfCollapsed(true));
  el.pdfExpandBtn.addEventListener("click", () => setPdfCollapsed(false));

  $("#seedBtn").addEventListener("click", () => {
    if (!confirm("Reset selected requests to the preselected set, and clear the Manuscript Number? (Your libraries are kept.)")) return;
    resetSnapshot = structuredClone(state.session);   // whole-session snapshot for "Undo reset"
    state.session.selected = [];
    state.session.manuscript = "";
    state.session.exportName = "";
    state.session.exportCount = 0;
    el.manuscriptInput.value = "";
    undoStack.length = 0;
    setExpandedCard(null);
    collapsedCards.clear();
    letterSectionOpen.clear();
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
        // Keep the recipient's own role — a working file handed over by an EA
        // must not turn the Editor's UI into an EA one.
        if (loaded.settings) state.settings = { ...loaded.settings, role: state.settings.role };
        migrate();
        undoStack.length = 0;
        resetSnapshot = null;
        collapsedCards.clear();
        letterSectionOpen.clear();
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

  // Mouse-first tool, light keyboard help: / search, ↑↓ move between checks, space/enter toggle, esc close.
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") {
      if (!el.topMenu.hidden) { closeTopMenu(); return; }
      if (!el.roleScreen.hidden) { if (state.settings.role) el.roleScreen.hidden = true; return; }   // first run: must pick
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
    footInfo: $("#footInfo"), undoBtn: $("#undoBtn"), undoResetBtn: $("#undoResetBtn"),
    orderBtn: $("#orderBtn"),
    menuBtn: $("#menuBtn"), topMenu: $("#topMenu"),
    roleBtn: $("#roleBtn"), roleScreen: $("#roleScreen"), roleCloseBtn: $("#roleCloseBtn"), setupBtn: $("#setupBtn"),
    settingsScreen: $("#settingsScreen"), settingsList: $("#settingsList"),
    introText: $("#introText"), introRevertBtn: $("#introRevertBtn"),
    setupScreen: $("#setupScreen"),
    setupLibs: $("#setupLibs"), setupIntro: $("#setupIntro"), setupSections: $("#setupSections"), setupRequests: $("#setupRequests"),
    exportLibBtn: $("#exportLibBtn"), importLibInput: $("#importLibInput"),
    pdfCollapseBtn: $("#pdfCollapseBtn"), pdfExpandBtn: $("#pdfExpandBtn"),
    importInput: $("#importInput")
  };
  await loadState();
  el.manuscriptInput.value = state.session.manuscript || "";
  applyRole();
  wire();
  render();
  if (!state.settings.role) openRolePicker();   // first run: pick a role before anything else
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
