-- TNS|MultiSw -> NG|TNE
-- SPDX-License-Identifier: GPL-3.0-or-later
--
-- lvglMultiSw -> lvglMultiSwNG configuration converter, EdgeTX tool script.
-- https://github.com/mnorden81/lvglmultisw-to-ng
--
-- Converts the old "MultiSwE/L" widgets of the CURRENTLY LOADED model into one
-- lvglMultiSwNG configuration (one NG tab per old widget address).
--
-- * The old configuration files are parsed, never executed.
-- * Old files and the model file are never modified.
-- * An existing NG configuration is only replaced after confirmation. The new
--   file goes into the other of NG's two slots with a higher generation, so the
--   previous configuration stays on the card as fallback.
--
-- Same conversion rules as the browser tool (src/core.js).

local OLD_DIR = "/WIDGETS/lvglMultiSw/"
local NG_DIR = "/WIDGETS/lvglMultiSwNG/"
local OLD_WIDGET = "MultiSwE/L"
local NG_WIDGET = "MultiSw NG"
local OPTION_DEFS = {
    {"CRSF", 1}, {"Address", 0}, {"Intervall", 100}, {"ShmEncoding", 0}, {"ShmVarStart", 1},
    {"ShmSync", 0}, {"SPort", 0}, {"SPortPhy", 0}, {"SPortApp", 0x51}, {"SPortProto", 1},
}

----------------------------------------------------------------- helpers ---
local NIL = {}            -- stands for a literal nil inside parsed lists
local LIST = setmetatable({}, {__mode = "k"}) -- tables that were pure lists in the old file

local function isList(v) return type(v) == "table" and LIST[v] == true end

local function trunc(v)
    local r = v >= 0 and math.floor(v) or math.ceil(v)
    return math.tointeger and math.tointeger(r) or r
end

local function int(v, def)
    if type(v) == "boolean" then return v and 1 or 0 end
    if type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge then return trunc(v) end
    return def
end

local function clamp(v, lo, hi)
    if v < lo then return lo elseif v > hi then return hi end
    return v
end

local function isInt(v) return type(v) == "number" and v == v and v % 1 == 0 end

local function fmtNum(v)
    if math.type and math.type(v) == "integer" then return string.format("%d", v) end
    return string.format("%.0f", v)
end

local function str(v)
    if type(v) == "string" then return v end
    if v == nil or v == NIL then return "" end
    if type(v) == "number" and isInt(v) then return fmtNum(v) end
    return tostring(v)
end

local function cutBytes(s, max)
    if #s <= max then return s end
    local n = max
    -- do not split a UTF-8 sequence: back off while the byte after the cut is a continuation byte
    while n > 0 and (string.byte(s, n + 1) or 0) >= 0x80 and (string.byte(s, n + 1) or 0) < 0xC0 do n = n - 1 end
    return string.sub(s, 1, n)
end

local function cleanString(v, max, fallback)
    local s = str(v)
    s = string.gsub(s, "[%z\1-\31\127]", " ")
    s = cutBytes(s, max)
    if s == "" and fallback ~= nil then return fallback end
    return s
end

local function toHex(s)
    return (string.gsub(s, ".", function(c) return string.format("%02x", string.byte(c)) end))
end

local function truthy(v) return v ~= nil and v ~= NIL and v ~= false and v ~= 0 and v ~= "" end

----------------------------------------------------- old config (tableser) ---
-- The old widget stores `return { {table1}, {table2}, ... }` where a value {n}
-- refers to table n. We only accept that literal subset and never run the file.
local function parseOldConfig(text)
    if not string.find(text, "%S") then return nil, "empty" end
    local pos, len = 1, #text
    local function fail(msg) error({msg}, 0) end
    local function skip()
        while true do
            pos = string.find(text, "[^%s]", pos) or (len + 1)
            if string.sub(text, pos, pos + 1) == "--" then
                pos = string.find(text, "\n", pos, true) or (len + 1)
            else break end
        end
    end
    local function ch() return string.sub(text, pos, pos) end

    local function parseString()
        local q = ch()
        pos = pos + 1
        local parts = {}
        local pattern = q == '"' and '[\\"]' or "[\\']"
        while true do
            local s = string.find(text, pattern, pos)
            if not s then fail("truncated") end
            parts[#parts + 1] = string.sub(text, pos, s - 1)
            local c = string.sub(text, s, s)
            pos = s + 1
            if c == q then return table.concat(parts) end
            if pos > len then fail("truncated") end
            local e = ch()
            pos = pos + 1
            if e == "n" or e == "\n" then parts[#parts + 1] = "\n"
            elseif e == "r" then parts[#parts + 1] = "\r"
            elseif e == "t" then parts[#parts + 1] = "\t"
            elseif string.find(e, "^%d") then
                local d = e
                while #d < 3 and string.find(string.sub(text, pos, pos), "^%d") do
                    d = d .. string.sub(text, pos, pos)
                    pos = pos + 1
                end
                parts[#parts + 1] = string.char(tonumber(d) % 256)
            else parts[#parts + 1] = e end
        end
    end

    local parseTable
    local function parseValue(depth)
        skip()
        if pos > len then fail("truncated") end
        local c = ch()
        if c == "{" then return parseTable(depth + 1) end
        if c == '"' or c == "'" then return parseString() end
        for _, w in ipairs({"true", "false", "nil"}) do
            if string.sub(text, pos, pos + #w - 1) == w
                and not string.find(string.sub(text, pos + #w, pos + #w), "^[%w_]") then
                pos = pos + #w
                if w == "true" then return true elseif w == "false" then return false end
                return NIL
            end
        end
        local n = string.match(text, "^[-+]?0[xX]%x+", pos)
            or string.match(text, "^[-+]?%d+%.?%d*[eE][-+]?%d+", pos)
            or string.match(text, "^[-+]?%d+%.?%d*", pos)
            or string.match(text, "^[-+]?%.%d+[eE][-+]?%d+", pos)
            or string.match(text, "^[-+]?%.%d+", pos)
        if n then
            local v = tonumber(n) or tonumber((string.gsub(n, "^%+", "")))
            if v == nil then fail("bad number at offset " .. (pos - 1)) end
            pos = pos + #n
            return v
        end
        fail("unexpected character at offset " .. (pos - 1))
    end

    parseTable = function(depth)
        if depth > 8 then fail("nesting too deep") end
        pos = pos + 1 -- {
        local t = {arr = {}, n = 0, hash = {}, hasHash = false, raw = true}
        while true do
            skip()
            if pos > len then fail("truncated") end
            if ch() == "}" then
                pos = pos + 1
                return t
            end
            if ch() == "[" then
                pos = pos + 1
                local k = parseValue(depth)
                skip()
                if ch() ~= "]" then fail("expected ]") end
                pos = pos + 1
                skip()
                if ch() ~= "=" then fail("expected =") end
                pos = pos + 1
                local v = parseValue(depth)
                if type(k) == "table" then fail("table keys are not supported") end
                if type(k) == "number" then k = str(k) end -- like JS object keys
                if type(k) == "boolean" then k = tostring(k) end
                t.hash[k], t.hasHash = v, true
            else
                local s, e, name = string.find(text, "^([%a_][%w_]*)%s*=", pos)
                if s and name ~= "true" and name ~= "false" and name ~= "nil" then
                    pos = e + 1
                    t.hash[name], t.hasHash = parseValue(depth), true
                else
                    t.n = t.n + 1
                    t.arr[t.n] = parseValue(depth)
                end
            end
            skip()
            if ch() == "," or ch() == ";" then pos = pos + 1
            elseif ch() ~= "}" then
                if pos > len then fail("truncated") end
                fail("expected , or } at offset " .. (pos - 1))
            end
        end
    end

    local ok, result = pcall(function()
        skip()
        if string.sub(text, pos, pos + 5) ~= "return" then fail("not a configuration file (no 'return')") end
        pos = pos + 6
        skip()
        if ch() ~= "{" then fail("expected {") end
        local root = parseTable(0)
        skip()
        if pos <= len then fail("data after end of file") end
        local tables = root.arr
        if root.n == 0 then fail("no tables") end
        local function isRef(v)
            return type(v) == "table" and v.raw and v.n == 1 and type(v.arr[1]) == "number" and not v.hasHash
        end
        local resolving, cache = {}, {}
        local resolve
        resolve = function(idx)
            if cache[idx] then return cache[idx] end
            local raw = tables[idx]
            if type(raw) ~= "table" or not raw.raw then fail("invalid reference " .. str(idx)) end
            if resolving[idx] then fail("circular reference") end
            resolving[idx] = true
            local function conv(v)
                if type(v) == "table" and v.raw then
                    if not isRef(v) then fail("invalid value reference in table " .. str(idx)) end
                    local target = v.arr[1]
                    if not isInt(target) or target < 1 or target > root.n then fail("reference out of range") end
                    return resolve(trunc(target))
                end
                if v == NIL then return nil end
                return v
            end
            local out = {}
            if not raw.hasHash then
                for i = 1, raw.n do out[i] = conv(raw.arr[i]) end
                LIST[out] = true
            else
                for i = 1, raw.n do conv(raw.arr[i]) end -- references must still be valid
                for k, v in pairs(raw.hash) do out[k] = conv(v) end
            end
            resolving[idx] = nil
            cache[idx] = out
            return out
        end
        local top = resolve(1)
        if isList(top) then fail("unexpected top-level layout") end
        return top
    end)
    if ok then return result end
    if type(result) == "table" then return nil, result[1] end
    return nil, tostring(result)
end

---------------------------------------------------------- model YAML ---
local function unquote(v)
    v = string.match(v, "^%s*(.-)%s*$")
    local q = string.sub(v, 1, 1)
    if (q == '"' or q == "'") and #v >= 2 and string.sub(v, -1) == q then
        local body = string.sub(v, 2, -2)
        if q == "'" then return (string.gsub(body, "''", "'")) end
        local parts, i = {}, 1
        while i <= #body do
            local c = string.sub(body, i, i)
            if c == "\\" and i < #body then
                local hex = string.match(body, "^x(%x%x)", i + 1)
                if hex then
                    parts[#parts + 1], i = string.char(tonumber(hex, 16)), i + 4
                else
                    parts[#parts + 1], i = string.sub(body, i + 1, i + 1), i + 2
                end
            else
                parts[#parts + 1], i = c, i + 1
            end
        end
        return table.concat(parts)
    end
    return (string.gsub(v, "%s+#.*$", ""))
end

-- EdgeTX model files use nested "key: value" maps with numeric keys. Only the
-- screenData subtree is kept, to save memory on the radio.
local function parseYaml(text)
    local root = {}
    local stack = {{indent = -1, obj = root}}
    for raw in string.gmatch(text, "[^\r\n]+") do
        if string.find(raw, "%S") and not string.find(raw, "^%s*#") and not string.find(raw, "^%s*%-%s") then
            local spaces, rest = string.match(raw, "^( *)(.*)$")
            -- key = text up to the first ':' that is followed by whitespace or the end of the line
            local key, value
            local from = 2
            while true do
                local c = string.find(rest, ":", from, true)
                if not c then break end
                local after = string.sub(rest, c + 1)
                if after == "" or string.find(after, "^%s") then
                    key = string.sub(rest, 1, c - 1)
                    value = string.match(after, "^%s*(.-)%s*$")
                    break
                end
                from = c + 1
            end
            if key then
                local indent = #spaces
                while #stack > 1 and stack[#stack].indent >= indent do table.remove(stack) end
                local parent = stack[#stack].obj
                key = string.match(key, "^%s*(.-)%s*$")
                key = string.gsub(string.gsub(key, "^[\"']", ""), "[\"']$", "")
                if value == "" then
                    local child = nil
                    if parent and (parent ~= root or key == "screenData") then
                        child = {}
                        parent[key] = child
                    end
                    stack[#stack + 1] = {indent = indent, obj = child}
                elseif parent and parent ~= root then
                    parent[key] = unquote(value)
                end
            end
        end
    end
    return root
end

local function sortedKeys(obj)
    local keys = {}
    for k in pairs(obj or {}) do
        if type(k) == "string" and string.find(k, "^%d+$") then keys[#keys + 1] = k end
    end
    table.sort(keys, function(a, b) return tonumber(a) < tonumber(b) end)
    return keys
end

local function optionValue(entry)
    if type(entry) ~= "table" then return nil end
    local v = type(entry.value) == "table" and entry.value or {}
    for _, k in ipairs({"boolValue", "signedValue", "unsignedValue"}) do
        if v[k] ~= nil then return tonumber(v[k]) end
    end
    return nil
end

local function findWidgets(yaml)
    local found = {}
    local screens = yaml.screenData or {}
    for _, s in ipairs(sortedKeys(screens)) do
        local layout = type(screens[s]) == "table" and screens[s].layoutData or nil
        local zones = type(layout) == "table" and type(layout.zones) == "table" and layout.zones or {}
        for _, z in ipairs(sortedKeys(zones)) do
            local zone = type(zones[z]) == "table" and zones[z] or {}
            local name = zone.widgetName
            if name == OLD_WIDGET or name == NG_WIDGET then
                local entry = {kind = name == OLD_WIDGET and "old" or "ng", screen = tonumber(s) + 1, zone = tonumber(z) + 1}
                if entry.kind == "old" then
                    local data = type(zone.widgetData) == "table" and zone.widgetData or {}
                    local opts = type(data.options) == "table" and data.options or {}
                    entry.options = {}
                    for i, def in ipairs(OPTION_DEFS) do
                        local v = optionValue(opts[tostring(i - 1)])
                        if v == nil then v = def[2] end
                        entry.options[def[1]] = v
                    end
                end
                found[#found + 1] = entry
            end
        end
    end
    return found
end

------------------------------------------------------------ NG schema ---
local SCHEMAS = {
    config = {
        version = {1, 1}, generation = {0, 2147483647}, name = 32,
        destination = {0, 255}, interval = {5, 1000}, sendColors = {0, 1}, autoSave = {0, 1},
        buttonSpacing = {-1, 40}, protocol = {0, 3}, sportPhysicalId = {0, 0x1b}, sportAppId = {0, 255},
    },
    tab = {id = {1, 2147483647}, name = 32, address = {0, 255}, columns = {1, 4}, height = {0, 240}},
    control = {
        id = {1, 2147483647}, tab = {1, 2147483647}, name = 32, leftText = 32, rightText = 32,
        type = {1, 5}, address = {-1, 255}, output = {1, 8},
        color = {-2147483648, 4294967295}, textColor = {-2147483648, 4294967295}, font = {0, 65535},
        visible = {0, 1}, switch = {-2147483648, 2147483647}, switch2 = {-2147483648, 2147483647},
        source = {-2147483648, 2147483647}, activation = {-2147483648, 2147483647}, group = {0, 255},
        image = 128, sportType = {0, 255}, sportOptions = {0, 255}, sportPwmOn = {0, 255},
    },
}

local function validateRecord(rec)
    local schema = SCHEMAS[rec.kind]
    if not schema then return "unknown record" end
    for k, rule in pairs(schema) do
        local v = rec[k]
        if type(rule) == "number" then
            if type(v) ~= "string" or #v > rule or string.find(v, "[%z\1-\31]") then return "invalid " .. rec.kind .. "." .. k end
        elseif not (isInt(v) and v >= rule[1] and v <= rule[2]) then
            return "invalid " .. rec.kind .. "." .. k
        end
    end
    for k in pairs(rec) do
        if k ~= "kind" and schema[k] == nil then return "unknown property " .. k end
    end
    return nil
end

------------------------------------------------------------- convert ---
-- instances: list of {address, options, settings, tabName, label} in tab order.
local function convert(instances, lang)
    local leftText = lang == "de" and "Links" or "Left"
    local rightText = lang == "de" and "Rechts" or "Right"
    local warnings, skipped = {}, {}
    local stats = {controls = 0, skipped = 0}
    local function warn(level, text) warnings[#warnings + 1] = {level = level, text = text} end
    local function skip(label, reason)
        skipped[#skipped + 1] = {label = label, reason = reason}
        stats.skipped = stats.skipped + 1
    end
    if #instances == 0 then return nil, "no widgets selected" end

    local first = instances[1]
    local o0 = first.options
    local function protoOf(o)
        if truthy(o.CRSF) then return 0 end
        if truthy(o.SPort) then return clamp(int(o.SPortProto, 1), 1, 3) end
        return 0
    end
    local protocol = protoOf(o0)
    if not truthy(o0.CRSF) and not truthy(o0.SPort) then
        warn("warn", "CRSF and S.Port were both switched off in the old widget options, so it sent nothing itself (maybe SHM/mixer script or a plain UI). NG always sends; CRSF was chosen. Check the transport before use.")
    end
    if truthy(o0.CRSF) and truthy(o0.SPort) then
        warn("warn", "The old widget sent CRSF and S.Port at the same time; NG supports one protocol per model, CRSF was chosen.")
    end
    for i = 2, #instances do
        local inst, o = instances[i], instances[i].options
        if protoOf(o) ~= protocol or (protocol > 0 and (o.SPortPhy ~= o0.SPortPhy or o.SPortApp ~= o0.SPortApp)) then
            warn("warn", inst.label .. ": other transport settings than the first widget; NG uses one protocol per model, the first widget's settings were kept.")
        end
        if o.Intervall ~= o0.Intervall then
            warn("info", inst.label .. ": different send interval; the first widget's interval was kept.")
        end
    end
    local interval = clamp(int(o0.Intervall, 100), 5, 1000)

    local settings0 = first.settings or {}
    local destination = clamp(int(settings0.commandBroadcastAddress, 0), 0, 255)
    for i = 2, #instances do
        local st = instances[i].settings or {}
        if clamp(int(st.commandBroadcastAddress, 0), 0, 255) ~= destination then
            warn("warn", instances[i].label .. ": different CRSF destination; the first widget's value was kept.")
        end
    end
    local anyColors, allColors = false, true
    for _, inst in ipairs(instances) do
        local c = int((inst.settings or {}).activate_color_proto, 0)
        if c > 0 then anyColors = true end
        if c == 0 then allColors = false end
    end
    local sendColors = anyColors and 1 or 0
    if anyColors and not allColors then
        warn("info", "LED colors were enabled in only some widgets; NG has one setting for the whole model (enabled).")
    end

    local config = {
        header = {
            kind = "config", version = 1, generation = 0, name = "MultiSwitch NG",
            destination = destination, interval = interval, sendColors = sendColors, autoSave = 1,
            buttonSpacing = -1, protocol = protocol,
            sportPhysicalId = clamp(int(o0.SPortPhy, 0), 0, 0x1b),
            sportAppId = clamp(int(o0.SPortApp, 0x51), 0, 255),
        },
        tabs = {}, controls = {},
    }

    local usedEndpoints, nameCount = {}, {}
    local controlId = 0
    for ti, inst in ipairs(instances) do
        local st = inst.settings or {}
        local address = clamp(int(inst.address, 0), 0, 255)
        local name = cleanString(inst.tabName, 32, cleanString(st.name, 32, "Tab " .. ti))
        nameCount[name] = (nameCount[name] or 0) + 1
        if nameCount[name] > 1 then name = cutBytes(name, 28) .. " " .. fmtNum(address) end
        local columns = int(st.columns, 2)
        if columns < 1 or columns > 4 then
            warn("warn", inst.label .. ": " .. fmtNum(columns) .. " columns are not possible in NG (1..4); " .. fmtNum(clamp(columns, 1, 4)) .. " used.")
            columns = clamp(columns, 1, 4)
        end
        local tab = {kind = "tab", id = ti, name = name, address = address, columns = columns, height = 0}
        config.tabs[#config.tabs + 1] = tab

        local buttons = isList(st.buttons) and st.buttons or {}
        local count = isList(st.buttons) and #st.buttons or 0
        -- #list may stop at a hole; find the real length
        if isList(st.buttons) then for k in pairs(st.buttons) do if type(k) == "number" and k > count then count = k end end end
        local extSwitch, virtInput = {}, {}
        if count == 0 then warn("warn", inst.label .. ": the old configuration contains no buttons.") end
        for bi = 1, count do
            local b = buttons[bi]
            local label = inst.label .. " / " .. ((type(b) == "table" and b.name ~= nil) and str(b.name) or ("Output " .. bi))
            if type(b) ~= "table" then
                skipped[#skipped + 1] = {label = label, reason = "invalid button record"}
            else
                local typ = int(b.type, 1)
                local output = int(b.output, ((bi - 1) % 8) + 1)
                local bAddr = int(b.address, address)
                local endpoint = bAddr * 8 + output
                if typ < 1 or typ > 5 then skip(label, "unknown control type " .. fmtNum(typ))
                elseif protocol == 1 and typ == 5 then skip(label, "sliders are not supported by S.Port WM")
                elseif protocol >= 2 and (typ == 3 or typ == 5) then skip(label, "3Pos controls and sliders are not supported by S.Port ACW")
                elseif output < 1 or output > 8 then skip(label, "output " .. fmtNum(output) .. " is outside 1..8")
                elseif bAddr < 0 or bAddr > 255 then skip(label, "address " .. fmtNum(bAddr) .. " is outside 0..255")
                elseif protocol >= 2 and endpoint > 255 then skip(label, "ACW switch number " .. fmtNum(endpoint) .. " exceeds 255")
                elseif usedEndpoints[endpoint] then
                    skip(label, "address/output " .. fmtNum(bAddr) .. "/" .. fmtNum(output) .. " is already used by " .. usedEndpoints[endpoint])
                else
                    usedEndpoints[endpoint] = label
                    local sp = type(b.sport) == "table" and b.sport or {}
                    controlId = controlId + 1
                    local rec = {
                        kind = "control", id = controlId, tab = tab.id,
                        name = cleanString(b.name, 32, "Output " .. fmtNum(output)),
                        leftText = leftText, rightText = rightText, type = typ,
                        address = bAddr == address and -1 or bAddr, output = output,
                        color = int(b.color, 327680), textColor = int(b.textColor, 131072),
                        font = clamp(int(b.font, 0), 0, 65535),
                        visible = int(b.visible, 1) ~= 0 and 1 or 0,
                        switch = int(b.switch, 0), switch2 = int(b.switch2, 0), source = int(b.source, 0),
                        activation = int(b.activation_switch, 0), group = clamp(int(b.exclusive_group, 0), 0, 255),
                        image = cleanString(b.image, 128, ""),
                        sportType = clamp(int(sp.type, 1), 0, 255), sportOptions = clamp(int(sp.options, 0), 0, 255),
                        sportPwmOn = clamp(int(sp.pwm_on, 255), 0, 255),
                    }
                    if type(b.name) == "string" and rec.name ~= b.name then
                        warn("info", label .. ": name was shortened or cleaned to fit NG limits.")
                    end
                    if int(b.setVirtualInput, 0) > 0 then virtInput[#virtInput + 1] = rec.name end
                    if int(b.external_switch, 0) ~= 0 then extSwitch[#extSwitch + 1] = rec.name end
                    config.controls[#config.controls + 1] = rec
                    stats.controls = stats.controls + 1
                end
            end
        end

        local function names3(a)
            local out = {}
            for i = 1, math.min(3, #a) do out[i] = a[i] end
            return table.concat(out, ", ") .. (#a > 3 and ", ..." or "")
        end
        if #extSwitch > 0 then
            warn("warn", inst.label .. ": " .. #extSwitch .. " button(s) set an EdgeTX logical/virtual switch ('external_switch': " .. names3(extSwitch) .. "). NG cannot do this yet, so mixes or sounds that depend on those switches will no longer be triggered.")
        end
        if #virtInput > 0 then
            warn("warn", inst.label .. ": " .. #virtInput .. " button(s) set a virtual input (" .. names3(virtInput) .. "). NG does not support this yet.")
        end
        local tele = 0
        if isList(st.telemActions) then
            for _, a in pairs(st.telemActions) do
                if type(a) == "table" and int(a.switch, 0) ~= 0 then tele = tele + 1 end
            end
        end
        if tele > 0 then warn("warn", inst.label .. ": " .. tele .. " telemetry action(s) are configured; NG does not support them yet (dropped).") end
        if int(st.activate_vswitches, 0) > 0 then warn("warn", inst.label .. ": virtual switches were activated; NG does not support them yet (dropped).") end
        if inst.options and truthy(inst.options.ShmEncoding) then warn("warn", inst.label .. ": SHM encoding was enabled; NG does not support it yet (dropped).") end
        if int(st.statusPassthru, 0) > 0 then warn("info", inst.label .. ": status passthrough is not supported by NG (dropped).") end
    end

    local recs = {config.header}
    for _, r in ipairs(config.tabs) do recs[#recs + 1] = r end
    for _, r in ipairs(config.controls) do recs[#recs + 1] = r end
    for _, r in ipairs(recs) do
        local e = validateRecord(r)
        if e then return nil, "internal: generated record invalid: " .. e end
    end
    return {config = config, warnings = warnings, skipped = skipped, stats = stats}
end

-------------------------------------------------------------- output ---
local function luaQuote(s)
    local out = {'"'}
    for i = 1, #s do
        local c = string.sub(s, i, i)
        local b = string.byte(c)
        if c == '"' then out[#out + 1] = '\\"'
        elseif c == "\\" then out[#out + 1] = "\\\\"
        elseif c == "\n" then out[#out + 1] = "\\n"
        elseif c == "\r" then out[#out + 1] = "\\r"
        elseif b == 0 then out[#out + 1] = "\\0"
        elseif b < 32 or b == 127 then out[#out + 1] = "\\" .. b
        else out[#out + 1] = c end
    end
    out[#out + 1] = '"'
    return table.concat(out)
end

-- Same layout as NG storage.lua: one line per record, fields sorted.
local function serializeRecord(rec)
    local fields = {}
    for k, v in pairs(rec) do
        fields[#fields + 1] = k .. "=" .. (type(v) == "string" and luaQuote(v) or fmtNum(v))
    end
    table.sort(fields)
    return "{" .. table.concat(fields, ",") .. "},\n"
end

local function ngFileText(config, generation)
    local header = {}
    for k, v in pairs(config.header) do header[k] = v end
    header.generation = generation
    local parts = {"return {\n", serializeRecord(header)}
    for _, t in ipairs(config.tabs) do parts[#parts + 1] = serializeRecord(t) end
    for _, c in ipairs(config.controls) do parts[#parts + 1] = serializeRecord(c) end
    parts[#parts + 1] = "}\n"
    return table.concat(parts)
end

local function planWrite(textA, textB)
    local function gen(t)
        if t == nil then return -1 end
        return tonumber(string.match(string.sub(t, 1, 600), "generation=(%d+)") or "0")
    end
    local ga, gb = gen(textA), gen(textB)
    if ga < 0 and gb < 0 then return {slot = "a", generation = 1, replaces = false} end
    local max = math.max(ga, gb)
    return {slot = ga >= gb and "b" or "a", generation = max + 1, replaces = true, previous = max}
end

local Core = {
    parseOldConfig = parseOldConfig, parseYaml = parseYaml, findWidgets = findWidgets,
    convert = convert, ngFileText = ngFileText, planWrite = planWrite, toHex = toHex,
    validateRecord = validateRecord, isList = isList,
}

------------------------------------------------------------- file I/O ---
local function readFile(path, max)
    local f = io.open(path, "r")
    if not f then return nil end
    local parts, size = {}, 0
    while true do
        local data = io.read(f, 1024)
        if not data or #data == 0 then break end
        size = size + #data
        if max and size > max then io.close(f); return nil, "file too large" end
        parts[#parts + 1] = data
    end
    io.close(f)
    return table.concat(parts)
end

local function listDir(path)
    if type(dir) ~= "function" then return nil end
    local ok, iter = pcall(dir, path)
    if not ok or not iter then return nil end
    local names = {}
    for name in iter do names[#names + 1] = name end
    return names
end

local function isDirectory(path)
    if type(fstat) ~= "function" then return listDir(path) ~= nil end
    local info = fstat(path)
    return info ~= nil and type(info.attrib) == "number" and (info.attrib // 16) % 2 == 1
end

local function ensureDirectory(path)
    if isDirectory(path) then return true end
    if type(mkdir) ~= "function" then return nil, "cannot create " .. path .. " (no mkdir API)" end
    local result = mkdir(path)
    if result ~= 0 and result ~= 8 then return nil, "cannot create " .. path .. ": " .. tostring(result) end
    return true
end

-------------------------------------------------------------------- texts ---
local TEXT = {
    en = {
        title = "MultiSw -> NG converter",
        scanning = "Reading model and widget files ...",
        model = "Model", target = "NG file", tabs = "Old widgets (become NG tabs):",
        convert = "Convert and save", exit = "EXIT: quit",
        help = "Rotary: select   ENTER: on/off or choose file",
        nofile = "no file - ENTER: choose", bad = "unusable", buttons = "buttons",
        defaults = "no widget options found, defaults used",
        pick = "Choose old configuration file", pickhelp = "ENTER: use   EXIT: back",
        confirm = "This model already has an NG configuration (generation %d).",
        confirm2 = "Replace it? The previous one stays on the card in the other slot",
        confirm3 = "as fallback until NG saves again.",
        confirm4 = "ENTER: replace   EXIT: back",
        writing = "Writing ...", checking = "Checking with the NG loader ...",
        done = "Saved", failed = "Failed", controls = "controls", skippedN = "not taken",
        check_ok = "NG loader check: OK", check_na = "NG loader check: not available (older NG?)",
        check_fail = "NG loader check FAILED: ",
        next1 = "Now place the widget 'MultiSw NG' instead of 'MultiSwE/L'.",
        next2 = "If an NG widget is already on this model, reload the model.",
        report = "Report (rotary scrolls):", nothing = "No usable old configuration selected.",
        nong = "lvglMultiSwNG is not installed (" .. NG_DIR .. ").",
        noold = "No MultiSwE/L widget and no old configuration file found for this model.",
        nofilename = "This EdgeTX version does not report the model file name.",
    },
    de = {
        title = "MultiSw -> NG Konverter",
        scanning = "Lese Modell und Widget-Dateien ...",
        model = "Modell", target = "NG-Datei", tabs = "Alte Widgets (werden NG-Tabs):",
        convert = "Umwandeln und speichern", exit = "EXIT: Ende",
        help = "Drehen: waehlen   ENTER: an/aus oder Datei waehlen",
        nofile = "keine Datei - ENTER: waehlen", bad = "unbrauchbar", buttons = "Buttons",
        defaults = "keine Widget-Optionen gefunden, Standardwerte",
        pick = "Alte Konfigurationsdatei waehlen", pickhelp = "ENTER: uebernehmen   EXIT: zurueck",
        confirm = "Dieses Modell hat schon eine NG-Konfiguration (Generation %d).",
        confirm2 = "Ersetzen? Die bisherige bleibt im anderen Slot auf der Karte,",
        confirm3 = "bis NG das naechste Mal speichert.",
        confirm4 = "ENTER: ersetzen   EXIT: zurueck",
        writing = "Schreibe ...", checking = "Pruefe mit dem NG-Loader ...",
        done = "Gespeichert", failed = "Fehlgeschlagen", controls = "Controls", skippedN = "nicht uebernommen",
        check_ok = "Pruefung mit NG-Loader: OK", check_na = "Pruefung mit NG-Loader: nicht moeglich (aeltere NG?)",
        check_fail = "Pruefung mit NG-Loader FEHLER: ",
        next1 = "Jetzt das Widget 'MultiSw NG' statt 'MultiSwE/L' platzieren.",
        next2 = "Ist schon ein NG-Widget im Modell, das Modell neu laden.",
        report = "Bericht (Drehen scrollt):", nothing = "Keine brauchbare alte Konfiguration ausgewaehlt.",
        nong = "lvglMultiSwNG ist nicht installiert (" .. NG_DIR .. ").",
        noold = "Kein MultiSwE/L-Widget und keine alte Konfigurationsdatei fuer dieses Modell gefunden.",
        nofilename = "Diese EdgeTX-Version liefert den Modell-Dateinamen nicht.",
    },
}

local S -- tool state
local L -- current texts

local function language()
    local ok, gs = pcall(function() return getGeneralSettings and getGeneralSettings() end)
    local l = ok and type(gs) == "table" and gs.language or ""
    return string.lower(tostring(l)):sub(1, 2) == "de" and "de" or "en"
end

---------------------------------------------------------------- scanning ---
local function loadOld(name)
    local text, err = readFile(OLD_DIR .. name, 256 * 1024)
    if not text then return {ok = false, error = err or "missing"} end
    local settings, perr = parseOldConfig(text)
    if not settings then return {ok = false, error = perr} end
    if not isList(settings.buttons) then return {ok = false, error = "no buttons"} end
    return {ok = true, settings = settings}
end

local function scan()
    local info = model.getInfo()
    if type(info) ~= "table" or type(info.filename) ~= "string" or info.filename == "" then
        return nil, L.nofilename
    end
    S.modelFile, S.modelName = info.filename, info.name or ""

    if not isDirectory(string.sub(NG_DIR, 1, -2)) then return nil, L.nong end
    local appLua = readFile(NG_DIR .. "app.lua")
    local modelsDir = appLua == nil or string.find(appLua, "modelsDir", 1, true) ~= nil
    appLua = nil
    S.targetDir = modelsDir and (NG_DIR .. "models/") or NG_DIR

    -- old configuration files <ModelName>_<Address>.lua
    S.files = {}
    for _, name in ipairs(listDir(string.sub(OLD_DIR, 1, -2)) or {}) do
        local base, addr = string.match(name, "^(.+)_(%d+)%.lua$")
        if base then S.files[#S.files + 1] = {name = name, base = base, address = tonumber(addr)} end
    end
    table.sort(S.files, function(a, b) return string.lower(a.name) < string.lower(b.name) end)

    -- widget options from the model file
    local yamlText = readFile("/MODELS/" .. S.modelFile)
    local widgets = {}
    if yamlText then
        local yaml = parseYaml(yamlText)
        yamlText = nil
        widgets = findWidgets(yaml)
    end
    collectgarbage()

    local byAddress, order = {}, {}
    for _, w in ipairs(widgets) do
        if w.kind == "old" then
            local a = w.options.Address
            if not byAddress[a] then
                byAddress[a] = {address = a, options = w.options}
                order[#order + 1] = byAddress[a]
            end
        end
    end
    table.sort(order, function(a, b) return a.address < b.address end)

    local lowerName = string.lower(S.modelName)
    local function fileFor(address)
        local wanted = lowerName .. "_" .. fmtNum(address) .. ".lua"
        for _, f in ipairs(S.files) do
            if string.lower(f.name) == wanted then return f end
        end
        -- no directory listing available: try the expected name directly
        if #S.files == 0 and readFile(OLD_DIR .. S.modelName .. "_" .. fmtNum(address) .. ".lua", 1) ~= nil then
            return {name = S.modelName .. "_" .. fmtNum(address) .. ".lua", address = address}
        end
    end

    -- Widget already removed from the screen: offer the model's old files with default options.
    if #order == 0 then
        for _, f in ipairs(S.files) do
            if string.lower(f.base) == lowerName then
                local o = {}
                for _, def in ipairs(OPTION_DEFS) do o[def[1]] = def[2] end
                o.Address = f.address
                order[#order + 1] = {address = f.address, options = o, noOptions = true}
            end
        end
        table.sort(order, function(a, b) return a.address < b.address end)
    end
    if #order == 0 then return nil, L.noold end

    S.instances = {}
    for i, inst in ipairs(order) do
        local f = fileFor(inst.address)
        inst.file = f and f.name or nil
        inst.parsed = f and loadOld(f.name) or nil
        inst.include = inst.parsed ~= nil and inst.parsed.ok
        local st = inst.parsed and inst.parsed.ok and inst.parsed.settings or nil
        inst.tabName = st and truthy(st.name) and str(st.name) or ("Tab " .. i)
        S.instances[i] = inst
        collectgarbage()
    end

    local base = S.targetDir .. "model_" .. toHex(S.modelFile)
    S.pathA, S.pathB = base .. ".a.lua", base .. ".b.lua"
    local function head(p)
        local f = io.open(p, "r")
        if not f then return nil end
        local d = io.read(f, 600) or ""
        io.close(f)
        return d
    end
    S.plan = planWrite(head(S.pathA), head(S.pathB))
    return true
end

local function build()
    local chosen = {}
    for _, inst in ipairs(S.instances) do
        if inst.include and inst.parsed and inst.parsed.ok then
            chosen[#chosen + 1] = {
                address = inst.address, options = inst.options, settings = inst.parsed.settings,
                tabName = inst.tabName,
                label = "Address " .. fmtNum(inst.address) .. " (" .. inst.file .. ")",
            }
        end
    end
    if #chosen == 0 then return nil, L.nothing end
    local result, err = convert(chosen, S.lang)
    if not result then return nil, err end
    for _, inst in ipairs(S.instances) do
        if inst.include and inst.noOptions then
            table.insert(result.warnings, 1, {level = "warn", text = "Address " .. fmtNum(inst.address) .. ": the widget is no longer on the model's screens, so its options (CRSF/S.Port, interval) are unknown; defaults were used."})
        end
    end
    return result
end

------------------------------------------------------- write and verify ---
local function writeNg()
    local result, err = build()
    if not result then return nil, err end
    S.result = result
    local ok, derr = ensureDirectory(string.sub(S.targetDir, 1, -2))
    if not ok then return nil, derr end
    local path = S.plan.slot == "a" and S.pathA or S.pathB
    local text = ngFileText(result.config, S.plan.generation)
    local f = io.open(path, "w")
    if not f then return nil, "cannot open " .. path end
    local w = io.write(f, text)
    io.close(f)
    if w == nil then return nil, "cannot write " .. path end
    local back = readFile(path)
    if back ~= text then return nil, "verification failed for " .. path end
    S.writtenPath = path
    return true
end

-- Uses the installed NG widget's own config.lua and storage.lua to load the new file.
local function startSelfCheck()
    local ok, job = pcall(function()
        local cfgChunk = loadScript(NG_DIR .. "config.lua", "t")
        local stChunk = loadScript(NG_DIR .. "storage.lua", "t")
        if not cfgChunk or not stChunk then return nil end
        local t = function(fmt, ...)
            if select("#", ...) > 0 then return string.format(fmt, ...) end
            return fmt
        end
        local config = cfgChunk({t = t})
        local storage = stChunk(config)
        if type(storage) ~= "table" or type(storage.load) ~= "function" or type(storage.stepLoad) ~= "function" then return nil end
        return {storage = storage, load = storage.load(S.writtenPath)}
    end)
    if ok and job then S.check = job else S.checkResult = "na" end
end

local function stepSelfCheck()
    local c = S.check
    for _ = 1, 40 do
        if c.load.done then break end
        local ok, err = pcall(c.storage.stepLoad, c.load)
        if not ok then
            S.checkResult, S.checkError = "fail", tostring(err)
            S.check = nil
            return
        end
    end
    if c.load.done then
        if c.load.result then S.checkResult = "ok"
        else S.checkResult, S.checkError = "fail", tostring(c.load.error) end
        S.check = nil
    end
end

------------------------------------------------------------------- drawing ---
local LINE = 20

local function textWidth(s)
    if lcd.sizeText then
        local w = lcd.sizeText(s, SMLSIZE)
        if type(w) == "number" then return w end
    end
    return #s * 7
end

local function wrap(s, width, out, prefix)
    prefix = prefix or ""
    local line = prefix
    for word in string.gmatch(s, "%S+") do
        local candidate = line == prefix and (prefix .. word) or (line .. " " .. word)
        if textWidth(candidate) > width and line ~= prefix then
            out[#out + 1] = line
            line = "   " .. word
        else
            line = candidate
        end
    end
    if line ~= prefix then out[#out + 1] = line end
end

local function header(title)
    lcd.clear()
    lcd.drawText(8, 4, title or L.title, BOLD)
end

local function drawRows(rows, top, selected, scroll)
    local visible = math.floor((LCD_H - top - 24) / LINE)
    for i = 1, visible do
        local idx = i + scroll
        local r = rows[idx]
        if not r then break end
        lcd.drawText(8, top + (i - 1) * LINE, r, SMLSIZE + (idx == selected and INVERS or 0))
    end
    return visible
end

local function summaryRows()
    local rows = {}
    for _, inst in ipairs(S.instances) do
        local mark = inst.include and "[x] " or "[  ] "
        local desc
        if not inst.file then desc = L.nofile
        elseif not (inst.parsed and inst.parsed.ok) then desc = inst.file .. ": " .. L.bad .. " (" .. tostring(inst.parsed and inst.parsed.error) .. ")"
        else desc = inst.tabName .. " - " .. #inst.parsed.settings.buttons .. " " .. L.buttons .. " - " .. inst.file end
        rows[#rows + 1] = mark .. "Addr " .. fmtNum(inst.address) .. ": " .. desc .. (inst.noOptions and (" (" .. L.defaults .. ")") or "")
    end
    rows[#rows + 1] = ">> " .. L.convert
    return rows
end

local function drawSummary()
    header()
    lcd.drawText(8, 28, L.model .. ": " .. S.modelName .. "  (" .. S.modelFile .. ")", SMLSIZE)
    lcd.drawText(8, 46, L.target .. ": " .. (S.plan.slot == "a" and S.pathA or S.pathB), SMLSIZE)
    lcd.drawText(8, 68, L.tabs, SMLSIZE + BOLD)
    S.rows = summaryRows()
    local top = 88
    local visible = math.floor((LCD_H - top - 24) / LINE)
    if S.sel > S.scroll + visible then S.scroll = S.sel - visible end
    if S.sel <= S.scroll then S.scroll = S.sel - 1 end
    S.rowTop, S.visible = top, drawRows(S.rows, top, S.sel, S.scroll)
    lcd.drawText(8, LCD_H - 20, L.help .. "   " .. L.exit, SMLSIZE)
end

local function drawPicker()
    header(L.pick)
    local rows = {}
    for _, f in ipairs(S.files) do rows[#rows + 1] = f.name end
    S.rows = rows
    local top = 32
    local visible = math.floor((LCD_H - top - 24) / LINE)
    if S.psel > S.pscroll + visible then S.pscroll = S.psel - visible end
    if S.psel <= S.pscroll then S.pscroll = S.psel - 1 end
    S.rowTop, S.visible = top, drawRows(rows, top, S.psel, S.pscroll)
    lcd.drawText(8, LCD_H - 20, L.pickhelp, SMLSIZE)
end

local function drawConfirm()
    header()
    lcd.drawText(8, 40, string.format(L.confirm, S.plan.previous or 0), SMLSIZE)
    lcd.drawText(8, 64, L.confirm2, SMLSIZE)
    lcd.drawText(8, 84, L.confirm3, SMLSIZE)
    lcd.drawText(8, 116, L.confirm4, SMLSIZE + BOLD)
end

local function reportLines()
    local width = LCD_W - 24
    local out = {}
    local r = S.result
    if S.error then
        wrap(L.failed .. ": " .. S.error, width, out)
        return out
    end
    wrap(L.done .. ": " .. S.writtenPath, width, out)
    out[#out + 1] = string.format("%d %s, %d tabs, %d %s", r.stats.controls, L.controls, #r.config.tabs, #r.skipped, L.skippedN)
    if S.checkResult == "ok" then out[#out + 1] = L.check_ok
    elseif S.checkResult == "na" then out[#out + 1] = L.check_na
    elseif S.checkResult == "fail" then wrap(L.check_fail .. tostring(S.checkError), width, out)
    else out[#out + 1] = L.checking end
    wrap(L.next1, width, out)
    wrap(L.next2, width, out)
    if #r.warnings > 0 or #r.skipped > 0 then
        out[#out + 1] = ""
        out[#out + 1] = L.report
        for _, w in ipairs(r.warnings) do wrap(w.text, width, out, (w.level == "warn" and "! " or "i ")) end
        for _, s in ipairs(r.skipped) do wrap(s.label .. ": " .. s.reason, width, out, "- ") end
    end
    return out
end

local function drawResult()
    header()
    if not S.lines or S.check ~= nil or S.linesFor ~= S.checkResult then
        S.lines, S.linesFor = reportLines(), S.checkResult
    end
    local top = 30
    local visible = math.floor((LCD_H - top - 24) / LINE)
    S.rscroll = clamp(S.rscroll, 0, math.max(0, #S.lines - visible))
    for i = 1, visible do
        local l = S.lines[i + S.rscroll]
        if not l then break end
        lcd.drawText(8, top + (i - 1) * LINE, l, SMLSIZE)
    end
    lcd.drawText(8, LCD_H - 20, L.exit, SMLSIZE)
end

local function drawMessage(msg)
    header()
    local out = {}
    wrap(msg, LCD_W - 24, out)
    for i, l in ipairs(out) do lcd.drawText(8, 30 + (i - 1) * LINE, l, SMLSIZE) end
    lcd.drawText(8, LCD_H - 20, L.exit, SMLSIZE)
end

------------------------------------------------------------------- events ---
local function tappedRow(touchState)
    if not touchState or not S.rowTop then return nil end
    local i = math.floor((touchState.y - S.rowTop) / LINE) + 1
    if i < 1 or i > (S.visible or 0) then return nil end
    return i
end

local function activateSummaryRow()
    if S.sel > #S.instances then
        if S.plan.replaces then S.phase = "confirm" else S.phase = "write" end
        return
    end
    local inst = S.instances[S.sel]
    if inst.file and inst.parsed and inst.parsed.ok then
        inst.include = not inst.include
    elseif #S.files > 0 then
        S.phase, S.psel, S.pscroll = "pick", 1, 0
    end
end

local function init()
    L = TEXT[language()]
    S = {phase = "scan", sel = 1, scroll = 0, rscroll = 0, lang = language()}
end

local function run(event, touchState)
    if S == nil then init() end
    local tap = event == EVT_TOUCH_TAP
    if S.phase == "scan" then
        drawMessage(L.scanning)
        local ok, res, err = pcall(scan)
        if not ok then S.phase, S.message = "message", tostring(res)
        elseif not res then S.phase, S.message = "message", err
        else S.phase = "summary" end
        return 0
    end
    if S.phase == "message" then
        drawMessage(S.message)
        if event == EVT_VIRTUAL_EXIT or event == EVT_VIRTUAL_ENTER or tap then return 1 end
        return 0
    end
    if S.phase == "summary" then
        local rows = #S.instances + 1
        if event == EVT_VIRTUAL_EXIT then return 1
        elseif event == EVT_VIRTUAL_NEXT then S.sel = S.sel % rows + 1
        elseif event == EVT_VIRTUAL_PREV then S.sel = (S.sel - 2) % rows + 1
        elseif event == EVT_VIRTUAL_ENTER then activateSummaryRow()
        elseif tap then
            local i = tappedRow(touchState)
            if i and i + S.scroll <= rows then S.sel = i + S.scroll; activateSummaryRow() end
        end
        if S.phase == "summary" then drawSummary() end
        return 0
    end
    if S.phase == "pick" then
        local n = #S.files
        local function choose()
            local inst, f = S.instances[S.sel], S.files[S.psel]
            inst.file, inst.parsed = f.name, loadOld(f.name)
            inst.include = inst.parsed.ok
            local st = inst.parsed.ok and inst.parsed.settings or nil
            if st and truthy(st.name) then inst.tabName = str(st.name) end
            S.phase = "summary"
        end
        if event == EVT_VIRTUAL_EXIT then S.phase = "summary"
        elseif event == EVT_VIRTUAL_NEXT then S.psel = S.psel % n + 1
        elseif event == EVT_VIRTUAL_PREV then S.psel = (S.psel - 2) % n + 1
        elseif event == EVT_VIRTUAL_ENTER then choose()
        elseif tap then
            local i = tappedRow(touchState)
            if i and i + S.pscroll <= n then S.psel = i + S.pscroll; choose() end
        end
        if S.phase == "pick" then drawPicker() else drawSummary() end
        return 0
    end
    if S.phase == "confirm" then
        if event == EVT_VIRTUAL_EXIT then S.phase = "summary"; drawSummary(); return 0 end
        if event == EVT_VIRTUAL_ENTER or tap then S.phase = "write" end
        if S.phase == "confirm" then drawConfirm(); return 0 end
    end
    if S.phase == "write" then
        drawMessage(L.writing)
        local ok, res, err = pcall(writeNg)
        if not ok then S.error = tostring(res)
        elseif not res then S.error = err end
        if not S.error then startSelfCheck() end
        S.phase, S.lines = "result", nil
        if S.error and not S.result then S.result = {stats = {controls = 0}, config = {tabs = {}}, warnings = {}, skipped = {}} end
        return 0
    end
    if S.phase == "result" then
        if S.check then stepSelfCheck() end
        if event == EVT_VIRTUAL_EXIT then return 1
        elseif event == EVT_VIRTUAL_NEXT then S.rscroll = S.rscroll + 1
        elseif event == EVT_VIRTUAL_PREV then S.rscroll = math.max(0, S.rscroll - 1)
        end
        drawResult()
        return 0
    end
    return 0
end

return {name = "MultiSw -> NG", init = init, run = run, core = Core}
