#!/usr/bin/env bash
# Seclusa Weather — committed smoke checks (no network, no install).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
pass() { echo "PASS: $*"; }
bad()  { echo "FAIL: $*"; fail=1; }

echo "→ smoke @ $PWD"

# --- syntax ---
for f in js/*.js sw.js; do
  node --check "$f" || bad "syntax $f"
done
pass "JS syntax"

# --- version alignment ---
sw_ver=$(grep -m1 "const VERSION" sw.js | grep -oE "'v[0-9]+\.[0-9]+\.[0-9]+'" | tr -d "'")
sw_ass=$(grep -m1 "const ASSET_VER" sw.js | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
sw_key=$(grep -m1 "CACHE_NAME" sw.js | grep -oE "seclusaweather-v[0-9]+\.[0-9]+\.[0-9]+")
[ "$sw_ver" = "v$sw_ass" ] || bad "VERSION ($sw_ver) vs ASSET_VER ($sw_ass)"
[ "$sw_key" = "seclusaweather-$sw_ver" ] || bad "CACHE_NAME ($sw_key) vs VERSION ($sw_ver)"
footer=$(grep -oE 'Seclusa Weather v[0-9]+\.[0-9]+\.[0-9]+' index.html | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ "$footer" = "$sw_ass" ] || bad "footer version ($footer) vs ASSET_VER ($sw_ass)"
while read -r stamp; do
  [ "$stamp" = "$sw_ass" ] || bad "page ?v=$stamp != $sw_ass"
done < <(grep -hoE '\?v=[0-9]+\.[0-9]+\.[0-9]+' index.html offline.html | sed 's/?v=//' | sort -u)
unstamped=$(grep -oE '(src|href)="[^"?]+\.(css|js)"' index.html offline.html || true)
[ -z "$unstamped" ] || bad "unstamped asset links: $unstamped"
pass "version $sw_ver aligned"

# --- referenced files exist ---
missing=0
while read -r a; do
  path="${a#./}"
  path="${path%%\?*}"
  [ -f "$path" ] || { echo "MISSING (sw): $path"; missing=1; }
done < <(grep -oE "'\./[^']+'" sw.js | tr -d "'")
for f in $(grep -oE '(src|href)="[^"]+\.(css|js|json|png|svg)"' index.html offline.html | sed -E 's/.*(src|href)="//;s/"$//;s/\?v=.*//'); do
  [ -f "$f" ] || { echo "MISSING (page): $f"; missing=1; }
done
for f in $(grep -oE '"src": "[^"]+"' manifest.json | sed -E 's/.*"src": "//;s/"$//'); do
  [ -f "$f" ] || { echo "MISSING (manifest): $f"; missing=1; }
done
[ "$missing" -eq 0 ] || bad "missing assets"
pass "assets present"

# --- no plain http resources in app surface ---
http_hits=$(grep -RInE --include='*.{html,js,css,json}' 'http://' . \
  --exclude-dir=.git --exclude-dir=scripts 2>/dev/null \
  | grep -v 'xmlns="http://www.w3.org' \
  | grep -v 'README.md' \
  | grep -v 'LICENSE' || true)
[ -z "$http_hits" ] || bad "plain http:// references:\n$http_hits"
pass "no mixed-content http://"

# --- CSP / connect-src parity with config + SW ---
for host in api.open-meteo.com air-quality-api.open-meteo.com geocoding-api.open-meteo.com; do
  grep -q "$host" index.html || bad "CSP meta missing $host"
  grep -q "$host" .htaccess || bad ".htaccess missing $host"
  grep -q "$host" _headers || bad "_headers missing $host"
  grep -q "$host" sw.js || bad "sw.js API_ORIGINS missing $host"
  grep -q "$host" js/config.js || bad "config.js missing $host"
done
grep -q "frame-ancestors 'none'" .htaccess _headers vercel.json || bad "frame-ancestors missing from header samples"
grep -q 'X-Frame-Options' .htaccess _headers vercel.json || bad "X-Frame-Options missing from header samples"
pass "CSP / header host allowlist"

# --- privacy / XSS guardrails present ---
grep -q '_esc(' js/ui.js || bad "UI._esc missing"
grep -q '_validCoords' js/api.js || bad "API._validCoords missing"
grep -q 'safeGet' js/utils.js || bad "Utils.safeGet missing"
grep -q 'loadWeatherCache' js/utils.js || bad "loadWeatherCache missing"
grep -q 'Erase my data' index.html || bad "clear-data affordance missing"
grep -q 'rel="noopener noreferrer"' index.html || bad "noopener noreferrer missing"
grep -q 'content="no-referrer"' index.html || bad "referrer meta missing"
grep -q 'window.top !== window.self' js/app.js || bad "frame-bust missing"
pass "privacy / XSS guards"

# --- unit helpers (node, no DOM) ---
node <<'NODE' || bad "coord / cache unit checks"
const fs = require('fs');
const apiSrc = fs.readFileSync('js/api.js', 'utf8');
const utilsSrc = fs.readFileSync('js/utils.js', 'utf8');
global.CONFIG = {
  WEATHER_BASE: 'https://api.open-meteo.com',
  AIR_QUALITY_BASE: 'https://air-quality-api.open-meteo.com',
  GEOCODING_BASE: 'https://geocoding-api.open-meteo.com',
};
eval(apiSrc.replace(/^const API =/, 'global.API ='));
const ok = [
  [51.5, -0.1, true],
  [90, 180, true],
  [-90, -180, true],
  [91, 0, false],
  [0, 181, false],
  [NaN, 0, false],
  ['x', 'y', false],
];
for (const [lat, lon, expect] of ok) {
  const got = API._validCoords(lat, lon);
  if (got !== expect) {
    console.error('coord', lat, lon, 'got', got, 'want', expect);
    process.exit(1);
  }
}
eval(utilsSrc.replace(/^const Utils =/, 'global.Utils ='));
const good = Utils.formatTemp(0, 'metric');
if (good !== '0°C') { console.error('formatTemp 0 failed', good); process.exit(1); }
if (Utils.formatPrecip(0, 'metric') != null) { console.error('formatPrecip 0 should be null'); process.exit(1); }
if (Utils.getWindDirection(0) !== 'N') { console.error('wind dir'); process.exit(1); }
console.log('unit helpers ok');
NODE
pass "node unit helpers"

if [ "$fail" -ne 0 ]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE OK ($sw_ver)"
