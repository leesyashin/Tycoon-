import Phaser from 'phaser';
import type { Weather } from '@core/weather';
import { UI_THEME } from '@data/ui';
import { WEATHER_FX } from '@data/weather';

const DROP_KEY = 'weather-drop';
const SHADOW_KEY = 'weather-shadow';
const SHADOW_TEX = 128;

/** `rgba(…)` aus einer Token-Farbe (die Leinwand-Texturen brauchen CSS-Farben mit Deckkraft). */
function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/** Ein Regentropfen-Streifen (oben durchsichtig, unten hell) und ein weicher Schattenfleck, einmal je Spiel. */
function ensureTextures(scene: Phaser.Scene): void {
  const fx = WEATHER_FX;
  if (!scene.textures.exists(DROP_KEY)) {
    const w = Math.ceil(fx.rainStreakWidth) + 2;
    const h = fx.rainStreakLen;
    const tex = scene.textures.createCanvas(DROP_KEY, w, h);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(UI_THEME.surface, 0));
      g.addColorStop(1, rgba(UI_THEME.surface, 0.95));
      ctx.fillStyle = g;
      ctx.fillRect((w - fx.rainStreakWidth) / 2, 0, fx.rainStreakWidth, h);
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
      g.addColorStop(0.6, rgba(UI_THEME.surface, 0.9));
      g.addColorStop(1, rgba(UI_THEME.surface, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SHADOW_TEX, SHADOW_TEX);
      tex.refresh();
    }
  }
}

/** Deckkraft des grauen Filters bei diesem Wetter (die Szene mischt ihn mit dem Nachtfilter). */
export function gloomOf(w: Weather): number {
  return WEATHER_FX.cloudsGloom * w.clouds + WEATHER_FX.rainGloom * w.rain;
}

export interface WeatherDepths {
  /** Wolkenschatten über der Welt, Regen darüber, beides unter den Labels. */
  shadows: number;
  rain: number;
}

/**
 * Wetter in der Szene (rein kosmetisch, GAME_DESIGN § 12.4, UI_STYLE § 4 „Wetter“): Regentropfen als Partikel – nur
 * die Streifen werden gezeichnet, keine bildschirmfüllende Ebene – und Wolkenschatten, die an bewölkten Tagen über
 * die Dächer ziehen. Der Regen lebt in Bildschirm-Pixeln (Emitter ohne Scroll, Maßstab 1/Zoom): Tropfen sind in
 * jeder Zoomstufe gleich groß und gleich dicht. Bei „weniger Bewegung“ fällt kein Regen und die Schatten stehen; den
 * grauen Himmel mischt die Szene in den Nachtfilter (`gloomOf`).
 */
export class WeatherView {
  private readonly rain: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Ausschnitt oberhalb des Bildschirms, aus dem die Tropfen fallen (lokale Koordinaten = Bildschirm-Pixel). */
  private readonly zone = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private viewKey = '';
  private shadowAlpha = -1;
  private shadowsPlaced = false;
  private raining = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: Phaser.Geom.Rectangle,
    depth: WeatherDepths,
  ) {
    ensureTextures(scene);
    const fx = WEATHER_FX;
    this.rain = scene.add
      .particles(0, 0, DROP_KEY, {
        emitting: false,
        emitZone: { type: 'random', source: this.zone, quantity: 1 },
        speedX: { min: fx.rainDrift * 1.1, max: fx.rainDrift * 0.9 },
        speedY: { min: fx.rainSpeed * 0.85, max: fx.rainSpeed * 1.15 },
        // Streifen in Fallrichtung gedreht.
        rotate: Phaser.Math.RadToDeg(Math.atan2(-fx.rainDrift, fx.rainSpeed)),
        scale: { min: 0.7, max: 1.15 },
        alpha: { start: 1, end: 0.55 },
        tint: UI_THEME.rain,
        lifespan: 1000,
      })
      .setScrollFactor(0)
      .setDepth(depth.rain);
    const s = fx.shadowSize;
    for (let i = 0; i < fx.shadows; i++) {
      this.shadows.push(
        scene.add
          .image(0, 0, SHADOW_KEY)
          .setDisplaySize(s.w, s.h)
          .setTint(UI_THEME.ink)
          .setDepth(depth.shadows)
          .setAlpha(0)
          .setVisible(false),
      );
    }
  }

  /** Fallen gerade Tropfen? (Tests, Szene.) */
  isRaining(): boolean {
    return this.raining;
  }

  /**
   * Ein Frame: Regenstärke, Bewölkung und Nacht (0..1) bestimmen Tropfen und Schatten. `still`: weniger Bewegung.
   */
  update(dt: number, w: Weather, night: number, still: boolean): void {
    const fx = WEATHER_FX;
    this.fitRain(w.rain);
    const rain = still ? 0 : w.rain;
    const on = rain > 0.02;
    if (on !== this.raining) {
      this.raining = on;
      if (on) this.rain.start();
      else this.rain.stop();
    }
    if (on) this.rain.setAlpha(rain * Phaser.Math.Linear(fx.rainAlpha, fx.rainNightAlpha, night));
    // Wolkenschatten nur, solange es nicht regnet (bei Regen ist alles gleichmäßig grau), nachts nicht.
    const shadow = fx.shadowAlpha * w.clouds * (1 - w.rain) * (1 - night);
    if (Math.abs(shadow - this.shadowAlpha) > 0.002) {
      this.shadowAlpha = shadow;
      for (const s of this.shadows) s.setAlpha(shadow).setVisible(shadow > 0.002);
    }
    if (!this.shadows[0]?.visible) return;
    const r = this.shadowArea();
    const hw = fx.shadowSize.w / 2;
    const hh = fx.shadowSize.h / 2;
    if (!this.shadowsPlaced) {
      // Zu Beginn über den Ausschnitt verteilt, damit gleich einer zu sehen ist.
      this.shadowsPlaced = true;
      this.shadows.forEach((s, i) =>
        s.setPosition(
          r.left + ((i + 0.5) / this.shadows.length) * r.width,
          r.top + (((i * 0.618034) % 1) * 0.8 + 0.1) * r.height,
        ),
      );
    }
    for (const s of this.shadows) {
      if (!still) {
        s.x += fx.shadowWind.x * dt;
        s.y += fx.shadowWind.y * dt;
      }
      // Hinausgezogen (oder die Kamera ist weitergewandert): gegen den Wind neben dem Ausschnitt neu ansetzen.
      if (s.x - hw > r.right || s.y - hh > r.bottom || s.x + hw < r.left || s.y + hh < r.top) {
        s.setPosition(r.left - hw * 0.9, r.top + Math.random() * r.height);
      }
    }
  }

  /**
   * Gebiet, in dem Wolkenschatten ziehen: der Kamera-Ausschnitt plus eine Schattengröße ringsum, innerhalb des
   * Viertels. So sind an bewölkten Tagen immer ein paar im Bild, egal wohin geschoben wurde.
   */
  private shadowArea(): Phaser.Geom.Rectangle {
    const v = this.scene.cameras.main.worldView;
    const s = WEATHER_FX.shadowSize;
    const r = new Phaser.Geom.Rectangle(
      v.x - s.w / 2,
      v.y - s.h / 2,
      v.width + s.w,
      v.height + s.h,
    );
    const b = this.bounds;
    // Der schlanke Phaser-Build hat keine Rechteck-Helfer (`Intersection`): Überlappung von Hand.
    const overlaps = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
    return overlaps ? r : b;
  }

  /**
   * Emitter auf Bildschirm-Pixel bringen (bei Zoom- oder Größenänderung) und die Tropfen-Menge an Fläche und
   * Regenstärke anpassen: so dicht wie `rainDensity` je Pixel bei vollem Regen.
   */
  private fitRain(strength: number): void {
    const cam = this.scene.cameras.main;
    const level = Math.round(Phaser.Math.Clamp(strength, 0, 1) * 10);
    const key = `${String(cam.width)}x${String(cam.height)}@${String(cam.zoom)}:${String(level)}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    const fx = WEATHER_FX;
    const z = cam.zoom;
    // Ohne Scroll wirkt nur noch der Zoom um die Bildmitte: so liegt lokal (0, 0) oben links im Bild.
    this.rain
      .setScale(1 / z)
      .setPosition((cam.width / 2) * (1 - 1 / z), (cam.height / 2) * (1 - 1 / z));
    const margin = fx.rainStreakLen * 2;
    const lifespan = ((cam.height + margin * 3) / (fx.rainSpeed * 0.85)) * 1000;
    // Der Wind trägt die Tropfen seitlich: sie starten entsprechend weiter gegen den Wind.
    const drift = fx.rainDrift * (lifespan / 1000);
    const left = Math.min(0, -drift) - margin;
    const right = Math.max(0, -drift) + cam.width + margin;
    this.zone.setTo(left, -margin * 2, right - left, margin);
    this.rain.setParticleLifespan(lifespan);
    // Gleiche Dichte im Bild, obwohl die Tropfen auf einer breiteren Front starten.
    const drops = fx.rainDensity * (right - left) * cam.height * Math.max(0.15, level / 10);
    const perSec = drops / (lifespan / 1000);
    const quantity = Math.max(1, Math.ceil(perSec / 60));
    this.rain.setFrequency((1000 * quantity) / Math.max(1, perSec), quantity);
  }
}
