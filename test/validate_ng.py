"""Loads every generated NG file with the REAL storage.lua / config.lua of lvglMultiSwNG (via lupa)."""
import json, sys, os, glob
from lupa import LuaRuntime
ng_dir, out_dir = sys.argv[1], sys.argv[2]
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
function make_io()
  local files = {}
  local io_stub = {}
  function io_stub.open(path, mode)
    local f = io.open(path, "rb")   -- host io, only used for reading test files
    if not f then return nil, "cannot open", 2 end
    local data = f:read("a"); f:close()
    return {data = data, pos = 1}
  end
  function io_stub.read(h, n)
    if h.pos > #h.data then return "" end
    local s = string.sub(h.data, h.pos, h.pos + n - 1); h.pos = h.pos + #s; return s
  end
  function io_stub.close(h) return true end
  return io_stub
end
''')
lua.execute('''
COLOR_THEME_SECONDARY3 = 327680; COLOR_THEME_PRIMARY3 = 131072
local real_io = io
function load_ng(ng_dir)
  local app = { t = function(m, ...) if select("#", ...) == 0 then return m end return string.format(m, ...) end }
  local function chunk(name, arg) return assert(loadfile(ng_dir .. "/" .. name))(arg) end
  local config = chunk("config.lua", app)
  local storage = chunk("storage.lua", config)
  return config, storage
end
function load_file(storage, path)
  local host_io = real_io
  io = make_io()
  local job = storage.load(path)
  local guard = 0
  while not job.done do storage.stepLoad(job); guard = guard + 1; if guard > 100000 then error("loop") end end
  io = host_io
  return job
end
''')
# make_io needs the host io: define after capturing
lua.execute('''
local host = io
make_io = function()
  local s = {}
  function s.open(path, mode)
    local f = host.open(path, "rb")
    if not f then return nil, "cannot open", 2 end
    local data = f:read("a"); f:close()
    return {data = data, pos = 1}
  end
  function s.read(h, n) if h.pos > #h.data then return "" end local r = string.sub(h.data, h.pos, h.pos + n - 1); h.pos = h.pos + #r; return r end
  function s.close(h) return true end
  return s
end
''')
config, storage = lua.eval("load_ng")(ng_dir)
manifest = json.load(open(os.path.join(out_dir, "manifest.json")))
bad = 0
for m in manifest:
    job = lua.eval("load_file")(storage, m["path"])
    err = job["error"]
    res = job["result"]
    if err or not res:
        print("FAIL", m["model"], err); bad += 1; continue
    tabs, controls = len(res["tabs"]), len(res["controls"])
    hdr = res["header"]
    ok = (tabs == m["tabs"] and controls == m["controls"] and hdr["generation"] == m["generation"]
          and hdr["protocol"] == m["protocol"] and hdr["destination"] == m["destination"])
    print(("ok  " if ok else "FAIL"), m["model"], "tabs", tabs, "controls", controls, "generation", hdr["generation"], "dest", hdr["destination"])
    bad += 0 if ok else 1
sys.exit(1 if bad else 0)
