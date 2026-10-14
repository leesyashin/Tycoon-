/** Einzelne Sprite-PNGs für das DOM (Kacheln, Detailkarte, Avatar); die Szene nutzt den Atlas. */
export function spriteIconUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/sprites/icons/${name}.png`;
}
