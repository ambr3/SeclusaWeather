# Changelog

All notable changes to **Seclusa Weather**.

## Unreleased

### Changed
- Hourly forecast is a Now→forward horizontal strip (time, icon, temp, rain%) with in-flow day markers; day-paged 3-col grid, past hours, and equal-height empty pads removed.
- Night earth flip only rotates the disc paint; sun/moon keep the same orbit path and Day/Night marks stay fixed.

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
