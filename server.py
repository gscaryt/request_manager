#!/usr/bin/env python3
"""Template Request Manager — local server. Stdlib only, no installs, no network, no AI.

Serves the static app and stores data as real JSON files under ./archive:

    archive/
      masterLibraries.json  the foundations: sections + system requests per journal
      working.json          per-master personal layer (adaptations, personal requests, preselected)
      library.json          legacy personal requests (folded into working.json on first run)
      settings.json         app prefs: locks, dev password, active checklists
      session.json          current working selection
      checklists/<name>.json   named per-manuscript snapshots (Export)
      exports/<name>.docx      generated author checklists (DOCX)

Run:  python3 server.py   →  open http://localhost:4173
"""
import http.server, socketserver, json, os, re, io, zipfile
from urllib.parse import unquote, urlsplit
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.join(ROOT, "archive")
CHECKLISTS = os.path.join(ARCHIVE, "checklists")
EXPORTS = os.path.join(ARCHIVE, "exports")
PORT = int(os.environ.get("PORT", "4173"))

for d in (ARCHIVE, CHECKLISTS, EXPORTS):
    os.makedirs(d, exist_ok=True)

# Single-file stores keyed by name. Defaults returned when the file is absent.
STORES = {"library": [], "settings": {}, "session": {}, "masterLibraries": [], "working": {}}
SAFE = re.compile(r"^[A-Za-z0-9 ._-]{1,120}$")  # filename allowlist, blocks traversal


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)  # atomic: never leaves a half-written DB file


# ---- DOCX (WordprocessingML built by hand, zipped with stdlib) ----
def _runs(text):
    # One <w:p> per line so author-checklist line breaks survive.
    lines = (text or "").split("\n") or [""]
    return "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r></w:p>'
        for line in lines
    )


def _table(items):
    border = (
        '<w:tblBorders>'
        + "".join(
            f'<w:{e} w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            for e in ("top", "left", "bottom", "right", "insideH", "insideV")
        )
        + "</w:tblBorders>"
    )
    rows = ""
    for text in items:
        rows += (
            "<w:tr>"
            f'<w:tc><w:tcPr><w:tcW w:w="6500" w:type="dxa"/></w:tcPr>{_runs(text)}</w:tc>'
            f'<w:tc><w:tcPr><w:tcW w:w="3500" w:type="dxa"/></w:tcPr><w:p/></w:tc>'
            "</w:tr>"
        )
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
        + border
        + "</w:tblPr>"
        + '<w:tblGrid><w:gridCol w:w="6500"/><w:gridCol w:w="3500"/></w:tblGrid>'
        + rows
        + "</w:tbl><w:p/>"
    )


def _heading(text, bold=True, size=None):
    rpr = ("<w:b/>" if bold else "") + (f'<w:sz w:val="{size}"/>' if size else "")
    return f'<w:p><w:pPr><w:rPr>{rpr}</w:rPr></w:pPr><w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'


def build_docx(title, groups, intro=""):
    body = _heading(title, bold=True, size="32")
    if intro:
        body += _runs(intro) + "<w:p/>"
    for i, g in enumerate(groups, 1):
        body += _heading(f"{i}. {g['label']}")
        body += _table(g["items"])
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}<w:sectPr/></w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
    return buf.getvalue()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):  # quiet
        pass

    def end_headers(self):
        # No caching — always serve the current app.js/index.html (avoids "old version" after edits).
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"null")

    def _api_parts(self):
        # /api/checklists/My%20Name?x=1 -> ["checklists", "My Name"]
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            return None
        return [unquote(p) for p in path[5:].split("/") if p != ""]

    def do_GET(self):
        parts = self._api_parts()
        if parts is None:
            return super().do_GET()
        if parts[0] in STORES:
            return self._json(read_json(os.path.join(ARCHIVE, parts[0] + ".json"), STORES[parts[0]]))
        if parts == ["checklists"]:
            names = sorted(f[:-5] for f in os.listdir(CHECKLISTS) if f.endswith(".json"))
            return self._json(names)
        if parts[0] == "checklists" and len(parts) == 2 and SAFE.match(parts[1]):
            return self._json(read_json(os.path.join(CHECKLISTS, parts[1] + ".json"), None))
        return self._json({"error": "not found"}, 404)

    def do_PUT(self):
        parts = self._api_parts()
        if parts is None:
            return self._json({"error": "bad path"}, 400)
        if parts[0] in STORES:
            write_json(os.path.join(ARCHIVE, parts[0] + ".json"), self._body())
            return self._json({"ok": True})
        if parts[0] == "checklists" and len(parts) == 2 and SAFE.match(parts[1]):
            write_json(os.path.join(CHECKLISTS, parts[1] + ".json"), self._body())
            return self._json({"ok": True})
        return self._json({"error": "bad path"}, 400)

    def do_POST(self):
        if self.path == "/api/docx":
            payload = self._body()
            title = payload.get("title", "Author Checklist")
            data = build_docx(title, payload.get("groups", []), payload.get("intro", ""))
            name = payload.get("filename", title) + ".docx"
            if SAFE.match(payload.get("filename", "")):
                with open(os.path.join(EXPORTS, name), "wb") as f:
                    f.write(data)  # keep a copy in archive/exports
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json({"error": "bad path"}, 400)


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    except OSError:  # already running; just point the browser at it instead of a traceback
        raise SystemExit(f"Template Request Manager already running → http://localhost:{PORT}")
    with httpd:
        print(f"Template Request Manager running → http://localhost:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
