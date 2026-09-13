const App = {
  units: Utils.safeGet('units', null) || CONFIG.DEFAULT_UNITS,
  windUnit: Utils.safeGet('windUnit', null) || (Utils.safeGet('units', null) === 'imperial' ? 'mph' : 'kmh'),
  visUnit: Utils.safeGet('visUnit', null) || 'km',
  pressUnit: (Utils.safeGet('pressUnit', null) === 'inHg' ? 'inHg' : 'hPa'),
  forecastDays: parseInt(Utils.safeGet('forecastDays', ''), 10) === 14 ? 14 : 7,
  hourlyAll: Utils.safeGet('hourlyAll', '') === '1',
  chartMode: Utils.safeGet('chartMode', 'temp') || 'temp',
  lastCity: Utils.safeGet('lastCity', null),
  lastCountry: Utils.safeGet('lastCountry', '') || '',
  lastLat: parseFloat(Utils.safeGet('lastLat', '')),
  lastLon: parseFloat(Utils.safeGet('lastLon', '')),
  deferredPrompt: null,
  dropdownResults: [],
  dropdownIndex: -1,
  _weatherSeq: 0,
  _searchSeq: 0,
  _blurTimer: null,
  _last: null,

  init() {
    UI.setUnitLabel(this.units);
    UI.setWindUnitLabel(this.windUnit);
    UI.setVisLabel(this.visUnit);
    UI.setPressUnit(this.pressUnit);
    UI.initThemeToggle();

    window.__onFirstRender = () => this.dismissSplash();
    setTimeout(() => this.dismissSplash(), 3200);

    this.$('searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const city = this.$('searchInput').value.trim();
      if (city) this.searchCity(city);
    });

    const debouncedSearch = Utils.debounce((q) => this.showDropdown(q), 280);
    this.$('searchInput').addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { this.hideDropdown(); return; }
      debouncedSearch(q);
    });

    this.$('searchInput').addEventListener('keydown', (e) => this.handleDropdownKeys(e));
    this.$('searchInput').addEventListener('blur', () => {
      if (this._blurTimer) clearTimeout(this._blurTimer);
      this._blurTimer = setTimeout(() => this.hideDropdown(), 150);
    });
    this.$('searchInput').addEventListener('focus', () => {
      if (this._blurTimer) { clearTimeout(this._blurTimer); this._blurTimer = null; }
      const q = this.$('searchInput').value.trim();
      if (q.length >= 2 && this.dropdownResults.length) this.showDropdownList();
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'dynamicTextToggle' || e.target.closest('#dynamicTextToggle')) {
        const on = document.body.classList.toggle('dynamic-text');
        Utils.safeSet('dynamicText', on ? 'on' : 'off');
        const btn = document.getElementById('dynamicTextToggle');
        if (btn) btn.setAttribute('aria-pressed', String(on));
        this.updateDynamicText();
        return;
      }
      if (!e.target.closest('.search-form') && !e.target.closest('.search-dropdown')) {
        this.hideDropdown();
      }
      if (!e.target.closest('.units-menu')) this.closeUnitsMenu();
    });

    this.$('unitToggle').addEventListener('click', () => {
      this.units = this.units === 'metric' ? 'imperial' : 'metric';
      Utils.safeSet('units', this.units);
      UI.setUnitLabel(this.units);
      this.reloadCurrent();
    });

    this.$('windToggle').addEventListener('click', () => {
      const cycle = ['kmh', 'mph', 'kn', 'ms'];
      this.windUnit = cycle[(cycle.indexOf(this.windUnit) + 1) % cycle.length];
      Utils.safeSet('windUnit', this.windUnit);
      UI.setWindUnitLabel(this.windUnit);
      this.reloadCurrent();
    });

    this.$('visToggle').addEventListener('click', () => {
      this.visUnit = this.visUnit === 'km' ? 'mi' : 'km';
      Utils.safeSet('visUnit', this.visUnit);
      UI.setVisLabel(this.visUnit);
      this.reloadCurrent();
    });

    this.$('unitMenuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleUnitsMenu();
    });

    this.$('fc7Btn').addEventListener('click', () => this.setForecastDays(7));
    this.$('fc14Btn').addEventListener('click', () => this.setForecastDays(14));
    this.updateForecastTabs();

    this.$('h24Btn').addEventListener('click', () => this.setHourlyRange(false));
    this.$('hAllBtn').addEventListener('click', () => this.setHourlyRange(true));
    this.updateHourlyTabs();
    UI.setHourlyRange(this.hourlyAll);

    this.$('chartTempBtn').addEventListener('click', () => this.setChartMode('temp'));
    this.$('chartRainBtn').addEventListener('click', () => this.setChartMode('rain'));
    this.$('chartWindBtn').addEventListener('click', () => this.setChartMode('wind'));
    this.$('chartHumidityBtn').addEventListener('click', () => this.setChartMode('humidity'));
    this.$('chartCloudBtn').addEventListener('click', () => this.setChartMode('cloud'));
    this.$('chartPressureBtn').addEventListener('click', () => this.setChartMode('pressure'));
    this.$('chartSolarBtn').addEventListener('click', () => this.setChartMode('solar'));
    UI.setChartMode(this.chartMode);

    this.$('locationBtn').addEventListener('click', () => this.useLocation());
    this.$('themeToggle').addEventListener('click', () => {
      UI.toggleTheme();
      this.updateDynamicText();
    });

    if (Utils.safeGet('dynamicText') === 'on') {
      document.body.classList.add('dynamic-text');
      requestAnimationFrame(() => this.updateDynamicText());
    }

    this.$('helpToggle').addEventListener('click', () => this.toggleInstructions(true));
    this.$('helpClose').addEventListener('click', () => this.toggleInstructions(false));

    this.$('installDismiss').addEventListener('click', () => {
      this.$('installBanner').classList.add('hidden');
    });

    this.$('clearDataBtn').addEventListener('click', async () => {
      if (!window.confirm('Erase all local data and cached forecasts?')) return;
      const keys = ['units', 'windUnit', 'visUnit', 'pressUnit', 'forecastDays', 'hourlyAll', 'chartMode', 'dynamicText', 'theme', 'lastCity', 'lastCountry', 'lastLat', 'lastLon', 'weatherCache'];
      keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      if (window.caches) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((k) => window.caches.delete(k)));
        } catch (e) {}
      }
      window.location.reload();
    });

    this.$('installBtn').addEventListener('click', () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt().catch(() => {});
        this.deferredPrompt.userChoice
          .then(() => {
            this.deferredPrompt = null;
            this.$('installBanner').classList.add('hidden');
          })
.catch((e) => { console.debug('Install prompt failed:', e); });
      }
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.$('installBanner').classList.remove('hidden');
    });

    window.addEventListener('online', () => UI.markOffline(false));
    window.addEventListener('offline', () => UI.markOffline(true));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideDropdown();
        this.closeUnitsMenu();
        this.toggleInstructions(false);
      }
    });

    window.addEventListener('resize', Utils.debounce(() => {
      if (!this._last) return;
      UI.renderHourlyChart(this._last.weather.hourly, this._last.units);
      UI._updateChartHint();
      UI._updateHourlyScroll();
      if (this._last.lat != null && this._last.lon != null) {
        UI.renderWindCompass(this._last.lat, this._last.lon, UI._compassWindLabel || '', UI._compassWindDir, UI._compassGustLabel || '', UI._compassDayMaxLabel || '');
      }
    }, 250));

    if (Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
      const name = this.lastCity || CONFIG.DEFAULT_CITY;
      this.loadWeather(this.lastLat, this.lastLon, name, this.lastCountry || '', name).catch((e) => { console.debug('Background load failed:', e); });
    } else if (this.lastCity) {
      this.searchCity(this.lastCity).catch((e) => { console.debug('Background load failed:', e); });
    } else {
      const cached = Utils.loadWeatherCache();
      if (cached && cached.weather) {
        this.units = cached.units || this.units;
        Utils.safeSet('units', this.units);
        UI.setUnitLabel(this.units);
        UI.markOffline(!navigator.onLine);
        UI.renderWeather(cached.weather, cached.aq || null, this.units, cached.name, cached.country, cached.lat, cached.lon, this.forecastDays);
        this._last = { weather: cached.weather, aq: cached.aq || null, units: this.units, name: cached.name, country: cached.country || '', lat: cached.lat, lon: cached.lon, forecastDays: this.forecastDays };
        const ageMs = cached.savedAt ? Date.now() - cached.savedAt : 0;
        const ageHrs = Math.floor(ageMs / (60 * 60 * 1000));
        if (ageHrs >= 6) {
          UI.markStale(true, `Forecast data is ${ageHrs}h old. Pull to refresh.`);
        }
      } else if (CONFIG.DEFAULT_CITY) {
        this.searchCity(CONFIG.DEFAULT_CITY).catch((e) => { console.debug('Default city load failed:', e); });
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => { console.debug('SW registration failed:', e); });
    }

    this.startAutoRefresh();
  },

  dismissSplash() {
    const el = this.$('splash');
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => { el.classList.add('hidden'); }, 520);
  },

  startAutoRefresh() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => this.refreshSilently(), 30 * 60 * 1000);
  },

  updateDynamicText() {
    document.body.classList.remove('auto-dark', 'auto-light');
    if (!document.body.classList.contains('dynamic-text')) return;
    const cs = getComputedStyle(document.body);
    const bg = cs.getPropertyValue('--color-bg-start').trim();
    if (!bg) return;
    const hex = bg.replace('#', '');
    if (hex.length < 6) return;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    document.body.classList.add(luminance > 0.55 ? 'auto-dark' : 'auto-light');
  },

  async refreshSilently() {
    if (!Number.isFinite(this.lastLat) || !Number.isFinite(this.lastLon)) return;
    if (!navigator.onLine) return;
    const seq = ++this._weatherSeq;
    const lat = this.lastLat;
    const lon = this.lastLon;
    const units = this.units;
    const windUnit = this.windUnit;
    const forecastDays = this.forecastDays;
    const city = this.lastCity || 'Current Location';
    const country = this.lastCountry || '';
    try {
      const [weather, aq] = await Promise.all([
        API.getWeather(lat, lon, units, windUnit, forecastDays),
        API.getAirQuality(lat, lon).catch(() => null),
      ]);
      if (seq !== this._weatherSeq) return;
      if (!weather) return;
      UI.renderWeather(weather, aq, units, city, country, lat, lon, forecastDays);
      this._last = { weather, aq, units, name: city, country, lat, lon, forecastDays };
      Utils.saveWeatherCache({ savedAt: Date.now(), units, name: city, country, lat, lon, weather, aq });
    } catch (e) {
      /* silent background refresh; keep existing data on failure */
    }
  },

  async showDropdown(query) {
    const seq = ++this._searchSeq;
    try {
      const results = await API.searchCities(query);
      if (seq !== this._searchSeq) return;
      this.dropdownResults = results;
      this.dropdownIndex = -1;
      if (this.dropdownResults.length) {
        this.showDropdownList();
      } else {
        this.hideDropdown();
      }
    } catch {
      if (seq === this._searchSeq) this.hideDropdown();
    }
  },

  showDropdownList() {
    const dd = this.$('searchDropdown');
    dd.innerHTML = this.dropdownResults.map((r, i) => {
      const region = [r.admin1, r.country].filter(Boolean).join(', ');
      const active = i === this.dropdownIndex;
      return `<div class="search-dropdown__item${active ? ' search-dropdown__item--active' : ''}"
                   role="option" id="suggest-${i}" data-index="${i}"
                   aria-selected="${active}">
        <span class="search-dropdown__item-name">${UI._esc(r.name)}</span>
        <span class="search-dropdown__item-region">${UI._esc(region)}</span>
      </div>`;
    }).join('');

    dd.querySelectorAll('.search-dropdown__item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.index);
        this.selectDropdown(idx);
      });
    });

    dd.classList.remove('hidden');
    this.setComboboxState();
  },

  setComboboxState() {
    const input = this.$('searchInput');
    const dd = this.$('searchDropdown');
    const open = !dd.classList.contains('hidden') && this.dropdownResults.length > 0;
    input.setAttribute('aria-expanded', open);
    if (this.dropdownIndex >= 0 && this.dropdownResults[this.dropdownIndex]) {
      input.setAttribute('aria-activedescendant', `suggest-${this.dropdownIndex}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  },

  selectDropdown(idx) {
    const r = this.dropdownResults[idx];
    if (!r) return;
    const displayName = r.name || 'Location';
    this.$('searchInput').value = displayName;
    this.hideDropdown();
    this.loadWeather(r.lat, r.lon, displayName, r.country, displayName).catch((e) => { console.debug('Background load failed:', e); });
  },

  hideDropdown() {
    if (this._blurTimer) { clearTimeout(this._blurTimer); this._blurTimer = null; }
    this.$('searchDropdown').classList.add('hidden');
    this.dropdownResults = [];
    this.dropdownIndex = -1;
    this.setComboboxState();
  },

  handleDropdownKeys(e) {
    const dd = this.$('searchDropdown');
    if (dd.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.dropdownIndex = Math.min(this.dropdownIndex + 1, this.dropdownResults.length - 1);
      this.updateDropdownHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.dropdownIndex = Math.max(this.dropdownIndex - 1, -1);
      this.updateDropdownHighlight();
    } else if (e.key === 'Enter' && this.dropdownIndex >= 0) {
      e.preventDefault();
      this.selectDropdown(this.dropdownIndex);
    } else if (e.key === 'Escape') {
      this.hideDropdown();
    }
  },

  updateDropdownHighlight() {
    const items = this.$('searchDropdown').querySelectorAll('.search-dropdown__item');
    items.forEach((el, i) => {
      const active = i === this.dropdownIndex;
      el.classList.toggle('search-dropdown__item--active', active);
      el.setAttribute('aria-selected', active);
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
    this.setComboboxState();
  },

  async searchCity(city) {
    const seq = ++this._weatherSeq;
    UI.showLoading();
    try {
      const results = await API.searchCities(city);
      if (seq !== this._weatherSeq) return;
      if (!results.length) throw new Error('City not found. Check the spelling.');
      const geo = results[0];
      await this.loadWeather(geo.lat, geo.lon, geo.name, geo.country, geo.name);
    } catch (err) {
      if (seq !== this._weatherSeq) return;
      const cached = Utils.loadWeatherCache();
      if (cached && cached.weather && !navigator.onLine) {
        UI.markOffline(true);
        const ageMs = cached.savedAt ? Date.now() - cached.savedAt : 0;
        const ageHrs = Math.floor(ageMs / (60 * 60 * 1000));
        if (ageHrs >= 6) UI.markStale(true, `Forecast data is ${ageHrs}h old.`);
        this.lastCity = cached.name;
        this.lastCountry = cached.country || '';
        this.lastLat = cached.lat;
        this.lastLon = cached.lon;
        Utils.safeSet('lastCity', cached.name);
        Utils.safeSet('lastCountry', cached.country || '');
        Utils.safeSet('lastLat', cached.lat);
        Utils.safeSet('lastLon', cached.lon);
        UI.renderWeather(cached.weather, cached.aq || null, this.units, cached.name, cached.country, cached.lat, cached.lon, this.forecastDays);
        this._last = { weather: cached.weather, aq: cached.aq || null, units: this.units, name: cached.name, country: cached.country || '', lat: cached.lat, lon: cached.lon, forecastDays: this.forecastDays };
      } else {
        UI.showError(err && err.message ? err.message : 'Something went wrong.');
      }
    }
  },

  reloadCurrent() {
    if (Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
      const name = this.lastCity || 'Current Location';
      this.loadWeather(this.lastLat, this.lastLon, name, this.lastCountry || '', name).catch((e) => { console.debug('Background load failed:', e); });
    } else if (this.lastCity) {
      this.searchCity(this.lastCity).catch((e) => { console.debug('Background load failed:', e); });
    }
  },

  setForecastDays(days) {
    if (this.forecastDays === days) return;
    this.forecastDays = days;
    Utils.safeSet('forecastDays', days);
    this.updateForecastTabs();
    this.reloadCurrent();
  },

  updateForecastTabs() {
    const is14 = this.forecastDays === 14;
    const btn7 = this.$('fc7Btn');
    const btn14 = this.$('fc14Btn');
    if (!btn7 || !btn14) return;
    btn7.classList.toggle('is-active', !is14);
    btn14.classList.toggle('is-active', is14);
    btn7.setAttribute('aria-selected', String(!is14));
    btn14.setAttribute('aria-selected', String(is14));
  },

  setHourlyRange(all) {
    if (this.hourlyAll === all) return;
    this.hourlyAll = all;
    Utils.safeSet('hourlyAll', all ? '1' : '');
    this.updateHourlyTabs();
    UI.setHourlyRange(all);
    if (this._last && this._last.weather) {
      UI.renderHourly(this._last.weather.hourly, this.units);
      UI.renderHourlyChart(this._last.weather.hourly, this.units);
    }
  },

  updateHourlyTabs() {
    const btn24 = this.$('h24Btn');
    const btnAll = this.$('hAllBtn');
    if (!btn24 || !btnAll) return;
    btn24.classList.toggle('is-active', !this.hourlyAll);
    btnAll.classList.toggle('is-active', this.hourlyAll);
    btn24.setAttribute('aria-selected', String(!this.hourlyAll));
    btnAll.setAttribute('aria-selected', String(this.hourlyAll));
  },

  setChartMode(mode) {
    if (!['temp', 'rain', 'wind', 'humidity', 'cloud', 'pressure', 'solar'].includes(mode)) return;
    if (this.chartMode === mode) return;
    this.chartMode = mode;
    Utils.safeSet('chartMode', mode);
    UI.setChartMode(mode);
    if (this._last && this._last.weather) {
      UI.renderHourlyChart(this._last.weather.hourly, this.units);
    }
  },

  async loadWeather(lat, lon, name, country, cityKey) {
    const seq = ++this._weatherSeq;
    UI.showLoading();
    let weather;
    let aq = null;
    try {
      [weather, aq] = await Promise.all([
        API.getWeather(lat, lon, this.units, this.windUnit, this.forecastDays),
        API.getAirQuality(lat, lon).catch(() => null),
      ]);
    } catch (err) {
      if (seq !== this._weatherSeq) return;
      const cached = Utils.loadWeatherCache();
      if (cached && cached.weather) {
        weather = cached.weather;
        aq = cached.aq || null;
        name = cached.name || name;
        country = cached.country || country;
        UI.markOffline(!navigator.onLine);
        const ageMs = cached.savedAt ? Date.now() - cached.savedAt : 0;
        const ageHrs = Math.floor(ageMs / (60 * 60 * 1000));
        if (ageHrs >= 6) UI.markStale(true, `Forecast data is ${ageHrs}h old.`);

        try {
          UI.renderWeather(weather, aq, this.units, name, country, cached.lat, cached.lon, this.forecastDays);
          this._last = { weather, aq, units: this.units, name, country, lat: cached.lat, lon: cached.lon, forecastDays: this.forecastDays };
          if (Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
            this.lastCity = name;
            this.lastCountry = country;
            this.lastLat = cached.lat;
            this.lastLon = cached.lon;
            Utils.safeSet('lastCity', name);
            Utils.safeSet('lastCountry', country);
            Utils.safeSet('lastLat', cached.lat);
            Utils.safeSet('lastLon', cached.lon);
          }
        } catch (renderErr) {
          UI.showError('Something went wrong.');
        }
        return;
      } else {
        UI.showError(err && err.message ? err.message : 'Something went wrong.');
        return;
      }
    }

    if (seq !== this._weatherSeq) return;

    try {
      UI.renderWeather(weather, aq, this.units, name, country, lat, lon, this.forecastDays);
      this._last = { weather, aq, units: this.units, name, country, lat, lon, forecastDays: this.forecastDays };
      this.lastCity = cityKey;
      this.lastCountry = country;
      this.lastLat = lat;
      this.lastLon = lon;
      Utils.safeSet('lastCity', cityKey);
      Utils.safeSet('lastCountry', country);
      Utils.safeSet('lastLat', lat);
      Utils.safeSet('lastLon', lon);
      Utils.saveWeatherCache({ savedAt: Date.now(), units: this.units, name, country, lat, lon, weather, aq });
    } catch (renderErr) {
      UI.showError('Something went wrong.');
    }
  },

  async useLocation() {
    const seq = ++this._weatherSeq;
    if (!navigator.geolocation) {
      UI.showError('Geolocation is not supported by your browser.');
      return;
    }

    UI.showLoading();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          if (seq !== this._weatherSeq) return;
          await this.loadWeather(lat, lon, 'Current Location', '', 'Current Location');
        } catch (err) {
          if (seq === this._weatherSeq) UI.showError(err && err.message ? err.message : 'Something went wrong.');
        }
      },
      (err) => {
        if (seq !== this._weatherSeq) return;
        const timedOut = err && err.code === 3;
        UI.showError(timedOut
          ? 'Location request timed out. Please search for a city.'
          : 'Location access denied. Please search for a city.');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  },

  $(id) {
    return document.getElementById(id);
  },

  toggleInstructions(show) {
    const panel = this.$('instructions');
    const btn = this.$('helpToggle');
    if (!panel) return;
    const open = show != null ? show : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
  },

  toggleUnitsMenu() {
    const dd = this.$('unitsDropdown');
    const btn = this.$('unitMenuBtn');
    if (!dd) return;
    const open = dd.classList.contains('hidden');
    dd.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  },

  closeUnitsMenu() {
    const dd = this.$('unitsDropdown');
    const btn = this.$('unitMenuBtn');
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    App.init();
  } catch (e) {
    console.debug('Init failed:', e);
  }
});
