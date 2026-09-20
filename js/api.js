const API = {
  async fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        if (res.status === 400) throw new Error('Invalid request. Check your search.');
        if (res.status === 404) throw new Error('City not found. Check the spelling.');
        if (res.status === 429) throw new Error('Too many requests. Wait a moment.');
        throw new Error('Unable to fetch weather data.');
      }
      return res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  async searchCities(query) {
    const url = `${CONFIG.GEOCODING_BASE}/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
    const data = await this.fetchJSON(url);
    if (!data.results) return [];
    return data.results.map(r => ({
      lat: r.latitude,
      lon: r.longitude,
      name: r.name,
      country: r.country_code,
      admin1: r.admin1 || '',
      tz: r.timezone,
    }));
  },

  async getWeather(lat, lon, units, windUnit) {
    const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
    const precipUnit = units === 'imperial' ? 'inch' : 'mm';
    const days = 14;
    const params = [
      `latitude=${lat}`,
      `longitude=${lon}`,
      `current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,surface_pressure,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,visibility,dew_point_2m,cape`,
      `hourly=temperature_2m,apparent_temperature,dew_point_2m,weather_code,precipitation_probability,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,cloud_cover,visibility,pressure_msl,cape,shortwave_radiation,is_day`,
      `daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,moonrise,moonset,moon_phase,precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,uv_index_clear_sky_max,sunshine_duration,daylight_duration,shortwave_radiation_sum`,
      `temperature_unit=${tempUnit}`,
      `wind_speed_unit=${windUnit || 'kmh'}`,
      `precipitation_unit=${precipUnit}`,
      `forecast_days=${days}`,
      `timezone=auto`,
    ];
    return this.fetchJSON(`${CONFIG.WEATHER_BASE}/v1/forecast?${params.join('&')}`);
  },

  async getAirQuality(lat, lon) {
    const params = [
      `latitude=${lat}`,
      `longitude=${lon}`,
      `current=european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`,
      `timezone=auto`,
    ];
    return this.fetchJSON(`${CONFIG.AIR_QUALITY_BASE}/v1/air-quality?${params.join('&')}`);
  },

};
