#!/usr/bin/env python3
"""Build a single, self-contained dist/AIPChecks.html.

Inlines styles.css + data.js + storage.js + app.js into index.html and converts
the ES modules into one classic <script> so the page runs by double-clicking it
straight from disk (file://) — no Python, no server, no install. That single
file is what you send to other people; it works the same on Mac and Windows.

Dev is unchanged: keep editing the separate files and run `python3 server.py`.
Run this only when you want a fresh distributable:  python3 build.py
"""
import os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def strip_module(src):
    """Drop import lines and `export ` keywords so the file runs in a shared scope."""
    src = re.sub(r'^\s*import .*?;\s*$', "", src, flags=re.M)   # app.js's two imports
    src = re.sub(r'^\s*export\s+\{[^}]*\};\s*$', "", src, flags=re.M)  # `export { ... };`
    src = re.sub(r'^export\s+', "", src, flags=re.M)            # `export function/async`
    return src


def build():
    css = read("styles.css")
    data = strip_module(read("data.js"))
    storage = strip_module(read("storage.js"))
    app = strip_module(read("app.js"))

    # Each source keeps its own scope (avoids name clashes, e.g. `sections` exists
    # in both data.js and app.js) and exposes only what the next file needs.
    bundle = (
        "// === data.js ===\n"
        "const __data = (function () {\n" + data +
        "\nreturn { seedMasterLibrary, DEFAULT_INTRO };\n})();\n"
        "const seedMasterLibrary = __data.seedMasterLibrary;\n"
        "const DEFAULT_INTRO = __data.DEFAULT_INTRO;\n\n"
        "// === storage.js ===\n"
        "const store = (function () {\n" + storage +
        "\nreturn { loadStores, save, isOnline, listChecklists, saveChecklist,"
        " getChecklist, exportDocx, triggerDownload };\n})();\n\n"
        "// === app.js ===\n" + app
    )

    html = read("index.html")
    # Remove the dev-only file:// guard (the standalone file is *meant* to run that way).
    html = re.sub(r'\s*<script>\s*//[^<]*?location\.protocol[\s\S]*?</script>', "", html)
    # Inline CSS and replace the module script with the assembled classic script.
    html = html.replace('<link rel="stylesheet" href="styles.css">',
                        "<style>\n" + css + "\n</style>")
    html = html.replace('<script type="module" src="app.js"></script>',
                        "<script>\n" + bundle + "\n</script>")

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "AIPChecks.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote {out}  ({os.path.getsize(out) // 1024} KB)")
    print("Double-click it to run — no install, Mac or Windows.")


if __name__ == "__main__":
    build()
