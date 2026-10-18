/**
 * Wetter (GAME_DESIGN § 12.4): rein kosmetisch, ändert keine Rate. Jeder Spieltag hat je Standort eine feste Art –
 * Sonne, Wolken oder Regen –, an Regentagen mit einem Schauer, der sanft einsetzt und aufhört. Events legen das
 * Wetter fest (Regentag, Hitzewelle).
 */
export type WeatherKind = 'sun' | 'clouds' | 'rain';

export const WEATHER_KINDS: readonly WeatherKind[] = ['sun', 'clouds', 'rain'];

/** Anteil der Tage je Wetter (Summe 1). Standorte ohne Eintrag nutzen `default`. */
export const CLIMATE: Readonly<Record<string, Readonly<Record<WeatherKind, number>>>> = {
  default: { sun: 0.45, clouds: 0.3, rain: 0.25 },
  berlin: { sun: 0.4, clouds: 0.35, rain: 0.25 },
  kyoto: { sun: 0.45, clouds: 0.3, rain: 0.25 },
  tokyo: { sun: 0.45, clouds: 0.3, rain: 0.25 },
  seoul: { sun: 0.5, clouds: 0.3, rain: 0.2 },
  newyork: { sun: 0.45, clouds: 0.35, rain: 0.2 },
  // Tropen: kurze, kräftige Schauer, selten nur grau.
  bali: { sun: 0.5, clouds: 0.15, rain: 0.35 },
};

export const WEATHER = {
  /** Der erste Spieltag ist immer sonnig (erster Eindruck, Tutorial). */
  firstDaySun: true,
  /** Schauer an Regentagen: Beginn zur vollen Stunde zwischen `from` und `to`, Dauer in Stunden. */
  showerStart: { from: 7, to: 16 },
  showerHours: { min: 2, max: 6 },
  /** So viele Spielminuten setzt der Regen ein bzw. hört auf. */
  rampMinutes: 25,
  /** An Regentagen ist es auch außerhalb des Schauers so bewölkt (0..1). */
  rainDayClouds: 0.75,
  /** Events, die das Wetter festlegen (der Regentag regnet durchgehend). */
  eventWeather: { rainyDay: 'rain', heatwave: 'sun' } as Readonly<Record<string, WeatherKind>>,
  /** Symbol im HUD: Regen ab dieser Stärke, Wolke ab dieser Bewölkung, sonst Sonne bzw. nachts Mond. */
  hud: { rainFrom: 0.15, cloudsFrom: 0.5, nightFrom: 0.5 },
} as const;

/** Optik in der Szene (`scenes/weatherView.ts`). */
export const WEATHER_FX = {
  /** Grauer Multiply-Filter (`--c-overcast`, mit dem Nachtfilter gemischt): bei voller Bewölkung, plus bei Regen. */
  cloudsGloom: 0.1,
  rainGloom: 0.14,
  /** Tropfen: Deckkraft bei vollem Regen (nachts etwas weniger), Fall und Wind in Bildschirm-Pixeln je Sekunde. */
  rainAlpha: 0.75,
  rainNightAlpha: 0.5,
  rainSpeed: 620,
  rainDrift: -110,
  /** Streifen eines Tropfens (Pixel) und Tropfen je Bildschirm-Pixel bei vollem Regen (390×844 ≈ 300). */
  rainStreakLen: 18,
  rainStreakWidth: 1.6,
  rainDensity: 0.0009,
  /** Wolkenschatten an bewölkten Tagen: Anzahl, Größe (Welt-Pixel), Deckkraft, Wind (Welt-Pixel je Sekunde). */
  shadows: 4,
  shadowSize: { w: 900, h: 460 },
  shadowAlpha: 0.24,
  shadowWind: { x: 16, y: 6 },
  /** Ab dieser Regenstärke spannen Gäste draußen den Schirm auf und meiden die Terrasse. */
  umbrellaFrom: 0.25,
  /** Schirm-Farben (Frames `umbrella-<n>`). */
  umbrellaColors: 4,
} as const;
