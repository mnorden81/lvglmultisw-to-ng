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

[`edgetx/SCRIPTS/TOOLS/msw2ng.lua`](edgetx/SCRIPTS/TOOLS/msw2ng.lua) does the conversion directly on the radio:

1. Copy `msw2ng.lua` to `/SCRIPTS/TOOLS/` on the SD card (lvglMultiSwNG must be installed).
2. Open *SYSTEM → Tools → MultiSw -> NG*. The tool reads the SD card and lists **all old configurations**
   (`WIDGETS/lvglMultiSw/<Model>_<Address>.lua`) with the model each one belongs to, or `?` if no model has that
   name any more, and marks unusable (empty or truncated) files.
3. Check the configurations to convert: ENTER toggles one, the first line checks all assigned ones.
4. ENTER long (or PAGE, or tapping `>`) opens the settings of a configuration, i.e. the relation old → new:
   * target model (needed for renamed models) and NG tab address,
   * for all tabs of that target model: protocol (CRSF, S.Port WM, ACW 1.5, ACW 1.4), interval, CRSF destination,
     S.Port physical and app ID.

   Defaults come from the old widget options in the model file (`destination` from `commandBroadcastAddress`).
   If the old widget is no longer on the model's screens, the defaults are used and the report says so.
5. Select *Convert checked*. All checked configurations of one model become tabs (ordered by tab address) of
   that model's NG configuration, written where the installed NG version expects it. An existing NG
   configuration is only replaced after confirmation, into the other slot, so the previous one stays as fallback.
6. Each written file is checked with the installed NG widget's own `config.lua`/`storage.lua`. The report lists
   everything that was not migrated (rotary scrolls).

Then place "MultiSw NG" instead of "MultiSwE/L" in those models. If an NG widget was already on the loaded model,
reload the model. The texts are German on a German radio, otherwise English.

Old files are never run as code: only literal table syntax passes a check before a file is loaded with an empty
environment. The work is split into small steps per frame to stay within EdgeTX's CPU limit per script call
(the tests check every call against an instruction budget).

## Not migrated

The tools report these per button/tab:

* EdgeTX logical/virtual switches set by buttons (`external_switch`): newer NG versions can set local switches
  (`Set switch`, L01..L64 Sticky / VS01..VS64). The EdgeTX script assigns them automatically when the installed NG
  supports it (it resolves the switch index with `getSwitchName` on the radio, activates used VS switches and keeps
  sliders, duplicates and self-feeding assignments out). The browser tool cannot resolve switch indices and only
  reports them.
* not supported by NG yet: virtual inputs, telemetry actions, SHM encoding, status passthrough
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
