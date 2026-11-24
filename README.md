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

## On the radio: EdgeTX tool script

[`edgetx/SCRIPTS/TOOLS/msw2ng.lua`](edgetx/SCRIPTS/TOOLS/msw2ng.lua) does the same conversion directly on the radio,
for the **currently loaded model**:

1. Copy `msw2ng.lua` to `/SCRIPTS/TOOLS/` on the SD card (lvglMultiSwNG must be installed).
2. Load the model, open *SYSTEM → Tools → MultiSw -> NG*.
3. The list shows the model's old widgets (one future NG tab per address). Rotary selects, ENTER switches
   a widget on/off. If the model was renamed and no file matches, ENTER lets you choose the old file.
4. Select *Convert and save*. An existing NG configuration is only replaced after a second confirmation.
5. The tool checks the written file with the installed NG widget's own `config.lua`/`storage.lua`
   and shows a report of everything that was not migrated (rotary scrolls).

Then place "MultiSw NG" instead of "MultiSwE/L". If an NG widget was already on the model, reload the model.
If the old widget was already removed from the screens, the tool still finds the model's old files, but uses
default widget options (CRSF, interval 100) and says so.

Compared with the browser tool there is no tab renaming or reordering (tabs follow the address order);
do that in the NG widget afterwards. The texts are German on a German radio, otherwise English.

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

The EdgeTX script is a Lua port of `src/core.js`. Its tests run the script with
[fengari](https://fengari.io/) in a browser against an in-memory SD card with mocked EdgeTX APIs, check that
it writes byte-identical files to `src/core.js`, and load the result with the real NG `config.lua`/`storage.lua`:

```
test/edgetx/build.sh "/path/to/WIDGETS/lvglMultiSwNG" test-out/edgetx-test.html
# serve test-out/ over http://localhost and open the page: the title says PASSED or FAILED
```

## License

GPL-3.0-or-later, like the widgets it migrates between. See `LICENSE`.
