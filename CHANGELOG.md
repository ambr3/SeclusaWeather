# Changelog

All notable changes to **Seclusa Weather**.

## Unreleased

### Added
- README screenshots from the live site (phone light/dark + desktop)

### Changed
- Shortened README to match Seclusa Solitaire style
- Cropped README screenshots; show on one row with no gaps between images
- README “A note from me” links to the Seclusa about page

### Fixed
- Saved place (`lastLat`/`lastLon`) now expires with the same 7-day TTL as weatherCache

### Changed
- Version **0.6.5**

### Added
- Hourly day tabs (Today / Tomorrow / weekday) with swipe sync; “Swipe hours” above the tabs, “Swipe days” below; tap a tab or in-strip day marker to jump.
- Earth arc N / E / S / W marks; they swap places with the night disc flip (text stays upright).

### Fixed
- On-device `weatherCache` now expires after 7 days and rejects oversized / malformed AQ payloads (matches privacy claim).
- Service worker same-origin cache write uses `URL.origin` (not string prefix).
- Stored units / wind / chart / city / lat-lon preferences validated on load.
- `getUVLevel` / `getAQILevel` / `formatVisibility` reject null/NaN instead of treating them as valid.
- README self-cleaning cache row corrected (no SW API cache; localStorage TTL).

## 0.6.4 — 2026-09-29

### Fixed
- Service worker no longer intercepts Open-Meteo requests (was synthesizing 503 offline JSON and breaking search/refresh on the hosted site). Offline forecasts stay in `localStorage` only.

### Changed
- Shipping version / SW cache **0.6.4**.

## 0.6.3 — 2026-09-29

### Fixed
- Silent refresh no longer cancels in-flight search/locate (`_userBusy` + no shared seq bump).
- Service worker: geocoding is network-only (no search-history cache); prune clears legacy geocode entries; activate prune timer is not duplicated.
- Offline page styles moved out of inline `<style>` (CSP `style-src 'self'`).
- Weather cache load validates `current` / hourly+daily `time[]` shapes before use.

### Changed
- Fresh install / after erase: no silent London default — empty start until search or locate.
- Dropped Open-Meteo `preconnect` on first paint (contact only when fetching).
- Escape more summary/celestial/hourly text sinks into `innerHTML`.
- Hourly forecast is a Now→forward horizontal strip (time, icon, temp, rain%) with in-flow day markers.
- Night earth flip only rotates the disc paint; sun/moon keep the same orbit path.
- Shipping version / SW cache **0.6.3**.

## 0.6.2 — 2026-09-28

### Added
- Local summer/winter clock-change dates under Sun & Moon (browser `Intl` tzdata only; no network).

### Changed
- Sun / Moon / Clocks in mobile-first stacked panels with soft squircles; 2-col Sun/Moon from 640px.
- Clearer Rise–set / UV / Solar / Summer / Winter labels; orbit mark Noon → Day.
- Open-source footer link points at the same-origin OSS page.

## 0.6.1 — 2026-09-28

### Changed
- Hourly day pages (swipe L/R), full Today, compact cells, equal-height pages, stacked mobile pager.
- Section titles outside pills (Forecast, Hourly, Graphs, Details, Wind, Sun & Moon).
- Shared Open-Meteo `dayOutlook` / `hourIcon`; rain % and icons gated on real precip.
- Earth night flip (dark + stars on top); Wind as its own section.

### Removed
- 24h / All hourly tabs.

## 0.6.0 — 2026-09-27

### Changed
- Local fonts (DM Sans / Sora); UI polish; CSP without `unsafe-inline`.
