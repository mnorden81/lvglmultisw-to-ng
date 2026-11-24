// Node adapter implementing the same fs interface as the browser tool (case-insensitive paths).
const fs = require("fs");
const path = require("path");
function resolve(root, rel, create) {
  let cur = root;
  for (const part of rel.split("/").filter(Boolean)) {
    let names;
    try { names = fs.readdirSync(cur); } catch (e) { return null; }
    const hit = names.find((n) => n.toLowerCase() === part.toLowerCase());
    if (hit) cur = path.join(cur, hit);
    else if (create) cur = path.join(cur, part);
    else return null;
  }
  return cur;
}
module.exports = function (root) {
  return {
    async list(p) {
      const d = resolve(root, p);
      if (!d || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) return null;
      return fs.readdirSync(d, { withFileTypes: true }).map((e) => ({ name: e.name, kind: e.isDirectory() ? "dir" : "file" }));
    },
    async read(p) {
      const d = resolve(root, p);
      if (!d || !fs.existsSync(d) || fs.statSync(d).isDirectory()) return null;
      return new Uint8Array(fs.readFileSync(d));
    },
    async write(p, u8) { const d = resolve(root, p, true); fs.writeFileSync(d, Buffer.from(u8)); },
    async mkdir(p) { fs.mkdirSync(resolve(root, p, true), { recursive: true }); },
  };
};
