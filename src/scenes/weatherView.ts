import Phaser from 'phaser';
import type { Weather } from '@core/weather';
import { UI_THEME } from '@data/ui';
import { WEATHER_FX } from '@data/weather';

const RAIN_KEY = 'weather-rain';
const SHADOW_KEY = 'weather-shadow';
/** Kantenlänge der Regen-Textur: Zweierpotenz, damit sie sich in WebGL wiederholen lässt. */
const RAIN_TEX = 128;
const SHADOW_TEX = 128;

/** `rgba(…)` aus einer Token-Farbe (die Leinwand-Texturen brauchen CSS-Farben mit Deckkraft). */
function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/** Regenstreifen (schräg, wie der Wind sie treibt) und ein weicher Schattenfleck, einmal je Spiel erzeugt. */
function ensureTextures(scene: Phaser.Scene): void {
  const fx = WEATHER_FX;
  if (!scene.textures.exists(RAIN_KEY)) {
    const tex = scene.textures.createCanvas(RAIN_KEY, RAIN_TEX, RAIN_TEX);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      // Feste Verteilung (Goldener Schnitt) statt Zufall: dieselben Streifen bei jedem Start.
      const slope = fx.rainDrift / fx.rainSpeed;
      ctx.lineCap = 'round';
      ctx.lineWidth = fx.rainStreakWidth;
      for (let i = 0; i < fx.rainStreaks; i++) {
        const x = ((i * 0.618034) % 1) * RAIN_TEX;
        const y = ((i * 0.381966 + (i % 3) * 0.29) % 1) * RAIN_TEX;
        const len = fx.rainStreakLen * (0.7 + ((i * 7) % 5) * 0.12);
        ctx.strokeStyle = rgba(UI_THEME.surface, 0.55 + ((i * 3) % 4) * 0.12);
        // Streifen, die über den Rand reichen, auch auf der anderen Seite zeichnen (nahtlose Kachel).
        for (const dx of [-RAIN_TEX, 0, RAIN_TEX])
          for (const dy of [-RAIN_TEX, 0, RAIN_TEX]) {
            ctx.beginPath();
            ctx.moveTo(x + dx, y + dy);
            ctx.lineTo(x + dx + slope * len, y + dy + len);
            ctx.stroke();
          }
      }
      tex.refresh();
    }
  }
  if (!scene.textures.exists(SHADOW_KEY)) {
    const tex = scene.textures.createCanvas(SHADOW_KEY, SHADOW_TEX, SHADOW_TEX);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      const r = SHADOW_TEX / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, rgba(UI_THEME.surface, 1));
      g.addColorStop(0.55, rgba(UI_THEME.surface, 0.75));
      g.addColorStop(1, rgba(UI_THEME.surface, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SHADOW_TEX, SHADOW_TEX);
      tex.refresh();
    }
  }
}

export interface WeatherDepths {
  /** Wolkenschatten und grauer Filter liegen über der Welt, Regen darüber, alles unter den Labels. */
  shadows: number;
  gloom: number;
  rain: number;
}

/**
 * Wetter in der Szene (rein kosmetisch, GAME_DESIGN § 12.1, UI_STYLE § 4 „Wetter“): grauer Multiply-Filter bei
 * Wolken und Regen, Regenstreifen in zwei Ebenen über dem ganzen erreichbaren Viertel (Streifen in jeder Zoomstufe
 * gleich groß auf dem Bildschirm) und Wolkenschatten, die an bewölkten Tagen über die Dächer ziehen. Bei „weniger
 * Bewegung“ steht alles still.
 */
export class WeatherView {
  private readonly gloom: Phaser.GameObjects.Rectangle;
  private readonly near: Phaser.GameObjects.TileSprite;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private zoom = 0;
  private alphaKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: Phaser.Geom.Rectangle,
    depth: WeatherDepths,
  ) {
    ensureTextures(scene);
    const b = bounds;
    this.gloom = scene.add
      .rectangle(b.centerX, b.centerY, b.width, b.height, UI_THEME.overcast, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(depth.gloom)
      .setAlpha(0)
      .setVisible(false);
    const rain = (d: number) =>
      scene.add
        .tileSprite(b.x, b.y, b.width, b.height, RAIN_KEY)
        .setOrigin(0, 0)
        .setDepth(d)
        .setAlpha(0)
        .setVisible(false);
    this.far = rain(depth.rain);
    this.near = rain(depth.rain + 0.5);
    const s = WEATHER_FX.shadowSize;
    for (let i = 0; i < WEATHER_FX.shadows; i++) {
      // Gleichmäßig über das Viertel verteilt, leicht versetzt in der Höhe.
      const x = b.x + ((i + 0.5) / WEATHER_FX.shadows) * b.width;
      const y = b.y + (((i * 0.618034) % 1) * 0.8 + 0.1) * b.height;
      this.shadows.push(
        scene.add
          .image(x, y, SHADOW_KEY)
          .setDisplaySize(s.w, s.h)
          .setTint(UI_THEME.ink)
          .setDepth(depth.shadows)
          .setAlpha(0)
          .setVisible(false),
      );
    }
  }

  /**
   * Ein Frame: Deckkraft aus Regenstärke, Bewölkung und Nacht (0..1), Bewegung von Regen und Schatten.
   * `still`: weniger Bewegung (Streifen und Schatten stehen).
   */
  update(dt: number, w: Weather, night: number, still: boolean): void {
    const fx = WEATHER_FX;
    const zoom = this.scene.cameras.main.zoom;
    if (zoom !== this.zoom) {
      // Streifen behalten ihre Bildschirmgröße: herausgezoomt wird die Kachel in der Welt größer.
      this.zoom = zoom;
      this.near.setTileScale(1 / zoom);
      this.far.setTileScale(fx.rainFar.scale / zoom);
    }
    const rainAlpha = w.rain * Phaser.Math.Linear(fx.rainAlpha, fx.rainNightAlpha, night);
    const gloom = fx.cloudsGloom * w.clouds + fx.rainGloom * w.rain;
    // Wolkenschatten nur, solange es nicht regnet (bei Regen ist alles gleichmäßig grau).
    const shadow = fx.shadowAlpha * w.clouds * (1 - w.rain) * (1 - night);
    const key = `${rainAlpha.toFixed(3)}:${gloom.toFixed(3)}:${shadow.toFixed(3)}`;
    if (key !== this.alphaKey) {
      this.alphaKey = key;
      this.near.setAlpha(rainAlpha).setVisible(rainAlpha > 0.005);
      this.far.setAlpha(rainAlpha * fx.rainFar.alpha).setVisible(rainAlpha > 0.005);
      this.gloom.setAlpha(gloom).setVisible(gloom > 0.002);
      for (const s of this.shadows) s.setAlpha(shadow).setVisible(shadow > 0.002);
    }
    if (still) return;
    if (this.near.visible) {
      // Kachel-Koordinaten = Bildschirm-Pixel (Kachel-Maßstab 1/Zoom), die Ebenen fallen also gleich schnell.
      this.near.tilePositionY -= fx.rainSpeed * dt;
      this.near.tilePositionX -= fx.rainDrift * dt;
      this.far.tilePositionY -= (fx.rainSpeed * fx.rainFar.speed * dt) / fx.rainFar.scale;
      this.far.tilePositionX -= (fx.rainDrift * fx.rainFar.speed * dt) / fx.rainFar.scale;
    }
    if (this.shadows[0]?.visible) {
      const b = this.bounds;
      const half = fx.shadowSize.w / 2;
      for (const s of this.shadows) {
        s.x += fx.shadowWind.x * dt;
        s.y += fx.shadowWind.y * dt;
        // Rechts bzw. unten hinaus, links bzw. oben wieder herein.
        if (s.x - half > b.right) s.x = b.left - half;
        if (s.y - fx.shadowSize.h / 2 > b.bottom) s.y = b.top - fx.shadowSize.h / 2;
      }
    }
  }
}
