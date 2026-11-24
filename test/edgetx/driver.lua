-- Test driver for edgetx/SCRIPTS/TOOLS/msw2ng.lua, run with fengari in test/edgetx/run.html.
-- Mocks the EdgeTX file and screen API on an in-memory SD card.
local js = require "js"
local global = js.global
local function src(id) return global.document:getElementById(id).textContent end

local results = {}
local function check(name, ok, detail)
    results[#results + 1] = (ok and "ok   " or "FAIL ") .. name .. ((not ok and detail) and ("  -- " .. tostring(detail)) or "")
end

------------------------------------------------------------ EdgeTX mocks ---
local FILES, DIRS
local function norm(p) return (string.gsub(string.lower(p), "/+$", "")) end
local function parentOf(p) return string.match(p, "^(.*)/[^/]*$") end
local function addDirs(path)
    local d = parentOf(path)
    while d and d ~= "" do DIRS[norm(d)] = d; d = parentOf(d) end
end
local function resetCard()
    FILES, DIRS = {}, {}
end
local function put(path, text) FILES[norm(path)] = {path = path, data = text}; addDirs(path) end
local function get(path) local f = FILES[norm(path)]; return f and f.data end

io = {}
function io.open(path, mode)
    mode = mode or "r"
    local key = norm(path)
    if string.find(mode, "r") then
        local f = FILES[key]
        if not f then return nil, "file error", 2 end
        return {f = f, pos = 1}
    end
    local parent = parentOf(path)
    if parent and parent ~= "" and not DIRS[norm(parent)] then return nil, "no directory", 2 end
    if string.find(mode, "w") or not FILES[key] then FILES[key] = {path = path, data = ""} end
    return {f = FILES[key], pos = 1}
end
function io.read(h, n)
    local s = string.sub(h.f.data, h.pos, h.pos + n - 1)
    h.pos = h.pos + #s
    return s
end
function io.write(h, ...)
    for _, v in ipairs({...}) do h.f.data = h.f.data .. v end
    return h
end
function io.close(h) end
function dir(path)
    local key = norm(path)
    if not DIRS[key] then return nil end
    local names, seen = {}, {}
    for k, f in pairs(FILES) do if parentOf(k) == key then names[#names + 1] = string.match(f.path, "[^/]+$") end end
    for k, d in pairs(DIRS) do if parentOf(k) == key and not seen[k] then seen[k] = true; names[#names + 1] = string.match(d, "[^/]+$") end end
    local i = 0
    return function() i = i + 1; return names[i] end
end
function fstat(path)
    local k = norm(path)
    if DIRS[k] then return {attrib = 0x10, size = 0} end
    if FILES[k] then return {attrib = 0x20, size = #FILES[k].data} end
end
function mkdir(path) DIRS[norm(path)] = path; return 0 end
INFO = {}
model = {getInfo = function() return INFO end}
function loadScript(path, mode)
    local f = FILES[norm(path)]
    if not f then return nil, "not found: " .. path end
    return load(f.data, "@" .. path, "t")
end
local SCREEN = {}
lcd = {
    clear = function() SCREEN = {} end,
    drawText = function(x, y, t) SCREEN[#SCREEN + 1] = t end,
    sizeText = function(t) return #t * 7, 16 end,
}
LCD_W, LCD_H = 480, 272
SMLSIZE, BOLD, INVERS = 0x0100, 0x0200, 0x0400
EVT_VIRTUAL_ENTER, EVT_VIRTUAL_EXIT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_PREV, EVT_TOUCH_TAP = 101, 102, 103, 104, 105
function getGeneralSettings() return {language = "EN"} end
collectgarbage = function() return 0 end -- not implemented in fengari
local function screen() return table.concat(SCREEN, "\n") end

------------------------------------------------------------ load script ---
local toolSource = src("tool")
local tool = load(toolSource, "@msw2ng.lua", "t")()
local C = tool.core
local NGCONFIG, NGSTORAGE = src("ngconfig"), src("ngstorage")

----------------------------------------------------------- unit tests ---
do
    local t = 'return {\n-- Table: {1}\n{\n ["name"]="a\\"b\\\\c\\10d",\n ["list"]={2},\n ["f"]=51.0,\n ["neg"]=-5,\n ["b"]=true,\n},\n-- Table: {2}\n{\n {3},\n},\n-- Table: {3}\n{ ["x"]=1, },\n}\n--end\n'
    local r, err = C.parseOldConfig(t)
    check("parser: escapes, refs, trailer", r and r.name == 'a"b\\c\nd' and r.f == 51 and r.neg == -5 and r.b == true and r.list[1].x == 1 and C.isList(r.list), err)
    for _, bad in ipairs({'return { os.execute("x") }', 'return { {1}, ["a"]=f() }', 'x = 1', 'return { {1} } os.exit()', 'return {{ ["a"]={9} }}'}) do
        local res = C.parseOldConfig(bad)
        check("parser rejects: " .. bad, res == nil)
    end
    local _, e1 = C.parseOldConfig("")
    local _, e2 = C.parseOldConfig('return {\n{\n ["a"]={2},\n},\n{\n ["b"]="x')
    local _, e3 = C.parseOldConfig('return {{ ["a"]={2} },{ ["b"]={1} }}')
    check("parser: empty/truncated/circular", e1 == "empty" and e2 == "truncated" and e3 == "circular reference", tostring(e1) .. "," .. tostring(e2) .. "," .. tostring(e3))
    -- the parser must not run code: a function value in the file is a syntax error for it
    MARK = nil
    local r4 = C.parseOldConfig('return {{ ["a"]=(function() MARK=1 end)() }}')
    check("parser never executes", r4 == nil and MARK == nil)
end

------------------------------------------- core: same result as the JS tool ---
local function jsKeys(obj)
    local keys, arr = {}, global.Object:keys(obj)
    for i = 0, arr.length - 1 do keys[#keys + 1] = arr[i] end
    return keys
end

local function coreRun(fx)
    local yaml = C.parseYaml(fx.yaml)
    local widgets = C.findWidgets(yaml)
    local byAddress, order = {}, {}
    for _, w in ipairs(widgets) do
        if w.kind == "old" and not byAddress[w.options.Address] then
            byAddress[w.options.Address] = {address = w.options.Address, options = w.options}
            order[#order + 1] = byAddress[w.options.Address]
        end
    end
    table.sort(order, function(a, b) return a.address < b.address end)
    local insts = {}
    for _, inst in ipairs(order) do
        local wanted = string.lower(fx.modelName) .. "_" .. string.format("%d", inst.address) .. ".lua"
        for _, name in ipairs(jsKeys(fx.files)) do
            if string.lower(name) == wanted then
                local st = assert(C.parseOldConfig(fx.files[name]))
                insts[#insts + 1] = {address = inst.address, options = inst.options, settings = st,
                    tabName = st.name, label = "Address " .. string.format("%d", inst.address) .. " (" .. name .. ")"}
            end
        end
    end
    local r, err = C.convert(insts, "en")
    if not r then return "ERROR " .. tostring(err) end
    return C.toHex(C.ngFileText(r.config, 1)) .. "|" .. #r.warnings .. "|" .. #r.skipped .. "|" .. #widgets
end

local LUA_CORE = {}
local FIX = global.FIX
for i = 0, FIX.length - 1 do
    local ok, res = pcall(coreRun, FIX[i])
    LUA_CORE[#LUA_CORE + 1] = ok and res or ("ERROR " .. tostring(res))
end
global.LUA_CORE = table.concat(LUA_CORE, "\n")

-------------------------------------------------- tool end-to-end tests ---
local NG = "/WIDGETS/lvglMultiSwNG/"
local function card(fx, withNg)
    resetCard()
    put("/MODELS/" .. fx.modelFile, fx.yaml)
    for _, name in ipairs(jsKeys(fx.files)) do put("/WIDGETS/lvglMultiSw/" .. name, fx.files[name]) end
    put("/WIDGETS/lvglMultiSw/main.lua", "-- old widget")
    put("/WIDGETS/lvglMultiSw/Anna_0.lua", "return {}")
    if withNg ~= false then
        put(NG .. "main.lua", "-- ng")
        put(NG .. "app.lua", "app.modelsDir = app.dir .. \"models/\"")
        put(NG .. "config.lua", NGCONFIG)
        put(NG .. "storage.lua", NGSTORAGE)
    end
    INFO = {name = fx.modelName, filename = fx.modelFile}
end
local function hex(s) return C.toHex(s) end
local function target(fx, slot) return NG .. "models/model_" .. hex(fx.modelFile) .. "." .. slot .. ".lua" end

local function runTool(keys, frames)
    tool.init()
    tool.run(0) -- scan
    tool.run(0) -- draw summary
    for _, k in ipairs(keys) do
        local r = tool.run(k)
        if r ~= 0 then return r end
    end
    for _ = 1, frames or 30 do tool.run(0) end
    return 0
end

local fx1 = FIX[0]
do -- fresh conversion, two widgets -> two tabs
    card(fx1)
    runTool({EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER})
    local text = get(target(fx1, "a"))
    local expected = string.match(LUA_CORE[1], "^(%x+)|")
    check("tool: writes slot a with generation 1", text ~= nil and hex(text) == expected, text and "differs" or "missing")
    check("tool: NG loader check OK", string.find(screen(), "NG loader check: OK", 1, true) ~= nil, screen())
    local seen = screen()
    for _ = 1, 40 do tool.run(EVT_VIRTUAL_NEXT); seen = seen .. "\n" .. screen() end
    check("tool: report lists logical switches and skipped buttons",
        string.find(seen, "external_switch", 1, true) ~= nil and string.find(seen, "already used by", 1, true) ~= nil, seen)
    check("tool: old files unchanged", get("/WIDGETS/lvglMultiSw/Düsseldorf_0.lua") == fx1.files["Düsseldorf_0.lua"]
        and get("/MODELS/model01.yml") == fx1.yaml)
    -- second run: replace after confirmation, goes to slot b with generation 2
    runTool({EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER})
    check("tool: existing config is not replaced without confirmation", get(target(fx1, "b")) == nil, "slot b written")
    check("tool: asks before replacing", string.find(screen(), "already has an NG configuration (generation 1)", 1, true) ~= nil, screen())
    runTool({EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER, EVT_VIRTUAL_ENTER})
    local b = get(target(fx1, "b"))
    check("tool: replacement in slot b, generation 2, slot a kept", b and string.find(b, "generation=2", 1, true) and get(target(fx1, "a")) == text, b)
    check("tool: NG loader check OK after replace", string.find(screen(), "NG loader check: OK", 1, true) ~= nil, screen())
end

do -- deselect the second widget: one tab only
    card(fx1)
    runTool({EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER})
    local text = get(target(fx1, "a")) or ""
    local _, tabs = string.gsub(text, "kind=\"tab\"", "")
    check("tool: deselected widget is left out", tabs == 1, text)
end

do -- model renamed: the file has to be chosen by hand
    local fx = FIX[0]
    card(fx)
    put("/WIDGETS/lvglMultiSw/Modell08 elrs_0.lua", global.FIX_EXTRA.renamedFile)
    INFO = {name = "ELRS", filename = "model01.yml"}
    tool.init(); tool.run(0); tool.run(0)
    check("tool: missing file is shown", string.find(screen(), "no file - ENTER: choose", 1, true) ~= nil, screen())
    tool.run(EVT_VIRTUAL_ENTER) -- opens picker
    -- files sorted: Anna_0, Düsseldorf_0, Düsseldorf_1, Modell08 elrs_0
    tool.run(EVT_VIRTUAL_NEXT); tool.run(EVT_VIRTUAL_NEXT); tool.run(EVT_VIRTUAL_NEXT)
    tool.run(EVT_VIRTUAL_ENTER)
    check("tool: picked file is used", string.find(screen(), "[x] Addr 0: ELRS Licht", 1, true) ~= nil, screen())
    for _ = 1, 5 do tool.run(EVT_VIRTUAL_NEXT) end -- to the action row (3 rows: 2 widgets + action)
    tool.run(EVT_VIRTUAL_PREV); tool.run(EVT_VIRTUAL_PREV); tool.run(EVT_VIRTUAL_NEXT); tool.run(EVT_VIRTUAL_NEXT)
    tool.run(EVT_VIRTUAL_ENTER)
    for _ = 1, 30 do tool.run(0) end
    local text = get(target(fx, "a")) or ""
    check("tool: renamed model converted", string.find(text, "ELRS Licht", 1, true) ~= nil and string.find(screen(), "NG loader check: OK", 1, true) ~= nil, screen())
end

do -- old widget already removed from the screens: files of the model with default options
    local fx = FIX[4] -- KARL
    card(fx)
    put("/MODELS/" .. fx.modelFile, 'header: \n   name: "KARL"\nscreenData: \n   0:\n      layoutData: \n         zones: \n            0:\n               widgetName: "MultiSw NG"\n')
    runTool({EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER})
    local text = get(target(fx, "a")) or ""
    check("tool: fallback to model files with defaults", string.find(text, "Hand", 1, true) ~= nil and string.find(screen(), "no longer on the model's screens", 1, true) ~= nil, screen())
end

do -- unusable files are reported and never converted
    local fx = FIX[0]
    card(fx)
    put("/WIDGETS/lvglMultiSw/Düsseldorf_0.lua", global.FIX_EXTRA.empty)
    put("/WIDGETS/lvglMultiSw/Düsseldorf_1.lua", global.FIX_EXTRA.truncated)
    tool.init(); tool.run(0); tool.run(0)
    check("tool: empty/truncated files marked unusable", select(2, string.gsub(screen(), "unusable", "")) == 2, screen())
    tool.run(EVT_VIRTUAL_PREV); tool.run(EVT_VIRTUAL_ENTER); tool.run(0); tool.run(0)
    check("tool: nothing written without usable file", get(target(fx, "a")) == nil and string.find(screen(), "No usable old configuration", 1, true) ~= nil, screen())
end

do -- NG not installed
    card(FIX[0], false)
    tool.init(); tool.run(0); tool.run(0)
    check("tool: NG missing is reported", string.find(screen(), "not installed", 1, true) ~= nil, screen())
    check("tool: EXIT ends the tool", tool.run(EVT_VIRTUAL_EXIT) == 1)
end

do -- older NG version keeps configurations next to the code
    card(FIX[0])
    put(NG .. "app.lua", "-- old layout")
    runTool({EVT_VIRTUAL_PREV, EVT_VIRTUAL_ENTER})
    check("tool: older NG layout writes next to the code", get(NG .. "model_" .. hex("model01.yml") .. ".a.lua") ~= nil, screen())
end

do -- German texts on a German radio
    card(FIX[0])
    getGeneralSettings = function() return {language = "DE"} end
    tool.init(); tool.run(0); tool.run(0)
    check("tool: German UI", string.find(screen(), "Umwandeln und speichern", 1, true) ~= nil, screen())
    tool.run(EVT_VIRTUAL_PREV); tool.run(EVT_VIRTUAL_ENTER)
    for _ = 1, 30 do tool.run(0) end
    local text = get(target(FIX[0], "a")) or ""
    check("tool: German button texts Links/Rechts", string.find(text, 'leftText="Links"', 1, true) ~= nil, text)
    getGeneralSettings = function() return {language = "EN"} end
end

global.LUA_RESULTS = table.concat(results, "\n")
