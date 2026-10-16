import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { CulledGraphics } from '@scenes/city/culledGraphics';

/** Nimmt die Befehle auf, die `CulledGraphics` an Phasers Graphics weitergibt. */
function recorder(): { g: Phaser.GameObjects.Graphics; calls: string[] } {
  const calls: string[] = [];
  const g = {
    clear() {
      calls.push('clear');
      return g;
    },
    fillStyle(color: number, alpha: number) {
      calls.push(`fill ${color.toString(16)} ${String(alpha)}`);
      return g;
    },
    fillTriangle(...p: number[]) {
      calls.push(`tri ${p.join(',')}`);
      return g;
    },
    lineStyle(width: number, color: number, alpha: number) {
      calls.push(`line ${String(width)} ${color.toString(16)} ${String(alpha)}`);
      return g;
    },
    lineBetween(...p: number[]) {
      calls.push(`seg ${p.join(',')}`);
      return g;
    },
  };
  return { g: g as unknown as Phaser.GameObjects.Graphics, calls };
}

describe('Stadtflächen nur um den Kamera-Ausschnitt (CulledGraphics)', () => {
  /** Ein kleines Dreieck bei (x, y). */
  const tri = (c: CulledGraphics, x: number, y: number) =>
    c.fillTriangle(x, y, x + 10, y, x, y + 10);

  it('zeichnet nur, was den Ausschnitt plus Reserve berührt, in der ursprünglichen Reihenfolge', () => {
    const { g, calls } = recorder();
    const c = new CulledGraphics(g);
    c.fillStyle(0xff0000);
    tri(c, 0, 0);
    tri(c, 5000, 0); // weit rechts: nie im Bild
    c.fillStyle(0x00ff00);
    tri(c, 50, 50);
    c.lineStyle(1, 0x0000ff, 0.85);
    c.lineBetween(-20, 10, 20, 10);
    c.lineBetween(-3000, 0, -2900, 0); // weit links
    expect(c.size).toBe(5);
    c.show({ x0: 0, y0: 0, x1: 100, y1: 100 });
    expect(calls).toEqual([
      'clear',
      'fill ff0000 1',
      'tri 0,0,10,0,0,10',
      'fill ff00 1',
      'tri 50,50,60,50,50,60',
      'line 1 ff 0.85',
      'seg -20,10,20,10',
    ]);
  });

  it('setzt einen Stil nur, wenn er sich ändert', () => {
    const { g, calls } = recorder();
    const c = new CulledGraphics(g);
    for (let i = 0; i < 3; i++) c.fillStyle(0x123456).fillTriangle(0, 0, 1, 0, 0, 1);
    c.show({ x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(calls.filter((s) => s.startsWith('fill'))).toHaveLength(1);
    expect(calls.filter((s) => s.startsWith('tri'))).toHaveLength(3);
  });

  it('nimmt erst neu auf, wenn der Ausschnitt den aufgenommenen Bereich verlässt', () => {
    const { g, calls } = recorder();
    const c = new CulledGraphics(g);
    tri(c, 0, 0);
    tri(c, 400, 0);
    c.show({ x0: 0, y0: 0, x1: 200, y1: 200 });
    expect(calls.filter((s) => s === 'clear')).toHaveLength(1);
    // Ein Stück geschoben: liegt noch in der Reserve (halbe Ausschnittgröße je Seite), nichts passiert.
    c.show({ x0: 80, y0: 0, x1: 280, y1: 200 });
    expect(calls.filter((s) => s === 'clear')).toHaveLength(1);
    // Weiter als die Reserve: neu aufnehmen, jetzt mit dem Dreieck rechts.
    c.show({ x0: 250, y0: 0, x1: 450, y1: 200 });
    expect(calls.filter((s) => s === 'clear')).toHaveLength(2);
    expect(calls.at(-1)).toBe('tri 400,0,410,0,400,10');
  });
});
