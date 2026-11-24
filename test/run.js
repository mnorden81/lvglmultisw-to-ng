// Tests for the converter. Usage: node test/run.js <path to SD card root> <output dir for generated NG files>
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Core = require("../src/core.js");
const Scan = require("../src/scan.js");
const mkfs = require("./node-fs.js");

const sdRoot = process.argv[2];
const outDir = process.argv[3];
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.stack || e).split("\n").slice(0, 4).join("\n       ")); }
}
const bin = (s) => Core.bytesToBinary(Buffer.from(s, "utf8"));

(async () => {
  console.log("Parser");
  await test("old config: string escapes, refs, trailer", () => {
    const t = 'return {\n-- Table: {1}\n{\n ["name"]="a\\"b\\\\c\\10d",\n ["list"]={2},\n ["f"]=51.0,\n ["neg"]=-5,\n ["b"]=true,\n},\n-- Table: {2}\n{\n {3},\n},\n-- Table: {3}\n{ ["x"]=1, },\n}\n--end\n';
    const r = Core.parseOldConfig(t);
    assert.strictEqual(r.name, 'a"b\\c\nd');
    assert.strictEqual(r.f, 51); assert.strictEqual(r.neg, -5); assert.strictEqual(r.b, true);
    assert.deepStrictEqual(r.list.map((x) => x.x), [1]);
  });
  await test("old config: code is never executed / rejected", () => {
    for (const bad of ['return { os.execute("x") }', 'return { {1}, ["a"]=f() }', 'x = 1', 'return { {1} } os.exit()', 'return {{ ["a"]={9} }}'])
      assert.throws(() => Core.parseOldConfig(bad), undefined, bad);
  });
  await test("old config: empty, truncated and circular files are errors", () => {
    assert.throws(() => Core.parseOldConfig(""), /empty/);
    assert.throws(() => Core.parseOldConfig("return {\n{\n [\"a\"]={2},\n},\n{\n [\"b\"]=\"x"), /truncated/);
    assert.throws(() => Core.parseOldConfig("return {{ [\"a\"]={2} },{ [\"b\"]={1} }}"), /circular/);
  });
  await test("yaml: widget options with defaults for missing entries", () => {
    const y = Core.parseYaml('header: \n   name: "X"\nscreenData: \n   0:\n      layoutData: \n         zones: \n            0:\n               widgetName: MultiSwE/L\n               widgetData: \n                  options: \n                     1:\n                        type: Signed\n                        value: \n                           signedValue: 7\n');
    const w = Core.findWidgets(y);
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].options.Address, 7); assert.strictEqual(w[0].options.CRSF, 1); assert.strictEqual(w[0].options.SPortApp, 81);
  });

  console.log("Conversion rules");
  const base = (over) => Object.assign({ columns: 2, name: "Licht", commandBroadcastAddress: 0, activate_color_proto: 0, buttons: [] }, over || {});
  const btn = (i, over) => Object.assign({ name: "Output " + i, type: 1, switch: 0, switch2: 0, source: 0, visible: 1, exclusive_group: 0, activation_switch: 0, external_switch: 0, image: "", output: ((i - 1) % 8) + 1, address: 0, sport: { pwm_on: 255, options: 0, type: 1 }, color: 327680, textColor: 131072, font: 0 }, over || {});
  const opts = (over) => Object.assign({ CRSF: 1, Address: 0, Intervall: 100, ShmEncoding: 0, SPort: 0, SPortPhy: 0, SPortApp: 81, SPortProto: 1 }, over || {});
  const inst = (settings, o, extra) => Object.assign({ address: (o && o.Address) || 0, options: opts(o), settings, tabName: "", label: "A" }, extra || {});
  await test("address equal to tab address becomes -1, others stay explicit", () => {
    const s = base({ buttons: [btn(1), btn(2, { address: 3, output: 1 })] });
    const r = Core.convert([inst(s)]);
    assert.deepStrictEqual(r.config.controls.map((c) => c.address), [-1, 3]);
  });
  await test("protocol mapping: CRSF=0, S.Port WM/ACW from SPortProto", () => {
    const s = () => base({ buttons: [btn(1)] });
    assert.strictEqual(Core.convert([inst(s())]).config.header.protocol, 0);
    assert.strictEqual(Core.convert([inst(s(), { CRSF: 0, SPort: 1, SPortProto: 1 })]).config.header.protocol, 1);
    assert.strictEqual(Core.convert([inst(s(), { CRSF: 0, SPort: 1, SPortProto: 2 })]).config.header.protocol, 2);
    assert.strictEqual(Core.convert([inst(s(), { CRSF: 0, SPort: 1, SPortProto: 3, SPortPhy: 5, SPortApp: 90 })]).config.header.sportPhysicalId, 5);
  });
  await test("destination comes from commandBroadcastAddress, not from Address", () => {
    const r = Core.convert([inst(base({ commandBroadcastAddress: 200, buttons: [btn(1, { address: 4 })] }), { Address: 4 })]);
    assert.strictEqual(r.config.header.destination, 200);
    assert.strictEqual(r.config.tabs[0].address, 4);
  });
  await test("S.Port WM drops sliders, ACW drops 3Pos and sliders, with a report", () => {
    const s = base({ buttons: [btn(1, { type: 5 }), btn(2, { type: 3 }), btn(3)] });
    const wm = Core.convert([inst(s, { CRSF: 0, SPort: 1, SPortProto: 1 })]);
    assert.strictEqual(wm.config.controls.length, 2); assert.strictEqual(wm.skipped.length, 1);
    const acw = Core.convert([inst(s, { CRSF: 0, SPort: 1, SPortProto: 2 })]);
    assert.strictEqual(acw.config.controls.length, 1); assert.strictEqual(acw.skipped.length, 2);
  });
  await test("duplicate address/output across tabs is skipped, first tab wins", () => {
    const a = inst(base({ name: "A", buttons: [btn(1)] }), { Address: 0 });
    const b = inst(base({ name: "B", buttons: [btn(1, { address: 0 })] }), { Address: 1 });
    const r = Core.convert([a, b]);
    assert.strictEqual(r.config.controls.length, 1); assert.strictEqual(r.skipped.length, 1);
    assert.strictEqual(r.config.tabs.length, 2);
  });
  await test("columns outside 1..4 are clamped with a warning", () => {
    const r = Core.convert([inst(base({ columns: 6, buttons: [btn(1)] }))]);
    assert.strictEqual(r.config.tabs[0].columns, 4);
    assert(r.warnings.some((w) => /columns/.test(w.text)));
  });
  await test("virtual features are reported, not silently dropped", () => {
    const r = Core.convert([inst(base({ activate_vswitches: 1, buttons: [btn(1, { external_switch: 169 }), btn(2, { setVirtualInput: 2 })] }))]);
    const txt = r.warnings.map((w) => w.text).join("\n");
    assert(/logical\/virtual switch/.test(txt)); assert(/virtual input/.test(txt)); assert(/virtual switches were activated/.test(txt));
  });
  await test("names: umlauts stay byte-exact, 32 byte limit never splits a UTF-8 character", () => {
    const long = bin("Größenänderung-Größenänderung-X");
    const r = Core.convert([inst(base({ name: bin("Beleuchtung Küche"), buttons: [btn(1, { name: long })] }))]);
    const c = r.config.controls[0];
    assert(c.name.length <= 32);
    assert.doesNotThrow(() => decodeURIComponent(escape(c.name)));
    assert.strictEqual(r.config.tabs[0].name, bin("Beleuchtung Küche"));
  });
  await test("file text: sorted fields like storage.lua, escapes, trailing comma", () => {
    const r = Core.convert([inst(base({ name: 'Q"uote\\', buttons: [btn(1, { name: 'a"b' })] }))]);
    const t = Core.ngFileText(r.config, 1);
    const lines = t.split("\n");
    assert.strictEqual(lines[0], "return {"); assert.strictEqual(lines[lines.length - 2], "}");
    assert(lines[1].startsWith("{autoSave=1,buttonSpacing=-1,destination=0,generation=1,interval=100,kind=\"config\""));
    assert(t.includes('name="Q\\"uote\\\\"'));
    assert(/switch2=0,switch=0,tab=1/.test(t));
  });
  await test("planWrite: first write is generation 1 in slot a; replacing uses the older slot with a higher generation", () => {
    assert.deepStrictEqual(Core.planWrite({ a: null, b: null }), { slot: "a", generation: 1, replaces: false });
    assert.deepStrictEqual(Core.planWrite({ a: "{generation=17,", b: "{generation=18," }), { slot: "a", generation: 19, replaces: true });
    assert.deepStrictEqual(Core.planWrite({ a: "{generation=20,", b: null }), { slot: "b", generation: 21, replaces: true });
  });
  await test("model file name -> hex matches the real NG file of Modell13", () => {
    assert.strictEqual(Core.ngFileNames("model13.yml").a, "model_6d6f64656c31332e796d6c.a.lua");
  });

  console.log("Real SD card backup: " + sdRoot);
  const realFs = mkfs(sdRoot);
  const scan = await Scan.scan(realFs);
  const byFile = (f) => scan.models.find((m) => m.file === f);
  await test("scan finds 8 models with MultiSwitch widgets, NG installed without models/ folder", () => {
    assert.strictEqual(scan.models.length, 8);
    assert.deepStrictEqual(scan.models.map((m) => m.file), ["model2.yml", "model4.yml", "model5.yml", "model6.yml", "model8.yml", "model9.yml", "model10.yml", "model13.yml"]);
    assert.strictEqual(scan.ng.installed, true); assert.strictEqual(scan.ng.modelsDir, false);
    assert.strictEqual(scan.ng.target, "WIDGETS/lvglMultiSwNG");
  });
  await test("two widgets in one model -> two tabs (Dusseldorf-HF)", () => {
    const m = byFile("model4.yml"); assert.strictEqual(m.instances.length, 2);
    const b = Scan.build(m, scan, { lang: "de" });
    assert(b.ok); assert.deepStrictEqual(b.conv.config.tabs.map((t) => t.address), [0, 1]);
  });
  await test("renamed models: no auto match, manual file choice works (ELRS)", () => {
    const m = byFile("model8.yml");
    assert.strictEqual(m.instances[0].file, null);
    assert.strictEqual(Scan.build(m, scan, {}).ok, false);
    m.instances[0].file = "Modell08 elrs_0.lua"; m.instances[0].include = true;
    const b = Scan.build(m, scan, {}); assert(b.ok); assert.strictEqual(b.conv.config.controls.length, 16);
    m.instances[0].file = null; m.instances[0].include = false;
  });
  await test("empty and truncated old files are reported, never converted", () => {
    const m = byFile("model8.yml");
    m.instances[0].file = "BO105_0.lua"; m.instances[0].include = true;
    let b = Scan.build(m, scan, {}); assert.strictEqual(b.ok, false); assert(/empty/.test(b.messages.join()));
    m.instances[0].file = "MODELL02_0.lua";
    b = Scan.build(m, scan, {}); assert.strictEqual(b.ok, false); assert(/truncated/.test(b.messages.join()));
    m.instances[0].file = null; m.instances[0].include = false;
  });
  await test("every readable old config file converts to a schema-valid NG file", () => {
    let n = 0;
    for (const f of scan.configFiles) {
      if (!f.parsed.ok) continue;
      const r = Core.convert([{ address: f.address, options: opts({ Address: f.address }), settings: f.parsed.settings, tabName: "", label: f.name }]);
      assert(r.config.controls.length + r.skipped.length === f.parsed.settings.buttons.length, f.name);
      n++;
    }
    assert(n >= 25, "converted " + n);
  });

  console.log("Writing");
  // write into a fresh copy of the relevant folders only
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const copy = (rel) => { const src = path.join(sdRoot, rel); if (fs.existsSync(src)) fs.cpSync(src, path.join(outDir, rel), { recursive: true }); };
  ["MODELS", "WIDGETS/lvglMultiSw", "WIDGETS/lvglMultiSwNG"].forEach(copy);
  const wfs = mkfs(outDir);
  const wscan = await Scan.scan(wfs);
  const manifest = [];
  await test("write every convertible model, verify by reading back", async () => {
    for (const m of wscan.models) {
      if (!m.instances.length) continue;
      const b = Scan.build(m, wscan, { lang: "de" });
      if (!b.ok) continue;
      await Scan.writeResult(wfs, wscan, b);
      manifest.push({ model: m.file, path: path.join(outDir, b.path), tabs: b.conv.config.tabs.length, controls: b.conv.config.controls.length, generation: b.plan.generation, protocol: b.conv.config.header.protocol, destination: b.conv.config.header.destination, firstName: b.conv.config.controls[0].name });
    }
    assert.strictEqual(manifest.length, 5);
  });
  await test("old files and model files are untouched (byte-identical)", () => {
    for (const rel of ["MODELS", "WIDGETS/lvglMultiSw"]) {
      for (const f of fs.readdirSync(path.join(sdRoot, rel))) {
        const a = path.join(sdRoot, rel, f), b = path.join(outDir, rel, f);
        if (fs.statSync(a).isFile()) assert(fs.readFileSync(a).equals(fs.readFileSync(b)), f);
      }
    }
  });
  await test("existing NG config of Modell13 is detected and would be replaced only with a higher generation", async () => {
    const m = wscan.models.find((x) => x.file === "model13.yml");
    assert(m.hasExisting);
    const plan = Core.planWrite(m.existing);
    assert.strictEqual(plan.replaces, true); assert.strictEqual(plan.slot, "a"); assert.strictEqual(plan.generation, 19);
  });
  await test("re-scan after writing sees the new NG files and blocks a second write without overwrite", async () => {
    const again = await Scan.scan(wfs);
    const m = again.models.find((x) => x.file === "model2.yml");
    assert(m.hasExisting);
    const b = Scan.build(m, again, {});
    assert.strictEqual(b.blockedByExisting, true); assert.strictEqual(b.plan.generation, 2); assert.strictEqual(b.plan.slot, "b");
  });
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
