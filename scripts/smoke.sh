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
grep -q "font-src 'self'" index.html offline.html .htaccess _headers vercel.json || bad "font-src 'self' missing from CSP samples"
! grep -q "'unsafe-inline'" index.html offline.html .htaccess _headers vercel.json || bad "CSP still allows unsafe-inline"
grep -q "dynCSS" js/utils.js || bad "dynCSS helper missing"
inline_hits=$(grep -nE ' style=|\.style\.[a-zA-Z]' js/ui.js js/app.js index.html offline.html 2>/dev/null || true)
[ -z "$inline_hits" ] || bad "inline style sinks remain:\n$inline_hits"
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
if (Utils.getMoonPhaseName(0) !== 'New Moon') { console.error('moon new'); process.exit(1); }
if (Utils.getMoonPhaseName(0.5) !== 'Full Moon') { console.error('moon full'); process.exit(1); }
if (Utils.getMoonIllumination(0.5) !== 100) { console.error('illum full'); process.exit(1); }
if (Utils.getMoonIllumination(0) !== 0) { console.error('illum new'); process.exit(1); }
console.log('unit helpers ok');
NODE
pass "node unit helpers"

# --- default London + modal/earth review guards ---
grep -q "DEFAULT_LOCATION" js/config.js || bad "DEFAULT_LOCATION missing"
grep -q "name: 'London'" js/config.js || bad "London default missing"
grep -q "lat: 51.5074" js/config.js || bad "London lat missing"
grep -q "_ensureDefaultLocation" js/app.js || bad "_ensureDefaultLocation missing"
grep -q "built-in \*\*London\*\* default" README.md || bad "README London default note missing"
grep -q '_modalPaneHLocked' js/ui.js || bad "modal height settle lock missing"
grep -q 'settle = false' js/ui.js || bad "modal settle remasure missing"
grep -q '{ html = false }' js/ui.js || bad "_statRow html opt-in missing"
# Moon phase + sun/moon facts live in the earth-arc pill
grep -q 'earth-arc__row--phase' js/ui.js || bad "earth-arc phase row missing"
grep -q 'earth-arc__facts' js/ui.js || bad "earth-arc facts missing"
grep -q 'earth-arc__list' js/ui.js || bad "earth-arc list style missing"
grep -q 'hourly-modal__list' js/ui.js || bad "enlarge list missing"
grep -q '_statRow' js/ui.js || bad "enlarge list rows missing"
! grep -q 'hourly-modal__stats' js/ui.js || bad "enlarge chips should stay removed"
grep -q "align-items: flex-start" css/style.css || bad "celestial columns not top-aligned"
grep -q '_applyWeatherTheme' js/ui.js || bad "live weather theme helper missing"
grep -q 'sun.below ? 0 : 1' js/ui.js || bad "sunset→night theme flip missing"
! grep -q 'celestial__phase' js/ui.js || bad "phase should not be under Moon column"
# Fixed earth day = top half (no spin with sun)
grep -q 'Day = top half, night = bottom' js/ui.js || bad "fixed earth day/night comment missing"
grep -q 'M24,50 A26,26 0 0 1 76,50 Z' js/ui.js || bad "fixed day-top earth path missing"
# Head labels escaped
grep -q 'hourly-modal__head">${this._esc' js/ui.js || bad "modal head not escaped"
pass "default London / modal / earth guards"

# --- local fonts (no CDN) ---
grep -q "@font-face" css/style.css || bad "@font-face missing"
grep -qF -- "--font-body: 'DM Sans'" css/style.css || bad "DM Sans body missing"
grep -qF -- "--font-heading: 'Sora'" css/style.css || bad "Sora heading missing"
grep -qE 'fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/npm/@fontsource' css/style.css index.html && bad "external font CDN reference" || true
for f in \
  assets/fonts/dm-sans-latin-400-normal.woff2 \
  assets/fonts/dm-sans-latin-600-normal.woff2 \
  assets/fonts/dm-sans-latin-700-normal.woff2 \
  assets/fonts/sora-latin-600-normal.woff2 \
  assets/fonts/sora-latin-700-normal.woff2 \
  assets/fonts/sora-latin-800-normal.woff2
do
  [ -f "$f" ] || bad "missing font $f"
  grep -q "'./$f'" sw.js || bad "sw.js missing $f"
  grep -q "$f" css/style.css || bad "style.css missing url for $f"
done
grep -q 'weather-content--stagger' js/ui.js || bad "stagger class missing in ui.js"
grep -q 'weather-content--stagger' css/style.css || bad "stagger styles missing"
pass "local fonts + stagger"

if [ "$fail" -ne 0 ]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE OK ($sw_ver)"
