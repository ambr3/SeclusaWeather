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
    if (tz) {
      try {
        const input = isoString instanceof Date ? d : this.parseLocal(isoString, tz);
        return this._dtf(tz, { hour: '2-digit', minute: '2-digit', hour12: true }).format(input);
      } catch {
        /* invalid tz — fall through to device-local formatting */
      }
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
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
      if (aqi <= 50) return { label: 'Good', color: '#4caf50' };
      if (aqi <= 100) return { label: 'Moderate', color: '#ff9800' };
      if (aqi <= 150) return { label: 'Unhealthy for sensitive', color: '#f44336' };
      if (aqi <= 200) return { label: 'Unhealthy', color: '#9c27b0' };
      if (aqi <= 300) return { label: 'Very Unhealthy', color: '#880e4f' };
      return { label: 'Hazardous', color: '#4a148c' };
    }
    if (aqi <= 20) return { label: 'Good', color: '#4caf50' };
    if (aqi <= 40) return { label: 'Fair', color: '#8bc34a' };
    if (aqi <= 60) return { label: 'Moderate', color: '#ff9800' };
    if (aqi <= 80) return { label: 'Poor', color: '#f44336' };
    if (aqi <= 100) return { label: 'Very Poor', color: '#9c27b0' };
    return { label: 'Extremely Poor', color: '#880e4f' };
  },

  getUVLevel(uvi) {
    if (uvi <= 2) return { label: 'Low', color: '#4caf50' };
    if (uvi <= 5) return { label: 'Moderate', color: '#ff9800' };
    if (uvi <= 7) return { label: 'High', color: '#f44336' };
    if (uvi <= 10) return { label: 'Very High', color: '#9c27b0' };
    return { label: 'Extreme', color: '#880e4f' };
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
    if (value < 5) return { label: 'Low', color: '#4caf50' };
    if (value < 30) return { label: 'Moderate', color: '#ff9800' };
    if (value < 100) return { label: 'High', color: '#f44336' };
    return { label: 'Very High', color: '#880e4f' };
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
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  },
};
