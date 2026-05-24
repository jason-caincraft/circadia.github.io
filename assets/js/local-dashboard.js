(() => {
  const LOCATION = {
    latitude: 43.6121,
    longitude: -116.3915,
    timezone: "America/Boise",
    label: "Meridian, Idaho"
  };

  const FORECAST_URL = new URL("https://api.open-meteo.com/v1/forecast");
  FORECAST_URL.search = new URLSearchParams({
    latitude: String(LOCATION.latitude),
    longitude: String(LOCATION.longitude),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: LOCATION.timezone
  }).toString();

  const SELECTORS = {
    status: "[data-dashboard-status]",
    statusMessage: "[data-dashboard-status-message]",
    lastUpdated: "[data-last-updated]",
    currentCondition: "[data-current-condition]",
    currentTemperature: "[data-current-temperature]",
    currentApparent: "[data-current-apparent]",
    currentWind: "[data-current-wind]",
    currentPrecipitation: "[data-current-precipitation]",
    forecastList: "[data-forecast-list]",
    gardenGuidance: "[data-garden-guidance]",
    sunrise: "[data-sunrise]",
    sunset: "[data-sunset]",
    aqiStatus: "[data-aqi-status]",
    aqiMessage: "[data-aqi-message]"
  };

  function query(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    const element = query(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function formatTemperature(value) {
    return Number.isFinite(value) ? `${Math.round(value)}\u00b0F` : "--";
  }

  function formatSpeed(value) {
    return Number.isFinite(value) ? `${Math.round(value)} mph` : "--";
  }

  function formatPrecipitation(value) {
    return Number.isFinite(value) ? `${value.toFixed(value >= 1 ? 1 : 2)} in` : "--";
  }

  function formatProbability(value) {
    return Number.isFinite(value) ? `${Math.round(value)}% precip` : "Precip unknown";
  }

  function formatLocalApiTime(value) {
    const match = String(value || "").match(/T(\d{2}):(\d{2})/);
    if (!match) {
      return "--";
    }

    const hour = Number(match[1]);
    const minute = match[2];
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute} ${period}`;
  }

  function formatDayName(value, options = {}) {
    const parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
      return "--";
    }

    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function weatherCodeLabel(code) {
    if (code === 0) {
      return "Clear";
    }
    if (code === 1) {
      return "Mainly clear";
    }
    if (code === 2) {
      return "Partly cloudy";
    }
    if (code === 3) {
      return "Overcast";
    }
    if (code === 45 || code === 48) {
      return "Fog";
    }
    if ([51, 53, 55, 56, 57].includes(code)) {
      return "Drizzle";
    }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
      return "Rain";
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return "Snow";
    }
    if ([95, 96, 99].includes(code)) {
      return "Thunderstorm";
    }
    return "Unknown";
  }

  function setStatus(message, state = "ready") {
    const status = query(SELECTORS.status);
    const statusMessage = query(SELECTORS.statusMessage);

    if (!status || !statusMessage) {
      return;
    }

    status.classList.toggle("is-error", state === "error");
    statusMessage.textContent = message;
  }

  function renderCurrentWeather(current) {
    setText(SELECTORS.currentTemperature, formatTemperature(current.temperature_2m));
    setText(SELECTORS.currentApparent, formatTemperature(current.apparent_temperature));
    setText(SELECTORS.currentWind, formatSpeed(current.wind_speed_10m));
    setText(SELECTORS.currentPrecipitation, formatPrecipitation(current.precipitation));
    setText(SELECTORS.currentCondition, weatherCodeLabel(current.weather_code));
  }

  function renderSunTimes(daily) {
    setText(SELECTORS.sunrise, formatLocalApiTime(daily.sunrise?.[0]));
    setText(SELECTORS.sunset, formatLocalApiTime(daily.sunset?.[0]));
  }

  function createForecastDay(daily, index) {
    const item = document.createElement("section");
    item.className = "forecast-day";
    item.setAttribute("aria-label", formatDayName(daily.time[index], {
      weekday: "long",
      month: "long",
      day: "numeric"
    }));

    const date = document.createElement("div");
    date.className = "forecast-date";

    const dayName = document.createElement("strong");
    dayName.textContent = index === 0 ? "Today" : formatDayName(daily.time[index], { weekday: "short" });

    const calendarDate = document.createElement("span");
    calendarDate.textContent = formatDayName(daily.time[index], { month: "short", day: "numeric" });

    date.append(dayName, calendarDate);

    const temps = document.createElement("div");
    temps.className = "forecast-temps";

    const high = document.createElement("span");
    high.className = "forecast-pill";
    high.textContent = `High ${formatTemperature(daily.temperature_2m_max?.[index])}`;

    const low = document.createElement("span");
    low.className = "forecast-pill";
    low.textContent = `Low ${formatTemperature(daily.temperature_2m_min?.[index])}`;

    temps.append(high, low);

    const meta = document.createElement("div");
    meta.className = "forecast-meta";
    meta.textContent = `${weatherCodeLabel(daily.weather_code?.[index])} / ${formatProbability(daily.precipitation_probability_max?.[index])}`;

    item.append(date, temps, meta);
    return item;
  }

  function renderForecast(daily) {
    const list = query(SELECTORS.forecastList);
    if (!list) {
      return;
    }

    list.replaceChildren();
    const dayCount = Math.min(7, daily.time?.length || 0);

    if (dayCount === 0) {
      const empty = document.createElement("p");
      empty.className = "dashboard-card-copy";
      empty.textContent = "Forecast data is unavailable right now.";
      list.append(empty);
      return;
    }

    for (let index = 0; index < dayCount; index += 1) {
      list.append(createForecastDay(daily, index));
    }
  }

  function buildGardenGuidance(current, daily) {
    const highs = (daily.temperature_2m_max || []).slice(0, 7).filter(Number.isFinite);
    const lows = (daily.temperature_2m_min || []).slice(0, 7).filter(Number.isFinite);
    const precipChances = (daily.precipitation_probability_max || []).slice(0, 4).filter(Number.isFinite);
    const guidance = [];

    const coldestLow = Math.min(...lows.slice(0, 3));
    const hottestHigh = Math.max(...highs.slice(0, 3));
    const maxHighWeek = Math.max(...highs);
    const maxPrecipChance = precipChances.length ? Math.max(...precipChances) : null;
    const currentPrecip = Number.isFinite(current.precipitation) ? current.precipitation : 0;

    if (Number.isFinite(coldestLow) && coldestLow <= 36) {
      guidance.push({
        type: "warning",
        text: `Frost watch: an overnight low near ${Math.round(coldestLow)}\u00b0F shows up in the next few nights. Cover tender starts and keep an eye on containers.`
      });
    }

    if (Number.isFinite(hottestHigh) && hottestHigh >= 90) {
      guidance.push({
        type: "warning",
        text: `Heat stress: a high near ${Math.round(hottestHigh)}\u00b0F is forecast soon. Water deeply early and give new transplants afternoon shade if possible.`
      });
    }

    if (Number.isFinite(maxHighWeek) && maxHighWeek >= 82 && (maxPrecipChance === null || maxPrecipChance < 30) && currentPrecip < 0.05) {
      guidance.push({
        type: "warning",
        text: "Watering reminder: warm days and low rain chances are lining up. Check soil moisture before the afternoon heat settles in."
      });
    }

    const mildPlantingDay = highs.some((high, index) => {
      const low = lows[index];
      const precipChance = daily.precipitation_probability_max?.[index];
      return high >= 62 && high <= 82 && low >= 40 && (!Number.isFinite(precipChance) || precipChance <= 50);
    });

    if (mildPlantingDay) {
      guidance.push({
        type: "note",
        text: "Good planting weather appears in the forecast: mild highs, safer lows, and no major rain signal on at least one day."
      });
    }

    if (guidance.length === 0) {
      guidance.push({
        type: "note",
        text: "No sharp yard alerts from the current forecast. A normal soil check and light walk-through should cover it."
      });
    }

    return guidance;
  }

  function renderGardenGuidance(current, daily) {
    const list = query(SELECTORS.gardenGuidance);
    if (!list) {
      return;
    }

    list.replaceChildren();
    for (const item of buildGardenGuidance(current, daily)) {
      const listItem = document.createElement("li");
      if (item.type === "warning") {
        listItem.className = "is-warning";
      }
      listItem.textContent = item.text;
      list.append(listItem);
    }
  }

  function renderAirQualityPlaceholder() {
    setText(SELECTORS.aqiStatus, "Ready later");
    setText(
      SELECTORS.aqiMessage,
      "AQI integration can be added later with AirNow, OpenAQ, or another public source. This card is ready for a no-secret-key data feed when the source is chosen."
    );
  }

  function renderLastUpdated(label = "Last updated") {
    const updated = query(SELECTORS.lastUpdated);
    if (!updated) {
      return;
    }

    const now = new Date();
    updated.hidden = false;
    updated.textContent = `${label} ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(now)}`;
  }

  function renderUnavailableState() {
    setText(SELECTORS.currentCondition, "Unavailable");
    setText(SELECTORS.currentTemperature, "--");
    setText(SELECTORS.currentApparent, "--");
    setText(SELECTORS.currentWind, "--");
    setText(SELECTORS.currentPrecipitation, "--");
    setText(SELECTORS.sunrise, "--");
    setText(SELECTORS.sunset, "--");

    const forecastList = query(SELECTORS.forecastList);
    if (forecastList) {
      const message = document.createElement("p");
      message.className = "dashboard-card-copy";
      message.textContent = "The 7-day forecast could not be loaded. Try refreshing later.";
      forecastList.replaceChildren(message);
    }

    const guidance = query(SELECTORS.gardenGuidance);
    if (guidance) {
      const item = document.createElement("li");
      item.className = "is-warning";
      item.textContent = "Garden guidance is paused until weather data is available again.";
      guidance.replaceChildren(item);
    }
  }

  async function loadDashboard() {
    renderAirQualityPlaceholder();

    try {
      const response = await fetch(FORECAST_URL.toString(), {
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Open-Meteo request failed with ${response.status}`);
      }

      const data = await response.json();
      if (!data.current || !data.daily) {
        throw new Error("Open-Meteo response was missing current or daily weather data.");
      }

      renderCurrentWeather(data.current);
      renderSunTimes(data.daily);
      renderForecast(data.daily);
      renderGardenGuidance(data.current, data.daily);
      renderLastUpdated();
      setStatus(`Weather loaded for ${LOCATION.label}.`);
    } catch (error) {
      renderUnavailableState();
      renderLastUpdated("Last checked");
      setStatus("Weather data could not be loaded right now. The static quick links are still available.", "error");
      console.error("Local dashboard weather load failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDashboard);
  } else {
    loadDashboard();
  }
})();
