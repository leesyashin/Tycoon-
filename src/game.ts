import Phaser from 'phaser';
import type { Store } from '@core/store';
import { UI_CONFIG, UI_THEME } from '@data/ui';
import type { SfxId } from '@data/audio';
import { BootScene } from '@scenes/BootScene';
import { CafeScene } from '@scenes/CafeScene';
import { REGISTRY, UI_EVENTS } from '@scenes/registry';

export interface GameHandle {
  /** Szene soll ihre Texte neu setzen (Sprachwechsel). */
  langChanged(): void;
}

export interface GameOptions {
  store: Store;
  debugSpawn: number;
  onSfx(id: SfxId): void;
  onOpenStation(id: string): void;
  /** Die Café-Szene steht (Atlas geladen). */
  onReady(): void;
}

/**
 * Rendert der Browser ohne GPU (Software-Rasterizer wie SwiftShader/llvmpipe, gesperrter Treiber)? Dann liest
 * der Compositor die WebGL-Leinwand jeden Frame auf die CPU zurück (~10 ms Haupt-Thread pro Frame).
 */
function isSoftwareRenderer(game: Phaser.Game): boolean {
  const renderer = game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer>;
  const gl = renderer.gl;
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/** Bildrate nachträglich deckeln (Phaser liest `fps.limit` sonst nur beim Start). */
function limitFps(game: Phaser.Game, fps: number): void {
  const loop = game.loop as Phaser.Core.TimeStep & { _limitRate: number };
  loop.fpsLimit = fps;
  loop.hasFpsLimit = true;
  loop._limitRate = 1000 / fps;
  loop.sleep();
  loop.wake(true);
}

/**
 * Phaser-Teil als eigener Chunk (PLAN S9 „Performance“): `main.ts` lädt ihn erst, nachdem HUD und Store
 * laufen. So ist das Spiel bedienbar, bevor die ~1 MB Phaser geparst sind.
 */
export function startGame(o: GameOptions): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: UI_THEME.navy,
    // Flat-Shaded-Vektor-Sprites (UI_STYLE § 4): weich skalieren, keine Pixel-Optik.
    pixelArt: false,
    antialias: true,
    // Kein MSAA: Sprites sind Quads mit weichen Textur-Kanten, MSAA bringt dort optisch nichts,
    // kostet auf schwachen GPUs (und im Software-Renderer) aber den Großteil der Füllrate.
    antialiasGL: false,
    // Die Szene nutzt keine Pre-/Post-FX: deren Shader nicht beim Start kompilieren (spart ~1/3 des Boots).
    disablePreFX: true,
    disablePostFX: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [BootScene, CafeScene],
  });
  game.registry.set(REGISTRY.store, o.store);
  // Nur kosmetisch: `?debugSpawn=100` zeigt so viele Kunden/s, um die Agenten-Grenze zu prüfen.
  game.registry.set(REGISTRY.debugSpawn, o.debugSpawn);
  game.events.once(Phaser.Core.Events.READY, () => {
    // Ohne GPU schafft kein Gerät 60 fps; 30 fps halbieren den Readback pro Sekunde und lassen dem
    // Haupt-Thread Luft für HUD und Eingaben.
    if (isSoftwareRenderer(game)) limitFps(game, UI_CONFIG.softwareFpsLimit);
    game.scene.getScene('CafeScene').events.once(Phaser.Scenes.Events.CREATE, o.onReady);
  });
  game.events.on(UI_EVENTS.sfx, (id: SfxId) => o.onSfx(id));
  game.events.on(UI_EVENTS.openStation, (id: string) => o.onOpenStation(id));
  return { langChanged: () => game.events.emit(UI_EVENTS.langChanged) };
}
