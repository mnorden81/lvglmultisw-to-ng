const Scan = require("../src/scan.js");
const mk = require("./node-fs.js");
(async () => {
  const root = process.argv[2];
  const fs = mk(root);
  const s = await Scan.scan(fs);
  console.log("NG:", JSON.stringify(s.ng));
  for (const m of s.models) {
    console.log("\n== " + m.file + " '" + m.name + "'  ngWidgets=" + m.ngWidgets.length + " existingNG=" + m.hasExisting);
    for (const i of m.instances) {
      const f = s.configFiles.find((c) => c.name === i.file);
      console.log("  addr " + i.address + " widgets=" + JSON.stringify(i.widgets) + " file=" + i.file + " " + (f ? (f.parsed.ok ? "ok" : "ERR " + f.parsed.error) : "-") + " crsf=" + i.options.CRSF + " sport=" + i.options.SPort + "/" + i.options.SPortProto);
    }
    if (m.instances.length) {
      const b = Scan.build(m, s, {lang: "de"});
      if (!b.ok) console.log("  -> NOT OK", b.messages);
      else {
        console.log("  -> tabs=" + b.conv.config.tabs.map((t) => t.name + "@" + t.address).join(", ") + " controls=" + b.conv.config.controls.length + " skipped=" + b.conv.skipped.length + " dest=" + b.conv.config.header.destination + " proto=" + b.conv.config.header.protocol + " path=" + b.path + " blocked=" + b.blockedByExisting);
        b.conv.warnings.forEach((w) => console.log("     [" + w.level + "] " + w.text));
        b.conv.skipped.forEach((w) => console.log("     [skipped] " + w.label + ": " + w.reason));
      }
    }
  }
  console.log("\nOrphans:", s.orphans.map((o) => o.name + (o.parsed.ok ? "" : "(ERR " + o.parsed.error + ")")).join(", "));
  console.log("Problems:", s.problems);
})();
