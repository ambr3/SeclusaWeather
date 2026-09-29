# Changelog

All notable changes to **Seclusa Weather**.

## Unreleased

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
