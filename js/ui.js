const UI = {
  $: (id) => document.getElementById(id),

  _hourlyAll: false,
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
  CHART_MODES: ['temp', 'rain', 'solar'],

  _getMeasureCtx() {
    if (!this._measureCanvas) {
      this._measureCanvas = document.createElement('canvas');
      this._measureCtx = this._measureCanvas.getContext('2d');
    }
    this._measureCtx.font = '600 18px system-ui, sans-serif';
    return this._measureCtx;
  },

  _arcPos(ARC, t) {
    const seg = ARC.length - 1;
    const i = Math.max(0, Math.min(seg - 1, Math.floor(t * seg)));
    const f = Math.max(0, Math.min(1, t * seg - i));
    const a = ARC[i];
    const b = ARC[i + 1];
    return { left: a[0] + (b[0] - a[0]) * f, top: a[1] + (b[1] - a[1]) * f };
  },

  _arcFor(rise, set, tz) {
    if (!rise || !set) return null;
    const r = Utils.parseLocal(rise, tz).getTime();
    let s = Utils.parseLocal(set, tz).getTime();
    if (isNaN(r) || isNaN(s)) return null;
    if (s <= r) {
      // Set falls on the next local day — advance by one local day so DST
      // transitions don't skew the arc (offset delta between the two days).
      const offNow = Utils.tzOffsetMs(tz, s);
      const offNext = Utils.tzOffsetMs(tz, s + 24 * 60 * 60 * 1000);
      s += 24 * 60 * 60 * 1000 + (offNow - offNext);
    }
    const duration = s - r;
    if (duration > 26 * 60 * 60 * 1000 || duration < 0) return null;
    const t = (Date.now() - r) / (s - r);
    return { pos: this._arcPos(this._arc.ARC, Math.max(0, Math.min(1, t))), below: t < 0 || t > 1 };
  },

  _hourlyStartIdx(hourly) {
    if (!hourly || !hourly.time) return 0;
    const now = Date.now();
    for (let i = 0; i < hourly.time.length; i++) {
      if (Utils.parseLocal(hourly.time[i], this._tz).getTime() >= now) return i;
    }
    return hourly.time.length;
  },

  setHourlyRange(all) {
    this._hourlyAll = all;
  },

  showLoading() {
    this.$('loading').classList.remove('hidden');
    this.$('errorMessage').classList.add('hidden');
    this.$('weatherContent').classList.add('hidden');
  },

  hideLoading() {
    this.$('loading').classList.add('hidden');
  },

  showError(msg) {
    this.hideLoading();
    this.$('weatherContent').classList.add('hidden');
    const el = this.$('errorMessage');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  hideError() {
    this.$('errorMessage').classList.add('hidden');
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

  renderCurrentWeather(data, units) {
    if (!data || !data.current) return;
    const c = data.current;
    const d = data.daily || {};
    const currentPop = (d.time && d.time[0]) ? this.daytimeMaxPop(d.time[0], data.hourly) : null;
    const iconCode = WeatherIcons.adjustForPrecip(c.weather_code, currentPop, c.precipitation ?? 0, c.snowfall ?? 0);
    const icon = WeatherIcons.get(iconCode, c.is_day);
    const temp = Utils.formatTemp(c.temperature_2m, units);
    const feels = Utils.formatTemp(c.apparent_temperature, units);
    const desc = Utils.getWeatherDescription(iconCode);

    const sunrise = d.sunrise && d.sunrise[0] ? Utils.formatTime(d.sunrise[0], this._tz) : '—';
    const sunset = d.sunset && d.sunset[0] ? Utils.formatTime(d.sunset[0], this._tz) : '—';
    const moonrise = d.moonrise && d.moonrise[0] ? Utils.formatTime(d.moonrise[0], this._tz) : '—';
    const moonset = d.moonset && d.moonset[0] ? Utils.formatTime(d.moonset[0], this._tz) : '—';
    const phase = d.moon_phase && d.moon_phase.length ? d.moon_phase[0] : null;
    const phaseRow = phase != null
      ? `${Utils.getMoonPhaseName(phase)} · ${Utils.getMoonIllumination(phase)}% illuminated`
      : '';

    const dayHigh = d.temperature_2m_max && d.temperature_2m_max[0] != null ? Utils.formatTemp(d.temperature_2m_max[0], units) : null;
    const dayLow = d.temperature_2m_min && d.temperature_2m_min[0] != null ? Utils.formatTemp(d.temperature_2m_min[0], units) : null;
    const todayPop = (d.time && d.time[0]) ? this.daytimeMaxPop(d.time[0], data.hourly) : null;
    const dayPop = todayPop != null ? todayPop : (d.precipitation_probability_max != null ? Math.round(d.precipitation_probability_max[0] ?? 0) : null);
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const dayWind = c.wind_speed_10m != null ? `${Math.round(c.wind_speed_10m)} ${windUnit}` : null;
    const summaryParts = [];
    if (dayHigh && dayLow) summaryParts.push(`High ${dayHigh} / Low ${dayLow}`);
    if (dayPop != null && dayPop > 0) summaryParts.push(`${dayPop}% rain`);
    if (dayWind) summaryParts.push(`Wind ${dayWind}`);
    const daySummary = summaryParts.length ? summaryParts.join(' · ') : '';

    const ARC = (() => {
      const pts = [];
      const n = 64;
      const inset = 10;
      const base = 66;
      const apexY = 24;
      const rx = 50 - inset;
      const ry = base - apexY;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const th = Math.PI * (1 - t);
        const x = 50 + rx * Math.cos(th);
        const y = base - ry * Math.sin(th);
        pts.push([+x.toFixed(2), +y.toFixed(2)]);
      }
      return pts;
    })();
    this._arc = { ARC, tz: this._tz, sunrise: d.sunrise && d.sunrise[0], sunset: d.sunset && d.sunset[0], moonrise: d.moonrise && d.moonrise[0], moonset: d.moonset && d.moonset[0] };

    const sunArc = this._arcFor(d.sunrise && d.sunrise[0], d.sunset && d.sunset[0], this._tz);
    const moonArc = this._arcFor(d.moonrise && d.moonrise[0], d.moonset && d.moonset[0], this._tz);

    this.$('currentWeather').innerHTML = `
      <div class="current-weather__top">
        <div>
          <div class="current-weather__location">
            ${this._esc(data._cityName)}<span class="current-weather__country">${this._esc(data._country)}</span>
          </div>
          <div class="current-weather__desc">${desc}</div>
        </div>
        <div class="current-weather__icon${c.is_day === 0 ? ' is-night' : ''}">${icon}</div>
      </div>
      <div class="current-weather__temp-row">
        <div class="current-weather__temp">${temp}</div>
        ${daySummary ? `<div class="current-weather__summary">${daySummary}</div>` : ''}
      </div>
      <div class="current-weather__meta">
        <div class="current-weather__feels">Feels like ${feels}</div>
        <div class="current-weather__updated" id="currentUpdated">Updated ${Utils.formatClock(new Date())}</div>
      </div>
      <div class="current-weather__celestial">
        <div class="celestial">
          <div class="celestial__title">Sun</div>
          <div class="celestial__times">
            <div class="celestial__row"><span class="celestial__label">Rise</span><span class="celestial__value">${sunrise}</span></div>
            <div class="celestial__row"><span class="celestial__label">Set</span><span class="celestial__value">${sunset}</span></div>
          </div>
        </div>
        <div class="celestial-divider" aria-hidden="true"></div>
        <div class="celestial">
          <div class="celestial__title">Moon</div>
          <div class="celestial__times">
            <div class="celestial__row"><span class="celestial__label">Rise</span><span class="celestial__value">${moonrise}</span></div>
            <div class="celestial__row"><span class="celestial__label">Set</span><span class="celestial__value">${moonset}</span></div>
          </div>
        </div>
      </div>
      ${phaseRow ? `<div class="current-weather__phase">${phaseRow}</div>` : ''}
      <div class="current-weather__arc" aria-hidden="true">
        <svg class="current-weather__arc-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line class="current-weather__arc-horizon" x1="0" y1="66" x2="100" y2="66" vector-effect="non-scaling-stroke"/>
          <line class="current-weather__arc-noonline" x1="50" y1="24" x2="50" y2="66" vector-effect="non-scaling-stroke"/>
          <polyline class="current-weather__arc-line" points="${ARC.map((p) => p.join(',')).join(' ')}" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="current-weather__arc-label current-weather__arc-label--rise">${sunrise !== '—' ? sunrise : ''}</div>
        <div class="current-weather__arc-label current-weather__arc-label--set">${sunset !== '—' ? sunset : ''}</div>
        <div class="current-weather__arc-noon">Noon</div>
        <div class="current-weather__arc-orb current-weather__arc-sun${sunArc && sunArc.below ? ' is-below' : ''}" style="${sunArc ? `left:${sunArc.pos.left}%;top:${sunArc.pos.top}%` : 'display:none'}">${WeatherIcons._sun()}</div>
        <div class="current-weather__arc-orb current-weather__arc-moon${moonArc && moonArc.below ? ' is-below' : ''}" style="${moonArc ? `left:${moonArc.pos.left}%;top:${moonArc.pos.top}%` : 'display:none'}">${WeatherIcons._moon()}</div>
      </div>
    `;

    const theme = Utils.getThemeClass(iconCode, c.is_day);
    const isDark = document.body.classList.contains('theme-dark');
    const isDyn = document.body.classList.contains('dynamic-text');
    document.body.classList.remove('theme-clear', 'theme-clear-night',
      'theme-clouds', 'theme-clouds-night', 'theme-rain', 'theme-rain-night',
      'theme-snow', 'theme-snow-night', 'theme-thunder', 'theme-thunder-night',
      'theme-drizzle', 'theme-drizzle-night', 'theme-mist', 'theme-mist-night');
    document.body.classList.add(theme);
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('dynamic-text', isDyn);
    const themeColors = {
      'theme-clear': '#2e7cf0', 'theme-clear-night': '#14204e',
      'theme-clouds': '#3f79c6', 'theme-rain': '#465369',
      'theme-snow': '#b7cbe0', 'theme-thunder': '#101633',
      'theme-drizzle': '#55677e', 'theme-mist': '#8295aa',
      'theme-clouds-night': '#2a3f66', 'theme-rain-night': '#1e3a5c',
      'theme-snow-night': '#33486b', 'theme-thunder-night': '#1a2040',
      'theme-drizzle-night': '#243d5e', 'theme-mist-night': '#38466b'
    };
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = themeColors[theme] || '#4facfe';

    this.startLiveClock();
  },

  startLiveClock() {
    if (this._liveClockTimer) clearInterval(this._liveClockTimer);
    this._liveClockTimer = setInterval(() => this.updateLiveClock(), 60000);
  },

  updateLiveClock() {
    const updated = this.$('currentUpdated');
    if (updated) updated.textContent = `Updated ${Utils.formatClock(new Date())}`;
    if (!this._arc) return;
    const { tz, sunrise, sunset, moonrise, moonset } = this._arc;
    const sun = this._arcFor(sunrise, sunset, tz);
    const moon = this._arcFor(moonrise, moonset, tz);
    const sunEl = document.querySelector('.current-weather__arc-sun');
    const moonEl = document.querySelector('.current-weather__arc-moon');
    if (sunEl && sun) {
      sunEl.style.left = `${sun.pos.left}%`;
      sunEl.style.top = `${sun.pos.top}%`;
      sunEl.classList.toggle('is-below', sun.below);
    }
    if (moonEl && moon) {
      moonEl.style.left = `${moon.pos.left}%`;
      moonEl.style.top = `${moon.pos.top}%`;
      moonEl.classList.toggle('is-below', moon.below);
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
    const todayPop = (d.time && d.time[0]) ? this.daytimeMaxPop(d.time[0], data.hourly) : null;
    const popToday = todayPop != null ? todayPop : (d.precipitation_probability_max != null ? Math.round(d.precipitation_probability_max[0] ?? 0) : null);
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
      { label: 'UV Index', icon: this._metricIcon('uv'), value: uv != null ? `<span class="uv-badge" style="background:${uvInfo.color}">${Math.round(uv)}</span>` : '—', sub: uv != null ? `${uvInfo.label}${uvClear != null ? ` · clear sky ${Math.round(uvClear)}` : ''}` : 'Not available' },
      { label: 'Visibility', icon: this._metricIcon('visibility'), value: Utils.formatVisibility(c.visibility, UI.visUnit), sub: 'Current visibility' },
      { label: 'Pressure', icon: this._metricIcon('pressure'), value: pressureMsl != null ? Utils.formatPressure(pressureMsl, UI.pressUnit) : pressure != null ? Utils.formatPressure(pressure, UI.pressUnit) : '—', sub: pressureMsl != null && pressure != null ? `MSL ${Utils.formatPressure(pressureMsl, UI.pressUnit)} · Surface ${Utils.formatPressure(pressure, UI.pressUnit)}` : 'Atmospheric pressure · tap to toggle', id: 'pressureBox' },
    ];

    const cape = c.cape != null ? Math.round(c.cape) : null;
    if (cape != null) {
      let capeInfo;
      if (cape < 300) capeInfo = { label: 'None', color: '#5fb84d', desc: 'Stable air, no thunderstorms' };
      else if (cape < 1000) capeInfo = { label: 'Low', color: '#5fb84d', desc: 'Weak thunderstorm potential' };
      else if (cape < 2000) capeInfo = { label: 'Moderate', color: '#ff9800', desc: 'Thunderstorms possible' };
      else if (cape < 3000) capeInfo = { label: 'High', color: '#f44336', desc: 'Strong storms likely' };
      else capeInfo = { label: 'Extreme', color: '#880e4f', desc: 'Severe storms expected' };
      conditions.push({ label: 'Thunderstorm risk', icon: this._metricIcon('bolt'), value: `<span style="color:${capeInfo.color}">${capeInfo.label}</span>`, sub: capeInfo.desc });
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
          <span class="conditions-item__value">${aqLevel ? `<span class="uv-badge" style="background:${aqLevel.color}">${aqi}</span> <span style="color:${aqLevel.color}">${aqLevel.label}</span>` : '<span class="uv-badge">—</span>'}</span>
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
        <span class="conditions-item__value"><span style="color:#5fb84d">Low</span></span>
        <span class="conditions-item__sub">Little to no pollen</span>
      </div>
    `;
    } else if (pollenPresent.length && pollenPresent.some(([, v]) => v > 0)) {
      const top = [...pollenPresent].sort((a, b) => b[1] - a[1]);
      const pLevel = Utils.getPollenLevel(top[0][1]);
      const pollenColors = { Low: '#5fb84d', Moderate: '#ff9800', High: '#f44336', 'Very High': '#880e4f' };
      const barColor = pollenColors[pLevel.label] || '#5fb84d';
      const bars = top.slice(0, 3).map(([label, v]) => {
        const pct = Math.max(2, Math.min(100, Math.round(v)));
        return `
          <div class="pollen-row">
            <span class="pollen-row__label">${label}</span>
            <span class="pollen-row__bar"><span class="pollen-row__fill" style="width:${pct}%;background:${barColor}"></span></span>
            <span class="pollen-row__value">${Math.round(v)}</span>
          </div>
        `;
      }).join('');
      pollenBlock = `
        <div class="conditions-item conditions-item--wide">
          <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
          <span class="conditions-item__value"><span style="color:${pLevel.color}">${pLevel.label}</span></span>
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
      <div class="detail-box detail-box--conditions" style="animation-delay:0s">
        <div class="detail-box__title">Conditions</div>
        <div class="conditions-grid">
          ${conditionsGrid}
          ${aqiBlock}
          ${pollenBlock}
        </div>
      </div>
    `);

    const mapBox = `
      <div class="detail-box detail-box--compass" id="compassSection">
        <div class="detail-box__title">Wind direction</div>
        <div class="compass-container" id="compassContainer"></div>
      </div>
    `;

    boxes.push(mapBox);
    container.innerHTML = `<div class="detail-grid">${boxes.join('')}</div>`;
    container.classList.remove('hidden');

    const pressBox = document.getElementById('pressureBox');
    if (pressBox) {
      pressBox.style.cursor = 'pointer';
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
    if (!container || !section) return;

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

    container.innerHTML = `
      <div class="weather-compass">
        <div class="weather-compass__wind">
          <span class="weather-compass__now-label">Wind now</span>
          <span class="weather-compass__wind-speed">${windLabel || 'Wind —'}${gustLabel ? `<span class="weather-compass__gust"> &middot; gusts ${gustLabel}</span>` : ''}</span>
          ${dirDeg != null ? `<span class="weather-compass__wind-dir">blowing ${toDir} &middot; from ${fromDir}</span>` : ''}
        </div>
        <div class="weather-compass__rose">
          <svg viewBox="0 0 100 100" class="weather-compass__svg" role="img"
               aria-label="${dirDeg != null ? `Wind from ${fromDir}, blowing toward ${toDir}` : 'Wind direction not available'}">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5"/>
            <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" stroke-opacity="0.1" stroke-width="1" stroke-dasharray="2 3"/>
            ${ticks}
            ${cardinals}
            ${arrow}
            <circle cx="50" cy="50" r="3.4" fill="currentColor" opacity="0.6"/>
          </svg>
        </div>
        ${todayWind ? `
        <div class="weather-compass__today" aria-label="Today's wind detail">
          <span class="weather-compass__today-title">Today's wind</span>
          ${todayWind.maxGust ? `<span class="weather-compass__today-row"><b>Gustiest</b> ${todayWind.maxGust}</span>` : ''}
          ${todayWind.maxWind ? `<span class="weather-compass__today-row"><b>Strongest</b> ${todayWind.maxWind}</span>` : ''}
          ${todayWind.minWind ? `<span class="weather-compass__today-row"><b>Calmest</b> ${todayWind.minWind}</span>` : ''}
          ${todayWind.prevailing ? `<span class="weather-compass__today-row"><b>Prevailing</b> from ${todayWind.prevailing}</span>` : ''}
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
    if (section) section.classList.add('hidden');
  },

  // Max precipitation probability across daytime hours (is_day === 1) for a date.
  daytimeMaxPop(dateStr, hourly) {
    if (!hourly || !hourly.time || !hourly.precipitation_probability || !hourly.is_day) return null;
    const prefix = dateStr + 'T';
    let max = 0;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!hourly.time[k].startsWith(prefix)) continue;
      if (hourly.is_day[k] !== 1) continue;
      const p = hourly.precipitation_probability[k];
      if (p != null && p > max) max = p;
    }
    return max;
  },

  // Min/max across the 24 hours of a date for a given hourly key (e.g. dew point).
  dayMinMax(dateStr, hourly, key) {
    if (!hourly || !hourly.time || !hourly[key]) return null;
    const prefix = dateStr + 'T';
    let min = null;
    let max = null;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!hourly.time[k].startsWith(prefix)) continue;
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
      const pop = this.daytimeMaxPop(date, hourly) ?? (daily.precipitation_probability_max != null ? Math.round(daily.precipitation_probability_max[i] ?? 0) : 0);
      const rainSum = daily.rain_sum ? daily.rain_sum[i] : null;
      const snowSum = daily.snowfall_sum ? daily.snowfall_sum[i] : null;
      const weatherCode = WeatherIcons.dominantDayCode(date, hourly, pop, rainSum, snowSum, units) ?? daily.weather_code[i];
      const iconCode = WeatherIcons.dailyIcon(weatherCode, pop, rainSum, snowSum, units);
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
            <span class="forecast-card__row-label">${label}</span>
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
        <div class="forecast-card__pager" role="tablist" aria-label="Forecast days">
          ${dots}
          <span class="forecast-card__pagerlabel">
            <svg class="forecast-card__pagericon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg>
            <span class="forecast-card__pagerlead">Swipe to see</span>
            <span class="forecast-card__pagerrange">days 1–7</span>
            <span class="forecast-card__pagerlead forecast-card__pagerlead--tap">· tap any day to enlarge for more info</span>
          </span>
        </div>
      </div>
    `;

    const pagerEl = this.$('forecastCards').querySelector('.forecast-card__pager');
    const pagesEl = this.$('forecastCards').querySelector('.forecast-card__pages');
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
    const startIdx = this._hourlyStartIdx(hourly);
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const count = this._hourlyAll ? hourly.time.length - startIdx : 24;
    this._hourly = hourly;
    this._hourlyStart = startIdx;
    this._hourlyCount = Math.min(Math.max(count, 0), Math.max(0, hourly.time.length - startIdx));
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

    let prevKey = '';
    const parts = [];
    hourly.time.slice(startIdx, startIdx + count).forEach((time, i) => {
      const idx = startIdx + i;
      const temp = hourly.temperature_2m && hourly.temperature_2m[idx] != null
        ? Utils.formatTemp(hourly.temperature_2m[idx], units)
        : '—';
      const timeLabel = i === 0 ? 'Now' : Utils.formatHourShort(time, this._tz);
      const pop = hourly.precipitation_probability ? hourly.precipitation_probability[idx] : null;
      const wind = hourly.wind_speed_10m && hourly.wind_speed_10m[idx] != null ? Math.round(hourly.wind_speed_10m[idx]) : null;
      const windDir = hourly.wind_direction_10m && hourly.wind_direction_10m[idx] != null ? Math.round(hourly.wind_direction_10m[idx]) : null;
      const precipNow = hourly.precipitation && hourly.precipitation[idx] != null ? hourly.precipitation[idx] : 0;
      const snowNow = hourly.snowfall && hourly.snowfall[idx] != null ? hourly.snowfall[idx] : 0;
      const iconCode = WeatherIcons.adjustForPrecip(hourly.weather_code[idx], pop, precipNow, snowNow);
      const icon = WeatherIcons.get(iconCode, hourly.is_day && hourly.is_day[idx] != null ? hourly.is_day[idx] : 1);
      const desc = Utils.getWeatherDescription(iconCode);
      const windDirLabel = windDir != null ? Utils.getWindDirection(windDir) : '';
      const humidity = hourly.relative_humidity_2m && hourly.relative_humidity_2m[idx] != null ? `${Math.round(hourly.relative_humidity_2m[idx])}%` : '';
      const feelsLike = hourly.apparent_temperature && hourly.apparent_temperature[idx] != null
        ? Utils.formatTemp(hourly.apparent_temperature[idx], units)
        : null;

      const dateKey = time.slice(0, 10);
      if (i === 0 || dateKey !== prevKey) {
        let dateLabel;
        if (dateKey === todayKey) dateLabel = 'Today';
        else if (dateKey === tomorrowKey) dateLabel = 'Tomorrow';
        else dateLabel = Utils.parseLocal(time, this._tz)
          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        parts.push(`<div class="hourly-tile__day">${dateLabel}</div>`);
      }
      prevKey = dateKey;

      const subParts = [];
      if (feelsLike) subParts.push(`Feels ${feelsLike}`);
      if (pop != null && pop > 0) subParts.push(`${Math.round(pop)}% rain`);
      if (wind != null) subParts.push(`Wind ${wind} ${windUnit}${windDirLabel ? ' ' + windDirLabel : ''}`);
      if (humidity) subParts.push(`Humidity ${humidity}`);
      const sub = subParts.slice(0, 2).join(' · ');

      parts.push(`
        <div class="hourly-tile${i === 0 ? ' hourly-tile--now' : ''}" role="listitem" data-i="${i}">
          <div class="hourly-tile__time">${timeLabel}</div>
          <div class="hourly-tile__icon">${icon}</div>
          <div class="hourly-tile__temp">${temp}</div>
          <div class="hourly-tile__label">${desc}</div>
          ${sub ? `<div class="hourly-tile__sub">${sub}</div>` : ''}
        </div>
      `);
    });

    const tilesHtml = parts.join('');
    this.$('hourlyScroll').innerHTML = `
      <div class="hourly-card hourly-card--hscroll" role="list">
        <div class="hourly-card__strip">${tilesHtml}</div>
        <div class="hourly-card__hint" id="hourlyHint"><svg class="hourly-card__hinticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg><span>Swipe to see more hours · Tap any hour to enlarge for more info</span></div>
      </div>
    `;

    this._updateHourlyScroll();
    if (!this._hourlyModalBound) this._bindHourlyModal();
  },

  _updateHourlyScroll() {
    const strip = document.querySelector('.hourly-card__strip');
    const card = strip && strip.closest('.hourly-card--hscroll');
    if (!strip) return;
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    card.classList.toggle('hourly-card--overflow', overflow);
  },

  _bindHourlyModal() {
    const scroll = this.$('hourlyScroll');
    const modal = this.$('hourlyModal');
    if (!scroll || !modal) return;

    scroll.addEventListener('click', (e) => {
      const card = e.target.closest('.hourly-tile');
      if (card && !this._modalOpen) this.openHourlyDetail(parseInt(card.dataset.i, 10) || 0);
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

    modal.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (!e.target.closest('.hourly-modal__card')) return;
      down = true; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
    });
    modal.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'touch') return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (axis === 'x') e.preventDefault();
    });
    modal.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType === 'touch') return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) this._navModal(peakX < 0 ? 1 : -1);
    });
    modal.addEventListener('pointercancel', () => { down = false; axis = null; });

    modal.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.hourly-modal__card')) return;
      const t = e.touches[0];
      if (!t) return;
      down = true; startX = t.clientX; startY = t.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
    }, { passive: true });
    modal.addEventListener('touchmove', (e) => {
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
    modal.addEventListener('touchend', () => {
      if (!down) return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) this._navModal(peakX < 0 ? 1 : -1);
      axis = null;
    });
    modal.addEventListener('touchcancel', () => { down = false; axis = null; });

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
    this._modalCount = this._hourlyCount;
    this._modalIndex = Math.max(0, Math.min(this._hourlyCount - 1, i));
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  openForecastDetail(i) {
    if (!this._forecastDaily || !this._forecastDaily.time || !this._forecastCount) return;
    this._modalMode = 'forecast';
    this._modalCount = this._forecastCount;
    this._modalIndex = Math.max(0, Math.min(this._forecastCount - 1, i));
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  _navModal(dir) {
    if (this._modalIndex == null || this._modalCount == null) return;
    const n = this._modalIndex + dir;
    if (n < 0 || n >= this._modalCount) return;
    this._modalIndex = n;
    this._modalSlideDir = dir;
    this._renderHourlyModal();
  },


  closeHourlyDetail() {
    const modal = this.$('hourlyModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    }
    this._modalOpen = false;
    document.body.classList.remove('has-modal');
    if (this._modalKeyHandler) {
      document.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
  },

  _renderHourlyModal() {
    if (this._modalMode === 'forecast') { this._renderForecastModal(); return; }
    const modal = this.$('hourlyModal');
    if (!modal || !this._hourly) return;
    const h = this._hourly;
    const idx = this._hourlyStart + this._modalIndex;
    const time = h.time && h.time[idx];
    if (time == null) { this.closeHourlyDetail(); return; }

    const units = this._modalUnits || 'metric';
    const temp = h.temperature_2m && h.temperature_2m[idx] != null ? Utils.formatTemp(h.temperature_2m[idx], units) : '—';
    const tempRaw = h.temperature_2m && h.temperature_2m[idx];
    const tempColor = tempRaw != null ? Utils.getTempColor(tempRaw, units) : null;
    const feels = h.apparent_temperature && h.apparent_temperature[idx] != null ? Utils.formatTemp(h.apparent_temperature[idx], units) : null;
    const feelsRaw = h.apparent_temperature && h.apparent_temperature[idx];
    const feelsVal = feels != null ? (feelsRaw != null ? `<span style="color:${Utils.getTempColor(feelsRaw, units)}">${feels}</span>` : feels) : null;
    const dewPoint = h.dew_point_2m && h.dew_point_2m[idx] != null ? Utils.formatTemp(h.dew_point_2m[idx], units) : null;
    const pop = h.precipitation_probability ? h.precipitation_probability[idx] : null;
    const precip = h.precipitation ? h.precipitation[idx] : 0;
    const snow = h.snowfall ? h.snowfall[idx] : 0;
    const wind = h.wind_speed_10m && h.wind_speed_10m[idx] != null ? Math.round(h.wind_speed_10m[idx]) : null;
    const windDir = h.wind_direction_10m && h.wind_direction_10m[idx] != null ? Math.round(h.wind_direction_10m[idx]) : null;
    const humidity = h.relative_humidity_2m && h.relative_humidity_2m[idx] != null ? `${Math.round(h.relative_humidity_2m[idx])}%` : null;
    const pressure = h.pressure_msl && h.pressure_msl[idx] != null ? Utils.formatPressure(h.pressure_msl[idx], UI.pressUnit) : null;
    const cloud = h.cloud_cover && h.cloud_cover[idx] != null ? `${Math.round(h.cloud_cover[idx])}%` : null;
    const visibility = h.visibility && h.visibility[idx] != null ? Utils.formatVisibility(h.visibility[idx], UI.visUnit) : null;
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const windVal = wind != null ? `${wind} ${windUnit}${windDir != null ? ` ${Utils.getWindDirection(windDir)}` : ''}` : null;

    const iconCode = WeatherIcons.adjustForPrecip(h.weather_code[idx], pop, precip, snow);
    const icon = WeatherIcons.get(iconCode, h.is_day && h.is_day[idx] != null ? h.is_day[idx] : 1);
    const desc = Utils.getWeatherDescription(iconCode);

    const stat = (label, value, tint) => value != null
      ? `<div class="hourly-modal__stat${tint ? ` hourly-modal__stat--${tint}` : ''}"><span class="hourly-modal__stat-label">${label}</span><span class="hourly-modal__stat-value">${value}</span></div>`
      : '';

    const tLabel = this._modalIndex === 0 ? 'Now' : Utils.formatHourShort(time, this._tz);
    let dLabel = '';
    const dateKey = String(time).slice(0, 10);
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const today = dtf.format(new Date());
      const [y, m, d] = today.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      if (dateKey === today) dLabel = 'Today';
      else if (dateKey === tomorrow) dLabel = 'Tomorrow';
      else dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    const creating = modal.classList.contains('hidden') || !modal.querySelector('.hourly-modal__card');
    let body = modal.querySelector('.hourly-modal__body');
    if (creating) {
      modal.innerHTML = `
        <div class="hourly-modal__backdrop"></div>
        <div class="hourly-modal__card">
          <button type="button" class="hourly-modal__nav hourly-modal__nav--prev" aria-label="Previous hour">&lsaquo;</button>
          <div class="hourly-modal__body"></div>
          <button type="button" class="hourly-modal__close" aria-label="Close">&times;</button>
          <button type="button" class="hourly-modal__nav hourly-modal__nav--next" aria-label="Next hour">&rsaquo;</button>
        </div>
      `;
      modal.classList.remove('hidden');
      document.body.classList.add('has-modal');
      body = modal.querySelector('.hourly-modal__body');
    } else if (this._modalSlideDir && body) {
      const anim = `${this._modalSlideDir === 1 ? 'hourlyModalInLeft' : 'hourlyModalInRight'} 0.3s cubic-bezier(0.22, 1, 0.36, 1)`;
      body.style.animation = 'none';
      void body.offsetWidth;
      body.style.animation = anim;
      this._modalSlideDir = 0;
    }

    if (body) {
      body.innerHTML = `
        <div class="hourly-modal__scrollhint">Scroll up/down for all stats</div>
        <div class="hourly-modal__date">${dLabel}</div>
        <div class="hourly-modal__time">${tLabel}</div>
        <div class="hourly-modal__icon">${icon}</div>
        <div class="hourly-modal__temp"${tempColor ? ` style="color:${tempColor};-webkit-text-fill-color:${tempColor}"` : ''}>${temp}</div>
        <div class="hourly-modal__desc">${desc}</div>
        <div class="hourly-modal__stats">
          ${stat('Feels', feelsVal, 'feels')}
          ${stat('Rain', pop != null ? `${Math.round(pop)}%` : null, 'rain')}
          ${stat('Precip', Utils.formatPrecip(precip, units), 'precip')}
          ${stat('Snow', Utils.formatSnow(snow, units), 'snow')}
          ${stat('Humidity', humidity, 'humidity')}
          ${stat('Wind', windVal, 'wind')}
          ${stat('Pressure', pressure, 'pressure')}
          ${stat('Clouds', cloud, 'clouds')}
          ${stat('Visibility', visibility, 'visibility')}
          ${stat('Dew point', dewPoint, 'dew')}
        </div>
        <div class="hourly-modal__hint">Swipe or use <kbd>&larr;</kbd> <kbd>&rarr;</kbd> to browse hours</div>
      `;
      body.scrollTop = 0;
    }

    const focus = modal.querySelector('.hourly-modal__close');
    if (focus) focus.focus();
  },

  _renderForecastModal() {
    const modal = this.$('hourlyModal');
    if (!modal || !this._forecastDaily) return;
    const d = this._forecastDaily;
    const i = this._modalIndex;
    const date = d.time && d.time[i];
    if (date == null) { this.closeHourlyDetail(); return; }

    const units = this._forecastUnits || 'metric';
    const high = d.temperature_2m_max && d.temperature_2m_max[i] != null ? Utils.formatTemp(d.temperature_2m_max[i], units) : '—';
    const low = d.temperature_2m_min && d.temperature_2m_min[i] != null ? Utils.formatTemp(d.temperature_2m_min[i], units) : '—';
    const feelsHigh = d.apparent_temperature_max && d.apparent_temperature_max[i] != null ? Utils.formatTemp(d.apparent_temperature_max[i], units) : null;
    const feelsLow = d.apparent_temperature_min && d.apparent_temperature_min[i] != null ? Utils.formatTemp(d.apparent_temperature_min[i], units) : null;
    const pop = this.daytimeMaxPop(date, this._forecastHourly) ?? (d.precipitation_probability_max != null ? Math.round(d.precipitation_probability_max[i] ?? 0) : 0);
    const rainSum = d.rain_sum ? d.rain_sum[i] : null;
    const snowSum = d.snowfall_sum ? d.snowfall_sum[i] : null;
    const windMax = d.wind_speed_10m_max && d.wind_speed_10m_max[i] != null ? Math.round(d.wind_speed_10m_max[i]) : null;
    const gustMax = d.wind_gusts_10m_max && d.wind_gusts_10m_max[i] != null ? Math.round(d.wind_gusts_10m_max[i]) : null;
    const windDir = d.wind_direction_10m_dominant && d.wind_direction_10m_dominant[i] != null ? Math.round(d.wind_direction_10m_dominant[i]) : null;
    const uv = d.uv_index_max && d.uv_index_max[i] != null ? d.uv_index_max[i] : null;
    const uvClear = d.uv_index_clear_sky_max && d.uv_index_clear_sky_max[i] != null ? Math.round(d.uv_index_clear_sky_max[i]) : null;
    const sunshine = d.sunshine_duration ? d.sunshine_duration[i] : null;
    const daylight = d.daylight_duration && d.daylight_duration[i] != null ? Utils.formatDuration(d.daylight_duration[i]) : null;
    const precipHours = d.precipitation_hours && d.precipitation_hours[i] != null ? `${Math.round(d.precipitation_hours[i])}h` : null;
    const sunrise = d.sunrise && d.sunrise[i] ? Utils.formatTime(d.sunrise[i], this._tz) : null;
    const sunset = d.sunset && d.sunset[i] ? Utils.formatTime(d.sunset[i], this._tz) : null;
    const moonPhase = d.moon_phase && d.moon_phase[i] != null ? d.moon_phase[i] : null;
    const moonInfo = moonPhase != null ? `${Utils.getMoonPhaseName(moonPhase)} · ${Utils.getMoonIllumination(moonPhase)}%` : null;
    const moonrise = d.moonrise && d.moonrise[i] ? Utils.formatTime(d.moonrise[i], this._tz) : null;
    const moonset = d.moonset && d.moonset[i] ? Utils.formatTime(d.moonset[i], this._tz) : null;
    const tempMaxRaw = d.temperature_2m_max && d.temperature_2m_max[i];
    const tempColor = tempMaxRaw != null ? Utils.getTempColor(tempMaxRaw, units) : null;
    const dew = date ? this.dayMinMax(date, this._forecastHourly, 'dew_point_2m') : null;
    const dewVal = dew ? `${Utils.formatTemp(dew.min, units)} / ${Utils.formatTemp(dew.max, units)}` : null;

    const iconCode = WeatherIcons.dailyIcon(
      WeatherIcons.dominantDayCode(date, this._forecastHourly, pop, rainSum ?? 0, snowSum ?? 0, units) ?? d.weather_code[i],
      pop, rainSum ?? 0, snowSum ?? 0, units
    );
    const icon = WeatherIcons.get(iconCode, true);
    const desc = Utils.getWeatherDescription(iconCode);
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const uvInfo = uv != null ? Utils.getUVLevel(uv) : null;
    const feelsHighRaw = d.apparent_temperature_max && d.apparent_temperature_max[i];
    const feelsVal = feelsHigh != null && feelsLow != null
      ? (feelsHighRaw != null
          ? `<span style="color:${Utils.getTempColor(feelsHighRaw, units)}">${feelsHigh} / ${feelsLow}</span>`
          : `${feelsHigh} / ${feelsLow}`)
      : null;

    const stat = (label, value, tint) => value != null
      ? `<div class="hourly-modal__stat${tint ? ` hourly-modal__stat--${tint}` : ''}"><span class="hourly-modal__stat-label">${label}</span><span class="hourly-modal__stat-value">${value}</span></div>`
      : '';

    const summaryBits = [];
    if (desc && high !== '—' && low !== '—') summaryBits.push(`${desc} with a high of ${high} and a low of ${low}.`);
    else if (desc) summaryBits.push(`${desc}.`);
    else if (high !== '—' && low !== '—') summaryBits.push(`High ${high} / Low ${low}.`);
    const summaryExtras = [];
    if (pop > 0) summaryExtras.push(`${Math.round(pop)}% chance of rain`);
    else if (rainSum && rainSum > 0) summaryExtras.push(`${Utils.formatPrecip(rainSum, units)} of rain expected`);
    if (snowSum && snowSum > 0) summaryExtras.push(`${Utils.formatSnow(snowSum, units)} of snow expected`);
    if (windMax != null) summaryExtras.push(`winds up to ${windMax} ${windUnit}${gustMax != null ? `, gusting ${gustMax} ${windUnit}` : ''}`);
    if (uv != null && uvInfo) summaryExtras.push(`UV ${Math.round(uv)} (${uvInfo.label.toLowerCase()})`);
    if (summaryExtras.length) summaryBits.push(summaryExtras.join(', '));
    const summary = summaryBits.join(' ');

    const parsed = Utils.parseLocal(date + 'T00:00:00', this._tz);
    const weekday = i === 0 ? 'Today' : parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'long' });
    const dateHeading = parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, month: 'long', day: 'numeric' });
    const windVal = windMax != null
      ? `${windMax} ${windUnit}${gustMax != null ? ` · gusts ${gustMax}` : ''}${windDir != null ? ` ${Utils.getWindDirection(windDir)}` : ''}`
      : null;

    const creating = modal.classList.contains('hidden') || !modal.querySelector('.hourly-modal__card');
    let body = modal.querySelector('.hourly-modal__body');
    if (creating) {
      modal.innerHTML = `
        <div class="hourly-modal__backdrop"></div>
        <div class="hourly-modal__card">
          <button type="button" class="hourly-modal__nav hourly-modal__nav--prev" aria-label="Previous day">&lsaquo;</button>
          <div class="hourly-modal__body"></div>
          <button type="button" class="hourly-modal__close" aria-label="Close">&times;</button>
          <button type="button" class="hourly-modal__nav hourly-modal__nav--next" aria-label="Next day">&rsaquo;</button>
        </div>
      `;
      modal.classList.remove('hidden');
      document.body.classList.add('has-modal');
      body = modal.querySelector('.hourly-modal__body');
    } else if (this._modalSlideDir && body) {
      const anim = `${this._modalSlideDir === 1 ? 'hourlyModalInLeft' : 'hourlyModalInRight'} 0.3s cubic-bezier(0.22, 1, 0.36, 1)`;
      body.style.animation = 'none';
      void body.offsetWidth;
      body.style.animation = anim;
      this._modalSlideDir = 0;
    }

    if (body) {
      body.innerHTML = `
        <div class="hourly-modal__date">${weekday}</div>
        <div class="hourly-modal__time">${dateHeading}</div>
        <div class="hourly-modal__icon">${icon}</div>
        <div class="hourly-modal__temp"${tempColor ? ` style="color:${tempColor};-webkit-text-fill-color:${tempColor}"` : ''}>${high}<span class="hourly-modal__temp-low"> / ${low}</span></div>
        <div class="hourly-modal__desc">${desc}</div>
        ${summary ? `<div class="hourly-modal__summary">${summary}</div>` : ''}
        ${stat('Sun', sunrise && sunset ? `${sunrise} <span class="hourly-modal__stat-arrow">&#8593;</span> / ${sunset} <span class="hourly-modal__stat-arrow">&#8595;</span>` : null, 'sun')}
        <div class="hourly-modal__hint">Swipe or use <kbd>&larr;</kbd> <kbd>&rarr;</kbd> to browse days</div>
      `;
      body.scrollTop = 0;
    }

    const focus = modal.querySelector('.hourly-modal__close');
    if (focus) focus.focus();
  },

  renderHourlyChart(hourly, units) {
    const container = this.$('hourlyChart');
    if (!container || !hourly || !hourly.time) return;

    container.classList.remove('hidden');
    this._bindChartSwipe(container);

    const W = Math.max(320, container.clientWidth || 600);
    const H = 320;
    const padR = 16, padT = 30, padB = 48;
    const ih = H - padT - padB;
    let padL = 58;

    const startIdx = this._hourlyStartIdx(hourly);
    const count = 24;
    const times = hourly.time.slice(startIdx, startIdx + count);
    const mode = this._chartMode;
    const modeLabel = this._chartModeLabel(mode);
    const modePillsMarkup = this.CHART_MODES.map((m) =>
      `<button type="button" class="hourly-chart__mode${m === mode ? ' is-active' : ''}" role="tab" aria-selected="${m === mode}" data-mode="${m}">${this._chartModeShort(m)}</button>`
    ).join('');
    const empty = () => {
      container.innerHTML = `
        <div class="hourly-chart__head">
          <span class="hourly-chart__title">${modeLabel}</span>
          <div class="hourly-chart__nav" role="group" aria-label="Change chart">
            <button type="button" class="hourly-chart__arrow" data-dir="prev" aria-label="Previous chart">‹</button>
            <button type="button" class="hourly-chart__arrow" data-dir="next" aria-label="Next chart">›</button>
          </div>
        </div>
        <div class="hourly-chart__modes" role="tablist" aria-label="Chart type">${modePillsMarkup}</div>
        <div class="hourly-chart__empty">No data available for this chart.</div>`;
    };
    if (!times.length) { empty(); return; }
    const slice = (key) => hourly[key] ? hourly[key].slice(startIdx, startIdx + count) : null;

    const pops = slice('precipitation_probability');

    let cfg;
    if (mode === 'rain') {
      if (!pops) { empty(); return; }
      cfg = {
        min: 0, max: 100, suffix: '%',
        values: pops, color: '#38BDF8', cells: true,
        legend: [{ label: 'chance of rain', swatch: '#38BDF8' }],
      };
    } else if (mode === 'solar') {
      const raw = slice('shortwave_radiation');
      if (!raw) { empty(); return; }
      const fullSun = 1000;
      const vals = raw.map((v) => v == null ? null : Math.max(0, Math.min(100, Math.round((v / fullSun) * 100))));
      cfg = {
        min: 0, max: 100, values: vals, color: '#FACC15', suffix: '%',
        legend: [{ label: 'Sun strength (%)', swatch: '#FACC15' }],
      };
    } else {
      const vals = slice('temperature_2m');
      if (!vals) { empty(); return; }
      const suffix = units === 'imperial' ? '°F' : '°C';
      cfg = {
        values: vals, suffix: '°', tempGrad: true,
        second: slice('dew_point_2m') || [],
        legend: [
          { label: `Temperature (${suffix})`, swatch: '#FF7043' },
          { label: `Dew point (${suffix})`, swatch: '#26C6DA' },
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
      xlabels += `<text x="${pos(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${Utils.formatHourShort(times[i], this._tz)}</text>`;
    }
    if (labelStep < 24) {
      const parts = times[0].slice(0, 10).split('-').map(Number);
      const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)).toISOString().slice(0, 10) + 'T00:00:00';
      const dayEnd = Utils.parseLocal(next, this._tz);
      xlabels += `<text x="${pos(times.length).toFixed(1)}" y="${H - 12}" text-anchor="end" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${Utils.formatHourShort(dayEnd, this._tz)}</text>`;
    }

    let line = '', dots = '', cells = '', defs = '';
    if (cfg.cells) {
      const baseY = padT + ih;
      const scale = (t) => (t - minT) / span;
      cfg.values.forEach((t, i) => {
        if (!Number.isFinite(t)) return;
        const h = Math.max(2, scale(t) * ih);
        const op = (0.45 + 0.55 * Math.min(1, scale(t))).toFixed(2);
        const x0 = (cellsPos.pos(i) - cellsPos.bw / 2).toFixed(1);
        const y0 = (baseY - h).toFixed(1);
        cells += `<rect x="${x0}" y="${y0}" width="${cellsPos.bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${cellsPos.rx}" fill="${cfg.color}" fill-opacity="${op}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>`;
      });
      cells += `<rect x="${padL}" y="${(baseY - 1).toFixed(1)}" width="${iw.toFixed(1)}" height="1" fill="currentColor" fill-opacity="0.15"/>`;
    } else if (cfg.values) {
      // Sparse series may contain null/NaN entries; drop them so polylines and
      // area fills never receive invalid coordinates.
      const path = (arr) => arr
        .map((t, i) => (Number.isFinite(t) ? `${x(i).toFixed(1)},${y(t).toFixed(1)}` : null))
        .filter(Boolean).join(' ');
      const points = path(cfg.values);
      const area = points ? `${padL},${(padT + ih).toFixed(1)} ${points} ${x(times.length - 1).toFixed(1)},${(padT + ih).toFixed(1)}` : '';
      const gustPoints = cfg.gusts ? path(cfg.gusts) : '';
      if (cfg.tempGrad) {
        const gradStops = [1, 0.75, 0.5, 0.25, 0].map((f) => {
          const t = minT + span * f;
          return `<stop offset="${Math.round(f * 100)}%" stop-color="${Utils.getTempColor(t, units)}"/>`;
        }).join('');
        defs = `<linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient>`;
        line = `<polygon points="${area}" fill="url(#tempGrad)" fill-opacity="0.22"/>
                <polyline points="${points}" fill="none" stroke="url(#tempGrad)" stroke-width="11" stroke-opacity="0.25" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="${points}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="${points}" fill="none" stroke="url(#tempGrad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        dots = cfg.values.map((t, i) => {
          if (!Number.isFinite(t)) return '';
          return `<circle cx="${x(i).toFixed(1)}" cy="${y(t).toFixed(1)}" r="4.5" fill="${Utils.getTempColor(t, units)}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>`;
        }).join('');
      } else {
        line = `<polygon points="${area}" fill="${cfg.color}" fill-opacity="0.18"/>
                <polyline points="${points}" fill="none" stroke="${cfg.color}" stroke-width="10" stroke-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="${points}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="${points}" fill="none" stroke="${cfg.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (gustPoints) {
          line += `<polyline points="${gustPoints}" fill="none" stroke="${cfg.gustColor}" stroke-width="7" stroke-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>
                   <polyline points="${gustPoints}" fill="none" stroke="${cfg.gustColor}" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        dots = cfg.values.map((t, i) => {
          if (!Number.isFinite(t)) return '';
          return `<circle cx="${x(i).toFixed(1)}" cy="${y(t).toFixed(1)}" r="4.5" fill="${cfg.color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>`;
        }).join('');
      }
      if (cfg.second && cfg.second.length) {
        const dpPoints = path(cfg.second);
        line += `<polyline points="${dpPoints}" fill="none" stroke="#26C6DA" stroke-width="6" stroke-opacity="0.25" stroke-linecap="round" stroke-linejoin="round"/>
                 <polyline points="${dpPoints}" fill="none" stroke="#26C6DA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 4"/>`;
        dots += cfg.second.map((t, i) => {
          if (!Number.isFinite(t)) return '';
          return `<circle cx="${x(i).toFixed(1)}" cy="${y(t).toFixed(1)}" r="3.5" fill="#26C6DA" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/>`;
        }).join('');
      }
    }

    container.innerHTML = `
      <div class="hourly-chart__head">
        <span class="hourly-chart__title">${modeLabel}</span>
        <div class="hourly-chart__nav" role="group" aria-label="Change chart">
          <button type="button" class="hourly-chart__arrow" data-dir="prev" aria-label="Previous chart">‹</button>
          <button type="button" class="hourly-chart__arrow" data-dir="next" aria-label="Next chart">›</button>
        </div>
      </div>
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
          ${cfg.legend.map((l) => `<span class="hourly-chart__legend-item"><span class="hourly-chart__legend-swatch" style="background:${l.swatch}"></span>${l.label}</span>`).join('')}
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
    return mode === 'temp' ? 'Temp & Dew'
      : mode === 'rain' ? 'Rain'
      : 'Solar';
  },

  _chartModeLabel(mode) {
    return mode === 'rain' ? 'Rain'
      : mode === 'solar' ? 'Sun strength'
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
      if (modeBtn) {
        this._setMode(modeBtn.getAttribute('data-mode'));
        return;
      }
      const arrow = e.target.closest('.hourly-chart__arrow');
      if (arrow) this._cycleChart(arrow.getAttribute('data-dir') === 'next' ? 1 : -1);
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
    weatherData._cityName = cityName;
    weatherData._country = country;
    this.$('weatherContent').classList.remove('hidden');
    this.$('weatherContent').classList.add('weather-content--visible');
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
      if (!hourly.time[k].startsWith(prefix)) continue;
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
