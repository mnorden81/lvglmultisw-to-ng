/* Browser UI for the lvglMultiSw -> lvglMultiSwNG converter. */
(function () {
  "use strict";

  // ------------------------------------------------------------- i18n ---
  const TEXT = {
    de: {
      title: "MultiSwitch: alte Konfiguration nach NG übernehmen",
      intro: "Liest die SD-Karte (Modelle und Konfigurationen des alten Widgets <code>lvglMultiSw</code>) und erzeugt daraus die Konfiguration für <code>lvglMultiSwNG</code>. Gelesen wird nur; geschrieben werden ausschließlich NG-Dateien. Alte Dateien und Modelldateien bleiben unverändert. Mehrere alte Widgets eines Modells werden zu Tabs eines NG-Widgets zusammengeführt, weil NG pro Modell genau eine Konfiguration kennt.",
      openRw: "SD-Karte öffnen (mit Schreibzugriff)",
      openRo: "Ordner einlesen (ohne Schreibzugriff, Download als ZIP)",
      browserNote: "Direktes Schreiben braucht Chrome oder Edge. In anderen Browsern bekommst du die Dateien als ZIP, das du auf die Karte entpackst.",
      pickRoot: "Wähle das Hauptverzeichnis der SD-Karte (oder ein Backup davon) mit den Ordnern MODELS und WIDGETS.",
      noRoot: "In diesem Ordner wurden MODELS und WIDGETS nicht gefunden.",
      scanning: "Lese Karte …",
      models: "Modelle mit altem MultiSwitch-Widget",
      none: "Auf dieser Karte wurde kein Modell mit dem alten Widget (MultiSwE/L) gefunden.",
      target: "Zielordner für NG-Dateien",
      targetModels: "…/lvglMultiSwNG/models/ (aktuelle NG-Version)",
      targetRoot: "…/lvglMultiSwNG/ (ältere NG-Version, Dateien neben dem Code)",
      ngMissing: "Das Widget lvglMultiSwNG ist auf der Karte nicht installiert. Die Dateien werden trotzdem erzeugt; installiere das Widget danach.",
      detected: "automatisch erkannt",
      widgetsIn: "Altes Widget",
      address: "Adresse",
      position: "Bildschirm {s}, Zone {z}",
      tabName: "Tab-Name",
      cfgFile: "Konfigurationsdatei",
      noFile: "— keine —",
      up: "nach oben",
      down: "nach unten",
      include: "übernehmen",
      statusOk: "{n} Buttons",
      statusErr: "unbrauchbar: {e}",
      result: "Ergebnis",
      tabsControls: "{t} Tab(s), {c} Steuerelement(e)",
      skipped: "Nicht übernommen",
      warnings: "Hinweise",
      existing: "Für dieses Modell gibt es schon eine NG-Konfiguration.",
      overwrite: "NG-Konfiguration ersetzen (neue Generation {g}, die alte bleibt als zweite Datei erhalten)",
      convertModel: "Dieses Modell schreiben",
      notPossible: "Nicht möglich",
      ngOnly: "Diese Modelle benutzen schon das NG-Widget (nichts zu tun)",
      orphans: "Konfigurationsdateien, die zu keinem Widget gehören (z. B. umbenannte Modelle)",
      write: "{n} Modell(e) auf die Karte schreiben",
      zip: "{n} Modell(e) als ZIP herunterladen",
      report: "Bericht herunterladen",
      written: "Geschrieben und zurückgelesen: {p}",
      writeFail: "Fehler: {e}",
      zipNote: "Entpacke das ZIP im Hauptverzeichnis der SD-Karte (die Ordner WIDGETS/… werden angelegt).",
      afterNote: "Danach in den Modellen das Widget „MultiSw NG“ statt „MultiSwE/L“ auf den Bildschirm legen. Die Modelldateien ändert dieses Tool nicht.",
      reload: "Neu einlesen",
      nothingSelected: "Nichts ausgewählt.",
    },
    en: {
      title: "MultiSwitch: migrate old configuration to NG",
      intro: "Reads the SD card (models and configurations of the old <code>lvglMultiSw</code> widget) and creates the configuration for <code>lvglMultiSwNG</code>. It only reads; it writes NG files only. Old files and model files stay untouched. Several old widgets of one model are merged into tabs of one NG widget, because NG keeps exactly one configuration per model.",
      openRw: "Open SD card (with write access)",
      openRo: "Read folder (no write access, download as ZIP)",
      browserNote: "Writing directly needs Chrome or Edge. In other browsers you get the files as a ZIP to unpack onto the card.",
      pickRoot: "Choose the SD card root (or a backup of it) containing the MODELS and WIDGETS folders.",
      noRoot: "MODELS and WIDGETS were not found in this folder.",
      scanning: "Reading card …",
      models: "Models with the old MultiSwitch widget",
      none: "No model with the old widget (MultiSwE/L) was found on this card.",
      target: "Target folder for NG files",
      targetModels: ".../lvglMultiSwNG/models/ (current NG version)",
      targetRoot: ".../lvglMultiSwNG/ (older NG version, files next to the code)",
      ngMissing: "The lvglMultiSwNG widget is not installed on this card. The files are still created; install the widget afterwards.",
      detected: "detected automatically",
      widgetsIn: "Old widget",
      address: "Address",
      position: "screen {s}, zone {z}",
      tabName: "Tab name",
      cfgFile: "Configuration file",
      noFile: "— none —",
      up: "move up",
      down: "move down",
      include: "include",
      statusOk: "{n} buttons",
      statusErr: "unusable: {e}",
      result: "Result",
      tabsControls: "{t} tab(s), {c} control(s)",
      skipped: "Not migrated",
      warnings: "Notes",
      existing: "This model already has an NG configuration.",
      overwrite: "Replace the NG configuration (new generation {g}, the old one stays as the second file)",
      convertModel: "Write this model",
      notPossible: "Not possible",
      ngOnly: "These models already use the NG widget (nothing to do)",
      orphans: "Configuration files not assigned to any widget (e.g. renamed models)",
      write: "Write {n} model(s) to the card",
      zip: "Download {n} model(s) as ZIP",
      report: "Download report",
      written: "Written and read back: {p}",
      writeFail: "Error: {e}",
      zipNote: "Unpack the ZIP in the SD card root (the WIDGETS/... folders are created).",
      afterNote: "Then place the \"MultiSw NG\" widget instead of \"MultiSwE/L\" on the screen of each model. This tool does not change model files.",
      reload: "Rescan",
      nothingSelected: "Nothing selected.",
    },
  };
  let lang = (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
  const tr = (k, v) => {
    let s = (TEXT[lang][k] !== undefined ? TEXT[lang][k] : k);
    if (v) for (const [a, b] of Object.entries(v)) s = s.replace("{" + a + "}", b);
    return s;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);

  // -------------------------------------------------------- fs adapters ---
  const lc = (s) => s.toLowerCase();

  function FsaAdapter(root) {
    async function dir(path, create) {
      let cur = root;
      for (const part of path.split("/").filter(Boolean)) {
        let found = null;
        for await (const [name, h] of cur.entries()) {
          if (h.kind === "directory" && lc(name) === lc(part)) { found = h; break; }
        }
        if (!found) {
          if (!create) return null;
          found = await cur.getDirectoryHandle(part, { create: true });
        }
        cur = found;
      }
      return cur;
    }
    async function fileHandle(path, create) {
      const parts = path.split("/");
      const name = parts.pop();
      const d = await dir(parts.join("/"), create);
      if (!d) return null;
      for await (const [n, h] of d.entries()) if (h.kind === "file" && lc(n) === lc(name)) return h;
      return create ? d.getFileHandle(name, { create: true }) : null;
    }
    return {
      writable: true,
      async list(path) {
        const d = await dir(path);
        if (!d) return null;
        const out = [];
        for await (const [name, h] of d.entries()) out.push({ name, kind: h.kind === "directory" ? "dir" : "file" });
        return out;
      },
      async read(path) {
        const h = await fileHandle(path);
        return h ? new Uint8Array(await (await h.getFile()).arrayBuffer()) : null;
      },
      async write(path, u8) {
        const h = await fileHandle(path, true);
        const w = await h.createWritable();
        await w.write(u8);
        await w.close();
      },
      async mkdir(path) { await dir(path, true); },
    };
  }

  // Read-only adapter over a FileList from <input webkitdirectory>; writes are collected for the ZIP.
  function FileListAdapter(files) {
    const entries = new Map(); // lower path -> {path, file}
    const all = Array.from(files).map((f) => ({ f, parts: f.webkitRelativePath.split("/") }));
    // find the prefix depth that exposes MODELS/ and WIDGETS/
    let depth = 1;
    for (const d of [1, 2, 0]) {
      if (all.some((x) => x.parts.length > d + 1 && lc(x.parts[d]) === "models")) { depth = d; break; }
    }
    for (const x of all) {
      const rel = x.parts.slice(depth).join("/");
      if (rel) entries.set(lc(rel), { path: rel, file: x.f });
    }
    const outputs = new Map();
    return {
      writable: false, outputs,
      hasRoot: () => Array.from(entries.keys()).some((k) => k.startsWith("models/")) && Array.from(entries.keys()).some((k) => k.startsWith("widgets/")),
      async list(path) {
        const prefix = lc(path) ? lc(path) + "/" : "";
        const seen = new Map();
        for (const [k, e] of entries) {
          if (!k.startsWith(prefix)) continue;
          const rest = e.path.slice(prefix.length).split("/");
          const name = rest[0];
          const kind = rest.length > 1 ? "dir" : "file";
          if (!seen.has(lc(name))) seen.set(lc(name), { name, kind });
        }
        for (const [p] of outputs) { // files created by us
          if (!lc(p).startsWith(prefix)) continue;
          const rest = p.slice(prefix.length).split("/");
          if (!seen.has(lc(rest[0]))) seen.set(lc(rest[0]), { name: rest[0], kind: rest.length > 1 ? "dir" : "file" });
        }
        return seen.size ? Array.from(seen.values()) : null;
      },
      async read(path) {
        if (outputs.has(path)) return outputs.get(path);
        const e = entries.get(lc(path));
        return e ? new Uint8Array(await e.file.arrayBuffer()) : null;
      },
      async write(path, u8) { outputs.set(path, u8); },
      async mkdir() {},
    };
  }

  // -------------------------------------------------------------- zip ---
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function makeZip(files) { // files: Map path -> Uint8Array (stored, no compression)
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (n) => [n & 255, (n >> 8) & 255];
    const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const [path, data] of files) {
      const name = enc.encode(path), crc = crc32(data);
      const local = Uint8Array.from([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0]);
      chunks.push(local, name, data);
      central.push(Uint8Array.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset)]), name);
      offset += local.length + name.length + data.length;
    }
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.size), ...u16(files.size), ...u32(cdSize), ...u32(offset), 0, 0]);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ------------------------------------------------------------- state ---
  const S = { fs: null, scan: null, built: new Map(), log: [], opts: { modelsDir: undefined }, busy: false };
  const convOpts = () => ({ lang });

  function rebuild() {
    S.built.clear();
    for (const m of S.scan.models) if (m.instances.length) S.built.set(m, Scan.build(m, S.scan, convOpts()));
    for (const m of S.scan.models) {
      const b = S.built.get(m);
      if (m.select === undefined) m.select = !!(b && b.ok && !b.blockedByExisting);
    }
  }

  async function load(fs) {
    S.fs = fs;
    $("status").textContent = tr("scanning");
    try {
      S.scan = await Scan.scan(fs, S.opts);
    } catch (e) {
      $("status").textContent = tr("writeFail", { e: e.message });
      return;
    }
    $("status").textContent = "";
    S.log = [];
    rebuild();
    render();
  }

  // ------------------------------------------------------------ render ---
  function fileLabel(f) {
    const st = f.parsed.ok ? tr("statusOk", { n: f.parsed.settings.buttons.length }) : tr("statusErr", { e: f.parsed.error });
    return Core.displayText(f.name) + "  (" + st + ")";
  }

  function render() {
    const sc = S.scan;
    const root = $("main");
    if (!sc) { root.innerHTML = ""; return; }
    let h = "";
    const ng = sc.ng;
    h += '<section class="card"><h2>' + esc(tr("target")) + "</h2>";
    if (!ng.installed) h += '<p class="warn">' + esc(tr("ngMissing")) + "</p>";
    h += '<label class="row"><select id="target">' +
      '<option value="models"' + (ng.modelsDir ? " selected" : "") + ">" + esc(tr("targetModels")) + (ng.installed && ng.detected ? " – " + esc(tr("detected")) : "") + "</option>" +
      '<option value="root"' + (!ng.modelsDir ? " selected" : "") + ">" + esc(tr("targetRoot")) + (ng.installed && !ng.detected ? " – " + esc(tr("detected")) : "") + "</option></select></label></section>";

    const convertible = sc.models.filter((m) => m.instances.length);
    const ngOnly = sc.models.filter((m) => !m.instances.length);
    h += "<h2>" + esc(tr("models")) + " (" + convertible.length + ")</h2>";
    if (!convertible.length) h += "<p>" + esc(tr("none")) + "</p>";
    convertible.forEach((m, mi) => { h += renderModel(m, mi); });

    if (ngOnly.length) {
      h += '<details class="card"><summary>' + esc(tr("ngOnly")) + " (" + ngOnly.length + ")</summary><ul>" +
        ngOnly.map((m) => "<li>" + esc(m.name) + " <span class='muted'>" + esc(m.file) + "</span></li>").join("") + "</ul></details>";
    }
    if (sc.orphans.length) {
      h += '<details class="card"><summary>' + esc(tr("orphans")) + " (" + sc.orphans.length + ")</summary><ul>" +
        sc.orphans.map((f) => "<li>" + esc(fileLabel(f)) + "</li>").join("") + "</ul></details>";
    }

    const sel = convertible.filter((m) => m.select && S.built.get(m) && S.built.get(m).ok && !S.built.get(m).blockedByExisting);
    h += '<section class="card actions">';
    if (S.fs && S.fs.writable) h += '<button id="write" class="primary"' + (sel.length ? "" : " disabled") + ">" + esc(tr("write", { n: sel.length })) + "</button> ";
    h += '<button id="zip"' + (sel.length ? "" : " disabled") + ">" + esc(tr("zip", { n: sel.length })) + "</button> ";
    h += '<button id="report">' + esc(tr("report")) + "</button> <button id='rescan'>" + esc(tr("reload")) + "</button>";
    h += '<p class="muted">' + esc(tr("afterNote")) + "</p>";
    if (!(S.fs && S.fs.writable)) h += '<p class="muted">' + esc(tr("zipNote")) + "</p>";
    h += '<ul id="log">' + S.log.map((l) => '<li class="' + l.cls + '">' + esc(l.text) + "</li>").join("") + "</ul></section>";
    root.innerHTML = h;
    wire(convertible);
  }

  function renderModel(m, mi) {
    const b = S.built.get(m);
    let h = '<section class="card model"><header><label><input type="checkbox" data-m="' + mi + '" class="msel"' + (m.select ? " checked" : "") + (b && b.ok && !b.blockedByExisting ? "" : " disabled") + "> <strong>" + esc(m.name) + '</strong></label> <span class="muted">' + esc(m.file) + "</span></header>";
    m.instances.forEach((inst, ii) => {
      const pos = inst.widgets.map((w) => tr("position", { s: w.screen, z: w.zone })).join("; ");
      const cands = S.scan.configFiles.slice().sort((a, b2) => (b2.address === inst.address) - (a.address === inst.address) || a.name.localeCompare(b2.name));
      h += '<div class="inst"><label class="inc"><input type="checkbox" class="iinc" data-m="' + mi + '" data-i="' + ii + '"' + (inst.include ? " checked" : "") + "> " + esc(tr("include")) + "</label>" +
        "<span>" + esc(tr("widgetsIn")) + " · " + esc(tr("address")) + " <strong>" + inst.address + "</strong> <span class='muted'>(" + esc(pos) + ")</span></span>" +
        '<label>' + esc(tr("tabName")) + ' <input type="text" class="itab" data-m="' + mi + '" data-i="' + ii + '" maxlength="32" value="' + esc(inst.tabName) + '"></label>' +
        '<label>' + esc(tr("cfgFile")) + ' <select class="ifile" data-m="' + mi + '" data-i="' + ii + '"><option value="">' + esc(tr("noFile")) + "</option>" +
        cands.map((f) => '<option value="' + esc(f.name) + '"' + (f.name === inst.file ? " selected" : "") + ">" + esc(fileLabel(f)) + "</option>").join("") + "</select></label>" +
        '<span class="mv"><button class="iup" data-m="' + mi + '" data-i="' + ii + '" title="' + esc(tr("up")) + '"' + (ii === 0 ? " disabled" : "") + '>↑</button><button class="idown" data-m="' + mi + '" data-i="' + ii + '" title="' + esc(tr("down")) + '"' + (ii === m.instances.length - 1 ? " disabled" : "") + ">↓</button></span></div>";
    });
    if (b && b.ok) {
      const c = b.conv;
      h += '<div class="res"><strong>' + esc(tr("result")) + ":</strong> " + esc(tr("tabsControls", { t: c.config.tabs.length, c: c.config.controls.length })) +
        ' <span class="muted">→ ' + esc(b.path) + "</span>";
      if (b.plan.replaces) {
        h += '<p class="warn">' + esc(tr("existing")) + ' <label><input type="checkbox" class="iover" data-m="' + mi + '"' + (m.overwrite ? " checked" : "") + "> " + esc(tr("overwrite", { g: b.plan.generation })) + "</label></p>";
      }
      if (c.skipped.length) h += '<details open><summary class="warn">' + esc(tr("skipped")) + " (" + c.skipped.length + ")</summary><ul>" + c.skipped.map((s) => "<li>" + esc(Core.displayText(s.label)) + " – " + esc(s.reason) + "</li>").join("") + "</ul></details>";
      const notes = b.messages.map((t) => ({ level: "warn", text: t })).concat(c.warnings);
      if (notes.length) h += "<details" + (notes.some((n) => n.level === "warn") ? " open" : "") + "><summary>" + esc(tr("warnings")) + " (" + notes.length + ")</summary><ul>" + notes.map((n) => '<li class="' + n.level + '">' + esc(Core.displayText(n.text)) + "</li>").join("") + "</ul></details>";
      h += "</div>";
    } else if (b) {
      h += '<div class="res"><strong class="warn">' + esc(tr("notPossible")) + ":</strong> " + esc(b.messages.map((x) => Core.displayText(x)).join(" ")) + "</div>";
    }
    return h + "</section>";
  }

  function wire(convertible) {
    const rb = () => { rebuild(); render(); };
    const model = (el) => convertible[Number(el.dataset.m)];
    document.querySelectorAll(".msel").forEach((el) => el.addEventListener("change", () => { model(el).select = el.checked; render(); }));
    document.querySelectorAll(".iinc").forEach((el) => el.addEventListener("change", () => { model(el).instances[Number(el.dataset.i)].include = el.checked; model(el).select = undefined; rb(); }));
    document.querySelectorAll(".itab").forEach((el) => el.addEventListener("change", () => { model(el).instances[Number(el.dataset.i)].tabName = el.value; rb(); }));
    document.querySelectorAll(".ifile").forEach((el) => el.addEventListener("change", () => {
      const inst = model(el).instances[Number(el.dataset.i)];
      inst.file = el.value || null;
      const f = S.scan.configFiles.find((c) => c.name === inst.file);
      inst.include = !!(f && f.parsed.ok);
      if (f && f.parsed.ok && f.parsed.settings.name) inst.tabName = Core.displayText(String(f.parsed.settings.name));
      model(el).select = undefined;
      rb();
    }));
    const move = (el, d) => { const m = model(el), i = Number(el.dataset.i); const t = m.instances[i]; m.instances.splice(i, 1); m.instances.splice(i + d, 0, t); rb(); };
    document.querySelectorAll(".iup").forEach((el) => el.addEventListener("click", () => move(el, -1)));
    document.querySelectorAll(".idown").forEach((el) => el.addEventListener("click", () => move(el, 1)));
    document.querySelectorAll(".iover").forEach((el) => el.addEventListener("change", () => { const m = model(el); m.overwrite = el.checked; rebuild(); m.select = el.checked ? true : false; render(); }));
    const target = $("target");
    if (target) target.addEventListener("change", () => { S.opts.modelsDir = target.value === "models"; load(S.fs); });
    const rs = $("rescan"); if (rs) rs.addEventListener("click", () => { S.opts = { modelsDir: undefined }; load(S.fs); });
    const selected = () => convertible.filter((m) => m.select && S.built.get(m) && S.built.get(m).ok && !S.built.get(m).blockedByExisting);
    const w = $("write");
    if (w) w.addEventListener("click", async () => {
      const log = [];
      for (const m of selected()) {
        const b = S.built.get(m);
        try { await Scan.writeResult(S.fs, S.scan, b); log.push({ cls: "ok", text: tr("written", { p: b.path }) }); }
        catch (e) { log.push({ cls: "warn", text: m.file + ": " + tr("writeFail", { e: e.message }) }); }
      }
      await load(S.fs);
      S.log = log; render();
    });
    $("zip").addEventListener("click", () => {
      const files = new Map();
      for (const m of selected()) { const b = S.built.get(m); files.set(b.path, Core.binaryToBytes(b.text)); }
      if (!files.size) return;
      download(makeZip(files), "lvglMultiSwNG-config.zip");
    });
    $("report").addEventListener("click", () => download(new Blob([makeReport(convertible)], { type: "text/plain;charset=utf-8" }), "multiswitch-migration-report.txt"));
  }

  function makeReport(models) {
    const out = ["MultiSwitch migration report", ""];
    for (const m of models) {
      out.push("== " + m.name + " (" + m.file + ")");
      const b = S.built.get(m);
      if (!b || !b.ok) { out.push("  not possible: " + (b ? b.messages.join(" ") : "") , ""); continue; }
      out.push("  target: " + b.path + "  generation " + b.plan.generation + (b.plan.replaces ? " (replaces existing config)" : ""));
      b.conv.config.tabs.forEach((t) => out.push("  tab '" + Core.displayText(t.name) + "' address " + t.address + ", " + b.conv.config.controls.filter((c) => c.tab === t.id).length + " controls"));
      b.conv.skipped.forEach((s) => out.push("  NOT MIGRATED: " + Core.displayText(s.label) + " - " + s.reason));
      b.messages.concat(b.conv.warnings.map((w) => "[" + w.level + "] " + w.text)).forEach((t) => out.push("  " + Core.displayText(t)));
      out.push("");
    }
    return out.join("\n");
  }

  // ------------------------------------------------------------- start ---
  function setStaticTexts() {
    document.title = tr("title");
    $("title").textContent = tr("title");
    $("intro").innerHTML = tr("intro");
    $("btnRw").textContent = tr("openRw");
    $("btnRo").textContent = tr("openRo");
    $("browserNote").textContent = tr("browserNote");
    $("pickHint").textContent = tr("pickRoot");
    $("langBtn").textContent = lang === "de" ? "English" : "Deutsch";
  }

  function init() {
    setStaticTexts();
    $("langBtn").addEventListener("click", () => { lang = lang === "de" ? "en" : "de"; setStaticTexts(); if (S.scan) { rebuild(); render(); } });
    const hasFsa = typeof window.showDirectoryPicker === "function";
    $("btnRw").disabled = !hasFsa;
    $("btnRw").addEventListener("click", async () => {
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        let fs = FsaAdapter(handle);
        if (!(await fs.list("MODELS")) || !(await fs.list("WIDGETS"))) {
          // maybe a backup folder one level deeper
          let sub = null;
          for await (const [, h] of handle.entries()) {
            if (h.kind !== "directory") continue;
            const cand = FsaAdapter(h);
            if ((await cand.list("MODELS")) && (await cand.list("WIDGETS"))) { sub = cand; break; }
          }
          if (!sub) { $("status").textContent = tr("noRoot"); return; }
          fs = sub;
        }
        S.opts = { modelsDir: undefined };
        await load(fs);
      } catch (e) { if (e && e.name !== "AbortError") $("status").textContent = tr("writeFail", { e: e.message }); }
    });
    $("btnRo").addEventListener("click", () => $("dirInput").click());
    $("dirInput").addEventListener("change", async () => {
      const fs = FileListAdapter($("dirInput").files);
      if (!fs.hasRoot()) { $("status").textContent = tr("noRoot"); return; }
      S.opts = { modelsDir: undefined };
      await load(fs);
    });
    window.__App = { load, FileListAdapter, state: S };
  }
  document.addEventListener("DOMContentLoaded", init);
})();
