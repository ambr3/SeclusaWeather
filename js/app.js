const App = {
  units: Utils.safeGet('units', null) || CONFIG.DEFAULT_UNITS,
  windUnit: Utils.safeGet('windUnit', null) || (Utils.safeGet('units', null) === 'imperial' ? 'mph' : 'kmh'),
  visUnit: Utils.safeGet('visUnit', null) || 'km',
  pressUnit: (Utils.safeGet('pressUnit', null) === 'inHg' ? 'inHg' : 'hPa'),
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

    this.$('h24Btn').addEventListener('click', () => this.setHourlyRange(false));
    this.$('hAllBtn').addEventListener('click', () => this.setHourlyRange(true));
    this.updateHourlyTabs();
    UI.setHourlyRange(this.hourlyAll);
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
      const keys = ['units', 'windUnit', 'visUnit', 'pressUnit', 'hourlyAll', 'chartMode', 'dynamicText', 'theme', 'lastCity', 'lastCountry', 'lastLat', 'lastLon', 'weatherCache'];
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

    this.$('staleNotice').addEventListener('click', () => {
      if (navigator.onLine) this.reloadCurrent();
    });
    this.$('offlineNotice').addEventListener('click', () => {
      if (navigator.onLine) this.reloadCurrent();
    });
    this.$('refreshBtn').addEventListener('click', () => {
      if (navigator.onLine) {
        this.reloadCurrent();
      } else {
        UI.showError('You are offline — check your connection to refresh.');
      }
    });

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
      UI._updateHourlyScroll();
      if (this._last.lat != null && this._last.lon != null) {
        UI.renderWindCompass(this._last.lat, this._last.lon, UI._compassWindLabel || '', UI._compassWindDir, UI._compassGustLabel || '', UI._compassTodayWind || '');
      }
    }, 250));

    const cached = Utils.loadWeatherCache();
    if (cached && cached.weather) {
      const lat = Number.isFinite(this.lastLat) ? this.lastLat : (Number.isFinite(cached.lat) ? cached.lat : null);
      const lon = Number.isFinite(this.lastLon) ? this.lastLon : (Number.isFinite(cached.lon) ? cached.lon : null);
      const name = this.lastCity || cached.name || 'Location';
      const country = this.lastCountry || cached.country || '';
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.lastLat = lat;
        this.lastLon = lon;
      }
      if (name) this.lastCity = name;
      if (country) this.lastCountry = country;
      this.units = cached.units || this.units;
      Utils.safeSet('units', this.units);
      UI.setUnitLabel(this.units);
      if (cached.windUnit) {
        this.windUnit = cached.windUnit;
        Utils.safeSet('windUnit', cached.windUnit);
        UI.setWindUnitLabel(cached.windUnit);
      }
      UI.renderWeather(cached.weather, cached.aq || null, this.units, name, country, lat, lon);
      this._last = { weather: cached.weather, aq: cached.aq || null, units: this.units, name, country, lat, lon };
      UI.setUpdatedAt(cached.savedAt);
      UI.markOffline(!navigator.onLine);
    }

    if (navigator.onLine) {
      this.startAutoRefresh();
      if (Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
        this.refreshSilently();
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => { console.debug('SW registration failed:', e); });
    }

    this._bindPullToRefresh();
  },

  dismissSplash() {
    const el = this.$('splash');
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => { el.classList.add('hidden'); }, 520);
  },

  startAutoRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this.refreshSilently(), 30 * 60 * 1000);
  },

  _bindPullToRefresh() {
    if (!('ontouchstart' in window)) return;
    const PULL_DIST_PROGRESS = 80;
    const PULL_DIST_MAX = 130;
    const TRIGGER = 70;
    const start = { y: null, x: null };
    let pulling = false;
    let dist = 0;

    const resetTracking = () => { start.y = null; start.x = null; pulling = false; dist = 0; };

    document.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('has-modal')) return;
      if (window.scrollY > 0) return;
      const t = e.touches[0];
      if (!t) return;
      start.y = t.clientY;
      start.x = t.clientX;
      pulling = false;
      dist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (start.y == null) return;
      const t = e.touches[0];
      if (!t) return;
      if (window.scrollY > 0) { resetTracking(); return; }
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!pulling) {
        if (dy <= 6) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) { resetTracking(); return; }
        pulling = true;
      }
      e.preventDefault();
      dist = Math.min(PULL_DIST_MAX, PULL_DIST_PROGRESS * (1 - Math.exp(-dy / PULL_DIST_PROGRESS)));
      this._updatePullIndicator(dist, TRIGGER);
    }, { passive: false });

    const finish = () => {
      if (start.y == null) return;
      const triggered = pulling && dist >= TRIGGER;
      resetTracking();
      this._resetPullIndicator();
      if (!triggered) return;
      if (navigator.onLine) {
        this.reloadCurrent();
      } else {
        UI.showError('You are offline — check your connection to refresh.');
      }
    };

    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', finish, { passive: true });
  },

  _updatePullIndicator(dist, triggerAt) {
    const el = this.$('ptrIndicator');
    if (!el) return;
    el.style.transform = `translateY(${Math.max(0, dist - 44)}px)`;
    const label = el.querySelector('.ptr-indicator__label');
    if (label) label.textContent = dist >= triggerAt ? 'Release to refresh' : 'Pull to refresh';
  },

  _resetPullIndicator() {
    const el = this.$('ptrIndicator');
    if (!el) return;
    el.style.transform = '';
    const label = el.querySelector('.ptr-indicator__label');
    if (label) label.textContent = 'Pull to refresh';
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
    const city = this.lastCity || 'Current Location';
    const country = this.lastCountry || '';
    try {
      const [weather, aq] = await Promise.all([
        API.getWeather(lat, lon, units, windUnit),
        API.getAirQuality(lat, lon).catch(() => null),
      ]);
      if (seq !== this._weatherSeq) return;
      if (!weather) return;
      UI.renderWeather(weather, aq, units, city, country, lat, lon);
      this._last = { weather, aq, units, name: city, country, lat, lon };
      UI.setUpdatedAt(Date.now());
      Utils.saveWeatherCache({ savedAt: Date.now(), units, windUnit, name: city, country, lat, lon, weather, aq });
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
        const cacheUnits = cached.units || this.units;
        const cacheWind = cached.windUnit || this.windUnit;
        this.units = cacheUnits;
        this.windUnit = cacheWind;
        Utils.safeSet('units', cacheUnits);
        Utils.safeSet('windUnit', cacheWind);
        UI.setUnitLabel(cacheUnits);
        UI.setWindUnitLabel(cacheWind);
        UI.renderWeather(cached.weather, cached.aq || null, cacheUnits, cached.name, cached.country, cached.lat, cached.lon);
        this._last = { weather: cached.weather, aq: cached.aq || null, units: cacheUnits, name: cached.name, country: cached.country || '', lat: cached.lat, lon: cached.lon };
        UI.setUpdatedAt(cached.savedAt);
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

  async loadWeather(lat, lon, name, country, cityKey) {
    const seq = ++this._weatherSeq;
    UI.showLoading();
    let weather;
    let aq = null;
    try {
      [weather, aq] = await Promise.all([
        API.getWeather(lat, lon, this.units, this.windUnit),
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
          const cacheUnits = cached.units || this.units;
          const cacheWind = cached.windUnit || this.windUnit;
          this.units = cacheUnits;
          this.windUnit = cacheWind;
          Utils.safeSet('units', cacheUnits);
          Utils.safeSet('windUnit', cacheWind);
          UI.setUnitLabel(cacheUnits);
          UI.setWindUnitLabel(cacheWind);
          UI.renderWeather(weather, aq, cacheUnits, name, country, cached.lat, cached.lon);
          this._last = { weather, aq, units: cacheUnits, name, country, lat: cached.lat, lon: cached.lon };
          UI.setUpdatedAt(cached.savedAt);
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
      UI.renderWeather(weather, aq, this.units, name, country, lat, lon);
      this._last = { weather, aq, units: this.units, name, country, lat, lon };
      this.lastCity = cityKey;
      this.lastCountry = country;
      this.lastLat = lat;
      this.lastLon = lon;
      UI.setUpdatedAt(Date.now());
      Utils.safeSet('lastCity', cityKey);
      Utils.safeSet('lastCountry', country);
      Utils.safeSet('lastLat', lat);
      Utils.safeSet('lastLon', lon);
      Utils.saveWeatherCache({ savedAt: Date.now(), units: this.units, windUnit: this.windUnit, name, country, lat, lon, weather, aq });
      this.startAutoRefresh();
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
