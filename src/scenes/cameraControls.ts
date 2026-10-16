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
      this.zoomAt(cam.zoom * (1 - dy * CAMERA.wheelStep), p.x, p.y);
    });
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
    const b = this.bounds;
    const hw = cam.width / cam.zoom / 2;
    const hh = cam.height / cam.zoom / 2;
    const fit = (c: number, lo: number, hi: number) =>
      lo > hi ? (lo + hi) / 2 : Phaser.Math.Clamp(c, lo, hi);
    const cx = fit(cam.scrollX + cam.width / 2, b.left + hw, b.right - hw);
    const cy = fit(cam.scrollY + cam.height / 2, b.top + hh, b.bottom - hh);
    cam.setScroll(cx - cam.width / 2, cy - cam.height / 2);
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
