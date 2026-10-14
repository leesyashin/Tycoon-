import Phaser from 'phaser';
import { CAMERA } from '@data/layouts';

/**
 * Drag zum Verschieben, Pinch (2 Finger) und Mausrad zum Zoomen, mit Grenzen.
 * `isDrag()` sagt der Szene, ob ein Pointer-Up ein Tap war oder das Ende einer Kamerabewegung.
 */
export class CameraControls {
  private dragged = false;
  private pinchDist = 0;
  private pinchZoom = 1;

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
      this.zoomAt(cam.zoom * (1 - dy * CAMERA.wheelStep), p.x, p.y);
    });
  }

  /**
   * Hält den Bildmittelpunkt im Raum. Eigene Klemmung statt `setBounds`, weil Phaser bei
   * herausgezoomter Kamera (Ansicht größer als Raum) an die obere Kante statt mittig klemmt.
   */
  clamp(): void {
    const cam = this.scene.cameras.main;
    const b = this.bounds;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, b.left, b.right);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, b.top, b.bottom);
    cam.setScroll(cx - cam.width / 2, cy - cam.height / 2);
  }

  setZoom(zoom: number): void {
    this.scene.cameras.main.setZoom(Phaser.Math.Clamp(zoom, CAMERA.minZoom, CAMERA.maxZoom));
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
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      this.clamp();
    }
  }

  /** Zoomt so, dass der Weltpunkt unter (sx, sy) stehen bleibt. */
  private zoomAt(zoom: number, sx: number, sy: number): void {
    const cam = this.scene.cameras.main;
    const z = Phaser.Math.Clamp(zoom, CAMERA.minZoom, CAMERA.maxZoom);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(z);
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.clamp();
  }
}
