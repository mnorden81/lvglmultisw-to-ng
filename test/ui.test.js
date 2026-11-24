// UI test in jsdom: drives the built single-file HTML with the real SD backup.
const { JSDOM } = require("/tmp/jsd/node_modules/jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const mkfs = require("./node-fs.js");
const sdRoot = process.argv[2], work = process.argv[3];
let passed = 0, failed = 0;
async function test(n, f) { try { await f(); passed++; console.log("  ok   " + n); } catch (e) { failed++; console.log("  FAIL " + n + "\n       " + String(e.stack || e).split("\n").slice(0, 4).join("\n       ")); } }
const tick = () => new Promise((r) => setTimeout(r, 30));
(async () => {
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  for (const rel of ["MODELS", "WIDGETS/lvglMultiSw", "WIDGETS/lvglMultiSwNG"]) fs.cpSync(path.join(sdRoot, rel), path.join(work, rel), { recursive: true });
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const errors = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/", beforeParse(w) {
    Object.defineProperty(w.navigator, "language", { value: "de-DE" });
    w.__blobs = [];
    w.URL.createObjectURL = (b) => { w.__blobs.push(b); return "blob:x"; };
    w.addEventListener("error", (e) => errors.push(e.message));
  } });
  const w = dom.window, d = w.document;
  await tick();
  const adapter = mkfs(work); adapter.writable = true;
  await w.__App.load(adapter); await tick();
  const cards = () => Array.from(d.querySelectorAll("section.model"));
  const card = (name) => cards().find((x) => x.querySelector("header strong").textContent === name);
  await test("page renders: 7 convertible models, German UI", () => {
    assert.strictEqual(cards().length, 7);
    assert(d.getElementById("title").textContent.includes("NG"));
    assert(d.getElementById("btnRw").textContent.includes("SD-Karte"));
  });
  await test("Dusseldorf-HF card shows two widget rows, skipped list and logical-switch warning", () => {
    const c = card("Dusseldorf-HF");
    assert.strictEqual(c.querySelectorAll(".inst").length, 2);
    assert(c.textContent.includes("Nicht übernommen (8)"));
    assert(/logical\/virtual switch/.test(c.textContent));
  });
  await test("models without a usable file are disabled and say why (ELRS)", () => {
    const c = card("ELRS");
    assert(c.querySelector(".msel").disabled); assert(c.textContent.includes("Nicht möglich"));
  });
  await test("choosing the renamed file by hand enables the model", async () => {
    const c = () => card("ELRS");
    const sel = c().querySelector(".ifile"); sel.value = "Modell08 elrs_0.lua";
    sel.dispatchEvent(new w.Event("change", { bubbles: true })); await tick();
    assert(!c().querySelector(".msel").disabled); assert(c().textContent.includes("1 Tab(s), 16 Steuerelement"));
  });
  await test("moving a tab down changes the order and the result", async () => {
    const c = () => card("Dusseldorf-HF");
    c().querySelector(".idown").dispatchEvent(new w.Event("click", { bubbles: true })); await tick();
    assert.strictEqual(c().querySelectorAll(".inst")[0].querySelector(".iinc").dataset.i, "0");
    assert(/Adresse\s*1/.test(c().querySelectorAll(".inst")[0].textContent));
  });
  await test("tab name edit is applied and HTML in names is escaped", async () => {
    const c = () => card("KARL");
    const inp = c().querySelector(".itab"); inp.value = '<img src=x onerror="window.__xss=1">Licht';
    inp.dispatchEvent(new w.Event("change", { bubbles: true })); await tick();
    assert.strictEqual(w.__xss, undefined); assert(!d.querySelector("img"));
    assert.strictEqual(c().querySelector(".itab").value, '<img src=x onerror="window.__xss=1">Licht');
    inp.value = "Beleuchtung"; inp.dispatchEvent(new w.Event("change", { bubbles: true })); await tick();
  });
  await test("NG-only model and orphans are listed separately", () => {
    assert(d.body.textContent.includes("Modell13")); assert(d.body.textContent.includes("MODELL02_0.lua"));
    assert(d.body.textContent.includes("unbrauchbar: truncated")); assert(d.body.textContent.includes("unbrauchbar: empty"));
  });
  await test("target folder follows the detected NG version (root, not models/)", () => {
    assert(d.getElementById("target").value === "root");
    assert(d.querySelector(".res").textContent.includes("WIDGETS/lvglMultiSwNG/model_"));
  });
  await test("write button writes and reads back; Modell13 untouched; log shows files", async () => {
    const before = fs.readFileSync(path.join(work, "WIDGETS/lvglMultiSwNG/model_6d6f64656c31332e796d6c.a.lua"));
    d.getElementById("write").dispatchEvent(new w.Event("click", { bubbles: true })); await new Promise((r) => setTimeout(r, 400));
    const files = fs.readdirSync(path.join(work, "WIDGETS/lvglMultiSwNG")).filter((f) => /^model_.*\.a\.lua$/.test(f));
    assert.strictEqual(files.length, 7, files.join());   // 6 converted (5 + ELRS) + the existing Modell13
    assert(before.equals(fs.readFileSync(path.join(work, "WIDGETS/lvglMultiSwNG/model_6d6f64656c31332e796d6c.a.lua"))));
    assert(d.getElementById("log").textContent.includes("Geschrieben und zurückgelesen"));
  });
  await test("after writing, a second write is blocked unless overwrite is confirmed", async () => {
    const c = card("KARL");
    assert(c.querySelector(".msel").disabled); assert(c.querySelector(".iover"));
    assert(c.textContent.includes("neue Generation 2"));
  });
  await test("ZIP download is a valid zip with the expected path", async () => {
    // re-enable one model by confirming overwrite, then zip
    const c = () => card("KARL");
    c().querySelector(".iover").checked = true; c().querySelector(".iover").dispatchEvent(new w.Event("change", { bubbles: true })); await tick();
    d.getElementById("zip").dispatchEvent(new w.Event("click", { bubbles: true })); await tick();
    const blob = w.__blobs[w.__blobs.length - 1];
    const buf = await new Promise((res) => { const fr = new w.FileReader(); fr.onload = () => res(Buffer.from(fr.result)); fr.readAsArrayBuffer(blob); });
    fs.writeFileSync(path.join(work, "out.zip"), buf);
    const out = require("child_process").execSync("unzip -l " + JSON.stringify(path.join(work, "out.zip")) + " && unzip -tq " + JSON.stringify(path.join(work, "out.zip"))).toString();
    assert(/WIDGETS\/lvglMultiSwNG\/model_.*\.b\.lua/.test(out), out); assert(/No errors/.test(out), out);
  });
  await test("English UI toggle", async () => {
    d.getElementById("langBtn").dispatchEvent(new w.Event("click", { bubbles: true })); await tick();
    assert(d.getElementById("title").textContent.startsWith("MultiSwitch: migrate"));
  });
  await test("no script errors", () => assert.deepStrictEqual(errors, []));
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
