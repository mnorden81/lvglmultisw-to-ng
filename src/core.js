/* lvglMultiSw -> lvglMultiSwNG configuration converter: core logic.
 *
 * Pure functions, no DOM and no file access, so the same code runs in the
 * browser tool and in the node tests.
 *
 * All text is handled as "binary strings" (one JS char = one byte, latin1), so
 * names with UTF-8 umlauts survive byte-exactly and the NG limits, which are
 * byte limits, can be checked directly.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- bytes ---
  function bytesToBinary(u8) {
    let out = "";
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return out;
  }
  function binaryToBytes(s) {
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
    return u8;
  }
  // Binary string -> readable text for display (UTF-8 if valid, else as is).
  function displayText(bin) {
    try {
      return decodeURIComponent(escape(bin));
    } catch (e) {
      return bin;
    }
  }
  function toHex(bin) {
    let h = "";
    for (let i = 0; i < bin.length; i++) h += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return h;
  }

  // ------------------------------------------- old config file (tableser) ---
  // The old widget stores `return { {table1}, {table2}, ... }` where a value
  // `{n}` refers to table n. The old widget runs the file with loadfile(); we
  // never execute it, we parse the small literal subset it can contain.
  function parseOldConfig(text) {
    if (!/\S/.test(text)) throw new Error("empty");
    let pos = 0;
    const len = text.length;
    const fail = (msg) => {
      throw new Error(msg);
    };
    const skip = () => {
      for (;;) {
        while (pos < len && /\s/.test(text[pos])) pos++;
        if (text.startsWith("--", pos)) {
          while (pos < len && text[pos] !== "\n") pos++;
        } else break;
      }
    };
    const eof = () => fail("truncated");
    function parseString() {
      const q = text[pos++];
      let out = "";
      for (;;) {
        if (pos >= len) eof();
        const c = text[pos++];
        if (c === q) return out;
        if (c !== "\\") {
          out += c;
          continue;
        }
        if (pos >= len) eof();
        const e = text[pos++];
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "\n") out += "\n";
        else if (/[0-9]/.test(e)) {
          let d = e;
          while (d.length < 3 && /[0-9]/.test(text[pos] || "")) d += text[pos++];
          out += String.fromCharCode(parseInt(d, 10) & 0xff);
        } else out += e;
      }
    }
    function parseValue(depth) {
      skip();
      if (pos >= len) eof();
      const c = text[pos];
      if (c === "{") return parseTable(depth + 1);
      if (c === '"' || c === "'") return parseString();
      const m = /^(true|false|nil)\b/.exec(text.slice(pos, pos + 6));
      if (m) {
        pos += m[1].length;
        return m[1] === "true" ? true : m[1] === "false" ? false : null;
      }
      const n = /^[-+]?(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/.exec(text.slice(pos, pos + 40));
      if (n) {
        pos += n[0].length;
        return Number(n[0]);
      }
      return fail("unexpected character at offset " + pos);
    }
    function parseTable(depth) {
      if (depth > 8) fail("nesting too deep");
      pos++; // {
      const t = { arr: [], hash: {}, isTable: true };
      for (;;) {
        skip();
        if (pos >= len) eof();
        if (text[pos] === "}") {
          pos++;
          return t;
        }
        if (text[pos] === "[") {
          pos++;
          const k = parseValue(depth);
          skip();
          if (text[pos] !== "]") fail("expected ]");
          pos++;
          skip();
          if (text[pos] !== "=") fail("expected =");
          pos++;
          const v = parseValue(depth);
          if (k && k.isTable) fail("table keys are not supported");
          t.hash[k] = v;
        } else {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(text.slice(pos, pos + 80));
          if (m && !/^(true|false|nil)$/.test(m[1])) {
            pos += m[0].length;
            t.hash[m[1]] = parseValue(depth);
          } else t.arr.push(parseValue(depth));
        }
        skip();
        if (text[pos] === "," || text[pos] === ";") pos++;
        else if (text[pos] !== "}") {
          if (pos >= len) eof();
          fail("expected , or } at offset " + pos);
        }
      }
    }
    skip();
    if (!text.startsWith("return", pos)) fail("not a configuration file (no 'return')");
    pos += 6;
    skip();
    if (text[pos] !== "{") fail("expected {");
    const rootTable = parseTable(0);
    skip();
    if (pos < len) {
      // trailing "--end" comment is skipped above; anything else is junk
      fail("data after end of file");
    }
    const tables = rootTable.arr;
    if (!tables.length) fail("no tables");
    const isRef = (v) =>
      v && v.isTable && v.arr.length === 1 && typeof v.arr[0] === "number" && !Object.keys(v.hash).length;
    const resolving = new Set();
    const cache = new Map();
    function resolve(idx) {
      if (cache.has(idx)) return cache.get(idx);
      const raw = tables[idx - 1];
      if (!raw || !raw.isTable) fail("invalid reference " + idx);
      if (resolving.has(idx)) fail("circular reference");
      resolving.add(idx);
      const map = {};
      const list = [];
      const conv = (v) => {
        if (v && v.isTable) {
          if (!isRef(v)) fail("invalid value reference in table " + idx);
          const target = v.arr[0];
          if (!Number.isInteger(target) || target < 1 || target > tables.length) fail("reference out of range");
          return resolve(target);
        }
        return v;
      };
      raw.arr.forEach((v) => list.push(conv(v)));
      Object.keys(raw.hash).forEach((k) => (map[k] = conv(raw.hash[k])));
      resolving.delete(idx);
      // positional-only tables become arrays, others objects (with .list for positional part)
      let out;
      if (Object.keys(map).length === 0) out = list;
      else {
        out = map;
        Object.defineProperty(out, "_list", { value: list, enumerable: false });
      }
      cache.set(idx, out);
      return out;
    }
    const top = resolve(1);
    if (Array.isArray(top)) fail("unexpected top-level layout");
    return top;
  }

  // ----------------------------------------------------- model YAML (mini) ---
  function unquote(v) {
    v = v.trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.length >= 2 && v[v.length - 1] === q) {
      const body = v.slice(1, -1);
      if (q === "'") return body.replace(/''/g, "'");
      return body.replace(/\\(x[0-9a-fA-F]{2}|.)/g, (m, e) =>
        e[0] === "x" && e.length === 3 ? String.fromCharCode(parseInt(e.slice(1), 16)) : e
      );
    }
    return v.replace(/\s+#.*$/, "");
  }
  // EdgeTX model files use nested "key: value" maps with numeric keys instead
  // of lists, so an indentation based key/value parser is enough.
  function parseYaml(text) {
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    for (const raw of text.split(/\r?\n/)) {
      if (!/\S/.test(raw) || /^\s*#/.test(raw)) continue;
      const m = /^( *)(.+?):(?:\s+(.*?))?\s*$/.exec(raw);
      if (!m || /^\s*-\s/.test(raw)) continue;
      const indent = m[1].length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].obj;
      const key = m[2].trim().replace(/^["']|["']$/g, "");
      if (m[3] === undefined || m[3] === "") {
        const child = {};
        parent[key] = child;
        stack.push({ indent, obj: child });
      } else parent[key] = unquote(m[3]);
    }
    return root;
  }

  const OLD_WIDGET = "MultiSwE/L";
  const NG_WIDGET = "MultiSw NG";
  const OPTION_DEFS = [
    ["CRSF", 1],
    ["Address", 0],
    ["Intervall", 100],
    ["ShmEncoding", 0],
    ["ShmVarStart", 1],
    ["ShmSync", 0],
    ["SPort", 0],
    ["SPortPhy", 0],
    ["SPortApp", 0x51],
    ["SPortProto", 1],
  ];

  function optionValue(entry) {
    if (!entry || typeof entry !== "object") return undefined;
    const v = entry.value || {};
    for (const k of ["boolValue", "signedValue", "unsignedValue"]) {
      if (v[k] !== undefined) return Number(v[k]);
    }
    return undefined;
  }

  function sortedKeys(obj) {
    return Object.keys(obj || {})
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => a - b);
  }

  // Finds the MultiSwitch widgets (old and NG) of a parsed model YAML.
  function findWidgets(yaml) {
    const found = [];
    const screens = yaml.screenData || {};
    for (const s of sortedKeys(screens)) {
      const zones = (((screens[s] || {}).layoutData || {}).zones) || {};
      for (const z of sortedKeys(zones)) {
        const zone = zones[z] || {};
        const name = zone.widgetName;
        if (name !== OLD_WIDGET && name !== NG_WIDGET) continue;
        const entry = { kind: name === OLD_WIDGET ? "old" : "ng", screen: Number(s) + 1, zone: Number(z) + 1 };
        if (entry.kind === "old") {
          const opts = ((zone.widgetData || {}).options) || {};
          entry.options = {};
          OPTION_DEFS.forEach(([n, def], i) => {
            const v = optionValue(opts[i]);
            entry.options[n] = v === undefined ? def : v;
          });
        }
        found.push(entry);
      }
    }
    return found;
  }

  function modelNameOf(yaml) {
    return (yaml.header && yaml.header.name) || "";
  }

  // ---------------------------------------------------------- NG schema ---
  const SCHEMAS = {
    config: {
      version: [1, 1], generation: [0, 2147483647], name: 32,
      destination: [0, 255], interval: [5, 1000], sendColors: [0, 1], autoSave: [0, 1],
      buttonSpacing: [-1, 40], protocol: [0, 3], sportPhysicalId: [0, 0x1b], sportAppId: [0, 255],
    },
    tab: { id: [1, 2147483647], name: 32, address: [0, 255], columns: [1, 4], height: [0, 240] },
    control: {
      id: [1, 2147483647], tab: [1, 2147483647], name: 32, leftText: 32, rightText: 32,
      type: [1, 5], address: [-1, 255], output: [1, 8],
      color: [-2147483648, 4294967295], textColor: [-2147483648, 4294967295], font: [0, 65535],
      visible: [0, 1], switch: [-2147483648, 2147483647], switch2: [-2147483648, 2147483647],
      source: [-2147483648, 2147483647], activation: [-2147483648, 2147483647], group: [0, 255], image: 128,
      sportType: [0, 255], sportOptions: [0, 255], sportPwmOn: [0, 255],
    },
  };
  function validateRecord(rec) {
    const schema = SCHEMAS[rec.kind];
    if (!schema) return "unknown record";
    for (const [k, rule] of Object.entries(schema)) {
      const v = rec[k];
      if (typeof rule === "number") {
        if (typeof v !== "string" || v.length > rule || /[\x00-\x1f]/.test(v)) return "invalid " + rec.kind + "." + k;
      } else if (!(Number.isInteger(v) && v >= rule[0] && v <= rule[1])) return "invalid " + rec.kind + "." + k;
    }
    for (const k of Object.keys(rec)) if (k !== "kind" && !(k in schema)) return "unknown property " + k;
    return null;
  }

  // ------------------------------------------------------------ helpers ---
  function cutBytes(s, max) {
    if (s.length <= max) return s;
    let n = max;
    while (n > 0 && (s.charCodeAt(n) & 0xc0) === 0x80) n--; // do not split a UTF-8 sequence
    return s.slice(0, n);
  }
  function cleanString(v, max, fallback) {
    let s = typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
    s = s.replace(/[\x00-\x1f\x7f]/g, " ");
    s = cutBytes(s, max);
    return s === "" && fallback !== undefined ? fallback : s;
  }
  function int(v, def) {
    if (typeof v === "boolean") return v ? 1 : 0;
    return typeof v === "number" && isFinite(v) ? Math.trunc(v) : def;
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // ------------------------------------------------------------ convert ---
  /*
   * instances: [{ address, options, settings (parsed old config), tabName, label }]
   *   in tab order. Returns {config, warnings, skipped, stats}.
   */
  function convert(instances, opts) {
    opts = opts || {};
    const lang = opts.lang === "en" ? "en" : "de";
    const leftText = lang === "en" ? "Left" : "Links";
    const rightText = lang === "en" ? "Right" : "Rechts";
    const warnings = [];
    const skipped = [];
    const warn = (level, text) => warnings.push({ level, text });
    if (!instances.length) throw new Error("no widgets selected");

    const first = instances[0];
    const o0 = first.options;

    // --- transport -----------------------------------------------------
    const protoOf = (o) => (o.CRSF ? 0 : o.SPort ? clamp(int(o.SPortProto, 1), 1, 3) : 0);
    const protocol = protoOf(o0);
    if (!o0.CRSF && !o0.SPort)
      warn("warn", "CRSF and S.Port were both switched off in the old widget options, so it sent nothing itself (maybe SHM/mixer script or a plain UI). NG always sends; CRSF was chosen. Check the transport before use.");
    if (o0.CRSF && o0.SPort)
      warn("warn", "The old widget sent CRSF and S.Port at the same time; NG supports one protocol per model, CRSF was chosen.");
    for (const inst of instances.slice(1)) {
      const o = inst.options;
      if (protoOf(o) !== protocol || (protocol > 0 && (o.SPortPhy !== o0.SPortPhy || o.SPortApp !== o0.SPortApp)))
        warn("warn", inst.label + ": other transport settings than the first widget; NG uses one protocol per model, the first widget's settings were kept.");
      if (o.Intervall !== o0.Intervall) warn("info", inst.label + ": different send interval; the first widget's interval was kept.");
    }
    const interval = clamp(int(o0.Intervall, 100), 5, 1000);

    const settings0 = first.settings || {};
    const destination = clamp(int(settings0.commandBroadcastAddress, 0), 0, 255);
    for (const inst of instances.slice(1)) {
      if (clamp(int((inst.settings || {}).commandBroadcastAddress, 0), 0, 255) !== destination)
        warn("warn", inst.label + ": different CRSF destination; the first widget's value was kept.");
    }
    const sendColors = instances.some((i) => int((i.settings || {}).activate_color_proto, 0) > 0) ? 1 : 0;
    if (sendColors && instances.some((i) => int((i.settings || {}).activate_color_proto, 0) === 0))
      warn("info", "LED colors were enabled in only some widgets; NG has one setting for the whole model (enabled).");

    const config = {
      header: {
        kind: "config", version: 1, generation: 0, name: "MultiSwitch NG",
        destination, interval, sendColors, autoSave: 1, buttonSpacing: -1,
        protocol, sportPhysicalId: clamp(int(o0.SPortPhy, 0), 0, 0x1b), sportAppId: clamp(int(o0.SPortApp, 0x51), 0, 255),
      },
      tabs: [],
      controls: [],
    };

    // --- tabs and controls ------------------------------------------
    const usedEndpoints = new Map();
    const nameCount = {};
    let controlId = 0;
    const stats = { controls: 0, skipped: 0 };
    instances.forEach((inst, ti) => {
      const st = inst.settings || {};
      const address = clamp(int(inst.address, 0), 0, 255);
      let name = cleanString(inst.tabName, 32, cleanString(st.name, 32, "Tab " + (ti + 1)));
      nameCount[name] = (nameCount[name] || 0) + 1;
      if (nameCount[name] > 1) name = cutBytes(name, 28) + " " + (address);
      let columns = int(st.columns, 2);
      if (columns < 1 || columns > 4) {
        warn("warn", inst.label + ": " + columns + " columns are not possible in NG (1..4); " + clamp(columns, 1, 4) + " used.");
        columns = clamp(columns, 1, 4);
      }
      const tab = { kind: "tab", id: ti + 1, name, address, columns, height: 0 };
      config.tabs.push(tab);

      const buttons = Array.isArray(st.buttons) ? st.buttons : [];
      const extSwitch = [];
      const virtInput = [];
      if (!buttons.length) warn("warn", inst.label + ": the old configuration contains no buttons.");
      buttons.forEach((b, bi) => {
        const label = inst.label + " / " + (b && b.name !== undefined ? displayText(String(b.name)) : "Output " + (bi + 1));
        if (!b || typeof b !== "object") return void skipped.push({ label, reason: "invalid button record" });
        const type = int(b.type, 1);
        const output = int(b.output, ((bi % 8) + 1));
        const bAddr = int(b.address, address);
        if (type < 1 || type > 5) return void skip(label, "unknown control type " + type);
        if (protocol === 1 && type === 5) return void skip(label, "sliders are not supported by S.Port WM");
        if (protocol >= 2 && (type === 3 || type === 5)) return void skip(label, "3Pos controls and sliders are not supported by S.Port ACW");
        if (output < 1 || output > 8) return void skip(label, "output " + output + " is outside 1..8");
        if (bAddr < 0 || bAddr > 255) return void skip(label, "address " + bAddr + " is outside 0..255");
        const endpoint = bAddr * 8 + output;
        if (protocol >= 2 && endpoint > 255) return void skip(label, "ACW switch number " + endpoint + " exceeds 255");
        if (usedEndpoints.has(endpoint))
          return void skip(label, "address/output " + bAddr + "/" + output + " is already used by " + usedEndpoints.get(endpoint));
        usedEndpoints.set(endpoint, label);

        const sp = b.sport && typeof b.sport === "object" ? b.sport : {};
        const rec = {
          kind: "control", id: ++controlId, tab: tab.id,
          name: cleanString(b.name, 32, "Output " + output),
          leftText, rightText, type,
          address: bAddr === address ? -1 : bAddr, output,
          color: int(b.color, 327680), textColor: int(b.textColor, 131072), font: clamp(int(b.font, 0), 0, 65535),
          visible: int(b.visible, 1) ? 1 : 0,
          switch: int(b.switch, 0), switch2: int(b.switch2, 0), source: int(b.source, 0),
          activation: int(b.activation_switch, 0), group: clamp(int(b.exclusive_group, 0), 0, 255),
          image: cleanString(b.image, 128, ""),
          sportType: clamp(int(sp.type, 1), 0, 255), sportOptions: clamp(int(sp.options, 0), 0, 255),
          sportPwmOn: clamp(int(sp.pwm_on, 255), 0, 255),
        };
        if (typeof b.name === "string" && rec.name !== b.name) warn("info", label + ": name was shortened or cleaned to fit NG limits.");
        if (int(b.setVirtualInput, 0) > 0) virtInput.push(rec.name);
        if (int(b.external_switch, 0) !== 0) extSwitch.push(rec.name);
        config.controls.push(rec);
        stats.controls++;
      });

      const names3 = (a) => a.slice(0, 3).map((n) => displayText(n)).join(", ") + (a.length > 3 ? ", ..." : "");
      if (extSwitch.length)
        warn("warn", inst.label + ": " + extSwitch.length + " button(s) set an EdgeTX logical/virtual switch ('external_switch': " + names3(extSwitch) + "). NG cannot do this yet, so mixes or sounds that depend on those switches will no longer be triggered.");
      if (virtInput.length)
        warn("warn", inst.label + ": " + virtInput.length + " button(s) set a virtual input (" + names3(virtInput) + "). NG does not support this yet.");
      // unsupported features at widget level
      const tele = Array.isArray(st.telemActions) ? st.telemActions.filter((a) => a && int(a.switch, 0) !== 0) : [];
      if (tele.length) warn("warn", inst.label + ": " + tele.length + " telemetry action(s) are configured; NG does not support them yet (dropped).");
      if (int(st.activate_vswitches, 0) > 0) warn("warn", inst.label + ": virtual switches were activated; NG does not support them yet (dropped).");
      if (inst.options && inst.options.ShmEncoding) warn("warn", inst.label + ": SHM encoding was enabled; NG does not support it yet (dropped).");
      if (int(st.statusPassthru, 0) > 0) warn("info", inst.label + ": status passthrough is not supported by NG (dropped).");
    });

    function skip(label, reason) {
      skipped.push({ label, reason });
      stats.skipped++;
    }

    // final check with the NG schema
    const problems = [];
    [config.header].concat(config.tabs, config.controls).forEach((r) => {
      const e = validateRecord(r);
      if (e) problems.push(e);
    });
    if (problems.length) throw new Error("internal: generated record invalid: " + problems.slice(0, 3).join(", "));
    return { config, warnings, skipped, stats };
  }

  // ------------------------------------------------------------- output ---
  function luaQuote(s) {
    let out = '"';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') out += '\\"';
      else if (c === "\\") out += "\\\\";
      else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\0") out += "\\0";
      else if (s.charCodeAt(i) < 32 || s.charCodeAt(i) === 127) out += "\\" + String(s.charCodeAt(i));
      else out += c;
    }
    return out + '"';
  }
  // Same layout as storage.lua serialize(): one line per record, sorted fields.
  function serializeRecord(rec) {
    const fields = Object.keys(rec).map((k) => k + "=" + (typeof rec[k] === "string" ? luaQuote(rec[k]) : String(rec[k])));
    fields.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return "{" + fields.join(",") + "},\n";
  }
  function ngFileText(config, generation) {
    const header = Object.assign({}, config.header, { generation });
    let text = "return {\n" + serializeRecord(header);
    config.tabs.forEach((t) => (text += serializeRecord(t)));
    config.controls.forEach((c) => (text += serializeRecord(c)));
    return text + "}\n";
  }
  function ngFileNames(modelFileName) {
    const base = "model_" + toHex(modelFileName);
    return { a: base + ".a.lua", b: base + ".b.lua" };
  }
  // existing: {a: text|null, b: text|null}. Returns which slot to write and the generation.
  function planWrite(existing) {
    const gen = (t) => {
      if (t == null) return -1;
      const m = /generation=(\d+)/.exec(t.slice(0, 600));
      return m ? Number(m[1]) : 0;
    };
    const ga = gen(existing.a), gb = gen(existing.b);
    if (ga < 0 && gb < 0) return { slot: "a", generation: 1, replaces: false };
    const max = Math.max(ga, gb);
    // write the other slot than the newest one, with a higher generation
    return { slot: ga >= gb ? "b" : "a", generation: max + 1, replaces: true };
  }

  return {
    bytesToBinary, binaryToBytes, displayText, toHex,
    parseOldConfig, parseYaml, findWidgets, modelNameOf, OPTION_DEFS, OLD_WIDGET, NG_WIDGET,
    convert, validateRecord, serializeRecord, ngFileText, ngFileNames, planWrite,
  };
});
