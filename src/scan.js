/* SD card scanning and write planning, independent of the DOM.
 *
 * `fs` is an adapter with (all paths relative to the SD root, "/" separated,
 * resolved case-insensitively like on a FAT card):
 *   async list(path)            -> [{name, kind: "file" | "dir"}] | null
 *   async read(path)            -> Uint8Array | null
 *   async write(path, u8)       -> void
 *   async mkdir(path)           -> void
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.Scan = factory(root.Core);
})(typeof self !== "undefined" ? self : this, function (Core) {
  "use strict";

  const OLD_DIR = "WIDGETS/lvglMultiSw";
  const NG_DIR = "WIDGETS/lvglMultiSwNG";

  const lower = (s) => s.toLowerCase();

  async function readText(fs, path) {
    const u8 = await fs.read(path);
    return u8 ? Core.bytesToBinary(u8) : null;
  }

  async function loadOldConfig(fs, name) {
    const text = await readText(fs, OLD_DIR + "/" + name);
    if (text === null) return { ok: false, error: "missing" };
    try {
      const settings = Core.parseOldConfig(text);
      if (!settings.buttons || !Array.isArray(settings.buttons)) return { ok: false, error: "no buttons" };
      return { ok: true, settings };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function detectNg(fs, opts) {
    const entries = await fs.list(NG_DIR);
    if (!entries) return { installed: false, modelsDir: true, detected: true, target: NG_DIR + "/models" };
    const appLua = await readText(fs, NG_DIR + "/app.lua");
    // Newer NG versions keep configurations in models/, older ones next to the code.
    let modelsDir = appLua === null ? true : /modelsDir/.test(appLua);
    const detected = modelsDir;
    if (opts && typeof opts.modelsDir === "boolean") modelsDir = opts.modelsDir;
    return { installed: true, modelsDir, detected, target: modelsDir ? NG_DIR + "/models" : NG_DIR };
  }

  async function scan(fs, opts) {
    const result = { models: [], orphans: [], ng: null, problems: [] };
    result.ng = await detectNg(fs, opts);

    // old config files: <ModelName>_<Address>.lua
    const oldEntries = (await fs.list(OLD_DIR)) || [];
    const cfgFiles = [];
    for (const e of oldEntries) {
      const m = e.kind === "file" && /^(.+)_(\d+)\.lua$/i.exec(e.name);
      if (m) cfgFiles.push({ name: e.name, base: m[1], address: Number(m[2]), parsed: null });
    }
    cfgFiles.sort((a, b) => a.name.localeCompare(b.name));
    for (const f of cfgFiles) f.parsed = await loadOldConfig(fs, f.name);
    result.configFiles = cfgFiles;

    const modelEntries = ((await fs.list("MODELS")) || []).filter((e) => e.kind === "file" && /\.yml$/i.test(e.name));
    modelEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const usedFiles = new Set();
    for (const entry of modelEntries) {
      const text = await readText(fs, "MODELS/" + entry.name);
      if (text === null) continue;
      let yaml;
      try {
        yaml = Core.parseYaml(text);
      } catch (e) {
        result.problems.push(entry.name + ": " + e.message);
        continue;
      }
      const widgets = Core.findWidgets(yaml);
      if (!widgets.length) continue;
      const nameBin = Core.modelNameOf(yaml);
      const name = Core.displayText(nameBin);
      const old = widgets.filter((w) => w.kind === "old");
      const ngWidgets = widgets.filter((w) => w.kind === "ng");

      // one tab per distinct address (widgets with the same address share one file)
      const byAddress = new Map();
      for (const w of old) {
        const key = w.options.Address;
        if (!byAddress.has(key)) byAddress.set(key, { address: key, options: w.options, widgets: [] });
        byAddress.get(key).widgets.push({ screen: w.screen, zone: w.zone });
      }
      const instances = [];
      for (const inst of [...byAddress.values()].sort((a, b) => a.address - b.address)) {
        const wanted = lower(name) + "_" + inst.address + ".lua";
        const match = cfgFiles.find((f) => lower(f.name) === wanted);
        if (match) usedFiles.add(match.name);
        inst.file = match ? match.name : null;
        inst.autoMatched = !!match;
        inst.include = !!(match && match.parsed.ok);
        const st = match && match.parsed.ok ? match.parsed.settings : null;
        inst.tabName = st && st.name ? Core.displayText(String(st.name)) : "Tab " + (instances.length + 1);
        instances.push(inst);
      }

      // existing NG configuration for this model
      const names = Core.ngFileNames(entry.name);
      const existing = {
        a: await readText(fs, result.ng.target + "/" + names.a),
        b: await readText(fs, result.ng.target + "/" + names.b),
      };
      result.models.push({
        file: entry.name, name, nameBin, instances, ngWidgets, existing,
        hasExisting: existing.a !== null || existing.b !== null,
        overwrite: false,
      });
    }
    result.orphans = cfgFiles.filter((f) => !usedFiles.has(f.name));
    return result;
  }

  // Builds the conversion result for one model from its current selection.
  function build(model, scanResult, opts) {
    const chosen = [];
    const messages = [];
    for (const inst of model.instances) {
      if (!inst.include) continue;
      const f = scanResult.configFiles.find((c) => c.name === inst.file);
      if (!f) {
        messages.push("Address " + inst.address + ": no configuration file selected.");
        continue;
      }
      if (!f.parsed.ok) {
        messages.push(f.name + ": cannot be used (" + f.parsed.error + ").");
        continue;
      }
      chosen.push({
        address: inst.address, options: inst.options, settings: f.parsed.settings,
        tabName: inst.tabName,
        label: "Address " + inst.address + " (" + f.name + ")",
      });
    }
    if (!chosen.length) return { ok: false, messages: messages.length ? messages : ["No usable old configuration selected."] };
    let conv;
    try {
      conv = Core.convert(
        chosen.map((c) => Object.assign({}, c, { tabName: utf8ToBinary(c.tabName) })),
        opts
      );
    } catch (e) {
      return { ok: false, messages: messages.concat(e.message) };
    }
    const plan = Core.planWrite(model.existing);
    const names = Core.ngFileNames(model.file);
    const text = Core.ngFileText(conv.config, plan.generation);
    return {
      ok: true, messages, conv, plan, text,
      path: scanResult.ng.target + "/" + (plan.slot === "a" ? names.a : names.b),
      blockedByExisting: plan.replaces && !model.overwrite,
    };
  }

  function utf8ToBinary(s) {
    try {
      return unescape(encodeURIComponent(s));
    } catch (e) {
      return s;
    }
  }

  async function writeResult(fs, scanResult, built) {
    const dir = scanResult.ng.target;
    // create missing directories one level at a time
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      if (!(await fs.list(p))) await fs.mkdir(p);
    }
    await fs.write(built.path, Core.binaryToBytes(built.text));
    const back = await fs.read(built.path);
    if (!back || Core.bytesToBinary(back) !== built.text) throw new Error("verification failed for " + built.path);
  }

  return { OLD_DIR, NG_DIR, scan, build, writeResult, utf8ToBinary };
});
