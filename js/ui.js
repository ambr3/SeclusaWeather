const UI = {
  $: (id) => document.getElementById(id),

  _chartMode: 'temp',
  _measureCanvas: null,
  _measureCtx: null,
  _hourly: null,
  _hourlyStart: 0,
  _hourlyCount: 0,
  _forecastDaily: null,
  _forecastCount: 0,
  _forecastUnits: 'metric',
  _forecastHourly: null,
  _modalUnits: 'metric',
  _modalMode: 'hourly',
  _modalCount: 0,
  _modalIndex: null,
  _modalOpen: false,
  _modalSlideDir: 0,
  _tz: null,
  _hourlyModalBound: false,
  _modalKeyHandler: null,
  _chartSwipeBound: false,
  _current: null,
  CHART_MODES: ['temp', 'rain', 'solar'],

  _getMeasureCtx() {
    if (!this._measureCanvas) {
      this._measureCanvas = document.createElement('canvas');
      this._measureCtx = this._measureCanvas.getContext('2d');
    }
    this._measureCtx.font = '600 18px system-ui, sans-serif';
    return this._measureCtx;
  },

  // Full-orbit around Earth. Rise = left, day = top, set = right, night = bottom.
  // Night only flips the disc paint (dark on top) — orb path direction stays the same.
  _orbitFor(rise, set, tz, radius) {
    if (!rise || !set) return null;
    const r = Utils.parseLocal(rise, tz).getTime();
    let s = Utils.parseLocal(set, tz).getTime();
    if (isNaN(r) || isNaN(s)) return null;
    if (s <= r) {
      // Set falls on the next local day — advance by one local day so DST
      // transitions don't skew the path (offset delta between the two days).
      const offNow = Utils.tzOffsetMs(tz, s);
      const offNext = Utils.tzOffsetMs(tz, s + 24 * 60 * 60 * 1000);
      s += 24 * 60 * 60 * 1000 + (offNow - offNext);
    }
    const dayDur = s - r;
    if (dayDur > 26 * 60 * 60 * 1000 || dayDur <= 0) return null;

    const offRise = Utils.tzOffsetMs(tz, r);
    const offNext = Utils.tzOffsetMs(tz, r + 24 * 60 * 60 * 1000);
    const nextRise = r + 24 * 60 * 60 * 1000 + (offRise - offNext);
    const nightDur = Math.max(1, nextRise - s);
    const cycle = nextRise - r;

    let now = Date.now();
    if (now < r) now += Math.ceil((r - now) / cycle) * cycle;
    if (now >= nextRise) now -= Math.floor((now - r) / cycle) * cycle;

    let angle;
    let below;
    if (now <= s) {
      const f = Math.max(0, Math.min(1, (now - r) / dayDur));
      angle = Math.PI * (1 - f);
      below = false;
    } else {
      const f = Math.max(0, Math.min(1, (now - s) / nightDur));
      angle = -Math.PI * f;
      below = true;
    }

    const cx = 50;
    const cy = 50;
    const rad = radius != null ? radius : 40;
    return {
      left: +(cx + rad * Math.cos(angle)).toFixed(2),
      top: +(cy - rad * Math.sin(angle)).toFixed(2),
      angle,
      deg: +((-angle * 180) / Math.PI).toFixed(2),
      below,
    };
  },

  // True while the sun is above the horizon (rise→set). Null if times missing.
  _sunIsUp(sunrise, sunset, tz) {
    const orb = this._orbitFor(sunrise, sunset, tz, 1);
    if (!orb) return null;
    return !orb.below;
  },

  _THEME_CLASSES: [
    'theme-clear', 'theme-clear-night',
    'theme-clouds', 'theme-clouds-night', 'theme-rain', 'theme-rain-night',
    'theme-snow', 'theme-snow-night', 'theme-thunder', 'theme-thunder-night',
    'theme-drizzle', 'theme-drizzle-night', 'theme-mist', 'theme-mist-night',
  ],

  _THEME_COLORS: {
    'theme-clear': '#2e7cf0', 'theme-clear-night': '#14204e',
    'theme-clouds': '#3f79c6', 'theme-rain': '#465369',
    'theme-snow': '#b7cbe0', 'theme-thunder': '#101633',
    'theme-drizzle': '#55677e', 'theme-mist': '#8295aa',
    'theme-clouds-night': '#2a3f66', 'theme-rain-night': '#1e3a5c',
    'theme-snow-night': '#33486b', 'theme-thunder-night': '#1a2040',
    'theme-drizzle-night': '#243d5e', 'theme-mist-night': '#38466b',
  },

  _applyWeatherTheme(weatherCode, isDay) {
    const theme = Utils.getThemeClass(weatherCode, isDay);
    const isDark = document.body.classList.contains('theme-dark');
    const isDyn = document.body.classList.contains('dynamic-text');
    document.body.classList.remove(...this._THEME_CLASSES);
    document.body.classList.add(theme);
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('dynamic-text', isDyn);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this._THEME_COLORS[theme] || '#4facfe';
    return theme;
  },

  _hourlyStartIdx(hourly) {
    if (!hourly || !hourly.time) return 0;
    const now = Date.now();
    for (let i = 0; i < hourly.time.length; i++) {
      if (Utils.parseLocal(hourly.time[i], this._tz).getTime() >= now) return i;
    }
    return hourly.time.length;
  },

  showLoading() {
    this.$('loading').classList.remove('hidden');
    this.$('errorMessage').classList.add('hidden');
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
  },

  hideLoading() {
    this.$('loading').classList.add('hidden');
  },

  showError(msg) {
    this.hideLoading();
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
    const el = this.$('errorMessage');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  hideError() {
    this.$('errorMessage').classList.add('hidden');
  },

  showEmptyStart() {
    this.hideLoading();
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
    const el = this.$('errorMessage');
    el.textContent = 'Search for a city or use your location to see the forecast.';
    el.classList.remove('hidden');
  },

  markOffline(show) {
    const el = this.$('offlineNotice');
    if (el) el.classList.toggle('hidden', !show);
  },

  markStale(show, message) {
    const el = this.$('staleNotice');
    if (el) {
      if (message) this.$('staleNoticeText').textContent = message;
      el.classList.toggle('hidden', !show);
    }
  },

  setUpdatedAt(ts) {
    const el = this.$('lastUpdated');
    const current = this.$('currentUpdated');
    if (!Number.isFinite(ts)) {
      if (el) el.classList.add('hidden');
      return;
    }
    this._dataUpdatedAt = ts;
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / (60 * 1000));
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let label;
    if (mins < 1) label = 'Updated just now';
    else if (mins < 60) label = `Updated ${mins} min ago`;
    else if (mins < 60 * 24) label = `Last refreshed at ${time}`;
    else label = `Last refreshed ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
    if (el) {
      el.textContent = label;
      el.classList.remove('hidden');
    }
    if (current) current.textContent = `Updated ${Utils.formatClock(d)}`;
  },

  // Values for the "Now" tile/modal slot, preferring the live current-weather
  // observation so it stays consistent with the summary card. Rain % is the
  // current-hour probability (only shown when this hour actually has rain or
  // snow expected), never the whole-day maximum.
  _nowFromCurrent(cur, hourly, units) {
    if (!cur) return null;
    const startIdx = this._hourlyStartIdx(hourly);
    const pop = this._meaningfulNowPop(cur, hourly, startIdx);
    return {
      pop,
      temp: cur.temperature_2m != null ? Utils.formatTemp(cur.temperature_2m, units) : null,
      tempRaw: cur.temperature_2m != null ? cur.temperature_2m : null,
      feels: cur.apparent_temperature != null ? Utils.formatTemp(cur.apparent_temperature, units) : null,
      feelsRaw: cur.apparent_temperature != null ? cur.apparent_temperature : null,
      humidity: cur.relative_humidity_2m != null ? `${Math.round(cur.relative_humidity_2m)}%` : null,
      wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
      windDir: cur.wind_direction_10m != null ? Math.round(cur.wind_direction_10m) : null,
      gust: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null,
      precip: cur.precipitation != null ? cur.precipitation : null,
      snow: cur.snowfall != null ? cur.snowfall : null,
      dew: cur.dew_point_2m != null ? Utils.formatTemp(cur.dew_point_2m, units) : null,
      pressure: cur.pressure_msl != null ? Utils.formatPressure(cur.pressure_msl, UI.pressUnit) : null,
      cloud: cur.cloud_cover != null ? `${Math.round(cur.cloud_cover)}%` : null,
      visibility: cur.visibility != null ? Utils.formatVisibility(cur.visibility, UI.visUnit) : null,
      cape: cur.cape != null ? cur.cape : null,
      code: cur.weather_code != null ? cur.weather_code : null,
      isDay: cur.is_day != null ? cur.is_day : null,
    };
  },

  renderCurrentWeather(data, units) {
    if (!data || !data.current) return;
    const c = data.current;
    const d = data.daily || {};
    const nowStartIdx = this._hourlyStartIdx(data.hourly);
    const nowPop = this._meaningfulNowPop(c, data.hourly, nowStartIdx);
    const todayKey = (d.time && d.time[0]) ? d.time[0] : this._todayDateKey();
    const outlook = this.dayOutlook(todayKey, d, data.hourly, units);
    const dayPop = outlook ? outlook.pop : null;
    const iconCode = WeatherIcons.hourIcon(c.weather_code, nowPop, c.precipitation ?? 0, c.snowfall ?? 0);
    const temp = Utils.formatTemp(c.temperature_2m, units);
    const feels = Utils.formatTemp(c.apparent_temperature, units);
    const desc = Utils.getWeatherDescription(iconCode);

    const sunrise = d.sunrise && d.sunrise[0] ? Utils.formatTimeCompact(d.sunrise[0], this._tz) : '—';
    const sunset = d.sunset && d.sunset[0] ? Utils.formatTimeCompact(d.sunset[0], this._tz) : '—';
    const moonrise = d.moonrise && d.moonrise[0] ? Utils.formatTimeCompact(d.moonrise[0], this._tz) : '—';
    const moonset = d.moonset && d.moonset[0] ? Utils.formatTimeCompact(d.moonset[0], this._tz) : '—';
    const phase = d.moon_phase && d.moon_phase[0] != null ? d.moon_phase[0] : null;
    const phaseName = phase != null ? Utils.getMoonPhaseName(phase) : '';
    const phaseIllum = phase != null ? `${Utils.getMoonIllumination(phase)}% lit` : '';

    const dayHigh = d.temperature_2m_max && d.temperature_2m_max[0] != null ? Utils.formatTemp(d.temperature_2m_max[0], units) : null;
    const dayLow = d.temperature_2m_min && d.temperature_2m_min[0] != null ? Utils.formatTemp(d.temperature_2m_min[0], units) : null;
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const dayWind = c.wind_speed_10m != null ? `${Math.round(c.wind_speed_10m)} ${windUnit}` : null;
    const summaryParts = [];
    if (dayHigh && dayLow) summaryParts.push(`High ${dayHigh} / Low ${dayLow}`);
    if (dayPop != null && dayPop > 0) summaryParts.push(`${dayPop}% rain`);
    if (dayWind) summaryParts.push(`Wind ${dayWind}`);
    const daySummary = summaryParts.length ? summaryParts.join(' · ') : '';

    const SUN_R = 42;
    const MOON_R = 36;
    const sunOrb = this._orbitFor(d.sunrise && d.sunrise[0], d.sunset && d.sunset[0], this._tz, SUN_R);
    const moonOrb = this._orbitFor(d.moonrise && d.moonrise[0], d.moonset && d.moonset[0], this._tz, MOON_R);
    // Night mode follows the sun horizon, not the stale API is_day snapshot.
    const sunUp = sunOrb ? !sunOrb.below : null;
    const isDay = sunUp == null ? (c.is_day === 0 ? 0 : 1) : (sunUp ? 1 : 0);
    const iconLive = WeatherIcons.get(iconCode, isDay);
    this._arc = {
      tz: this._tz,
      sunrise: d.sunrise && d.sunrise[0],
      sunset: d.sunset && d.sunset[0],
      moonrise: d.moonrise && d.moonrise[0],
      moonset: d.moonset && d.moonset[0],
      sunR: SUN_R,
      moonR: MOON_R,
      weatherCode: iconCode,
      isDay,
    };

    this.$('currentWeather').innerHTML = `
      <div class="current-weather__top">
        <div class="current-weather__heading">
          <div class="current-weather__updated" id="currentUpdated">Updated ${Utils.formatClock(new Date(Number.isFinite(this._dataUpdatedAt) ? this._dataUpdatedAt : Date.now()))}</div>
          <div class="current-weather__location">
            ${this._esc(data._cityName)}<span class="current-weather__country">${this._esc(data._country)}</span>
          </div>
          <div class="current-weather__desc">${this._esc(desc)}</div>
        </div>
        <div class="current-weather__icon${isDay === 0 ? ' is-night' : ''}">${iconLive}</div>
      </div>
      <div class="current-weather__temp-row">
        <div class="current-weather__temp">${this._esc(temp)}</div>
        ${daySummary ? `<div class="current-weather__summary">${this._esc(daySummary)}</div>` : ''}
      </div>
      <div class="current-weather__meta">
        <div class="current-weather__feels">Feels like ${this._esc(feels)}</div>
      </div>
      <div class="current-weather__celestial">
        <div class="celestial">
          <div class="celestial__title">Sun</div>
          <div class="celestial__times">
            <div class="celestial__row"><span class="celestial__label">Rise</span><span class="celestial__value">${this._esc(sunrise)}</span></div>
            <div class="celestial__row"><span class="celestial__label">Set</span><span class="celestial__value">${this._esc(sunset)}</span></div>
          </div>
        </div>
        <div class="celestial-divider" aria-hidden="true"></div>
        <div class="celestial">
          <div class="celestial__title">Moon</div>
          <div class="celestial__times">
            <div class="celestial__row"><span class="celestial__label">Rise</span><span class="celestial__value">${this._esc(moonrise)}</span></div>
            <div class="celestial__row"><span class="celestial__label">Set</span><span class="celestial__value">${this._esc(moonset)}</span></div>
          </div>
        </div>
      </div>
    `;

    const daylight = d.daylight_duration && d.daylight_duration[0] != null
      ? Utils.formatDuration(d.daylight_duration[0]) : null;
    const sunshine = d.sunshine_duration && d.sunshine_duration[0] != null
      ? Utils.formatDuration(d.sunshine_duration[0]) : null;
    const uvRaw = d.uv_index_max && d.uv_index_max[0] != null ? d.uv_index_max[0] : null;
    const uvInfo = uvRaw != null ? Utils.getUVLevel(uvRaw) : null;
    const uvLabel = uvRaw != null ? `${Math.round(uvRaw)}${uvInfo ? ` · ${uvInfo.label}` : ''}` : null;
    const solarSum = d.shortwave_radiation_sum && d.shortwave_radiation_sum[0] != null
      ? `${Math.round(d.shortwave_radiation_sum[0] * 10) / 10} MJ/m²` : null;
    const sunStatus = sunOrb ? (sunOrb.below ? 'Below horizon' : 'Above horizon') : null;
    const moonStatus = moonOrb ? (moonOrb.below ? 'Below horizon' : 'Above horizon') : null;
    const phaseLine = [phaseName, phaseIllum].filter(Boolean).join(' · ');
    const sunSpan = (sunrise !== '—' && sunset !== '—')
      ? `${sunrise} → ${sunset}`
      : (sunrise !== '—' ? sunrise : (sunset !== '—' ? sunset : null));
    const moonSpan = (moonrise !== '—' && moonset !== '—')
      ? `${moonrise} → ${moonset}`
      : (moonrise !== '—' ? moonrise : (moonset !== '—' ? moonset : null));

    const row = (label, value, tone = '') => (
      value
        ? `<div class="earth-arc__row${tone ? ` earth-arc__row--${tone}` : ''}"><dt>${this._esc(label)}</dt><dd>${this._esc(value)}</dd></div>`
        : ''
    );
    const panel = (title, rowsHtml, tone = '') => {
      if (!rowsHtml) return '';
      return `
        <section class="earth-arc__panel${tone ? ` earth-arc__panel--${tone}` : ''}">
          <h3 class="earth-arc__group-title">${this._esc(title)}</h3>
          <dl class="earth-arc__list">${rowsHtml}</dl>
        </section>`;
    };

    const sunPanel = panel('Sun', [
      row('Rise–set', sunSpan),
      row('Now', sunStatus),
      row('Daylight', daylight),
      row('Sunshine', sunshine),
      row('UV', uvLabel),
      row('Solar', solarSum),
    ].join(''), 'sun');
    const moonPanel = panel('Moon', [
      row('Phase', phaseLine, 'phase'),
      row('Rise–set', moonSpan),
      row('Now', moonStatus),
    ].join(''), 'moon');

    const clockChanges = Utils.getClockChanges(this._tz);
    let clocksBar = '';
    if (clockChanges) {
      if (clockChanges.observes) {
        clocksBar = `
          <section class="earth-arc__clocks" aria-label="Clock changes for this location">
            <h3 class="earth-arc__group-title">Clocks</h3>
            <dl class="earth-arc__list">
              ${row('Summer', clockChanges.summer)}
              ${row('Winter', clockChanges.winter)}
            </dl>
          </section>`;
      } else {
        clocksBar = `
          <section class="earth-arc__clocks" aria-label="Clock changes for this location">
            <h3 class="earth-arc__group-title">Clocks</h3>
            <p class="earth-arc__clocks-note">No daylight-saving clock changes here.</p>
          </section>`;
      }
    }

    const arcHost = this.$('earthArc');
    const arcSec = this.$('earthArcSection');
    if (arcHost) {
      if (arcSec) arcSec.classList.remove('hidden');
      arcHost.innerHTML = `
      <div class="current-weather__arc" aria-hidden="true">
        <svg class="current-weather__arc-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="earthDayGlow" cx="50%" cy="28%" r="75%">
              <stop offset="0%" stop-color="#d4efff"/>
              <stop offset="28%" stop-color="#5bb4ef"/>
              <stop offset="65%" stop-color="#1a6fbf"/>
              <stop offset="100%" stop-color="#0a3a6e"/>
            </radialGradient>
            <radialGradient id="earthNightGlow" cx="50%" cy="72%" r="75%">
              <stop offset="0%" stop-color="#1a2744"/>
              <stop offset="55%" stop-color="#0a101c"/>
              <stop offset="100%" stop-color="#02050c"/>
            </radialGradient>
            <clipPath id="earthClip">
              <circle cx="50" cy="50" r="26"/>
            </clipPath>
          </defs>
          <circle class="current-weather__orbit current-weather__orbit--sun" cx="50" cy="50" r="${SUN_R}" fill="none"/>
          <circle class="current-weather__orbit current-weather__orbit--moon" cx="50" cy="50" r="${MOON_R}" fill="none"/>
          <g class="current-weather__earth" id="earthDisc">
            <circle cx="50" cy="50" r="28.4" class="current-weather__earth-glow" fill="rgba(110,190,255,0.18)"/>
            <circle cx="50" cy="50" r="27.2" class="current-weather__earth-atm"/>
            <circle cx="50" cy="50" r="26.6" class="current-weather__earth-rim"/>
            <!-- Day half on top by default; rotate 180° at night so dark (+stars) is on top. -->
            <g id="earthHemispheres" clip-path="url(#earthClip)">
              <circle cx="50" cy="50" r="26" fill="url(#earthNightGlow)"/>
              <g id="earthStars" class="current-weather__earth-stars">
                <circle cx="30" cy="62" r="0.42" fill="#fff" opacity="0.75"/>
                <circle cx="38" cy="70" r="0.32" fill="#fff" opacity="0.55"/>
                <circle cx="46" cy="58" r="0.28" fill="#fff" opacity="0.45"/>
                <circle cx="54" cy="74" r="0.38" fill="#fff" opacity="0.7"/>
                <circle cx="62" cy="64" r="0.3" fill="#fff" opacity="0.5"/>
                <circle cx="70" cy="72" r="0.35" fill="#fff" opacity="0.65"/>
                <circle cx="34" cy="78" r="0.25" fill="#fff" opacity="0.4"/>
                <circle cx="58" cy="82" r="0.28" fill="#fff" opacity="0.48"/>
                <circle cx="42" cy="86" r="0.22" fill="#fff" opacity="0.35"/>
                <circle cx="66" cy="56" r="0.26" fill="#fff" opacity="0.42"/>
              </g>
              <g id="earthLitHalf">
                <path d="M24,50 A26,26 0 0 1 76,50 Z" fill="url(#earthDayGlow)"/>
                <path d="M24,50 A26,26 0 0 1 76,50 Z" fill="rgba(255,255,255,0.10)"/>
              </g>
            </g>
            <circle cx="50" cy="50" r="26" class="current-weather__earth-edge" fill="none"/>
          </g>
          <text class="current-weather__orbit-mark current-weather__orbit-mark--soft" id="orbitMarkNoon" x="50" y="9" text-anchor="middle">Day</text>
          <text class="current-weather__orbit-mark current-weather__orbit-mark--soft" id="orbitMarkNight" x="50" y="98" text-anchor="middle">Night</text>
        </svg>
        <div class="current-weather__arc-orb current-weather__arc-sun${sunOrb && sunOrb.below ? ' is-below' : ''}${sunOrb ? '' : ' is-hidden'}">${WeatherIcons._sun()}</div>
        <div class="current-weather__arc-orb current-weather__arc-moon${moonOrb && moonOrb.below ? ' is-below' : ''}${moonOrb ? '' : ' is-hidden'}">${WeatherIcons._moon()}</div>
      </div>
      ${(sunPanel || moonPanel || clocksBar) ? `
      <div class="earth-arc__facts">
        <div class="earth-arc__panels">
          ${sunPanel}${moonPanel}
        </div>
        ${clocksBar}
      </div>` : ''}`;
    }

    this._applyWeatherTheme(iconCode, isDay);
    this._syncEarthOrientation(isDay === 0);
    this._setOrbPositions(sunOrb, moonOrb);
    this.startLiveClock();
  },

  // Night: rotate disc paint so dark (+stars) is on top. Orbit marks and orb
  // coords stay fixed (day top / night bottom) so sun & moon keep the same path.
  _syncEarthOrientation(isNight) {
    const host = this.$('earthArcSection') || this.$('earthArc');
    if (host) host.classList.toggle('earth-arc--night', !!isNight);
    const hemi = document.getElementById('earthHemispheres');
    if (hemi) hemi.setAttribute('transform', isNight ? 'rotate(180 50 50)' : '');
  },

  _setOrbPositions(sun, moon) {
    const parts = [];
    if (sun) parts.push(`--sun-x:${sun.left}%`, `--sun-y:${sun.top}%`);
    if (moon) parts.push(`--moon-x:${moon.left}%`, `--moon-y:${moon.top}%`);
    if (parts.length) Utils.dynCSS.set('orbs', `:root{${parts.join(';')}}`);
  },

  startLiveClock() {
    if (this._liveClockTimer) clearInterval(this._liveClockTimer);
    this.updateLiveClock();
    this._liveClockTimer = setInterval(() => this.updateLiveClock(), 60000);
  },

  updateLiveClock() {
    if (!this._arc) return;
    const { tz, sunrise, sunset, moonrise, moonset, sunR, moonR, weatherCode } = this._arc;
    const sun = this._orbitFor(sunrise, sunset, tz, sunR);
    const moon = this._orbitFor(moonrise, moonset, tz, moonR);
    const sunEl = document.querySelector('.current-weather__arc-sun');
    const moonEl = document.querySelector('.current-weather__arc-moon');
    if (sunEl && sun) {
      sunEl.classList.remove('is-hidden');
      sunEl.classList.toggle('is-below', !!sun.below);
    } else if (sunEl) {
      sunEl.classList.add('is-hidden');
    }
    if (moonEl && moon) {
      moonEl.classList.remove('is-hidden');
      moonEl.classList.toggle('is-below', !!moon.below);
    } else if (moonEl) {
      moonEl.classList.add('is-hidden');
    }
    this._setOrbPositions(sun, moon);
    this._syncEarthOrientation(!!(sun && sun.below));
    // Flip day/night theme when the sun crosses the horizon.
    if (sun && weatherCode != null) {
      const isDay = sun.below ? 0 : 1;
      if (this._arc.isDay !== isDay) {
        this._arc.isDay = isDay;
        this._applyWeatherTheme(weatherCode, isDay);
        const iconEl = document.querySelector('.current-weather__icon');
        if (iconEl) {
          iconEl.classList.toggle('is-night', isDay === 0);
          iconEl.innerHTML = WeatherIcons.get(weatherCode, isDay);
        }
      }
    }
  },

  renderDetailBoxes(data, aq, units) {
    this._lastWeather = data;
    this._lastAQ = aq;
    this._lastUnits = units;
    const container = this.$('detailGrid');
    if (!container || !data || !data.current) return;

    const c = data.current;
    const d = data.daily || {};

    const boxes = [];

    const precipNow = Utils.formatPrecip(c.precipitation, units) || (units === 'imperial' ? '0 in' : '0 mm');
    const popToday = (d.time && d.time[0])
      ? (this.dayOutlook(d.time[0], d, data.hourly, units)?.pop ?? null)
      : null;
    const rainToday = d.rain_sum && d.rain_sum[0] != null ? Math.round(d.rain_sum[0] * 10) / 10 : null;
    const snowToday = d.snowfall_sum && d.snowfall_sum[0] != null ? d.snowfall_sum[0] : null;
    const precipSub = [];
    if (popToday != null) precipSub.push(`${popToday}% chance today`);
    const snowLabel = Utils.formatSnow(snowToday, units);
    if (snowLabel) precipSub.push(`${snowLabel} snow`);
    if (rainToday > 0) precipSub.push(`${Utils.formatPrecip(rainToday, units)} rain`);

    const uv = d.uv_index_max && d.uv_index_max[0] != null ? d.uv_index_max[0] : null;
    const uvClear = d.uv_index_clear_sky_max && d.uv_index_clear_sky_max[0] != null ? d.uv_index_clear_sky_max[0] : null;
    const uvInfo = uv != null ? Utils.getUVLevel(uv) : null;

    const humidity = c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null;
    const pressure = c.surface_pressure != null ? Math.round(c.surface_pressure) : null;
    const pressureMsl = c.pressure_msl != null ? Math.round(c.pressure_msl) : null;
    const dewPoint = c.dew_point_2m != null ? Utils.formatTemp(c.dew_point_2m, units) : '—';

    const conditions = [
      { label: 'Precip', icon: this._metricIcon('precip'), value: precipNow, sub: precipSub.length ? precipSub.join(' · ') : 'Dry today' },
      { label: 'Humidity', icon: this._metricIcon('humidity'), value: humidity != null ? `${humidity}%` : '—', sub: `Dew point ${dewPoint}` },
      { label: 'UV Index', icon: this._metricIcon('uv'), value: uv != null ? `<span class="uv-badge tone-${uvInfo.tone}">${Math.round(uv)}</span>` : '—', sub: uv != null ? `${uvInfo.label}${uvClear != null ? ` · clear sky ${Math.round(uvClear)}` : ''}` : 'Not available' },
      { label: 'Visibility', icon: this._metricIcon('visibility'), value: Utils.formatVisibility(c.visibility, UI.visUnit), sub: 'Current visibility' },
      { label: 'Pressure', icon: this._metricIcon('pressure'), value: pressureMsl != null ? Utils.formatPressure(pressureMsl, UI.pressUnit) : pressure != null ? Utils.formatPressure(pressure, UI.pressUnit) : '—', sub: pressureMsl != null && pressure != null ? `MSL ${Utils.formatPressure(pressureMsl, UI.pressUnit)} · Surface ${Utils.formatPressure(pressure, UI.pressUnit)}` : 'Atmospheric pressure · tap to toggle', id: 'pressureBox' },
    ];

    const cape = c.cape != null ? Math.round(c.cape) : null;
    if (cape != null) {
      let capeInfo;
      if (cape < 300) capeInfo = { label: 'None', tone: 'good', desc: 'Stable air, no thunderstorms' };
      else if (cape < 1000) capeInfo = { label: 'Low', tone: 'good', desc: 'Weak thunderstorm potential' };
      else if (cape < 2000) capeInfo = { label: 'Moderate', tone: 'moderate', desc: 'Thunderstorms possible' };
      else if (cape < 3000) capeInfo = { label: 'High', tone: 'high', desc: 'Strong storms likely' };
      else capeInfo = { label: 'Extreme', tone: 'extreme', desc: 'Severe storms expected' };
      conditions.push({ label: 'Thunderstorm risk', icon: this._metricIcon('bolt'), value: `<span class="tone-${capeInfo.tone}">${capeInfo.label}</span>`, sub: capeInfo.desc });
    }

    const aqC = aq && aq.current;
    let aqiBlock = `
      <div class="conditions-item conditions-item--wide conditions-item--empty">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('aqi')}</span>Air Quality</span>
        <span class="conditions-item__sub">Not available</span>
      </div>
    `;
    if (aqC) {
      const isEU = aqC.european_aqi != null;
      const rawAqi = isEU ? aqC.european_aqi : aqC.us_aqi;
      const aqi = rawAqi != null ? Math.round(Number(rawAqi)) : null;
      const aqLevel = aqi != null && Number.isFinite(aqi) ? Utils.getAQILevel(aqi, isEU ? 'eu' : 'us') : null;
      const chips = [
        ['PM2.5', aqC.pm2_5], ['PM10', aqC.pm10], ['NO₂', aqC.nitrogen_dioxide],
        ['O₃', aqC.ozone], ['SO₂', aqC.sulphur_dioxide], ['CO', aqC.carbon_monoxide],
      ].filter(([, v]) => v != null).map(([label, v]) =>
        `<span class="detail-box__chip">${label} ${Math.round(v)}</span>`
      ).join('');
      aqiBlock = `
        <div class="conditions-item conditions-item--wide">
          <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('aqi')}</span>Air Quality · ${isEU ? 'European' : 'US'} AQI</span>
          <span class="conditions-item__value">${aqLevel ? `<span class="uv-badge tone-${aqLevel.tone}">${aqi}</span> <span class="tone-${aqLevel.tone}">${aqLevel.label}</span>` : '<span class="uv-badge">—</span>'}</span>
          <div class="conditions-item__chips">${chips}</div>
        </div>
      `;
    }

    const pollenTypes = aqC ? [
      ['Alder', aqC.alder_pollen], ['Birch', aqC.birch_pollen], ['Grass', aqC.grass_pollen],
      ['Mugwort', aqC.mugwort_pollen], ['Olive', aqC.olive_pollen], ['Ragweed', aqC.ragweed_pollen],
    ] : [];
    const pollenPresent = pollenTypes.filter(([, v]) => v != null);
    let pollenBlock = `
      <div class="conditions-item conditions-item--wide conditions-item--empty">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
        <span class="conditions-item__sub">Not available</span>
      </div>
    `;
    if (pollenPresent.length && !pollenPresent.some(([, v]) => v > 0)) {
      pollenBlock = `
      <div class="conditions-item conditions-item--wide">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
        <span class="conditions-item__value"><span class="tone-good">Low</span></span>
        <span class="conditions-item__sub">Little to no pollen</span>
      </div>
    `;
    } else if (pollenPresent.length && pollenPresent.some(([, v]) => v > 0)) {
      const top = [...pollenPresent].sort((a, b) => b[1] - a[1]);
      const pLevel = Utils.getPollenLevel(top[0][1]);
      const bars = top.slice(0, 3).map(([label, v]) => {
        const pct = Math.max(2, Math.min(100, Math.round(v)));
        const w = Math.round(pct / 5) * 5;
        return `
          <div class="pollen-row">
            <span class="pollen-row__label">${label}</span>
            <span class="pollen-row__bar"><span class="pollen-row__fill pollen-w-${w} tone-${pLevel.tone}"></span></span>
            <span class="pollen-row__value">${Math.round(v)}</span>
          </div>
        `;
      }).join('');
      pollenBlock = `
        <div class="conditions-item conditions-item--wide">
          <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
          <span class="conditions-item__value"><span class="tone-${pLevel.tone}">${pLevel.label}</span></span>
          <span class="conditions-item__sub">${top[0][0]} is highest · grains/m³</span>
          <div class="pollen-bars">${bars}</div>
          <div class="pollen-legend">Low &lt;5 · Moderate 5–30 · High 30–99 · Very High 100+</div>
        </div>
      `;
    }

    const conditionsGrid = conditions.map((s) => `
      <div class="conditions-item${s.id ? ` conditions-item--press` : ''}${s.wide ? ` conditions-item--wide` : ''}"${s.id ? ` id="${s.id}"` : ''}>
        <span class="conditions-item__label">${s.icon ? `<span class="conditions-item__icon">${s.icon}</span>` : ''}${s.label}</span>
        <span class="conditions-item__value">${s.value}</span>
        <span class="conditions-item__sub">${s.sub || ''}${s.id ? `<span class="conditions-item__swap" title="Tap to toggle pressure units">${this._metricIcon('swap')}</span>` : ''}</span>
      </div>
    `).join('');

    boxes.push(`
      <div class="detail-box detail-box--conditions">
        <div class="conditions-grid">
          ${conditionsGrid}
          ${aqiBlock}
          ${pollenBlock}
        </div>
      </div>
    `);

    container.innerHTML = `<div class="detail-grid">${boxes.join('')}</div>`;
    const detailSec = this.$('detailSection');
    if (detailSec) detailSec.classList.remove('hidden');
    container.classList.remove('hidden');
    const windSec = this.$('windSection');
    if (windSec) windSec.classList.remove('hidden');
    const compassSec = this.$('compassSection');
    if (compassSec) compassSec.classList.remove('hidden');

    const pressBox = document.getElementById('pressureBox');
    if (pressBox) {
      pressBox.addEventListener('click', () => {
        UI.pressUnit = UI.pressUnit === 'inHg' ? 'hPa' : 'inHg';
        Utils.safeSet('pressUnit', UI.pressUnit);
        UI.renderDetailBoxes(UI._lastWeather, UI._lastAQ, UI._lastUnits);
        if (UI._lastWeather && UI._lastWeather.hourly) {
          UI.renderHourlyChart(UI._lastWeather.hourly, UI._lastUnits);
        }
      });
    }
  },

  renderWindCompass(lat, lon, windLabel, windDir, gustLabel, todayWind) {
    const container = this.$('compassContainer');
    const section = this.$('compassSection');
    const windSec = this.$('windSection');
    if (!container || !section) return;

    if (windSec) windSec.classList.remove('hidden');
    section.classList.remove('hidden');

    const cityName = UI._compassCityName ? this._esc(UI._compassCityName) : '';
    const country = UI._compassCountry ? this._esc(UI._compassCountry) : '';

    const dirDeg = windDir != null ? Math.round(((windDir % 360) + 360) % 360) : null;
    const fromDir = dirDeg != null ? Utils.getWindDirection(dirDeg) : null;
    const toDeg = dirDeg != null ? (dirDeg + 180) % 360 : null;
    const toDir = toDeg != null ? Utils.getWindDirection(toDeg) : null;

    const ticks = [];
    for (let d = 0; d < 360; d += 15) {
      const r = (d * Math.PI) / 180;
      const major = d % 45 === 0;
      const len = major ? 7 : 3;
      ticks.push(
        `<line x1="${(50 + Math.sin(r) * 42).toFixed(2)}" y1="${(50 - Math.cos(r) * 42).toFixed(2)}"` +
        ` x2="${(50 + Math.sin(r) * (42 - len)).toFixed(2)}" y2="${(50 - Math.cos(r) * (42 - len)).toFixed(2)}"` +
        ` stroke="currentColor" stroke-opacity="${major ? 0.55 : 0.28}" stroke-width="${major ? 2.4 : 1.2}"/>`
      );
    }

    const cardinals = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => {
      const r = (d * Math.PI) / 180;
      const major = d % 90 === 0;
      const label = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][d / 45];
      const x = 50 + Math.sin(r) * 29;
      const y = 50 - Math.cos(r) * 29;
      return `<text x="${x.toFixed(2)}" y="${(y + 3.4).toFixed(2)}" text-anchor="middle"` +
        ` font-size="${major ? 10 : 7}" font-weight="${major ? 800 : 600}" fill="currentColor" opacity="${major ? 0.95 : 0.6}">${label}</text>`;
    }).join('');

    const arrow = dirDeg != null
      ? `<g transform="rotate(${toDeg} 50 50)">
           <line x1="50" y1="52" x2="50" y2="18" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
           <polygon points="50,7 58,25 42,25" fill="currentColor"/>
           <polygon points="50,52 57,45 43,45" fill="currentColor" opacity="0.35"/>
        </g>`
      : '';

    const safeWind = this._esc(windLabel || 'Wind —');
    const safeGust = gustLabel ? this._esc(gustLabel) : '';
    const safeToday = todayWind ? {
      maxGust: todayWind.maxGust ? this._esc(todayWind.maxGust) : '',
      maxWind: todayWind.maxWind ? this._esc(todayWind.maxWind) : '',
      minWind: todayWind.minWind ? this._esc(todayWind.minWind) : '',
      prevailing: todayWind.prevailing ? this._esc(todayWind.prevailing) : '',
    } : null;

    container.innerHTML = `
      <div class="weather-compass">
        <div class="weather-compass__wind">
          <span class="weather-compass__now-label">Wind now</span>
          <span class="weather-compass__wind-speed">${safeWind}${safeGust ? `<span class="weather-compass__gust"> &middot; gusts ${safeGust}</span>` : ''}</span>
          ${dirDeg != null ? `<span class="weather-compass__wind-dir">blowing ${this._esc(toDir)} &middot; from ${this._esc(fromDir)}</span>` : ''}
        </div>
        <div class="weather-compass__rose">
          <svg viewBox="0 0 100 100" class="weather-compass__svg" role="img"
               aria-label="${dirDeg != null ? this._esc(`Wind from ${fromDir}, blowing toward ${toDir}`) : 'Wind direction not available'}">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5"/>
            <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" stroke-opacity="0.1" stroke-width="1" stroke-dasharray="2 3"/>
            ${ticks}
            ${cardinals}
            ${arrow}
            <circle cx="50" cy="50" r="3.4" fill="currentColor" opacity="0.6"/>
          </svg>
        </div>
        ${safeToday ? `
        <div class="weather-compass__today" aria-label="Today's wind detail">
          <span class="weather-compass__today-title">Today's wind</span>
          ${safeToday.maxGust ? `<span class="weather-compass__today-row"><b>Gustiest</b> ${safeToday.maxGust}</span>` : ''}
          ${safeToday.maxWind ? `<span class="weather-compass__today-row"><b>Strongest</b> ${safeToday.maxWind}</span>` : ''}
          ${safeToday.minWind ? `<span class="weather-compass__today-row"><b>Calmest</b> ${safeToday.minWind}</span>` : ''}
          ${safeToday.prevailing ? `<span class="weather-compass__today-row"><b>Prevailing</b> from ${safeToday.prevailing}</span>` : ''}
        </div>` : ''}
        <div class="weather-compass__location">
          <div class="weather-compass__city">${cityName}${country ? `<span class="weather-compass__country">${country}</span>` : ''}</div>
          <div class="weather-compass__coords">${Number(lat).toFixed(2)}&deg;, ${Number(lon).toFixed(2)}&deg;</div>
        </div>
      </div>
    `;
  },

  hideCompass() {
    const section = this.$('compassSection');
    const windSec = this.$('windSection');
    if (section) section.classList.add('hidden');
    if (windSec) windSec.classList.add('hidden');
  },

  // Max precipitation probability across daytime hours (is_day === 1) for a date.
  daytimeMaxPop(dateStr, hourly) {
    if (!hourly || !hourly.time || !hourly.precipitation_probability || !hourly.is_day) return null;
    const prefix = dateStr + 'T';
    let max = null;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      if (hourly.is_day[k] !== 1) continue;
      const p = hourly.precipitation_probability[k];
      if (p != null && (max == null || p > max)) max = p;
    }
    return max;
  },

  // Rain chance that should actually be advertised for a day. A nonzero max
  // hourly probability alone is too noisy on clear days (open-meteo can report
  // e.g. 60% while rain_sum stays 0.0), so it only surfaces when the forecast
  // actually includes precipitation. Mirrors the icon logic in
  // WeatherIcons.dailyIcon.
  meaningfulDayPop(dateStr, daily, hourly) {
    if (!daily || !daily.time) return null;
    const idx = daily.time.indexOf(String(dateStr));
    const dailyMax = idx >= 0 && daily.precipitation_probability_max
      ? daily.precipitation_probability_max[idx]
      : null;
    const pop = this.daytimeMaxPop(dateStr, hourly) ?? dailyMax;
    if (pop == null || pop <= 0) return null;
    const pick = (key) => idx >= 0 && daily[key] && daily[key][idx] != null ? daily[key][idx] : 0;
    if (pick('rain_sum') > 0 || pick('snowfall_sum') > 0 || pick('precipitation_sum') > 0) return pop;
    return null;
  },

  // Rain chance for the "Now" slot: the current hour's probability is only
  // surfaced when precipitation is actually happening or expected this hour —
  // the model often reports a large chance for the current hour while the sky
  // stays clear and dry, which must never read as "X% rain now".
  _meaningfulNowPop(cur, hourly, startIdx) {
    if (!cur) return null;
    const prob = hourly && hourly.precipitation_probability
      ? hourly.precipitation_probability[startIdx]
      : null;
    if (prob == null || prob <= 0) return null;
    const hourPrecip = hourly && hourly.precipitation && hourly.precipitation[startIdx] != null ? hourly.precipitation[startIdx] : 0;
    const hourSnow = hourly && hourly.snowfall && hourly.snowfall[startIdx] != null ? hourly.snowfall[startIdx] : 0;
    const curPrecip = cur.precipitation != null ? cur.precipitation : 0;
    const curSnow = cur.snowfall != null ? cur.snowfall : 0;
    if (curPrecip > 0 || curSnow > 0 || hourPrecip > 0 || hourSnow > 0) return prob;
    return null;
  },

  // Same gate for any hourly slot: probability alone is too noisy when the
  // hour's precip/snow amounts are zero.
  _meaningfulHourPop(hourly, idx) {
    if (!hourly || idx == null || idx < 0) return null;
    const prob = hourly.precipitation_probability ? hourly.precipitation_probability[idx] : null;
    if (prob == null || prob <= 0) return null;
    const precip = hourly.precipitation && hourly.precipitation[idx] != null ? hourly.precipitation[idx] : 0;
    const snow = hourly.snowfall && hourly.snowfall[idx] != null ? hourly.snowfall[idx] : 0;
    if (precip > 0 || snow > 0) return prob;
    return null;
  },

  // Unified day outlook (icon + rain %) — summary, forecast rows, and forecast
  // modal all read from this so Open-Meteo daily/hourly never disagree.
  dayOutlook(dateStr, daily, hourly, units) {
    if (!daily || !daily.time || dateStr == null) return null;
    const idx = daily.time.indexOf(String(dateStr));
    if (idx < 0) return null;
    const pop = this.meaningfulDayPop(dateStr, daily, hourly);
    const rainSum = daily.rain_sum && daily.rain_sum[idx] != null ? daily.rain_sum[idx] : 0;
    const snowSum = daily.snowfall_sum && daily.snowfall_sum[idx] != null ? daily.snowfall_sum[idx] : 0;
    const raw = WeatherIcons.dominantDayCode(dateStr, hourly, pop ?? 0, rainSum, snowSum, units)
      ?? daily.weather_code[idx];
    let iconCode = WeatherIcons.dailyIcon(raw, pop ?? 0, rainSum, snowSum, units);

    // Today while it's wet now: don't paint a dry day icon beside a wet summary.
    if (String(dateStr) === this._todayDateKey() && this._current) {
      const c = this._current;
      const nowIdx = this._hourlyStartIdx(hourly);
      const nowPop = this._meaningfulNowPop(c, hourly, nowIdx);
      const nowIcon = WeatherIcons.hourIcon(
        c.weather_code, nowPop, c.precipitation ?? 0, c.snowfall ?? 0
      );
      const wet = (g) => g === 'drizzle' || g === 'rain' || g === 'snow' || g === 'thunder';
      if (wet(WeatherIcons._group(nowIcon)) && !wet(WeatherIcons._group(iconCode))) {
        iconCode = nowIcon;
      }
    }

    return { idx, pop, rainSum, snowSum, iconCode };
  },

  // Min/max across the 24 hours of a date for a given hourly key (e.g. dew point).
  dayMinMax(dateStr, hourly, key) {
    if (!hourly || !hourly.time || !hourly[key]) return null;
    const prefix = dateStr + 'T';
    let min = null;
    let max = null;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      const v = hourly[key][k];
      if (v == null || !Number.isFinite(Number(v))) continue;
      if (min == null || v < min) min = v;
      if (max == null || v > max) max = v;
    }
    return min == null ? null : { min, max };
  },

  renderForecast(daily, units, hourly) {
    if (!daily || !daily.time || !daily.time.length) return;
    if (this._modalOpen) this.closeHourlyDetail();
    const count = Math.min(14, daily.time.length);
    const pageSize = 7;
    this._forecastDaily = daily;
    this._forecastCount = count;
    this._forecastUnits = units;
    this._forecastHourly = hourly;

    const rowMarkup = (date, i) => {
      const max = daily.temperature_2m_max && daily.temperature_2m_max[i] != null ? Math.round(daily.temperature_2m_max[i]) : '—';
      const min = daily.temperature_2m_min && daily.temperature_2m_min[i] != null ? Math.round(daily.temperature_2m_min[i]) : '—';
      const outlook = this.dayOutlook(date, daily, hourly, units);
      const pop = outlook && outlook.pop != null ? outlook.pop : 0;
      const iconCode = outlook ? outlook.iconCode : (daily.weather_code ? daily.weather_code[i] : 0);
      const icon = WeatherIcons.get(iconCode, true);

      const d = Utils.parseLocal(date + 'T00:00:00', this._tz);
      const weekday = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short' });
      const dateLabel = d.toLocaleDateString('en-US', { timeZone: this._tz || undefined, month: 'short', day: 'numeric' });
      const label = Utils.getWeatherDescription(iconCode);
      const chance = pop > 0 ? `<span class="forecast-card__row-chance">${pop}% rain</span>` : '';

      return `
        <div class="forecast-card__row${i === 0 ? ' forecast-card__row--today' : ''}" role="listitem" data-i="${i}">
          <div class="forecast-card__day">
            <span class="forecast-card__weekday">${weekday}</span>
            <span class="forecast-card__date">${dateLabel}</span>
          </div>
          <div class="forecast-card__row-icon">${icon}</div>
          <div class="forecast-card__row-info">
            <span class="forecast-card__row-label">${this._esc(label)}</span>
            ${chance}
          </div>
          <div class="forecast-card__row-temps">
            <span class="forecast-card__high">${max === '—' ? '' : max}${max === '—' ? '' : '°'}</span>
            <span class="forecast-card__low">${min === '—' ? '' : min}${min === '—' ? '' : '°'}</span>
          </div>
        </div>
      `;
    };

    const pages = [];
    for (let start = 0; start < count; start += pageSize) {
      const rows = daily.time.slice(start, Math.min(start + pageSize, count))
        .map((date, j) => rowMarkup(date, start + j)).join('');
      pages.push(`<div class="forecast-card__page" role="group">${rows}</div>`);
    }
    const dots = pages.map((_, p) => `
      <button type="button" class="forecast-card__pagerdot${p === 0 ? ' is-active' : ''}" data-page="${p}"
              aria-label="Days ${p * pageSize + 1} to ${Math.min((p + 1) * pageSize, count)}"></button>`).join('');

    this.$('forecastCards').innerHTML = `
      <div class="forecast-card forecast-card--pager">
        <div class="forecast-card__pages" role="list">${pages.join('')}</div>
        <div class="forecast-card__pager forecast-card__pager--stack" role="tablist" aria-label="Forecast days">
          <div class="forecast-card__pagerdots">${dots}</div>
          <span class="forecast-card__pagerlabel">
            <svg class="forecast-card__pagericon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg>
            <span class="forecast-card__pagerlead">Swipe</span>
            <span class="forecast-card__pagerrange">days 1–7</span>
          </span>
          <span class="forecast-card__pagertap">Tap any day for more info</span>
        </div>
      </div>
    `;

    const pagerEl = this.$('forecastCards').querySelector('.forecast-card__pager');
    const pagesEl = this.$('forecastCards').querySelector('.forecast-card__pages');
    if (pagesEl) {
      requestAnimationFrame(() => {
        const pageNodes = pagesEl.querySelectorAll('.forecast-card__page');
        let maxH = 0;
        Utils.dynCSS.del('forecast-h');
        pageNodes.forEach((p) => { maxH = Math.max(maxH, p.offsetHeight); });
        if (maxH > 0) Utils.dynCSS.set('forecast-h', `:root{--forecast-page-h:${maxH}px}`);
      });
    }
    if (pages.length > 1 && pagerEl && pagesEl) {
      const dotsEl = pagerEl.querySelectorAll('.forecast-card__pagerdot');
      const labelEl = pagerEl.querySelector('.forecast-card__pagerlabel');
      const rangeEl = pagerEl.querySelector('.forecast-card__pagerrange');
      const syncDots = () => {
        const page = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth) || 0;
        dotsEl.forEach((dot, p) => dot.classList.toggle('is-active', p === page));
        const other = page === 0 ? 1 : 0;
        const first = other * pageSize + 1;
        const last = Math.min((other + 1) * pageSize, count);
        if (labelEl) labelEl.classList.toggle('is-back', page === 1);
        if (rangeEl) rangeEl.textContent = `days ${first}–${last}`;
      };
      pagesEl.addEventListener('scroll', syncDots, { passive: true });
      pagerEl.addEventListener('click', (e) => {
        const dot = e.target.closest('.forecast-card__pagerdot');
        if (!dot) return;
        const page = parseInt(dot.dataset.page, 10) || 0;
        pagesEl.scrollTo({ left: page * pagesEl.clientWidth, behavior: 'smooth' });
      });
      syncDots();
    }
  },

  renderHourly(hourly, units) {
    if (!hourly || !hourly.time || !hourly.time.length) return;
    if (this._modalOpen) this.closeHourlyDetail();
    const nowIdx = this._hourlyStartIdx(hourly);
    this._modalUnits = units;

    let todayKey = null;
    let tomorrowKey = null;
    const advanceDay = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    };
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      todayKey = dtf.format(new Date());
      tomorrowKey = advanceDay(todayKey);
    } catch {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      tomorrowKey = advanceDay(todayKey);
    }

    // Now → forward only (no past hours).
    const listStart = nowIdx;
    this._hourly = hourly;
    this._hourlyStart = listStart;
    this._hourlyCount = Math.max(0, hourly.time.length - listStart);
    this._hourlyNowIdx = nowIdx;

    const dayLabelFor = (dateKey) => {
      if (dateKey === todayKey) return 'Today';
      if (dateKey === tomorrowKey) return 'Tomorrow';
      return Utils.parseLocal(dateKey + 'T00:00:00', this._tz)
        .toLocaleDateString('en-US', { weekday: 'short' });
    };

    const hourFor = (idx) => {
      const time = hourly.time[idx];
      const isNow = idx === nowIdx;
      const nowVals = isNow ? this._nowFromCurrent(this._current, hourly, units) : null;
      let tempRaw = hourly.temperature_2m && hourly.temperature_2m[idx] != null
        ? hourly.temperature_2m[idx]
        : null;
      let temp = tempRaw != null ? `${Math.round(tempRaw)}°` : '—';
      const timeLabel = isNow ? 'Now' : Utils.formatHourShort(time, this._tz);
      let pop = isNow ? null : this._meaningfulHourPop(hourly, idx);
      let precipNow = hourly.precipitation && hourly.precipitation[idx] != null ? hourly.precipitation[idx] : 0;
      let snowNow = hourly.snowfall && hourly.snowfall[idx] != null ? hourly.snowfall[idx] : 0;
      if (nowVals) {
        pop = nowVals.pop;
        if (nowVals.tempRaw != null) {
          tempRaw = nowVals.tempRaw;
          temp = `${Math.round(tempRaw)}°`;
        } else if (nowVals.temp != null) {
          temp = String(nowVals.temp).replace(/\s/g, '');
        }
        if (nowVals.precip != null) precipNow = nowVals.precip;
        if (nowVals.snow != null) snowNow = nowVals.snow;
      }
      const iconCode = WeatherIcons.hourIcon(
        nowVals && nowVals.code != null ? nowVals.code : hourly.weather_code[idx],
        pop, precipNow, snowNow
      );
      const icon = WeatherIcons.get(
        iconCode,
        nowVals && nowVals.isDay != null ? nowVals.isDay
          : (hourly.is_day && hourly.is_day[idx] != null ? hourly.is_day[idx] : 1)
      );
      const rain = pop != null && pop > 0 ? `${Math.round(pop)}%` : '';
      const modalI = idx - listStart;
      return `
        <div class="hourly-strip__hour${isNow ? ' hourly-strip__hour--now' : ''}"
             role="listitem" data-i="${modalI}" tabindex="0"
             aria-label="${this._esc(`${timeLabel}, ${temp}${rain ? `, ${rain} rain` : ''}`)}">
          <span class="hourly-strip__time">${this._esc(timeLabel)}</span>
          <span class="hourly-strip__icon">${icon}</span>
          <span class="hourly-strip__temp">${this._esc(temp)}</span>
          ${rain ? `<span class="hourly-strip__rain">${this._esc(rain)}</span>` : '<span class="hourly-strip__rain hourly-strip__rain--empty" aria-hidden="true"></span>'}
        </div>
      `;
    };

    const parts = [];
    let prevKey = null;
    for (let idx = listStart; idx < hourly.time.length; idx++) {
      const dateKey = String(hourly.time[idx]).slice(0, 10);
      if (prevKey && dateKey !== prevKey) {
        parts.push(`
          <div class="hourly-strip__day" role="presentation" aria-hidden="true">
            <span class="hourly-strip__day-label">${this._esc(dayLabelFor(dateKey))}</span>
          </div>`);
      }
      parts.push(hourFor(idx));
      prevKey = dateKey;
    }

    Utils.dynCSS.del('hourly-h');
    this.$('hourlyScroll').innerHTML = `
      <div class="hourly-card forecast-card">
        <div class="hourly-strip" role="list" aria-label="Hourly forecast from now">
          ${parts.join('')}
        </div>
      </div>
    `;

    if (!this._hourlyModalBound) this._bindHourlyModal();
  },

  _updateHourlyScroll() {
    // Strip scrolls horizontally; no equal-height page sync.
    Utils.dynCSS.del('hourly-h');
  },

  _bindHourlyModal() {
    const scroll = this.$('hourlyScroll');
    const modal = this.$('hourlyModal');
    if (!scroll || !modal) return;

    scroll.addEventListener('click', (e) => {
      const card = e.target.closest('.hourly-strip__hour');
      if (card && !this._modalOpen) this.openHourlyDetail(parseInt(card.dataset.i, 10) || 0);
    });
    scroll.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.hourly-strip__hour');
      if (!card || this._modalOpen) return;
      e.preventDefault();
      this.openHourlyDetail(parseInt(card.dataset.i, 10) || 0);
    });

    const fScroll = this.$('forecastCards');
    if (fScroll) {
      fScroll.addEventListener('click', (e) => {
        const row = e.target.closest('.forecast-card__row');
        if (row && !this._modalOpen) this.openForecastDetail(parseInt(row.dataset.i, 10) || 0);
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('hourly-modal__backdrop')) {
        this.closeHourlyDetail();
        return;
      }
      if (e.target.closest('.hourly-modal__close')) { this.closeHourlyDetail(); return; }
      if (e.target.closest('.hourly-modal__nav--prev')) { this._navModal(-1); return; }
      if (e.target.closest('.hourly-modal__nav--next')) { this._navModal(1); return; }
    });

    let startX = null, startY = null, dx = 0, dy = 0, peakX = 0, peakY = 0, down = false, axis = null;

    const trackEl = () => modal.querySelector('.hourly-modal__track');
    const setTrackX = (px, withTransition) => {
      const track = trackEl();
      if (!track) return;
      const tr = withTransition
        ? 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
      Utils.dynCSS.set('modal-drag', `#hourlyModal{--modal-drag-x:${px}px;--modal-drag-tr:${tr}}`);
    };
    const settleTrack = (dir) => {
      const track = trackEl();
      if (!track) return;
      const can = dir < 0 ? this._modalIndex > 0 : this._modalIndex < this._modalCount - 1;
      if (!can || !dir) {
        setTrackX(0, true);
        return;
      }
      const target = dir > 0 ? -track.parentElement.clientWidth : track.parentElement.clientWidth;
      setTrackX(target, true);
      let finished = false;
      const finish = (e) => {
        if (finished) return;
        if (e && e.target && e.target !== track) return;
        finished = true;
        track.removeEventListener('transitionend', finish);
        this._modalIndex += dir;
        this._modalSlideDir = 0;
        this._renderHourlyModal();
      };
      track.addEventListener('transitionend', finish);
      setTimeout(() => finish({ target: track }), 450);
    };

    modal.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (!e.target.closest('.hourly-modal__body')) return;
      if (e.target.closest('button')) return;
      down = true; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
      setTrackX(0, false);
    });
    modal.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'touch') return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      }
      if (axis === 'x') {
        e.preventDefault();
        const atStart = this._modalIndex <= 0 && dx > 0;
        const atEnd = this._modalIndex >= this._modalCount - 1 && dx < 0;
        const resist = (atStart || atEnd) ? 0.28 : 1;
        setTrackX(dx * resist, false);
      }
    });
    modal.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType === 'touch') return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 48) settleTrack(peakX < 0 ? 1 : -1);
      else if (axis === 'x') setTrackX(0, true);
      axis = null;
    });
    modal.addEventListener('pointercancel', () => { down = false; axis = null; setTrackX(0, true); });

    modal.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.hourly-modal__body')) return;
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      if (!t) return;
      down = true; startX = t.clientX; startY = t.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
      setTrackX(0, false);
    }, { passive: true });
    modal.addEventListener('touchmove', (e) => {
      if (!down) return;
      const t = e.touches[0];
      if (!t) return;
      dx = t.clientX - startX; dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      }
      if (axis === 'x') {
        e.preventDefault();
        const atStart = this._modalIndex <= 0 && dx > 0;
        const atEnd = this._modalIndex >= this._modalCount - 1 && dx < 0;
        const resist = (atStart || atEnd) ? 0.28 : 1;
        setTrackX(dx * resist, false);
      }
    }, { passive: false });
    modal.addEventListener('touchend', () => {
      if (!down) return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 48) settleTrack(peakX < 0 ? 1 : -1);
      else if (axis === 'x') setTrackX(0, true);
      axis = null;
    });
    modal.addEventListener('touchcancel', () => { down = false; axis = null; setTrackX(0, true); });

    this._addModalKeyHandler();
    this._hourlyModalBound = true;
  },


  _addModalKeyHandler() {
    if (this._modalKeyHandler) return;
    this._modalKeyHandler = (e) => {
      if (!this._modalOpen) return;
      if (e.key === 'Escape') this.closeHourlyDetail();
      else if (e.key === 'ArrowLeft') this._navModal(-1);
      else if (e.key === 'ArrowRight') this._navModal(1);
    };
    document.addEventListener('keydown', this._modalKeyHandler);
  },

  openHourlyDetail(i) {
    if (!this._hourly || !this._hourly.time || !this._hourlyCount) return;
    this._modalMode = 'hourly';
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    this._modalCount = this._hourlyCount;
    this._modalIndex = Math.max(0, Math.min(this._hourlyCount - 1, i));
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  openForecastDetail(i) {
    if (!this._forecastDaily || !this._forecastDaily.time) return;
    const total = Math.min(14, this._forecastDaily.time.length);
    if (!total) return;
    this._forecastCount = total;
    this._modalMode = 'forecast';
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    this._modalCount = total;
    this._modalIndex = Math.max(0, Math.min(total - 1, i));
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  _navModal(dir) {
    if (this._modalIndex == null || this._modalCount == null) return;
    const n = this._modalIndex + dir;
    if (n < 0 || n >= this._modalCount) return;
    const modal = this.$('hourlyModal');
    const track = modal && modal.querySelector('.hourly-modal__track');
    const viewport = track && track.parentElement;
    if (!track || !viewport) {
      this._modalIndex = n;
      this._modalSlideDir = dir;
      this._renderHourlyModal();
      return;
    }
    const target = dir > 0 ? -viewport.clientWidth : viewport.clientWidth;
    Utils.dynCSS.set('modal-drag', `#hourlyModal{--modal-drag-x:${target}px;--modal-drag-tr:transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)}`);
    let finished = false;
    const finish = (e) => {
      if (finished) return;
      if (e && e.target && e.target !== track) return;
      finished = true;
      track.removeEventListener('transitionend', finish);
      this._modalIndex = n;
      this._modalSlideDir = 0;
      this._renderHourlyModal();
    };
    track.addEventListener('transitionend', finish);
    setTimeout(() => finish({ target: track }), 450);
  },

  closeHourlyDetail() {
    const modal = this.$('hourlyModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    }
    this._modalOpen = false;
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    document.body.classList.remove('has-modal');
    if (this._modalKeyHandler) {
      document.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    if (this._modalResizeHandler) {
      window.removeEventListener('resize', this._modalResizeHandler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._modalResizeHandler);
      }
      this._modalResizeHandler = null;
    }
  },

  _ensureModalShell(prevLabel, nextLabel) {
    const modal = this.$('hourlyModal');
    if (!modal) return null;
    let card = modal.querySelector('.hourly-modal__card');
    if (!card) {
      modal.innerHTML = `
        <div class="hourly-modal__backdrop"></div>
        <div class="hourly-modal__card">
          <button type="button" class="hourly-modal__nav hourly-modal__nav--prev" aria-label="${prevLabel}">&lsaquo;</button>
          <div class="hourly-modal__body">
            <div class="hourly-modal__viewport">
              <div class="hourly-modal__track"></div>
            </div>
            <div class="hourly-modal__hint" id="hourlyModalHint" aria-live="polite"></div>
          </div>
          <button type="button" class="hourly-modal__close" aria-label="Close">&times;</button>
          <button type="button" class="hourly-modal__nav hourly-modal__nav--next" aria-label="${nextLabel}">&rsaquo;</button>
        </div>
      `;
      modal.classList.remove('hidden');
      document.body.classList.add('has-modal');
      if (!this._modalResizeHandler) {
        this._modalResizeHandler = Utils.debounce(() => {
          if (!this._modalOpen) return;
          this._modalPaneH = null;
          this._modalPaneHLocked = false;
          this._syncModalPaneHeight();
        }, 150);
        window.addEventListener('resize', this._modalResizeHandler);
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', this._modalResizeHandler);
        }
      }
    } else {
      const prev = modal.querySelector('.hourly-modal__nav--prev');
      const next = modal.querySelector('.hourly-modal__nav--next');
      if (prev) prev.setAttribute('aria-label', prevLabel);
      if (next) next.setAttribute('aria-label', nextLabel);
    }
    modal.classList.toggle('hourly-modal--forecast', this._modalMode === 'forecast');
    modal.classList.toggle('hourly-modal--hourly', this._modalMode !== 'forecast');
    this._updateModalHint();
    return modal.querySelector('.hourly-modal__track');
  },

  _updateModalHint() {
    const hint = this.$('hourlyModalHint');
    if (!hint) return;
    if (this._modalMode === 'forecast') {
      const n = (this._modalIndex ?? 0) + 1;
      const total = this._modalCount || 0;
      hint.textContent = `Day ${n} of ${total} · swipe for more days`;
    } else {
      hint.textContent = 'Swipe for more hours';
    }
  },

  // Fixed layout (5-line summary + fixed list rows). Grow until settle, then lock for the session.
  _syncModalPaneHeight({ settle = false } = {}) {
    const modal = this.$('hourlyModal');
    const viewport = modal && modal.querySelector('.hourly-modal__viewport');
    const track = modal && modal.querySelector('.hourly-modal__track');
    if (!modal || !viewport || !track) return;
    const panes = [...track.querySelectorAll('.hourly-modal__pane')];
    const center = panes[1] || panes.find((p) => !p.classList.contains('hourly-modal__pane--empty'));
    if (!center) return;

    modal.classList.remove('hourly-modal--sized', 'hourly-modal--dense');
    Utils.dynCSS.del('modal-h');
    void center.offsetHeight;

    const vv = window.visualViewport;
    const avail = Math.floor((vv && vv.height) || window.innerHeight);
    const hintEl = modal.querySelector('.hourly-modal__hint');
    const hintH = hintEl ? Math.ceil(hintEl.getBoundingClientRect().height) : 0;
    const cap = Math.max(240, avail - 32 - hintH);

    let h = center.offsetHeight;
    if (!h) return;
    if (h > cap) {
      modal.classList.add('hourly-modal--dense');
      void center.offsetHeight;
      h = center.offsetHeight || h;
    }
    h = Math.min(Math.ceil(h), cap);

    // Grow through early remasures; lock after settle so mid-swipe never resizes.
    if (this._modalPaneH == null) this._modalPaneH = h;
    else if (!this._modalPaneHLocked) this._modalPaneH = Math.max(this._modalPaneH, h);
    if (settle) this._modalPaneHLocked = true;
    h = this._modalPaneH;

    Utils.dynCSS.set('modal-h', `#hourlyModal{--modal-pane-h:${h}px}`);
    modal.classList.add('hourly-modal--sized');
  },

  _statRow(label, value, { html = false } = {}) {
    const safeLabel = this._esc(label);
    const raw = value == null || value === '' ? '—' : value;
    // Opt-in HTML only (colored feels-like spans we build ourselves).
    const safeValue = html ? String(raw) : this._esc(String(raw));
    return `<div class="hourly-modal__row"><span class="hourly-modal__row-label">${safeLabel}</span><span class="hourly-modal__row-value">${safeValue}</span></div>`;
  },

  // Day blurb: sky + temps + rain chance (sun times stay in the list). Max ~5 lines in CSS.
  _dayStory({ weekday, desc, high, low, pop, rainLabel }) {
    const dayName = weekday === 'Today' ? 'Today' : weekday;
    const sky = (desc || 'mixed conditions').toLowerCase();
    const looksOk = /^(clear sky|mainly clear|partly cloudy|overcast)$/.test(sky);
    let open;
    if (high !== '—' && low !== '—') {
      open = looksOk
        ? `${dayName} looks ${sky}, warming to ${high} and cooling to ${low}.`
        : `${dayName} brings ${sky}, warming to ${high} and cooling to ${low}.`;
    } else if (high !== '—') {
      open = looksOk
        ? `${dayName} looks ${sky}, near ${high}.`
        : `${dayName} brings ${sky}, near ${high}.`;
    } else {
      open = looksOk ? `${dayName} looks ${sky}.` : `${dayName} brings ${sky}.`;
    }
    if (rainLabel && pop > 0) open += ` Expect about a ${Math.round(pop)}% chance of rain (~${rainLabel}).`;
    else if (rainLabel) open += ` Expect around ${rainLabel} of rain.`;
    else if (pop > 0) open += ` Rain chance about ${Math.round(pop)}%.`;
    return open;
  },

  _hourlyPaneHTML(modalIndex) {
    const h = this._hourly;
    if (!h || !h.time) return '';
    const idx = this._hourlyStart + modalIndex;
    const time = h.time[idx];
    if (time == null) return '';
    const units = this._modalUnits || 'metric';
    const nowIdx = this._hourlyNowIdx != null ? this._hourlyNowIdx : this._hourlyStartIdx(h);
    const isNow = idx === nowIdx;
    const nowVals = isNow ? this._nowFromCurrent(this._current, h, units) : null;
    const temp = nowVals && nowVals.temp != null ? nowVals.temp : (h.temperature_2m && h.temperature_2m[idx] != null ? Utils.formatTemp(h.temperature_2m[idx], units) : '—');
    const tempRaw = nowVals && nowVals.tempRaw != null ? nowVals.tempRaw : (h.temperature_2m && h.temperature_2m[idx]);
    const tempTone = tempRaw != null ? Utils.getTempTone(tempRaw, units) : null;
    const dewPoint = nowVals && nowVals.dew != null ? nowVals.dew : (h.dew_point_2m && h.dew_point_2m[idx] != null ? Utils.formatTemp(h.dew_point_2m[idx], units) : null);
    const feels = nowVals && nowVals.feels != null ? nowVals.feels : (h.apparent_temperature && h.apparent_temperature[idx] != null ? Utils.formatTemp(h.apparent_temperature[idx], units) : null);
    const feelsRaw = nowVals && nowVals.feelsRaw != null ? nowVals.feelsRaw : (h.apparent_temperature && h.apparent_temperature[idx]);
    const feelsVal = feels != null ? (feelsRaw != null ? `<span class="temp-tone-${Utils.getTempTone(feelsRaw, units)}">${this._esc(feels)}</span>` : feels) : null;
    const pop = isNow && nowVals ? nowVals.pop : this._meaningfulHourPop(h, idx);
    const precip = nowVals && nowVals.precip != null ? nowVals.precip : (h.precipitation ? h.precipitation[idx] : 0);
    const wind = nowVals && nowVals.wind != null ? nowVals.wind : (h.wind_speed_10m && h.wind_speed_10m[idx] != null ? Math.round(h.wind_speed_10m[idx]) : null);
    const windDir = nowVals && nowVals.windDir != null ? nowVals.windDir : (h.wind_direction_10m && h.wind_direction_10m[idx] != null ? Math.round(h.wind_direction_10m[idx]) : null);
    const humidity = nowVals && nowVals.humidity != null ? nowVals.humidity : (h.relative_humidity_2m && h.relative_humidity_2m[idx] != null ? `${Math.round(h.relative_humidity_2m[idx])}%` : null);
    const gust = (nowVals && nowVals.gust != null)
      ? nowVals.gust
      : (h.wind_gusts_10m && h.wind_gusts_10m[idx] != null ? Math.round(h.wind_gusts_10m[idx]) : null);
    const pressure = nowVals && nowVals.pressure != null ? nowVals.pressure : (h.pressure_msl && h.pressure_msl[idx] != null ? Utils.formatPressure(h.pressure_msl[idx], UI.pressUnit) : null);
    const cloud = nowVals && nowVals.cloud != null ? nowVals.cloud : (h.cloud_cover && h.cloud_cover[idx] != null ? `${Math.round(h.cloud_cover[idx])}%` : null);
    const visibility = nowVals && nowVals.visibility != null ? nowVals.visibility : (h.visibility && h.visibility[idx] != null ? Utils.formatVisibility(h.visibility[idx], UI.visUnit) : null);
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const windVal = Utils.formatWind(wind, windDir, UI.windUnit);
    const clock = Utils.formatTime(time, this._tz);
    let endClock = clock;
    try {
      const end = new Date(Utils.parseLocal(time, this._tz).getTime() + 60 * 60 * 1000);
      endClock = Utils.formatTime(end, this._tz);
    } catch { /* keep start clock */ }
    const tLabel = isNow
      ? `Now · ${Utils.formatClock(new Date())}`
      : `${clock} – ${endClock}`;
    let dLabel = '';
    const dateKey = String(time).slice(0, 10);
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const today = dtf.format(new Date());
      const [y, m, d] = today.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      if (dateKey === today) dLabel = 'Today';
      else if (dateKey === tomorrow) dLabel = 'Tomorrow';
      else dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const row = (label, value, opts) => this._statRow(label, value, opts);
    const rainLabel = Utils.formatPrecip(precip, units) || (units === 'imperial' ? '0 in' : '0 mm');
    const feelsHtml = feels != null && feelsRaw != null;
    return `
      <div class="hourly-modal__pane">
        <div class="hourly-modal__head">${this._esc(dLabel)} · ${this._esc(tLabel)}</div>
        <div class="hourly-modal__temp${tempTone ? ` temp-tone-${tempTone}` : ''}">${this._esc(temp)}</div>
        <div class="hourly-modal__list">
          ${row('Feels like', feelsVal, { html: feelsHtml })}
          ${row('Chance', pop != null ? `${Math.round(pop)}%` : null)}
          ${row('Rainfall', rainLabel)}
          ${row('Humidity', humidity)}
          ${row('Wind', windVal)}
          ${row('Gusts', gust != null ? `${gust} ${windUnit}` : null)}
          ${row('Dew point', dewPoint)}
          ${row('Pressure', pressure)}
          ${row('Cloud cover', cloud)}
          ${row('Visibility', visibility)}
        </div>
      </div>`;
  },

  _forecastPaneHTML(modalIndex) {
    const d = this._forecastDaily;
    if (!d || !d.time) return '';
    const date = d.time[modalIndex];
    if (date == null) return '';
    const units = this._forecastUnits || 'metric';
    const high = d.temperature_2m_max && d.temperature_2m_max[modalIndex] != null ? Utils.formatTemp(d.temperature_2m_max[modalIndex], units) : '—';
    const low = d.temperature_2m_min && d.temperature_2m_min[modalIndex] != null ? Utils.formatTemp(d.temperature_2m_min[modalIndex], units) : '—';
    const feelsHigh = d.apparent_temperature_max && d.apparent_temperature_max[modalIndex] != null ? Utils.formatTemp(d.apparent_temperature_max[modalIndex], units) : null;
    const feelsLow = d.apparent_temperature_min && d.apparent_temperature_min[modalIndex] != null ? Utils.formatTemp(d.apparent_temperature_min[modalIndex], units) : null;
    const outlook = this.dayOutlook(date, d, this._forecastHourly, units);
    const pop = outlook && outlook.pop != null ? outlook.pop : 0;
    const rainSum = outlook ? outlook.rainSum : (d.rain_sum ? d.rain_sum[modalIndex] : null);
    const snowSum = outlook ? outlook.snowSum : (d.snowfall_sum ? d.snowfall_sum[modalIndex] : null);
    const sunshine = d.sunshine_duration && d.sunshine_duration[modalIndex] != null ? Utils.formatDuration(d.sunshine_duration[modalIndex]) : null;
    const daylight = d.daylight_duration && d.daylight_duration[modalIndex] != null ? Utils.formatDuration(d.daylight_duration[modalIndex]) : null;
    const sunrise = d.sunrise && d.sunrise[modalIndex] ? Utils.formatTime(d.sunrise[modalIndex], this._tz) : null;
    const sunset = d.sunset && d.sunset[modalIndex] ? Utils.formatTime(d.sunset[modalIndex], this._tz) : null;
    const tempMaxRaw = d.temperature_2m_max && d.temperature_2m_max[modalIndex];
    const tempTone = tempMaxRaw != null ? Utils.getTempTone(tempMaxRaw, units) : null;
    const iconCode = outlook
      ? outlook.iconCode
      : WeatherIcons.dailyIcon(
        WeatherIcons.dominantDayCode(date, this._forecastHourly, pop, rainSum ?? 0, snowSum ?? 0, units) ?? d.weather_code[modalIndex],
        pop, rainSum ?? 0, snowSum ?? 0, units
      );
    const desc = Utils.getWeatherDescription(iconCode);
    const feelsHighRaw = d.apparent_temperature_max && d.apparent_temperature_max[modalIndex];
    const feelsVal = feelsHigh != null && feelsLow != null
      ? (feelsHighRaw != null
          ? `<span class="temp-tone-${Utils.getTempTone(feelsHighRaw, units)}">${this._esc(feelsHigh)} / ${this._esc(feelsLow)}</span>`
          : `${feelsHigh} / ${feelsLow}`)
      : null;
    const parsed = Utils.parseLocal(date + 'T00:00:00', this._tz);
    const weekdayLong = modalIndex === 0 ? 'Today' : parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'long' });
    const weekdayShort = modalIndex === 0 ? 'Today' : parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short' });
    const dateHeading = parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, month: 'short', day: 'numeric' });
    const rainZero = units === 'imperial' ? '0 in' : '0 mm';
    const rainLabel = Utils.formatPrecip(rainSum, units) || rainZero;
    const storyRain = Utils.formatPrecip(rainSum, units);
    const summary = this._dayStory({
      weekday: weekdayLong, desc, high, low, pop, rainLabel: storyRain,
    });
    const row = (label, value, opts) => this._statRow(label, value, opts);
    const feelsHtml = feelsHigh != null && feelsLow != null && feelsHighRaw != null;
    return `
      <div class="hourly-modal__pane">
        <div class="hourly-modal__head">${this._esc(weekdayShort)} · ${this._esc(dateHeading)}</div>
        <div class="hourly-modal__temp${tempTone ? ` temp-tone-${tempTone}` : ''}">${this._esc(high)}<span class="hourly-modal__temp-low"> / ${this._esc(low)}</span></div>
        <div class="hourly-modal__summary">${summary ? this._esc(summary) : ''}</div>
        <div class="hourly-modal__list">
          ${row('Feels like', feelsVal, { html: feelsHtml })}
          ${row('Chance', pop > 0 ? `${Math.round(pop)}%` : null)}
          ${row('Rainfall', rainLabel)}
          ${row('Sunrise', sunrise)}
          ${row('Sunset', sunset)}
          ${row('Sunshine', sunshine)}
          ${row('Daylight', daylight)}
        </div>
      </div>`;
  },

  _paintModalTrack(paneFn) {
    const isForecast = this._modalMode === 'forecast';
    const track = this._ensureModalShell(
      isForecast ? 'Previous day' : 'Previous hour',
      isForecast ? 'Next day' : 'Next hour'
    );
    if (!track) return;
    const i = this._modalIndex;
    const prev = i > 0 ? paneFn.call(this, i - 1) : '<div class="hourly-modal__pane hourly-modal__pane--empty" aria-hidden="true"></div>';
    const cur = paneFn.call(this, i) || '<div class="hourly-modal__pane"><div class="hourly-modal__desc">No data</div></div>';
    const next = i < this._modalCount - 1 ? paneFn.call(this, i + 1) : '<div class="hourly-modal__pane hourly-modal__pane--empty" aria-hidden="true"></div>';
    Utils.dynCSS.set('modal-drag', '#hourlyModal{--modal-drag-x:0px;--modal-drag-tr:none}');
    track.innerHTML = `
      <div class="hourly-modal__slide">${prev}</div>
      <div class="hourly-modal__slide">${cur}</div>
      <div class="hourly-modal__slide">${next}</div>
    `;
    // Force layout so translate uses real widths
    void track.offsetWidth;
    Utils.dynCSS.set('modal-drag', '#hourlyModal{--modal-drag-x:0px;--modal-drag-tr:none}');
    this._updateModalHint();
    const sync = (settle = false) => { if (this._modalOpen) this._syncModalPaneHeight({ settle }); };
    sync(false);
    // After open animation + fonts, remasure and lock (early paint can undersize).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => sync(true));
    });
    const card = this.$('hourlyModal') && this.$('hourlyModal').querySelector('.hourly-modal__card');
    if (card) {
      card.addEventListener('animationend', () => sync(true), { once: true });
    }
    const focus = this.$('hourlyModal') && this.$('hourlyModal').querySelector('.hourly-modal__close');
    if (focus) focus.focus();
  },

  _renderHourlyModal() {
    if (this._modalMode === 'forecast') { this._renderForecastModal(); return; }
    const modal = this.$('hourlyModal');
    if (!modal || !this._hourly) return;
    const idx = this._hourlyStart + this._modalIndex;
    if (!this._hourly.time || this._hourly.time[idx] == null) { this.closeHourlyDetail(); return; }
    this._paintModalTrack(this._hourlyPaneHTML);
  },

  _renderForecastModal() {
    const modal = this.$('hourlyModal');
    if (!modal || !this._forecastDaily) return;
    const date = this._forecastDaily.time && this._forecastDaily.time[this._modalIndex];
    if (date == null) { this.closeHourlyDetail(); return; }
    this._paintModalTrack(this._forecastPaneHTML);
  },

  renderHourlyChart(hourly, units) {
    const container = this.$('hourlyChart');
    if (!container || !hourly || !hourly.time) return;

    const mode = this._chartMode;
    const modeLabel = this._chartModeLabel(mode);
    container.classList.remove('hidden');
    const chartHead = this.$('hourlyChartHead');
    if (chartHead) chartHead.classList.remove('hidden');
    this._bindChartSwipe(container);

    const W = Math.max(320, container.clientWidth || 600);
    const H = 320;
    const padR = 16, padT = 30, padB = 48;
    const ih = H - padT - padB;
    let padL = 58;

    const startIdx = this._hourlyStartIdx(hourly);
    const count = 24;
    const times = hourly.time.slice(startIdx, startIdx + count);
    const modePillsMarkup = this.CHART_MODES.map((m) =>
      `<button type="button" class="hourly-chart__mode hourly-chart__mode--${m}${m === mode ? ' is-active' : ''}" role="tab" aria-selected="${m === mode}" data-mode="${m}">${this._chartModeShort(m)}</button>`
    ).join('');
    const empty = () => {
      container.innerHTML = `
        <div class="hourly-chart__modes" role="tablist" aria-label="Chart type">${modePillsMarkup}</div>
        <div class="hourly-chart__empty">No data available for this chart.</div>`;
    };
    if (!times.length) { empty(); return; }
    const slice = (key) => hourly[key] ? hourly[key].slice(startIdx, startIdx + count) : null;

    const pops = slice('precipitation_probability');
    const precipSlice = slice('precipitation');
    const snowSlice = slice('snowfall');

    let cfg;
    if (mode === 'rain') {
      if (!pops) { empty(); return; }
      // Same gate as hourly list: probability alone is noise when amount is 0.
      const gated = pops.map((p, i) => {
        if (p == null || p <= 0) return 0;
        const r = precipSlice && precipSlice[i] != null ? precipSlice[i] : 0;
        const s = snowSlice && snowSlice[i] != null ? snowSlice[i] : 0;
        return (r > 0 || s > 0) ? p : 0;
      });
      cfg = {
        min: 0, max: 100, suffix: '%',
        values: gated, color: '#38BDF8', cells: true,
        legend: [{ label: 'chance of rain', swatch: 'rain' }],
      };
    } else if (mode === 'solar') {
      const raw = slice('shortwave_radiation');
      if (!raw) { empty(); return; }
      const fullSun = 1000;
      const vals = raw.map((v) => v == null ? null : Math.max(0, Math.min(100, Math.round((v / fullSun) * 100))));
      cfg = {
        min: 0, max: 100, values: vals, color: '#FACC15', suffix: '%',
        legend: [{ label: 'Solar radiation (%)', swatch: 'solar' }],
      };
    } else {
      const vals = slice('temperature_2m');
      if (!vals) { empty(); return; }
      const suffix = units === 'imperial' ? '°F' : '°C';
      cfg = {
        values: vals, suffix: '°', tempGrad: true,
        second: slice('dew_point_2m') || [],
        legend: [
          { label: `Temperature (${suffix})`, swatch: 'temp' },
          { label: `Dew point (${suffix})`, swatch: 'dew' },
        ],
      };
    }

    const finite = (arr) => arr.filter((v) => Number.isFinite(v));
    const primary = finite(cfg.values || []);
    const secondary = cfg.second ? finite(cfg.second) : [];
    if (!primary.length && !secondary.length) { empty(); return; }
    const minT = cfg.min != null ? cfg.min : Math.min(...primary, ...secondary);
    const maxT = cfg.max != null ? cfg.max : Math.max(...primary, ...secondary);
    const span = Math.max(1, maxT - minT);

    // Grow left padding so the widest y-axis label (e.g. "1013 hPa") isn't clipped.
    if (cfg.values) {
      try {
        const ctx = this._getMeasureCtx();
        const ticks = 4;
        for (let i = 0; i <= ticks; i++) {
          const t = Math.round(minT + (span * i) / ticks);
          padL = Math.max(padL, ctx.measureText(`${t}${cfg.suffix}`).width + 16);
        }
      } catch (e) { /* measurement is best-effort */ }
    }
    const iw = W - padL - padR;

    const y = (t) => padT + ih - ((t - minT) / span) * ih;
    const x = (i) => padL + (i / times.length) * iw;

    // For the bar ("cells") view the band indents by half a bar width on each
    // side so the first/last bars sit full-size and never touch the y-axis.
    let cellsPos = null;
    if (cfg.cells) {
      const cw = iw / times.length;
      const gap = Math.min(7, cw * 0.22);
      const bw = Math.max(2, cw - gap);
      cellsPos = {
        bw,
        rx: Math.min(8, bw / 2),
        pos: (i) => padL + bw / 2 + (i / times.length) * (iw - bw),
      };
    }
    const pos = (i) => (cellsPos ? cellsPos.pos(i) : x(i));

    let grid = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const t = minT + (span * i) / ticks;
      const yy = y(t).toFixed(1);
      grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="currentColor" stroke-opacity="0.12"/>
               <text x="${padL - 12}" y="${+yy + 6}" text-anchor="end" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${Math.round(t)}${cfg.suffix}</text>`;
    }

    let xlabels = '';
    const minGap = 76;
    const labelStep = [6, 8, 12, 24].find((s) => (iw * s) / times.length >= minGap) || 24;
    for (let i = 0; i < times.length; i += labelStep) {
      xlabels += `<text x="${pos(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${this._esc(Utils.formatHourShort(times[i], this._tz))}</text>`;
    }
    if (labelStep < 24) {
      const parts = times[0].slice(0, 10).split('-').map(Number);
      const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)).toISOString().slice(0, 10) + 'T00:00:00';
      const dayEnd = Utils.parseLocal(next, this._tz);
      xlabels += `<text x="${pos(times.length).toFixed(1)}" y="${H - 12}" text-anchor="end" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${this._esc(Utils.formatHourShort(dayEnd, this._tz))}</text>`;
    }

    let line = '', dots = '', cells = '', defs = '';
    if (cfg.cells) {
      const baseY = padT + ih;
      const scale = (t) => (t - minT) / span;
      defs = `<linearGradient id="chartBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.35"/>
        </linearGradient>
        <filter id="chartBarGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;
      cfg.values.forEach((t, i) => {
        if (!Number.isFinite(t)) return;
        const h = Math.max(2, scale(t) * ih);
        const x0 = (cellsPos.pos(i) - cellsPos.bw / 2).toFixed(1);
        const y0 = (baseY - h).toFixed(1);
        cells += `<rect x="${x0}" y="${y0}" width="${cellsPos.bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${cellsPos.rx}" fill="url(#chartBarGrad)" filter="url(#chartBarGlow)" stroke="rgba(255,255,255,0.55)" stroke-width="1.1"/>`;
      });
      cells += `<rect x="${padL}" y="${(baseY - 1).toFixed(1)}" width="${iw.toFixed(1)}" height="1" fill="currentColor" fill-opacity="0.15"/>`;
    } else if (cfg.values) {
      // Sparse series may contain null/NaN entries; drop them so paths never get invalid coords.
      const seriesPts = (arr) => arr
        .map((t, i) => (Number.isFinite(t) ? [x(i), y(t)] : null))
        .filter(Boolean);
      const smoothD = (pts) => {
        if (!pts.length) return '';
        if (pts.length === 1) return `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
          const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
          const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
          const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
          d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
        return d;
      };
      const mainPts = seriesPts(cfg.values);
      const mainD = smoothD(mainPts);
      const baseY = (padT + ih).toFixed(1);
      const areaD = mainPts.length
        ? `${mainD} L ${mainPts[mainPts.length - 1][0].toFixed(1)} ${baseY} L ${mainPts[0][0].toFixed(1)} ${baseY} Z`
        : '';
      const stroke = cfg.tempGrad ? 'url(#tempGrad)' : cfg.color;
      const fillId = cfg.tempGrad ? 'tempAreaGrad' : 'chartAreaGrad';
      if (cfg.tempGrad) {
        const gradStops = [1, 0.75, 0.5, 0.25, 0].map((f) => {
          const t = minT + span * f;
          return `<stop offset="${Math.round(f * 100)}%" stop-color="${Utils.getTempColor(t, units)}"/>`;
        }).join('');
        defs = `<linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient>
          <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${Utils.getTempColor(maxT, units)}" stop-opacity="0.38"/>
            <stop offset="55%" stop-color="${Utils.getTempColor(minT + span * 0.45, units)}" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="${Utils.getTempColor(minT, units)}" stop-opacity="0"/>
          </linearGradient>`;
      } else {
        defs = `<linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.42"/>
            <stop offset="70%" stop-color="${cfg.color}" stop-opacity="0.12"/>
            <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0"/>
          </linearGradient>`;
      }
      defs += `
        <filter id="chartLineGlow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="chartDotGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>`;
      if (mainD) {
        line = `
          ${areaD ? `<path d="${areaD}" fill="url(#${fillId})"/>` : ''}
          <path d="${mainD}" fill="none" stroke="${stroke}" stroke-width="12" stroke-opacity="0.18" stroke-linecap="round" stroke-linejoin="round" filter="url(#chartLineGlow)"/>
          <path d="${mainD}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${mainD}" fill="none" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      if (cfg.gusts) {
        const gustD = smoothD(seriesPts(cfg.gusts));
        if (gustD) {
          line += `
            <path d="${gustD}" fill="none" stroke="${cfg.gustColor}" stroke-width="7" stroke-opacity="0.22" stroke-linecap="round" stroke-linejoin="round" filter="url(#chartLineGlow)"/>
            <path d="${gustD}" fill="none" stroke="${cfg.gustColor}" stroke-width="2.8" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      }
      dots = cfg.values.map((t, i) => {
        if (!Number.isFinite(t)) return '';
        const fill = cfg.tempGrad ? Utils.getTempColor(t, units) : cfg.color;
        const cx = x(i).toFixed(1);
        const cy = y(t).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="6.2" fill="${fill}" fill-opacity="0.22" filter="url(#chartDotGlow)"/>
                <circle cx="${cx}" cy="${cy}" r="4.2" fill="${fill}" stroke="rgba(255,255,255,0.95)" stroke-width="1.6"/>
                <circle cx="${cx}" cy="${cy}" r="1.5" fill="rgba(255,255,255,0.95)"/>`;
      }).join('');
      if (cfg.second && cfg.second.length) {
        const dpPts = seriesPts(cfg.second);
        const dpD = smoothD(dpPts);
        if (dpD) {
          line += `
            <path d="${dpD}" fill="none" stroke="#26C6DA" stroke-width="7" stroke-opacity="0.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#chartLineGlow)"/>
            <path d="${dpD}" fill="none" stroke="#26C6DA" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 4"/>`;
        }
        dots += cfg.second.map((t, i) => {
          if (!Number.isFinite(t)) return '';
          const cx = x(i).toFixed(1);
          const cy = y(t).toFixed(1);
          return `<circle cx="${cx}" cy="${cy}" r="3.4" fill="#26C6DA" stroke="rgba(255,255,255,0.92)" stroke-width="1.2"/>
                  <circle cx="${cx}" cy="${cy}" r="1.1" fill="rgba(255,255,255,0.95)"/>`;
        }).join('');
      }
    }

    container.innerHTML = `
      <div class="hourly-chart__modes" role="tablist" aria-label="Chart type">${modePillsMarkup}</div>
      <svg viewBox="0 0 ${W} ${H}" class="hourly-chart__svg" role="img"
           aria-label="24-hour ${modeLabel} chart">
        <defs>${defs}</defs>
        ${grid}
        ${xlabels}
        ${cells}
        ${line}
        ${dots}
      </svg>
      ${cfg.legend && cfg.legend.length ? `
        <div class="hourly-chart__legend">
          ${cfg.legend.map((l) => `<span class="hourly-chart__legend-item"><span class="hourly-chart__legend-swatch hourly-chart__legend-swatch--${l.swatch}"></span>${l.label}</span>`).join('')}
        </div>` : ''}
      <div class="hourly-chart__hint"><svg class="hourly-card__hinticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg><span>Swipe to change chart</span></div>`;

    const modes = container.querySelector('.hourly-chart__modes');
    const activeMode = container.querySelector('.hourly-chart__mode.is-active');
    if (modes && activeMode && modes.scrollWidth > modes.clientWidth) {
      const mr = modes.getBoundingClientRect();
      const cr = activeMode.getBoundingClientRect();
      if (cr.left < mr.left || cr.right > mr.right) {
        modes.scrollLeft += (cr.left - mr.left) - (mr.width - cr.width) / 2;
      }
    }
  },

  setChartMode(mode) {
    if (mode === 'dew') mode = 'temp';
    this._chartMode = this.CHART_MODES.includes(mode) ? mode : 'temp';
  },

  _chartModeShort(mode) {
    return mode === 'temp' ? 'Temp'
      : mode === 'rain' ? 'Rain'
      : 'Solar';
  },

  _chartModeLabel(mode) {
    return mode === 'rain' ? 'Chance of rain'
      : mode === 'solar' ? 'Solar'
      : 'Temperature & dew point';
  },

  _setMode(mode) {
    this.setChartMode(mode);
    Utils.safeSet('chartMode', mode);
    if (this._lastWeather && this._lastWeather.hourly) {
      this.renderHourlyChart(this._lastWeather.hourly, this._lastUnits);
    }
  },

  _cycleChart(dir) {
    const order = this.CHART_MODES;
    const i = order.indexOf(this._chartMode);
    this._setMode(order[(i + dir + order.length) % order.length]);
  },

  _bindChartSwipe(container) {
    if (this._chartSwipeBound || !container) return;
    this._chartSwipeBound = true;

    container.tabIndex = 0;
    container.setAttribute('aria-label', 'Hourly chart — swipe or use arrow keys to change metric');

    container.addEventListener('click', (e) => {
      if (this._chartDragged) { this._chartDragged = false; return; }
      const modeBtn = e.target.closest('.hourly-chart__mode[data-mode]');
      if (modeBtn) this._setMode(modeBtn.getAttribute('data-mode'));
    });

    let startX = null, startY = null, dx = 0, dy = 0, peakX = 0, peakY = 0, down = false, axis = null;

    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target.closest('.hourly-chart__modes')) return;
      down = true; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null; this._chartDragged = false;
    });
    container.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'touch') return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (axis === 'x') e.preventDefault();
    });
    container.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType === 'touch') return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) { this._cycleChart(peakX < 0 ? 1 : -1); this._chartDragged = true; }
      axis = null;
    });
    container.addEventListener('pointercancel', () => { down = false; axis = null; });

    container.addEventListener('touchstart', (e) => {
      if (e.target.closest('.hourly-chart__modes')) return;
      const t = e.touches[0];
      if (!t) return;
      down = true; startX = t.clientX; startY = t.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null; this._chartDragged = false;
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (!down) return;
      const t = e.touches[0];
      if (!t) return;
      dx = t.clientX - startX; dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (axis === 'x') e.preventDefault();
    }, { passive: false });
    container.addEventListener('touchend', () => {
      if (!down) return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) { this._cycleChart(peakX < 0 ? 1 : -1); this._chartDragged = true; }
      axis = null;
    });
    container.addEventListener('touchcancel', () => { down = false; axis = null; });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this._cycleChart(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this._cycleChart(1); }
    });
  },

  renderWeather(weatherData, aqData, units, cityName, country, lat, lon) {
    if (!weatherData) return;
    if (!window.__appRendered) {
      window.__appRendered = true;
      if (typeof window.__onFirstRender === 'function') window.__onFirstRender();
    }
    this.hideLoading();
    this.hideError();
    this._tz = weatherData.timezone ? weatherData.timezone : null;
    this._current = weatherData.current || null;
    weatherData._cityName = cityName;
    weatherData._country = country;
    this.$('weatherContent').classList.remove('hidden');
    this.$('weatherContent').classList.add('weather-content--visible');
    if (!this._weatherStaggered) {
      this._weatherStaggered = true;
      this.$('weatherContent').classList.add('weather-content--stagger');
    }
    this.renderCurrentWeather(weatherData, units);
    this.renderForecast(weatherData.daily, units, weatherData.hourly);
    this.renderHourly(weatherData.hourly, units);
    this.renderHourlyChart(weatherData.hourly, units);
    this.renderDetailBoxes(weatherData, aqData, units);
    const windUnit = Utils.getWindUnit(this.windUnit);
    const cur = weatherData.current;
    const windSpeed = cur && cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
    UI._compassWindLabel = windSpeed != null ? `${windSpeed} ${windUnit}` : '';
    UI._compassWindDir = cur && cur.wind_direction_10m != null
      ? Math.round(cur.wind_direction_10m)
      : null;
    const gust = cur && cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null;
    UI._compassGustLabel = gust != null ? `${gust} ${windUnit}` : '';
    const todayWind = this._todayWindStats(weatherData.hourly, windUnit);
    UI._compassTodayWind = todayWind;
    UI._compassCityName = cityName;
    UI._compassCountry = country;
    if (lat != null && lon != null) {
      this.renderWindCompass(lat, lon, UI._compassWindLabel, UI._compassWindDir, UI._compassGustLabel, todayWind);
    } else {
      this.hideCompass();
    }
  },

  _todayDateKey() {
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      return dtf.format(new Date());
    } catch {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  },

  _dominantDir(dirs) {
    let sx = 0, sy = 0;
    for (const d of dirs) {
      const r = (d * Math.PI) / 180;
      sx += Math.cos(r);
      sy += Math.sin(r);
    }
    return (Math.round(Math.atan2(sy, sx) * 180 / Math.PI) % 360 + 360) % 360;
  },

  _todayWindStats(hourly, windUnit) {
    if (!hourly || !hourly.time || !hourly.wind_speed_10m) return null;
    const prefix = this._todayDateKey() + 'T';
    let maxWind = null;
    let maxGust = null;
    let minWind = null;
    const dirs = [];
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      const w = hourly.wind_speed_10m[k];
      if (w != null && Number.isFinite(w)) {
        if (maxWind == null || w > maxWind.v) maxWind = { v: w, k };
        if (minWind == null || w < minWind.v) minWind = { v: w, k };
      }
      const g = hourly.wind_gusts_10m ? hourly.wind_gusts_10m[k] : null;
      if (g != null && Number.isFinite(g) && (maxGust == null || g > maxGust.v)) maxGust = { v: g, k };
      const d = hourly.wind_direction_10m ? hourly.wind_direction_10m[k] : null;
      if (d != null && Number.isFinite(d)) dirs.push(d);
    }
    if (!maxWind && !maxGust) return null;
    const fmt = (t) => Utils.formatHourShort(hourly.time[t], this._tz);
    return {
      maxWind: maxWind ? `${Math.round(maxWind.v)} ${windUnit} at ${fmt(maxWind.k)}` : null,
      maxGust: maxGust ? `${Math.round(maxGust.v)} ${windUnit} at ${fmt(maxGust.k)}` : null,
      minWind: minWind ? `${Math.round(minWind.v)} ${windUnit} at ${fmt(minWind.k)}` : null,
      prevailing: dirs.length ? Utils.getWindDirection(this._dominantDir(dirs)) : null,
    };
  },

  setUnitLabel(units) {
    const label = units === 'imperial' ? '°F' : '°C';
    this.$('unitLabel').textContent = label;
    const el = this.$('unitMenuLabel');
    if (el) el.textContent = label;
  },

  setWindUnitLabel(code) {
    this.windUnit = code;
    const el = this.$('windLabel');
    if (el) el.textContent = Utils.getWindUnit(code);
  },

  setVisLabel(code) {
    this.visUnit = code;
    const el = this.$('visLabel');
    if (el) el.textContent = code === 'mi' ? 'mi' : 'km';
  },

  setPressUnit(code) {
    this.pressUnit = code === 'inHg' ? 'inHg' : 'hPa';
  },

  initThemeToggle() {
    const saved = Utils.safeGet('theme', null);
    const isDark = saved === 'dark';
    document.body.classList.toggle('theme-dark', isDark);
    const icon = this.$('themeIcon');
    if (icon) icon.textContent = isDark ? '\u2600' : '\u263E';
  },

  toggleTheme() {
    document.body.classList.toggle('theme-dark');
    const isDark = document.body.classList.contains('theme-dark');
    Utils.safeSet('theme', isDark ? 'dark' : 'light');
    const icon = this.$('themeIcon');
    if (icon) icon.textContent = isDark ? '\u2600' : '\u263E';
  },

  _esc(str) {
    if (str == null) return '';
    const el = document.createElement('span');
    el.textContent = String(str);
    return el.innerHTML;
  },

  _metricIcon(name) {
    const icons = {
      precip: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>`,
      humidity: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>`,
      wind: `<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>`,
      uv: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>`,
      visibility: `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`,
      pressure: `<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`,
      bolt: `<path d="M13 2 3 14h7l-1 8 10-14h-7l1-8z"/>`,
      aqi: `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>`,
      pollen: `<circle cx="12" cy="12" r="2.5"/><path d="M12 5v-2"/><path d="M12 21v-2"/><path d="M5 12H3"/><path d="M21 12h-2"/><path d="M6.8 6.8 5.4 5.4"/><path d="M18.6 18.6l-1.4-1.4"/><path d="M17.2 6.8l1.4-1.4"/><path d="M5.4 18.6l1.4-1.4"/>`,
      swap: `<path d="M7 3v14"/><path d="M4 14l3 3 3-3"/><path d="M17 21V7"/><path d="M14 10l-3-3-3 3"/>`,
    };
    const body = icons[name] || '';
    if (!body) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  },
};
