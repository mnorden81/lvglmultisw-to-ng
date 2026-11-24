// Fallback path (no File System Access API): folder input -> read-only scan -> ZIP.
const { JSDOM } = require("/tmp/jsd/node_modules/jsdom");
const fs = require("fs"), path = require("path"), assert = require("assert");
const sdRoot = process.argv[2];
const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
function walk(dir, base, out) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, base + "/" + e.name, out); else out.push([base + "/" + e.name, p]); } return out; }
(async () => {
  for (const prefix of ["SDCARD", "Backups/SDCARD"]) { // folder picked directly, or its parent picked
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", beforeParse(w) { Object.defineProperty(w.navigator, "language", { value: "en" }); w.URL.createObjectURL = () => "blob:x"; } });
    const w = dom.window, d = w.document;
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(d.getElementById("btnRw").disabled, true, "write button must be disabled without showDirectoryPicker");
    const list = [];
    for (const rel of ["MODELS", "WIDGETS/lvglMultiSw", "WIDGETS/lvglMultiSwNG", "SCRIPTS"]) {
      if (!fs.existsSync(path.join(sdRoot, rel))) continue;
      for (const [p, real] of walk(path.join(sdRoot, rel), prefix + "/" + rel, [])) {
        if (/\.luac$|\.png$/.test(p)) continue;
        const f = new w.File([fs.readFileSync(real)], path.basename(p));
        Object.defineProperty(f, "webkitRelativePath", { value: p });
        list.push(f);
      }
    }
    const adapter = w.__App.FileListAdapter(list);
    assert(adapter.hasRoot(), "root detected for " + prefix);
    await w.__App.load(adapter); await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(d.querySelectorAll("section.model").length, 7, prefix);
    assert.strictEqual(d.getElementById("write"), null, "no direct write button in read-only mode");
    assert(d.getElementById("zip") && !d.getElementById("zip").disabled);
    console.log("  ok   fallback with prefix '" + prefix + "': 7 models, ZIP only");
  }
})().catch((e) => { console.error("  FAIL", e.stack); process.exit(1); });
