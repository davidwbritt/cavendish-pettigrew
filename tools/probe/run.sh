#!/usr/bin/env bash
# End-to-end browser probe: drives the BUILT instrument from the landing screen
# through 24 questions, the review sheet, the certificate and the debrief, then
# prints what it saw.
#
# Why this exists: the unit suite asserts invariants, but every defect that
# reached the end of Plan 1 was an INTERACTION between correct components —
# two tricks silently disabled by a correct teardown, a suppression that leaked
# through a second path, a "92th centile" on the one screen built to be
# screenshotted. Only a real browser catches those.
#
# Usage:   tools/probe/run.sh
# Env:     CHROME=/path/to/chrome   PROBE_TIMEOUT=300
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
cd "$ROOT"
npm run build >/dev/null
cp dist/index.html "$OUT/probe.html"

# Headless virtual time does NOT run requestAnimationFrame, and the app detects
# timer expiry inside its rAF tick — so without this shim the timer appears
# frozen and no question ever times out. Route rAF through setTimeout, which
# virtual time DOES advance. Scratch copy only; the shipped file is untouched.
node -e '
const fs=require("fs"), p=process.argv[1];
const shim="<script>window.requestAnimationFrame=f=>setTimeout(()=>f(Date.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);</script>";
fs.writeFileSync(p, fs.readFileSync(p,"utf8").replace("</head>", shim+"</head>"));
' "$OUT/probe.html"

{ printf '\n<script>\n'; cat "$ROOT/tools/probe/driver.js"; printf '\n</script>\n'; } >> "$OUT/probe.html"

"${CHROME:-google-chrome}" --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=400000 --dump-dom "file://$OUT/probe.html" 2>/dev/null \
  | sed -n '/===TRACE-START===/,/===TRACE-END===/p' \
  | sed -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&amp;/\&/g' -e 's/&quot;/"/g'
