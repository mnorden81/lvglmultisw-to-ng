# lvglMultiSw → lvglMultiSwNG configuration converter

**Tool:** https://mnorden81.github.io/lvglmultisw-to-ng/ (runs entirely in your browser, nothing is uploaded)

Migrates the saved configuration of the old EdgeTX widget `lvglMultiSw` ("MultiSwE/L") to the new
`lvglMultiSwNG` widget by Wilhelm Meier ([wimalopaan/LUA](https://github.com/wimalopaan/LUA)).

## What it does

* Reads `MODELS/*.yml` and `WIDGETS/lvglMultiSw/<Model>_<Address>.lua` from the SD card (or a backup of it).
* Finds every old widget of a model together with its widget options (CRSF/S.Port, interval, ...).
* Several old widgets of one model become **tabs** of one NG configuration, because NG keeps exactly one
  configuration per model. You choose which widgets to take, the tab names and the tab order.
* Writes `model_<hex(model file name)>.a.lua`. An existing NG configuration is only replaced after
  confirmation, with a higher generation, in the other of the two slots.
* Old files and model files are never modified. The old file format is parsed, never executed.
* Chrome/Edge write directly to the card (File System Access API). Other browsers download a ZIP.
* The NG target folder (`models/` or next to the code) is detected from the installed NG version.

After the conversion, place the "MultiSw NG" widget instead of "MultiSwE/L" on the model's screen.
The tool does not change model files.

## Not migrated

NG has no equivalent yet; the tool reports these per button/tab:

* EdgeTX logical/virtual switches set by buttons (`external_switch`) — mixes relying on them stop working
* virtual inputs, telemetry actions, SHM encoding, status passthrough
* controls that violate NG rules (duplicate address/output across tabs, sliders with S.Port WM, 3Pos/sliders with ACW)

Mapping notes: the CRSF destination comes from the old `commandBroadcastAddress`; the old widget option
`Address` becomes the tab address.

## Status

Tested against a real TX16S SD card backup, and the generated files load cleanly with the real
`storage.lua`/`config.lua` of `lvglMultiSwNG`. **Not yet tested on a radio** — please check a converted model
on the ground first. Feedback and sample configurations are welcome as issues.

## Development

```
node build.js                      # inlines src/*.js into docs/index.html (served by GitHub Pages)
test/all.sh "/path/to/SD-card"     # needs node, python3 + lupa, and jsdom in /tmp/jsd
```

`src/core.js` parsers, mapping and writer · `src/scan.js` card scan and write plan · `src/app.js` UI.

## License

GPL-3.0-or-later, like the widgets it migrates between. See `LICENSE`.
