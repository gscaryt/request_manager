// Persistence. Talks to server.py (real files in /archive). If the server
// isn't there (page opened as a bare file://), falls back to localStorage so
// the app still works — minus on-disk files and DOCX.
const LS_KEY = "aip-checks-v3";
let online = true;

async function api(method, path, body) {
  const res = await fetch("/api/" + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(res.status);
  return res;
}

function lsAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function lsPut(key, value) {
  const all = lsAll();
  all[key] = value;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

// Load all stores at once. Sets `online` based on whether the server answered.
// `library` is legacy (personal requests, now folded into working) — still read for migration.
export async function loadStores(defaults) {
  try {
    const [library, settings, session, masterLibraries, working] = await Promise.all([
      api("GET", "library").then((r) => r.json()),
      api("GET", "settings").then((r) => r.json()),
      api("GET", "session").then((r) => r.json()),
      api("GET", "masterLibraries").then((r) => r.json()),
      api("GET", "working").then((r) => r.json())
    ]);
    online = true;
    return {
      library: library || [],
      settings: Object.keys(settings || {}).length ? settings : defaults.settings,
      session: Object.keys(session || {}).length ? session : defaults.session,
      masterLibraries: masterLibraries || [],
      working: working || {}
    };
  } catch {
    online = false;
    const all = lsAll();
    return {
      library: all.library || [],
      settings: all.settings || defaults.settings,
      session: all.session || defaults.session,
      masterLibraries: all.masterLibraries || [],
      working: all.working || {}
    };
  }
}

// Debounced per-store save so typing doesn't hammer the disk.
const timers = {};
export function save(key, value) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    if (online) api("PUT", key, value).catch(() => lsPut(key, value));
    else lsPut(key, value);
  }, 250);
}

export function isOnline() { return online; }

// Named per-manuscript snapshots in archive/checklists/.
export async function listChecklists() {
  try { return await api("GET", "checklists").then((r) => r.json()); }
  catch { return []; }
}
export async function saveChecklist(name, snapshot) {
  if (online) return api("PUT", "checklists/" + encodeURIComponent(name), snapshot);
  lsPut("checklist:" + name, snapshot);
}
export async function getChecklist(name) {
  try { return await api("GET", "checklists/" + encodeURIComponent(name)).then((r) => r.json()); }
  catch { return lsAll()["checklist:" + name] || null; }
}

// Build a .docx and download it. Uses the server when online (keeps an
// archive/exports/ copy); offline (e.g. the standalone single-file build) it
// builds the same WordprocessingML in the browser — no Python needed.
export async function exportDocx(title, filename, groups, intro) {
  if (online) {
    const res = await api("POST", "docx", { title, filename, groups, intro });
    triggerDownload(await res.blob(), filename + ".docx");
    return;
  }
  triggerDownload(buildDocxBlob(title, groups, intro), filename + ".docx");
}

// ---- In-browser DOCX builder (mirrors build_docx in server.py) ----
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xmlEscape(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function docxRuns(text) {
  // One <w:p> per line so author-checklist line breaks survive.
  const lines = (text || "").split("\n");
  return lines.map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("");
}
function docxTable(items) {
  const border = "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((e) => `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("") +
    "</w:tblBorders>";
  const rows = items.map((text) =>
    "<w:tr>" +
    `<w:tc><w:tcPr><w:tcW w:w="6500" w:type="dxa"/></w:tcPr>${docxRuns(text)}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="3500" w:type="dxa"/></w:tcPr><w:p/></w:tc>` +
    "</w:tr>").join("");
  return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + border + "</w:tblPr>" +
    '<w:tblGrid><w:gridCol w:w="6500"/><w:gridCol w:w="3500"/></w:tblGrid>' +
    rows + "</w:tbl><w:p/>";
}
function docxHeading(text, bold, size) {
  const rpr = (bold ? "<w:b/>" : "") + (size ? `<w:sz w:val="${size}"/>` : "");
  return `<w:p><w:pPr><w:rPr>${rpr}</w:rPr></w:pPr><w:r><w:rPr>${rpr}</w:rPr>` +
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}
function buildDocxBlob(title, groups, intro) {
  let body = docxHeading(title, true, "32");
  if (intro) body += docxRuns(intro) + "<w:p/>";
  (groups || []).forEach((g, i) => {
    body += docxHeading(`${i + 1}. ${g.label}`, true, null);
    body += docxTable(g.items || []);
  });
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`;
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const zip = zipStore([
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rels },
    { name: "word/document.xml", text: document }
  ]);
  return new Blob([zip], { type: DOCX_TYPE });
}

// Minimal store-only (uncompressed) ZIP writer — enough for a .docx package.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  const enc = new TextEncoder();
  const files = entries.map((e) => {
    const data = enc.encode(e.text);
    return { name: enc.encode(e.name), data, crc: crc32(data) };
  });
  const out = [];
  let offset = 0;
  const central = [];
  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const f of files) {
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(f.crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(f.name.length), ...u16(0)
    ];
    out.push(new Uint8Array(header), f.name, f.data);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(f.crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(f.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), { name: f.name }
    ]);
    offset += header.length + f.name.length + f.data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    const fixed = [];
    let nameBytes;
    for (const part of c) {
      if (part && part.name) nameBytes = part.name;
      else fixed.push(part);
    }
    const head = new Uint8Array(fixed);
    out.push(head, nameBytes);
    cdSize += head.length + nameBytes.length;
  }
  out.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0)
  ]));
  return new Blob(out);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
