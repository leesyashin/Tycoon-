import Phaser from 'phaser';
import { CAMERA } from '@data/layouts';

/**
 * Drag zum Verschieben, Pinch (2 Finger) und Mausrad zum Zoomen, mit Grenzen: Der ganze Kamera-Ausschnitt bleibt
 * in `bounds` (dort ist überall Stadt zu sehen), herauszoomen geht nur so weit, wie der Ausschnitt hineinpasst.
 * `isDrag()` sagt der Szene, ob ein Pointer-Up ein Tap war oder das Ende einer Kamerabewegung.
 */
export class CameraControls {
  private dragged = false;
  private pinchDist = 0;
  private pinchZoom = 1;
  /** Hat der Spieler die Kamera seit der letzten Startansicht selbst bewegt? Dann bleibt sein Ausschnitt. */
  private moved = false;
  /** Laufender Schwenk (`showAndReturn`): Bildmitte und Zoom, zu denen die Kamera danach zurückkehrt. */
  private tour: {
    back: { x: number; y: number; zoom: number };
    timer: Phaser.Time.TimerEvent | null;
    phase: 'to' | 'hold' | 'back';
  } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: Phaser.Geom.Rectangle,
  ) {
    const cam = scene.cameras.main;
    cam.centerOn(bounds.centerX, bounds.centerY);
    scene.input.addPointer(1);

    scene.input.on('pointerdown', () => {
      if (this.activePointers().length <= 1) this.dragged = false;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', () => {
      this.pinchDist = 0;
    });
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      this.moved = true;
      this.cancelTour();
      this.zoomAt(cam.zoom * (1 - dy * CAMERA.wheelStep), p.x, p.y);
    });
  }

  /** Läuft gerade ein Schwenk (hin, Pause oder zurück)? */
  touring(): boolean {
    return this.tour !== null;
  }

  /** Abschnitt des laufenden Schwenks: hin, am Ziel stehen, zurück; `null` ohne Schwenk. */
  tourPhase(): 'to' | 'hold' | 'back' | null {
    return this.tour?.phase ?? null;
  }

  /**
   * Kurzer Schwenk, bis der Weltpunkt `p` mitten im freien Teil des Bilds steht (`view`, Bildschirm-Pixel ohne
   * HUD und Panel), dann zurück an den Ausschnitt und Zoom des Spielers. `onArrive` läuft, sobald `p` zu sehen ist –
   * sofort, wenn er schon gut im Bild steht und die Kamera bleibt, wo sie ist. Zieht oder zoomt der Spieler unterwegs,
   * gehört die Kamera ab da wieder ihm; ein einfacher Tap bricht nicht ab.
   * @returns ob die Kamera schwenkt
   */
  showAndReturn(
    p: { x: number; y: number },
    view: Phaser.Geom.Rectangle,
    onArrive: () => void,
  ): boolean {
    const cam = this.scene.cameras.main;
    this.cancelTour();
    const z = cam.zoom;
    const back = { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2, zoom: z };
    const sx = (p.x - back.x) * z + cam.width / 2;
    const sy = (p.y - back.y) * z + cam.height / 2;
    const t = CAMERA.tour;
    const inner = new Phaser.Geom.Rectangle(
      view.x + t.marginPx,
      view.y + t.marginPx,
      view.width - 2 * t.marginPx,
      view.height - 2 * t.marginPx,
    );
    if (inner.width > 0 && inner.height > 0 && inner.contains(sx, sy)) {
      onArrive();
      return false;
    }
    const zoom = Phaser.Math.Clamp(Math.max(z, t.minZoom), this.minZoom(), CAMERA.maxZoom);
    const target = this.clampCenter(
      p.x + (cam.width / 2 - view.centerX) / zoom,
      p.y + (cam.height / 2 - view.centerY) / zoom,
      zoom,
    );
    const tour = {
      back,
      timer: null as Phaser.Time.TimerEvent | null,
      phase: 'to' as 'to' | 'hold' | 'back',
    };
    this.tour = tour;
    const ease = 'Sine.easeInOut';
    cam.zoomTo(zoom, t.panMs, ease, true);
    cam.pan(target.x, target.y, t.panMs, ease, true, (_c: unknown, progress: number) => {
      if (progress < 1 || this.tour !== tour) return;
      tour.phase = 'hold';
      onArrive();
      tour.timer = this.scene.time.delayedCall(t.holdMs, () => {
        if (this.tour !== tour) return;
        tour.phase = 'back';
        cam.zoomTo(back.zoom, t.backMs, ease, true);
        cam.pan(back.x, back.y, t.backMs, ease, true, (_c2: unknown, done: number) => {
          if (done >= 1 && this.tour === tour) this.tour = null;
        });
      });
    });
    return true;
  }

  /**
   * Schwenk abbrechen; die Kamera bleibt, wo sie gerade ist (der Spieler übernimmt) oder springt mit `restore`
   * zurück an den Ausschnitt von vorher (Größenänderung, neue Startansicht).
   */
  cancelTour(restore = false): void {
    const tour = this.tour;
    if (!tour) return;
    this.tour = null;
    tour.timer?.remove();
    const cam = this.scene.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    if (restore) {
      cam.setZoom(tour.back.zoom);
      cam.centerOn(tour.back.x, tour.back.y);
      this.setZoom(cam.zoom);
      this.clamp();
    }
  }

  /** Der Spieler hat die Kamera seit `fitted()` verschoben oder gezoomt. */
  userMoved(): boolean {
    return this.moved;
  }

  /** Die Szene hat die Startansicht gesetzt: spätere Größenänderungen dürfen sie wieder anpassen. */
  fitted(): void {
    this.moved = false;
  }

  /**
   * Die Spielfläche hat eine neue Größe (Adressleiste, Drehen, Fenster): Phaser ändert dabei nur Breite und Höhe der
   * Kamera, der Weltpunkt in der Bildmitte würde also wandern. Hier bleibt er stehen, der Zoom ebenso (höchstens
   * auf das neue Minimum angehoben).
   */
  keepCenter(prevWidth: number, prevHeight: number): void {
    const cam = this.scene.cameras.main;
    cam.scrollX += (prevWidth - cam.width) / 2;
    cam.scrollY += (prevHeight - cam.height) / 2;
    this.setZoom(cam.zoom);
    this.clamp();
  }

  /**
   * Hält den Ausschnitt in den Grenzen. Eigene Klemmung statt `setBounds`, weil Phaser bei herausgezoomter
   * Kamera (Ansicht größer als die Grenzen) an die obere Kante statt mittig klemmt.
   */
  clamp(): void {
    const cam = this.scene.cameras.main;
    const c = this.clampCenter(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    cam.setScroll(c.x - cam.width / 2, c.y - cam.height / 2);
  }

  /** Nächste erlaubte Bildmitte zu (cx, cy) bei diesem Zoom (Standard: dem aktuellen). */
  private clampCenter(
    cx: number,
    cy: number,
    zoom = this.scene.cameras.main.zoom,
  ): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const b = this.bounds;
    const hw = cam.width / zoom / 2;
    const hh = cam.height / zoom / 2;
    const fit = (c: number, lo: number, hi: number) =>
      lo > hi ? (lo + hi) / 2 : Phaser.Math.Clamp(c, lo, hi);
    return { x: fit(cx, b.left + hw, b.right - hw), y: fit(cy, b.top + hh, b.bottom - hh) };
  }

  /** Kleinster Zoom, bei dem der Ausschnitt noch ganz in die Grenzen passt. */
  private minZoom(): number {
    const cam = this.scene.cameras.main;
    return Math.max(CAMERA.minZoom, cam.width / this.bounds.width, cam.height / this.bounds.height);
  }

  setZoom(zoom: number): void {
    this.scene.cameras.main.setZoom(Phaser.Math.Clamp(zoom, this.minZoom(), CAMERA.maxZoom));
  }

  isDrag(): boolean {
    return this.dragged;
  }

  private activePointers(): Phaser.Input.Pointer[] {
    const ptrs = [
      this.scene.input.pointer1,
      this.scene.input.pointer2,
      this.scene.input.mousePointer,
    ];
    return ptrs.filter((p): p is Phaser.Input.Pointer => p?.isDown ?? false);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown) return;
    const cam = this.scene.cameras.main;
    const down = this.activePointers();
    const [a, b] = down;
    if (a && b) {
      this.dragged = true;
      this.moved = true;
      this.cancelTour();
      const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      if (this.pinchDist === 0) {
        this.pinchDist = dist;
        this.pinchZoom = cam.zoom;
        return;
      }
      this.zoomAt(this.pinchZoom * (dist / this.pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > CAMERA.dragThresholdPx) {
      this.dragged = true;
    }
    if (this.dragged) {
      this.moved = true;
      this.cancelTour();
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      this.clamp();
    }
  }

  /** Zoomt so, dass der Weltpunkt unter (sx, sy) stehen bleibt. */
  private zoomAt(zoom: number, sx: number, sy: number): void {
    const cam = this.scene.cameras.main;
    const z = Phaser.Math.Clamp(zoom, this.minZoom(), CAMERA.maxZoom);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(z);
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.clamp();
  }
}
