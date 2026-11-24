-- Test driver for edgetx/SCRIPTS/TOOLS/msw2ng.lua, run with fengari in test/edgetx/run.html.
-- Mocks the EdgeTX file and screen API on an in-memory SD card and enforces a per-call
-- instruction budget like EdgeTX's CPU limit for scripts.
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
local function resetCard() FILES, DIRS = {}, {} end
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
    local names = {}
    for k, f in pairs(FILES) do if parentOf(k) == key then names[#names + 1] = string.match(f.path, "[^/]+$") end end
    for k, d in pairs(DIRS) do if parentOf(k) == key then names[#names + 1] = string.match(d, "[^/]+$") end end
    local i = 0
    return function() i = i + 1; return names[i] end
end
function fstat(path)
    local k = norm(path)
    if DIRS[k] then return {attrib = 0x10, size = 0} end
    if FILES[k] then return {attrib = 0x20, size = #FILES[k].data} end
end
function mkdir(path) DIRS[norm(path)] = path; return 0 end
INFO = {name = "Düsseldorf", filename = "model01.yml"}
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
EVT_VIRTUAL_ENTER, EVT_VIRTUAL_EXIT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_PREV = 101, 102, 103, 104
EVT_TOUCH_TAP, EVT_VIRTUAL_ENTER_LONG, EVT_VIRTUAL_NEXT_PAGE = 105, 106, 107
function getGeneralSettings() return {language = "EN"} end
-- switch indices as the old widget stored them in external_switch
function getSwitchName(i)
    if i >= 169 and i <= 176 then return string.format("L%02d", i - 168) end
    if i >= 200 and i <= 231 then return string.format("L%02d", i - 190) end
    if i >= 232 and i <= 263 then return string.format("VS%d", i - 231) end
    return nil
end
collectgarbage = function() return 0 end -- not implemented in fengari
local function screen() return table.concat(SCREEN, "\n") end
local function has(s) return string.find(screen(), s, 1, true) ~= nil end

------------------------------------------------------------ load script ---
local tool = load(src("tool"), "@msw2ng.lua", "t")()
local C = tool.core
local NGCONFIG, NGSTORAGE = src("ngconfig"), src("ngstorage")
local NGLOCAL = string.find(NGCONFIG, "localSwitch", 1, true) ~= nil
results[#results + 1] = "info NG version under test: " .. (NGLOCAL and "with local switches" or "without local switches")

-- EdgeTX stops a script call after a fixed number of VM instructions. The mocks above run as
-- Lua here (C on the radio), so this budget is stricter than the radio's.
local BUDGET = 15000
local overBudget = nil
local PEAK = {}
local function call(event, touch)
    local n = 0
    debug.sethook(function() n = n + 100 end, "", 100)
    local ok, r = pcall(tool.run, event, touch)
    debug.sethook()
    local st = tool.state()
    local where = st and (st.phase .. "/" .. tostring(st.scan and st.scan.phase) .. "/" .. tostring(st.w and st.w.phase)) or "?"
    if n > (PEAK[where] or 0) then PEAK[where] = n end
    if n > BUDGET and not overBudget then overBudget = where .. " used " .. n end
    if not ok then error(r) end
    return r
end
do
    local fired = false
    debug.sethook(function() fired = true; debug.sethook() end, "", 1000)
    local x = 0
    for i = 1, 5000 do x = x + i end
    debug.sethook()
    check("budget hook works in this Lua", fired)
end

----------------------------------------------------------- unit tests ---
do
    local t = 'return {\n-- Table: {1}\n{\n ["name"]="a\\"b\\\\c\\10d",\n ["list"]={2},\n ["f"]=51.0,\n ["neg"]=-5,\n ["b"]=true,\n},\n-- Table: {2}\n{\n {3},\n},\n-- Table: {3}\n{ ["x"]=1, },\n}\n--end\n'
    local r, err = C.parseOldConfig(t)
    check("parser: escapes, refs, trailer", r and r.name == 'a"b\\c\nd' and r.f == 51 and r.neg == -5 and r.b == true and r.list[1].x == 1 and C.isList(r.list), err)
    MARK = nil
    for _, bad in ipairs({
        'return { os.execute("x") }', 'return { {1}, ["a"]=f() }', 'x = 1', 'return { {1} } os.exit()',
        'return {{ ["a"]={9} }}', 'return {{ ["a"]=(function() MARK=1 end)() }}',
        "return {{ '\"', (\"x\"):rep(3), '\"' }}", 'return {{ [[ " ]], ("x"):rep(3), [[ " ]] }}',
        'return {{ --[[ x ]] ("x"):rep(3) }}', 'return {{ ["a"]=#"x" }}', 'return {{ ["a"]=2^3 }}',
        'return {{ ["a"]=1 }} while true do end',
    }) do
        local res = C.parseOldConfig(bad)
        check("parser rejects: " .. bad, res == nil)
    end
    check("parser never executes code", MARK == nil)
    local _, e1 = C.parseOldConfig("")
    local _, e2 = C.parseOldConfig('return {\n{\n ["a"]={2},\n},\n{\n ["b"]="x')
    check("parser: empty and truncated", e1 == "empty" and e2 == "truncated", tostring(e1) .. "," .. tostring(e2))
    local r3 = C.parseOldConfig('return {{ ["a"]={2} },{ ["b"]={1} }}')
    check("parser: circular references do not hang", r3 == nil or type(r3) == "table")
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
    local r, err = C.convert(insts, {lang = "en"})
    if not r then return "ERROR " .. tostring(err) end
    return C.toHex(C.ngFileText(r.config, 1)) .. "|" .. #r.warnings .. "|" .. #r.skipped .. "|" .. #widgets
end

local LUA_CORE = {}
local FIX, X = global.FIX, global.FIX_EXTRA
for i = 0, FIX.length - 1 do
    local ok, res = pcall(coreRun, FIX[i])
    LUA_CORE[#LUA_CORE + 1] = ok and res or ("ERROR " .. tostring(res))
end
global.LUA_CORE = table.concat(LUA_CORE, "\n")
check("model name read from YAML", C.modelNameOf(C.parseYaml(FIX[0].yaml)) == "Düsseldorf")

-------------------------------------------------- tool end-to-end tests ---
local NG = "/WIDGETS/lvglMultiSwNG/"
local OLD = "/WIDGETS/lvglMultiSw/"
local function hex(s) return C.toHex(s) end
local function target(file, slot) return NG .. "models/model_" .. hex(file) .. "." .. slot .. ".lua" end

-- SD card with several models; old files sorted case-insensitively:
-- 2 Anna_0, 3 BO105_0, 4 Big_0, 5 Düsseldorf_0, 6 Düsseldorf_1, 7 KARL_4, 8 MODELL02_0, 9 Modell08 elrs_0
local ROW = {all = 1, anna = 2, bo105 = 3, big = 4, d0 = 5, d1 = 6, karl = 7, m02 = 8, elrs = 9, convert = 10}
local function card(withNg)
    resetCard()
    local fx1, fx5 = FIX[0], FIX[4]
    put("/MODELS/model01.yml", fx1.yaml)
    put("/MODELS/model02.yml", fx5.yaml)
    put("/MODELS/model03.yml", X.annaYaml)
    put("/MODELS/model04.yml", X.elrsYaml)
    put("/MODELS/model05.yml", X.bigYaml)
    put("/MODELS/models.yml", X.labelsYaml)
    put(OLD .. "Düsseldorf_0.lua", fx1.files["Düsseldorf_0.lua"])
    put(OLD .. "Düsseldorf_1.lua", fx1.files["Düsseldorf_1.lua"])
    put(OLD .. "KARL_4.lua", fx5.files["KARL_4.lua"])
    put(OLD .. "Anna_0.lua", X.annaFile)
    put(OLD .. "Big_0.lua", X.bigFile)
    put(OLD .. "Modell08 elrs_0.lua", X.renamedFile)
    put(OLD .. "BO105_0.lua", X.empty)
    put(OLD .. "MODELL02_0.lua", X.truncated)
    put(OLD .. "main.lua", "-- old widget")
    if withNg ~= false then
        put(NG .. "main.lua", "-- ng")
        put(NG .. "app.lua", "app.modelsDir = app.dir .. \"models/\"")
        put(NG .. "config.lua", NGCONFIG)
        put(NG .. "storage.lua", NGSTORAGE)
    end
end

local function start()
    tool.init()
    for _ = 1, 400 do
        call(0)
        if has("check = convert") or has("Haken = umwandeln") or has("not installed") or has("nicht installiert") then return end
    end
end
local function press(...) for _, e in ipairs({...}) do call(e) end end
local function goRow(n, current) -- move the list selection from `current` to row n
    for _ = 1, n - current do call(EVT_VIRTUAL_NEXT) end
    for _ = 1, current - n do call(EVT_VIRTUAL_PREV) end
end
local function finish()
    for _ = 1, 600 do
        call(0)
        if not has("Converting") and not has("Wandle") and (has("saved") or has("FAILED") or has("gespeichert") or has("FEHLER")) then break end
    end
end
local function reportText()
    local seen = screen()
    for _ = 1, 80 do call(EVT_VIRTUAL_NEXT); seen = seen .. "\n" .. screen() end
    return seen
end
local function count(s, pat) return select(2, string.gsub(s, pat, "")) end

do -- list of all old configurations with their models
    card()
    start()
    check("list: assigned files show their model", has("Düsseldorf_0.lua  -> Düsseldorf (model01.yml)") and has("KARL_4.lua  -> KARL (model02.yml)"), screen())
    check("list: renamed model is unassigned", has("Modell08 elrs_0.lua  -> ? (no model)"), screen())
    check("list: empty and truncated files are unusable", has("BO105_0.lua  unusable (empty)") and has("MODELL02_0.lua  unusable (truncated)"), screen())
    check("list: nothing is checked at the start", has("Convert checked: 0 file(s) -> 0 model(s)"), screen())
    press(EVT_VIRTUAL_ENTER) -- check all assigned
    check("list: check all assigned", has("Convert checked: 5 file(s) -> 4 model(s)"), screen())
    goRow(ROW.anna, 1); press(EVT_VIRTUAL_ENTER) -- uncheck Anna
    goRow(ROW.convert, ROW.anna); press(EVT_VIRTUAL_ENTER)
    finish()
    local d = get(target("model01.yml", "a"))
    local plain = d and string.gsub(d, ",localSwitch=%d+", "")
    check("convert: Düsseldorf identical to the browser tool" .. (NGLOCAL and " (apart from local switches)" or ""), plain and hex(plain) == string.match(LUA_CORE[1], "^(%x+)|"), d)
    if NGLOCAL then
        check("local switches: L01..L07 assigned, slider left out", d and count(d, "localSwitch=") == 7 and string.find(d, "localSwitch=7,", 1, true) ~= nil and not string.find(d, "localSwitch=8,", 1, true), d)
    else
        check("older NG: no local switch fields written", d and not string.find(d, "localSwitch", 1, true), d)
    end
    local k = get(target("model02.yml", "a"))
    check("convert: KARL identical to the browser tool", k and hex(k) == string.match(LUA_CORE[5], "^(%x+)|"), k)
    local b = get(target("model05.yml", "a")) or ""
    check("convert: 64-button configuration", count(b, 'kind="control"') == 64, b)
    if NGLOCAL then
        check("local switches: VS targets activate virtual switches in the header", count(b, "localSwitch=") == 22
            and string.find(b, "virtualSwitches=\"" .. string.rep("010", 10) .. "01" .. string.rep("0", 32) .. "\"", 1, true) ~= nil, b)
    end
    check("convert: unchecked Anna not written", get(target("model03.yml", "a")) == nil)
    local rep = reportText()
    local okCount = 0
    for _, r in ipairs(tool.state().reports) do if r.check == "ok" then okCount = okCount + 1 end end
    check("convert: NG loader check OK for all models", okCount == 3 and #tool.state().reports == 3, rep)
    check("report: switches and skipped buttons", string.find(rep, NGLOCAL and "Set switch" or "external_switch", 1, true) and string.find(rep, "already used by", 1, true), rep)
    check("old files and model files unchanged", get(OLD .. "Düsseldorf_0.lua") == FIX[0].files["Düsseldorf_0.lua"] and get("/MODELS/model01.yml") == FIX[0].yaml)
    check("EXIT ends the tool", call(EVT_VIRTUAL_EXIT) == 1)
end

do -- assign a renamed model's file by hand
    card()
    start()
    goRow(ROW.elrs, 1); press(EVT_VIRTUAL_ENTER) -- unassigned: opens the settings page
    check("detail: opens for unassigned file", has("Settings: Modell08 elrs_0.lua") and has("Choose a target model first."), screen())
    -- models sorted by file: model01 Düsseldorf, model02 KARL, model03 Anna, model04 ELRS, model05 Big
    press(EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER)
    check("detail: target model chosen", has("Target model: ELRS (model04.yml)") and has("Source: widget options of the model"), screen())
    press(EVT_VIRTUAL_PREV, EVT_VIRTUAL_ENTER, EVT_VIRTUAL_EXIT)
    check("detail: file checked for ELRS", has("[x] Modell08 elrs_0.lua  -> ELRS (model04.yml)"), screen())
    goRow(ROW.convert, ROW.elrs); press(EVT_VIRTUAL_ENTER)
    finish()
    local e = get(target("model04.yml", "a")) or ""
    check("convert: ELRS written with interval from its widget options", string.find(e, "ELRS Licht", 1, true) and string.find(e, "interval=60", 1, true), e)
end

do -- change old -> new settings: tab address and protocol
    card()
    start()
    goRow(ROW.d0, 1); press(EVT_VIRTUAL_ENTER_LONG)
    check("detail: opens with ENTER long", has("Settings: Düsseldorf_0.lua") and has("For all tabs of Düsseldorf:"), screen())
    -- fields: 1 convert, 2 target, 3 tab address, 4 old address, 5 for all tabs, 6 protocol, ...
    press(EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER) -- tab address
    for _ = 1, 5 do call(EVT_VIRTUAL_NEXT) end
    press(EVT_VIRTUAL_ENTER)
    press(EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_NEXT, EVT_VIRTUAL_ENTER)
    check("detail: protocol and tab address changed", has("Protocol: S.Port ACW 1.5") and has("NG tab address: 5"), screen())
    for _ = 1, 5 do call(EVT_VIRTUAL_PREV) end
    press(EVT_VIRTUAL_ENTER, EVT_VIRTUAL_EXIT) -- check it, back to list
    goRow(ROW.d1, ROW.d0); press(EVT_VIRTUAL_ENTER)
    goRow(ROW.convert, ROW.d1); press(EVT_VIRTUAL_ENTER)
    finish()
    local d = get(target("model01.yml", "a")) or ""
    local firstTab = string.match(d, '{address=(%d+),columns=%d+,height=0,id=1,kind="tab"')
    check("convert: chosen protocol in the header", string.find(d, "protocol=2", 1, true) ~= nil, d)
    check("convert: tabs ordered by the new tab address", firstTab == "1" and string.find(d, '{address=5,columns=2,height=0,id=2,kind="tab"', 1, true) ~= nil, d)
    local rep = reportText()
    check("convert: ACW skips 3Pos and sliders, NG check OK", string.find(rep, "not supported by S.Port ACW", 1, true) and string.find(rep, "NG check OK", 1, true), rep)
end

do -- replace an existing NG configuration only after confirmation
    card()
    start()
    goRow(ROW.d0, 1); press(EVT_VIRTUAL_ENTER); goRow(ROW.convert, ROW.d0); press(EVT_VIRTUAL_ENTER)
    finish()
    local first = get(target("model01.yml", "a"))
    start()
    goRow(ROW.d0, 1); press(EVT_VIRTUAL_ENTER); goRow(ROW.convert, ROW.d0); press(EVT_VIRTUAL_ENTER)
    call(0)
    check("confirm: asks before replacing", has("already have an NG configuration") and has("Düsseldorf (model01.yml, generation 1)"), screen())
    check("confirm: nothing written before ENTER", get(target("model01.yml", "b")) == nil)
    press(EVT_VIRTUAL_EXIT)
    check("confirm: EXIT goes back to the list", has("check = convert"), screen())
    goRow(ROW.convert, ROW.convert); press(EVT_VIRTUAL_ENTER, EVT_VIRTUAL_ENTER)
    finish()
    local b = get(target("model01.yml", "b")) or ""
    check("confirm: slot b with generation 2, slot a kept", string.find(b, "generation=2", 1, true) ~= nil and get(target("model01.yml", "a")) == first, b)
    check("confirm: NG check OK", string.find(reportText(), "NG check OK", 1, true) ~= nil)
end

do -- NG not installed
    card(false)
    start()
    check("NG missing is reported", has("not installed"), screen())
    check("EXIT ends the tool on the message", call(EVT_VIRTUAL_EXIT) == 1)
end

do -- older NG version keeps configurations next to the code
    card()
    put(NG .. "app.lua", "-- old layout")
    start()
    goRow(ROW.karl, 1); press(EVT_VIRTUAL_ENTER); goRow(ROW.convert, ROW.karl); press(EVT_VIRTUAL_ENTER)
    finish()
    check("older NG layout: written next to the code", get(NG .. "model_" .. hex("model02.yml") .. ".a.lua") ~= nil, screen())
end

do -- German radio
    card()
    getGeneralSettings = function() return {language = "DE"} end
    start()
    check("German UI", has("Alte Konfigurationen (Haken = umwandeln)"), screen())
    goRow(ROW.karl, 1); press(EVT_VIRTUAL_ENTER); goRow(ROW.convert, ROW.karl); press(EVT_VIRTUAL_ENTER)
    finish()
    local k = get(target("model02.yml", "a")) or ""
    check("German button texts Links/Rechts", string.find(k, 'leftText="Links"', 1, true) ~= nil, k)
    getGeneralSettings = function() return {language = "EN"} end
end

check("every call stayed within " .. BUDGET .. " instructions", overBudget == nil, overBudget)
local peaks = {}
for k, v in pairs(PEAK) do peaks[#peaks + 1] = k .. "=" .. v end
table.sort(peaks)
results[#results + 1] = "info peak instructions per call: " .. table.concat(peaks, ", ")
global.LUA_RESULTS = table.concat(results, "\n")
