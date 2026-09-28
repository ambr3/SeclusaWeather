const Utils = {
  IntlCache: new Map(),

  _dtf(tz, opts) {
    const key = `${tz || ''}|${JSON.stringify(opts)}`;
    let f = this.IntlCache.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
      this.IntlCache.set(key, f);
    }
    return f;
  },

  formatTemp(value, units) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const rounded = Math.round(value);
    return units === 'imperial' ? `${rounded}°F` : `${rounded}°C`;
  },

  formatTime(isoString, tz) {
    const d = isoString instanceof Date ? isoString : new Date(isoString);
    let out;
    if (tz) {
      try {
        const input = isoString instanceof Date ? d : this.parseLocal(isoString, tz);
        out = this._dtf(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(input);
      } catch {
        out = null;
      }
    }
    if (!out) out = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    // Keep "8:00 AM" on one line (narrow no-break space before AM/PM).
    return String(out).replace(/\s+(AM|PM)/i, '\u202F$1');
  },

  // Compact clock for tight UI (celestial row / arc labels).
  formatTimeCompact(isoString, tz) {
    return this.formatTime(isoString, tz)
      .replace(/\u202F/g, ' ')
      .replace(/\s+(AM|PM)/i, '\u00A0$1')
      .replace(/\bAM\b/i, 'am')
      .replace(/\bPM\b/i, 'pm');
  },

  formatHourShort(isoString, tz) {
    const d = isoString instanceof Date ? isoString : new Date(isoString);
    if (tz) {
      try {
        const input = isoString instanceof Date ? d : this.parseLocal(isoString, tz);
        return this._dtf(tz, { hour: 'numeric', hour12: true }).format(input);
      } catch {
        /* invalid tz — fall through to device-local formatting */
      }
    }
    return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  },

  // Wall-clock ISO string → epoch, in the given IANA timezone.
  // Falls back to the device-local parse when tz is missing.
  parseLocal(iso, tz) {
    const d = new Date(iso);
    if (!tz || isNaN(d)) return d;
    if (/Z$|[+-]\d\d:\d\d$/.test(iso)) return d;
    const asUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    let offsetMs;
    try {
      offsetMs = this.tzOffsetMs(tz, asUTC);
    } catch {
      return d;
    }
    return new Date(asUTC - offsetMs);
  },

  // tz offset in ms at a given epoch (UTC fields of the tz-local wall-clock
  // minus the epoch itself). Falls back to 0 on invalid input.
  tzOffsetMs(tz, epoch) {
    if (!tz) return 0;
    const parts = {};
    for (const part of this._dtf(tz, {
      hour12: false, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(epoch))) {
      if (part.type !== 'literal') parts[part.type] = parseInt(part.value, 10);
    }
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return Number.isFinite(wall) ? wall - epoch : 0;
  },

  getWindDirection(deg) {
    if (deg == null || !isFinite(deg)) return '—';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  },

  formatWind(speed, deg, unitCode) {
    if (speed == null || !isFinite(speed)) return null;
    const unit = this.getWindUnit(unitCode);
    const rounded = Math.round(speed);
    if (deg == null || !isFinite(deg)) return `${rounded} ${unit}`;
    return `${rounded} ${unit} ${this.getWindDirection(deg)} · ${Math.round(deg)}°`;
  },

  formatSolar(wm2) {
    if (wm2 == null || !isFinite(wm2) || wm2 <= 0) return null;
    return `${Math.round(wm2)} W/m²`;
  },

  formatCape(cape) {
    if (cape == null || !isFinite(cape) || cape < 50) return null;
    const v = Math.round(cape);
    let level = 'Low';
    if (cape >= 1000) level = 'Moderate';
    if (cape >= 2500) level = 'Strong';
    if (cape >= 4000) level = 'Extreme';
    return `${v} J/kg · ${level}`;
  },

  getWindUnit(code) {
    const map = { kmh: 'km/h', mph: 'mph', kn: 'kn', ms: 'm/s' };
    return map[code] || 'km/h';
  },

  formatVisibility(metres, unit) {
    if (metres == null) return '—';
    if (unit === 'mi') {
      const miles = metres / 1609.34;
      if (miles >= 10) return `${Math.round(miles)} mi`;
      return `${miles.toFixed(1)} mi`;
    }
    const km = metres / 1000;
    if (km >= 10) return `${Math.round(km)} km`;
    return `${km.toFixed(1)} km`;
  },

  formatPrecip(value, units) {
    if (value == null || value <= 0) return null;
    const v = Math.round(value * 10) / 10;
    return units === 'imperial' ? `${v} in` : `${v} mm`;
  },

  formatClock(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  formatDuration(seconds) {
    if (seconds == null) return '—';
    let h = Math.floor(seconds / 3600);
    let m = Math.round((seconds % 3600) / 60);
    if (m === 60) { h += 1; m = 0; }
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  },

  // UTC offset (minutes) for an IANA zone at an instant — used for DST scans.
  tzOffsetMinutes(tz, date) {
    if (!tz || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset',
      }).formatToParts(date);
      const name = (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
      if (name === 'GMT' || name === 'UTC') return 0;
      const m = name.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return null;
      const sign = m[1] === '-' ? -1 : 1;
      return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
    } catch {
      return null;
    }
  },

  // Summer / winter clock-change dates for a place's IANA timezone (this year).
  // Uses Intl tzdata — no network. Empty when the zone does not observe DST.
  getClockChanges(tz, year) {
    if (!tz) return null;
    let y = year;
    if (y == null) {
      try {
        y = Number(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(new Date()));
      } catch {
        y = new Date().getFullYear();
      }
    }
    if (!Number.isFinite(y)) return null;

    const fmtDay = (d) => {
      try {
        return d.toLocaleDateString('en-GB', {
          timeZone: tz, day: 'numeric', month: 'short', year: 'numeric',
        });
      } catch {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    };

    try {
      let prevOff = null;
      let prevUtc = null;
      let summer = null;
      let winter = null;
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= 31; day++) {
          const utc = new Date(Date.UTC(y, month, day, 12, 0, 0));
          if (utc.getUTCMonth() !== month) continue;
          const off = this.tzOffsetMinutes(tz, utc);
          if (off == null) return null;
          if (prevOff != null && off !== prevOff) {
            let lo = prevUtc.getTime();
            let hi = utc.getTime();
            while (hi - lo > 3600000) {
              const mid = new Date((lo + hi) / 2);
              const mOff = this.tzOffsetMinutes(tz, mid);
              if (mOff === prevOff) lo = mid.getTime();
              else hi = mid.getTime();
            }
            const at = new Date(hi);
            const label = fmtDay(at);
            if (off > prevOff) {
              if (!summer) summer = label;
            } else if (!winter) {
              winter = label;
            }
          }
          prevOff = off;
          prevUtc = utc;
        }
      }
      return { year: y, summer, winter, observes: !!(summer || winter) };
    } catch {
      return null;
    }
  },

  formatPressure(hPa, unit) {
    if (hPa == null || !Number.isFinite(hPa)) return '—';
    if (unit === 'inHg') return `${(hPa * 0.02953).toFixed(2)} inHg`;
    return `${Math.round(hPa)} hPa`;
  },

  // Open-Meteo returns snowfall in cm for metric requests but in inches when
  // `precipitation_unit=inch` is used — never unit-convert, just relabel.
  formatSnow(v, units) {
    if (v == null || v <= 0) return null;
    if (units === 'imperial') return `${Math.round(v * 10) / 10} in`;
    return `${Math.round(v * 10) / 10} cm`;
  },

  getAQILevel(aqi, scale) {
    if (scale === 'us') {
      if (aqi <= 50) return { label: 'Good', tone: 'good', color: '#4caf50' };
      if (aqi <= 100) return { label: 'Moderate', tone: 'moderate', color: '#ff9800' };
      if (aqi <= 150) return { label: 'Unhealthy for sensitive', tone: 'high', color: '#f44336' };
      if (aqi <= 200) return { label: 'Unhealthy', tone: 'very-high', color: '#9c27b0' };
      if (aqi <= 300) return { label: 'Very Unhealthy', tone: 'extreme', color: '#880e4f' };
      return { label: 'Hazardous', tone: 'hazard', color: '#4a148c' };
    }
    if (aqi <= 20) return { label: 'Good', tone: 'good', color: '#4caf50' };
    if (aqi <= 40) return { label: 'Fair', tone: 'fair', color: '#8bc34a' };
    if (aqi <= 60) return { label: 'Moderate', tone: 'moderate', color: '#ff9800' };
    if (aqi <= 80) return { label: 'Poor', tone: 'high', color: '#f44336' };
    if (aqi <= 100) return { label: 'Very Poor', tone: 'very-high', color: '#9c27b0' };
    return { label: 'Extremely Poor', tone: 'extreme', color: '#880e4f' };
  },

  getUVLevel(uvi) {
    if (uvi <= 2) return { label: 'Low', tone: 'good', color: '#4caf50' };
    if (uvi <= 5) return { label: 'Moderate', tone: 'moderate', color: '#ff9800' };
    if (uvi <= 7) return { label: 'High', tone: 'high', color: '#f44336' };
    if (uvi <= 10) return { label: 'Very High', tone: 'very-high', color: '#9c27b0' };
    return { label: 'Extreme', tone: 'extreme', color: '#880e4f' };
  },

  getTempColor(value, units) {
    const c = units === 'imperial' ? ((value - 32) * 5) / 9 : value;
    if (c <= -15) return '#5b6ee1';
    if (c <= -5) return '#3b7dd8';
    if (c <= 3) return '#4aa3df';
    if (c <= 10) return '#34a0a4';
    if (c <= 16) return '#52b788';
    if (c <= 21) return '#f2a541';
    if (c <= 27) return '#e76f2e';
    if (c <= 33) return '#d0342c';
    return '#a4161a';
  },

  // Discrete tone class for HTML (keeps CSP free of style= color attrs). Hex stays for SVG.
  getTempTone(value, units) {
    const c = units === 'imperial' ? ((value - 32) * 5) / 9 : value;
    if (c <= -15) return 't0';
    if (c <= -5) return 't1';
    if (c <= 3) return 't2';
    if (c <= 10) return 't3';
    if (c <= 16) return 't4';
    if (c <= 21) return 't5';
    if (c <= 27) return 't6';
    if (c <= 33) return 't7';
    return 't8';
  },

  // CSP-safe dynamic CSS via constructable stylesheet (not element.style / style=).
  dynCSS: {
    _sheet: null,
    _map: new Map(),
    _ensure() {
      if (this._sheet) return this._sheet;
      try {
        this._sheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, this._sheet];
        return this._sheet;
      } catch {
        this._sheet = null;
        return null;
      }
    },
    set(key, rule) {
      this._map.set(key, rule);
      this._flush();
    },
    del(key) {
      if (!this._map.delete(key)) return;
      this._flush();
    },
    _flush() {
      const sheet = this._ensure();
      if (!sheet) return;
      try {
        while (sheet.cssRules.length) sheet.deleteRule(0);
        for (const rule of this._map.values()) {
          try { sheet.insertRule(rule, sheet.cssRules.length); } catch { /* skip bad rule */ }
        }
      } catch { /* best-effort */ }
    },
  },

  getMoonPhaseName(phase) {
    const p = phase % 1;
    if (p < 0.0625 || p >= 0.9375) return 'New Moon';
    if (p < 0.1875) return 'Waxing Crescent';
    if (p < 0.3125) return 'First Quarter';
    if (p < 0.4375) return 'Waxing Gibbous';
    if (p < 0.5625) return 'Full Moon';
    if (p < 0.6875) return 'Waning Gibbous';
    if (p < 0.8125) return 'Last Quarter';
    return 'Waning Crescent';
  },

  getMoonIllumination(phase) {
    const p = phase % 1;
    return Math.round(((1 - Math.cos(2 * Math.PI * p)) / 2) * 100);
  },

  getPollenLevel(value) {
    if (value == null) return null;
    if (value < 5) return { label: 'Low', tone: 'good', color: '#4caf50' };
    if (value < 30) return { label: 'Moderate', tone: 'moderate', color: '#ff9800' };
    if (value < 100) return { label: 'High', tone: 'high', color: '#f44336' };
    return { label: 'Very High', tone: 'extreme', color: '#880e4f' };
  },

  getWeatherDescription(code) {
    const descriptions = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
    };
    return descriptions[code] || 'Unknown';
  },

  getThemeClass(weatherCode, isDay) {
    if (isDay === 0) {
      if (weatherCode <= 2) return 'theme-clear-night';
      if (weatherCode <= 3) return 'theme-clouds-night';
      if (weatherCode >= 45 && weatherCode <= 48) return 'theme-mist-night';
      if (weatherCode >= 51 && weatherCode <= 57) return 'theme-drizzle-night';
      if ((weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return 'theme-rain-night';
      if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) return 'theme-snow-night';
      if (weatherCode >= 95) return 'theme-thunder-night';
      return 'theme-clear-night';
    }
    if (weatherCode === 0) return 'theme-clear';
    if (weatherCode <= 3) return 'theme-clouds';
    if (weatherCode >= 45 && weatherCode <= 48) return 'theme-mist';
    if (weatherCode >= 51 && weatherCode <= 57) return 'theme-drizzle';
    if (weatherCode >= 61 && weatherCode <= 67) return 'theme-rain';
    if (weatherCode >= 71 && weatherCode <= 77) return 'theme-snow';
    if (weatherCode >= 80 && weatherCode <= 82) return 'theme-rain';
    if (weatherCode >= 85 && weatherCode <= 86) return 'theme-snow';
    if (weatherCode >= 95) return 'theme-thunder';
    return 'theme-clear';
  },

  debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  safeGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  },

  safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage full or unavailable — best effort
    }
  },

  saveWeatherCache(entry) {
    try {
      localStorage.setItem('weatherCache', JSON.stringify(entry));
    } catch (err) {
      // storage full or unavailable — cache is best-effort
    }
  },

  loadWeatherCache() {
    try {
      const raw = localStorage.getItem('weatherCache');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      if (!data.weather || typeof data.weather !== 'object' || Array.isArray(data.weather)) return null;
      if (data.lat != null && !Number.isFinite(Number(data.lat))) return null;
      if (data.lon != null && !Number.isFinite(Number(data.lon))) return null;
      return data;
    } catch (err) {
      return null;
    }
  },

  // Client-side unit conversion for offline unit/wind toggles. Open-Meteo
  // returns values already converted for the requested units, so a cached
  // payload must be rescaled when the user changes preference without a fetch.
  convertWeatherUnits(weather, fromUnits, toUnits, fromWind, toWind) {
    if (!weather) return weather;
    const clone = JSON.parse(JSON.stringify(weather));
    const tempKeys = [
      'temperature_2m', 'apparent_temperature', 'dew_point_2m',
      'temperature_2m_max', 'temperature_2m_min',
      'apparent_temperature_max', 'apparent_temperature_min',
    ];
    const precipKeys = ['precipitation', 'precipitation_sum', 'rain_sum'];
    const snowKeys = ['snowfall', 'snowfall_sum'];
    const windKeys = [
      'wind_speed_10m', 'wind_gusts_10m',
      'wind_speed_10m_max', 'wind_gusts_10m_max',
    ];

    const mapArr = (obj, key, fn) => {
      if (!obj || obj[key] == null) return;
      if (Array.isArray(obj[key])) obj[key] = obj[key].map((v) => (v == null ? v : fn(v)));
      else obj[key] = fn(obj[key]);
    };

    const convertTemp = (v) => {
      if (fromUnits === toUnits) return v;
      if (fromUnits === 'metric' && toUnits === 'imperial') return v * 9 / 5 + 32;
      if (fromUnits === 'imperial' && toUnits === 'metric') return (v - 32) * 5 / 9;
      return v;
    };
    const convertPrecip = (v) => {
      if (fromUnits === toUnits) return v;
      if (fromUnits === 'metric' && toUnits === 'imperial') return v / 25.4;
      if (fromUnits === 'imperial' && toUnits === 'metric') return v * 25.4;
      return v;
    };
    const convertSnow = (v) => {
      if (fromUnits === toUnits) return v;
      if (fromUnits === 'metric' && toUnits === 'imperial') return v / 2.54;
      if (fromUnits === 'imperial' && toUnits === 'metric') return v * 2.54;
      return v;
    };
    const toKmh = { kmh: 1, mph: 1.60934, kn: 1.852, ms: 3.6 };
    const convertWind = (v) => {
      if (fromWind === toWind) return v;
      const kmh = v * (toKmh[fromWind] || 1);
      return kmh / (toKmh[toWind] || 1);
    };

    const sections = [clone.current, clone.hourly, clone.daily].filter(Boolean);
    for (const sec of sections) {
      for (const k of tempKeys) mapArr(sec, k, convertTemp);
      for (const k of precipKeys) mapArr(sec, k, convertPrecip);
      for (const k of snowKeys) mapArr(sec, k, convertSnow);
      for (const k of windKeys) mapArr(sec, k, convertWind);
    }
    return clone;
  },
};
