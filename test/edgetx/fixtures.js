// Synthetic SD card content for the EdgeTX tool tests (test/edgetx/run.html).
// Old configuration files are written in the same format as tableser.lua of the old widget.
(function () {
  "use strict";
  // Lua %q style quoting as used by tableser.lua (exportstring)
  function q(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\\n").replace(/\r/g, "\\13").replace(/\0/g, "\\0") + '"';
  }
  function tableser(root) {
    const tables = [root];
    const lookup = new Map([[root, 1]]);
    let out = "return {\n";
    const ref = (v) => {
      if (!lookup.has(v)) { tables.push(v); lookup.set(v, tables.length); }
      return "{" + lookup.get(v) + "}";
    };
    const val = (v) => (v !== null && typeof v === "object" ? ref(v) : typeof v === "string" ? q(v) : String(v));
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      out += "-- Table: {" + (i + 1) + "}\n{\n";
      if (Array.isArray(t)) t.forEach((v) => (out += "   " + val(v) + ",\n"));
      else Object.keys(t).forEach((k) => (out += "   [" + q(k) + "]=" + val(t[k]) + ",\n"));
      out += "},\n";
    }
    return out + "}\n--end\n";
  }
  const btn = (i, address, over) => Object.assign({
    name: "Output " + i, type: 1, switch: 0, switch2: 0, source: 0, visible: 1, exclusive_group: 0,
    activation_switch: 0, external_switch: 0, image: "", setVirtualInput: 0, setVirtualValue: 0,
    virtualAutoMutexGroup: 1, output: ((i - 1) % 8) + 1, address: address + Math.floor((i - 1) / 8),
    sport: { pwm_on: 255, options: 0, type: 1 }, color: 327680, textColor: 131072, font: 0,
  }, over || {});
  const settings = (over, buttons) => Object.assign({
    version: 30, imagesdir: "/IMAGES/", name: "Beleuchtung", momentaryButton_radius: 20, show_physical: 1,
    activate_vswitches: 0, activate_color_proto: 0, rows: 4, columns: 2, commandBroadcastAddress: 0,
    statusPassthru: 0,
    telemActions: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ name: "In" + i, input: i, switch: 0, address: 0, colorOff: 1, colorOn: 2 })),
    virtualInputs: Array.from({ length: 16 }, () => ({ off: 0 })),
  }, over || {}, { buttons });

  // Model with two old widgets (address 0 uses 16 buttons, so it also covers address 1)
  const dussel0 = tableser(settings(
    { name: "Beleuchtung vorne", columns: 2, commandBroadcastAddress: 200, activate_color_proto: 1, statusPassthru: 1,
      telemActions: [{ name: "In1", input: 1, switch: 12, address: 0, colorOff: 1, colorOn: 2 }] },
    Array.from({ length: 16 }, (_, k) => btn(k + 1, 0, {
      name: ["Fahrlicht", "Rücklicht", "Blinker L", "Blinker R", "Licht mit einem sehr langen Namen äöü", "Hupe", "Ö", "Slider"][k % 8] + (k >= 8 ? " 2" : ""),
      type: [1, 2, 3, 4, 1, 4, 2, 5][k % 8],
      external_switch: k >= 8 ? 169 + (k - 8) : 0,
      setVirtualInput: k === 5 ? 1 : 0,
      exclusive_group: k === 2 || k === 3 ? 1 : 0,
      activation_switch: k === 0 ? 5 : 0,
      image: k === 1 ? "/IMAGES/rueck.png" : "",
      color: k === 4 ? 2164260864 : 327680,
      sport: { pwm_on: 100 + k, options: k % 3, type: 1 + (k % 2) },
    }))
  ));
  const dussel1 = tableser(settings(
    { name: "Beleuchtung vorne", columns: 5, commandBroadcastAddress: 0 },
    Array.from({ length: 8 }, (_, k) => btn(k + 1, 1, { name: "Heck " + (k + 1) }))
  ));
  // hand-written variant: comments, float, nil, single nested references, odd spacing
  const handWritten =
    'return {\n-- Table: {1}\n{\n   ["name"]="Hand \\"made\\"",\n   ["columns"]=3.0,\n   ["commandBroadcastAddress"]=51.0,\n' +
    '   ["buttons"]={2},\n   ["unused"]=nil,\n},\n-- Table: {2}\n{\n   {3},\n   {4},\n},\n-- Table: {3}\n{\n   ["name"]="Eins\\\nZwei",\n' +
    '   ["type"]=2,\n   ["output"]=3,\n   ["address"]=4,\n   ["sport"]={5},\n},\n-- Table: {4}\n{\n  ["name"]="Zwei", ["type"]=1, ["output"]=1, ["visible"]=false,\n},\n' +
    "-- Table: {5}\n{\n   [\"type\"]=0x02, [\"options\"]=-1, [\"pwm_on\"]=300,\n},\n}\n--end\n";

  const opt = (i, kind, v) => "                     " + i + ":\n                        type: " + kind + "\n                        value: \n                           " + (kind === "Bool" ? "boolValue" : "signedValue") + ": " + v + "\n";
  const yaml = (name, zones, extra) =>
    'semver: 2.11.0\nheader: \n   name: "' + name + '"\n   bitmap: ""\ntimers: \n   0:\n      swtch: "NONE"\n   # comment: x\n' +
    "screenData: \n   0:\n      LayoutId: \"Layout2x1\"\n      layoutData: \n         zones: \n" + zones +
    "         options: \n            0:\n               type: Bool\n               value: \n                  boolValue: 0\n" + (extra || "") +
    "topbarData: \n   zones: \n      0:\n         widgetName: \"MultiSwE/L\"\n";
  const zone = (z, widget, opts) =>
    "            " + z + ":\n               widgetName: " + widget + "\n" +
    (opts ? "               widgetData: \n                  options: \n" + opts : "");
  const optsFor = (o) => Object.entries(o).map(([i, [kind, v]]) => opt(i, kind, v)).join("");

  const dusselZones = (o0, o1) => zone(0, '"MultiSwE/L"', optsFor(o0)) + zone(1, "MultiSwE/L", optsFor(o1));

  window.FIX = [
    { name: "crsf two widgets", modelName: "Düsseldorf", modelFile: "model01.yml",
      yaml: yaml("Düsseldorf", dusselZones({ 0: ["Bool", 1], 1: ["Signed", 0], 2: ["Signed", 50] }, { 1: ["Signed", 1], 2: ["Signed", 100] })),
      files: { "Düsseldorf_0.lua": dussel0, "Düsseldorf_1.lua": dussel1 } },
    { name: "acw 1.5", modelName: "Düsseldorf", modelFile: "model01.yml",
      yaml: yaml("Düsseldorf", dusselZones({ 0: ["Bool", 0], 1: ["Signed", 0], 6: ["Bool", 1], 7: ["Signed", 5], 9: ["Signed", 2] }, { 0: ["Bool", 0], 1: ["Signed", 1], 6: ["Bool", 1], 9: ["Signed", 1] })),
      files: { "Düsseldorf_0.lua": dussel0, "Düsseldorf_1.lua": dussel1 } },
    { name: "s.port wm", modelName: "Düsseldorf", modelFile: "model01.yml",
      yaml: yaml("Düsseldorf", zone(0, "MultiSwE/L", optsFor({ 0: ["Bool", 0], 6: ["Bool", 1], 8: ["Signed", 90], 3: ["Bool", 1] }))),
      files: { "Düsseldorf_0.lua": dussel0 } },
    { name: "transport off", modelName: "Düsseldorf", modelFile: "model01.yml",
      yaml: yaml("Düsseldorf", zone(0, "MultiSwE/L", optsFor({ 0: ["Bool", 0] }))),
      files: { "Düsseldorf_0.lua": dussel0 } },
    { name: "hand written file", modelName: "KARL", modelFile: "model02.yml",
      yaml: yaml("KARL", zone(0, "MultiSwE/L", optsFor({ 1: ["Signed", 4] })) + zone(1, '"MultiSw NG"')),
      files: { "KARL_4.lua": handWritten } },
  ];
  window.FIX_EXTRA = {
    renamedFile: tableser(settings({ name: "ELRS Licht" }, Array.from({ length: 8 }, (_, k) => btn(k + 1, 0)))),
    empty: "",
    truncated: dussel1.slice(0, 400),
  };
})();
