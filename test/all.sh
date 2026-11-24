#!/bin/sh
# Usage: test/all.sh "<SD card root or backup>"   (needs node, python3 with lupa, and jsdom in /tmp/jsd)
set -e
cd "$(dirname "$0")/.."
SD="$1"
node build.js
node test/run.js "$SD" "$PWD/test-out"
node test/ui.test.js "$SD" "$PWD/test-ui-work" 2>&1 | grep -v "Not implemented"
node test/fallback.test.js "$SD" 2>&1 | grep -v "Not implemented"
for ng in "$SD/WIDGETS/lvglMultiSwNG"; do python3 -I test/validate_ng.py "$ng" "$PWD/test-out"; done
