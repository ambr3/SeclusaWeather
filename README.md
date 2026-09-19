<p align="center">
  <img src="assets/icons/icon-maskable-192.svg" alt="Seclusa Weather" width="120" height="120">
</p>

<h1 align="center">Seclusa Weather</h1>

<p align="center">
  <em>Seclusa — from the Latin meaning "private", "secluded", or "set apart"</em>
</p>

<p align="center">
  <em>A privacy-first weather PWA — zero tracking, no accounts, no API keys.</em>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue.svg"></a>
  <a href="https://github.com/ambr3/SeclusaWeather/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/ambr3/SeclusaWeather"></a>
  <img alt="Vanilla JS" src="https://img.shields.io/badge/built%20with-vanilla%20JS-f7df1e.svg">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5a67d8.svg">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#license">License</a>
</p>

---

Keeps your weather your own. Seclusa Weather is a **pure static, open-source weather app**. Everything runs in your browser: preferences and a cached forecast live only on your device, and the only outbound requests are to the [Open-Meteo](https://open-meteo.com/) APIs (weather, air quality, and geocoding). Installable, offline-capable, and auditable end-to-end.

---

## ✨ Features

### 🌡️ Forecast
- **Current conditions** — temperature, feels-like, humidity, pressure, wind, precipitation, UV, visibility
- **Hourly forecast** — scrollable 24h / all-day view with a multi-metric chart
  *(Temp & Dew · Rain · Wind · Humidity · Cloud · Pressure · Sun strength)*
- **Daily forecast** — 7-day or 14-day cards with a toggle
- **Sunrise/sunset arc** — a live SVG that shows the sun *and* moon arcing across your sky
- **Auto-refresh** — silently stays fresh every 30 minutes

### 🌍 Air & Environment
- **Air quality index** — EU or US AQI with PM2.5, PM10, NO₂, O₃, SO₂, CO breakdown
- **Pollen forecast** — alder, birch, grass, mugwort, olive, and ragweed levels
- **UV index** — color-coded badge with risk level

### 🗺️ Location
- **Wind compass** — a live SVG rose showing which way the wind is blowing, with speed, gusts, and your selected location's coordinates. No map service involved
- **Geolocation** — "use my location", fully opt-in, on button tap only

### 🎨 Interface
- **Dark / light themes** with dynamic weather backgrounds at sunrise, rain, snow, thunder, fog, and night
- **Metric / imperial toggle** — saved between visits
- **Touch-friendly 24/48h hourly list** — tap any hour (or any forecast day) for full details
- Smooth fade-in animations, fully responsive

---

## 🔒 Privacy

Your data is your business. That's the whole point.

| | |
|---|---|
| 🚫 **Zero tracking** | No analytics, no cookies, no fingerprinting, no third-party scripts |
| 🖥️ **No server** | Pure static site — nothing runs on a server |
| 🔑 **No API key** | Powered by free open-source [Open-Meteo](https://open-meteo.com/), no account needed |
| 🏠 **Stays on device** | Preferences and the cached forecast never leave your device. Saved coordinates are re-sent to Open-Meteo only when a forecast is refreshed (see the geolocation note below) |
| 📤 **What leaves** | Forecasts (with coordinates) and the city names you type in search go to Open-Meteo. Nothing else |
| 🧹 **Self-cleaning cache** | Cached API responses remove themselves after 7 days; the on-device forecast snapshot is overwritten on every refresh |
| 🧽 **Erase anytime** | The Help panel's "Erase my data" wipes the saved city, coordinates, settings, and every cache in one tap |
| 📍 **Geolocation opt-in** | Only on button tap, sent only to Open-Meteo |
| 🛡️ **Locked-down security** | The app can only reach the weather servers it actually needs |
| 🕵️ **No hidden sharing** | Nothing beyond the forecast request itself ever leaves your device |
| 🚫 **Camera & mic stay off** | Access to camera, microphone, motion sensors, and payment is blocked |
| 🖼️ **Can't be embedded** | The app won't run inside other websites (best-effort — GitHub Pages limits header support, and there's nothing to gain from embedding anyway) |
| 📜 **Open source** | GPL-3.0 — read every line |

> ⚠️ **Geolocation note:** your coordinates *are* sent to the weather API when you view a forecast. It's the only way to get a local forecast — but it's disclosed, opt-in, and never logged or shared. If you previously used "my location", the app automatically re-sends those saved coordinates to refresh the forecast on **every visit**; use Help → **"Erase my data"** to remove them. (The shields.io images above load only when this README is viewed on GitHub — the app itself never loads them.)

---

## 📦 Installation

### Use it
Open the live site in your browser and install it as a PWA:

1. Open the site
2. Tap **Install** / **Add to Home screen**
3. Done — it works offline too

> 💡 Want maximum security? On Android use a hardened browser like **Vanadium (GrapheneOS)** or **Brave** for any PWA.

### Self-host

Serve the repo as a static site. To harden responses with real headers (the in-page CSP meta can't block clickjacking on its own), deploy with the bundled samples: `.htaccess` for Apache, `_headers` for Netlify/Cloudflare Pages. GitHub Pages ignores both files.

---

## ⚠️ Disclaimer

> This project was **vibe-coded**. All code is reviewed before each release, but it's still recommended to audit for security flaws before use, especially when self-hosting. Use at your own risk.

---

## 📄 License

[GPL-3.0](LICENSE) — free to use, modify, and share, with the same freedom preserved for derivatives.

---
