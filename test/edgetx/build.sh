#!/bin/sh
# Usage: test/edgetx/build.sh <lvglMultiSwNG widget folder> <output.html>
# Inlines the tool script, the NG widget's config.lua/storage.lua, the test driver,
# src/core.js and the fixtures into one HTML page. Open it in a browser: the page
# title becomes PASSED or FAILED. Needs perl.
set -e
cd "$(dirname "$0")/../.."
NG="$1"
OUT="$2"
perl -e '
  sub slurp { local $/; open my $f, "<:raw", $_[0] or die "$_[0]: $!"; my $d = <$f>; $d =~ s/\r\n/\n/g; $d }
  my ($ng, $out) = @ARGV;
  my $html = slurp("test/edgetx/run.template.html");
  my %parts = (
    TOOL => slurp("edgetx/SCRIPTS/TOOLS/msw2ng.lua"),
    NGCONFIG => slurp("$ng/config.lua"),
    NGSTORAGE => slurp("$ng/storage.lua"),
    DRIVER => slurp("test/edgetx/driver.lua"),
    CORE => slurp("src/core.js"),
    FIXTURES => slurp("test/edgetx/fixtures.js"),
  );
  for my $k (keys %parts) {
    die "$k contains </script>" if $parts{$k} =~ m{</script}i;
    my $v = $parts{$k}; # script elements are raw text: no entity escaping
    $html =~ s{/\*__${k}__\*/}{$v}e;
  }
  open my $o, ">:raw", $out or die; print $o $html;
' "$NG" "$OUT"
echo "$OUT"
