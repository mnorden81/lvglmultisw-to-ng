const fs = require("fs");
const read = (f) => fs.readFileSync(__dirname + "/src/" + f, "utf8").replace(/<\/script>/gi, "<\\/script>");
let html = fs.readFileSync(__dirname + "/src/template.html", "utf8");
html = html.replace("/*__CORE__*/", () => read("core.js")).replace("/*__SCAN__*/", () => read("scan.js")).replace("/*__APP__*/", () => read("app.js"));
fs.mkdirSync(__dirname + "/docs", { recursive: true });
fs.writeFileSync(__dirname + "/docs/index.html", html);
console.log("docs/index.html", html.length, "bytes");
