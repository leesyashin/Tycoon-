/** Namen im Sprite `public/assets/ui/icons.svg` (Phosphor Fill, MIT, und eigene; siehe docs/ASSETS.md). */
export type IconName =
  | 'banknote'
  | 'coffee'
  | 'leaf'
  | 'plus'
  | 'gear'
  | 'users'
  | 'chart-bar'
  | 'trophy'
  | 'shopping-cart'
  | 'megaphone'
  | 'map-trifold'
  | 'hammer'
  | 'clock'
  | 'smiley'
  | 'smiley-meh'
  | 'smiley-sad'
  | 'broom'
  | 'lightning'
  | 'x'
  | 'caret-left'
  | 'caret-right'
  | 'arrow-left'
  | 'lock'
  | 'star'
  | 'sparkle'
  | 'gift'
  | 'play'
  | 'check'
  | 'coins'
  | 'sun'
  | 'moon'
  | 'storefront'
  | 'music-notes'
  | 'wifi-high'
  | 'armchair'
  | 'plant'
  | 'umbrella'
  | 'crown'
  | 'timer'
  | 'calendar'
  | 'warning-circle'
  | 'bell'
  | 'rocket'
  | 'fast-forward'
  | 'paint-brush'
  | 'close'
  | 'cloud-rain'
  | 'flower-lotus'
  | 'confetti'
  | 'package'
  | 'ice-cream'
  | 'tick'
  | 'video-camera'
  | 'truck'
  | 'user-minus'
  | 'car'
  | 'heart'
  | 'eye'
  | 'trend-up'
  | 'door';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function iconHref(name: IconName): string {
  return `${import.meta.env.BASE_URL}assets/ui/icons.svg#i-${name}`;
}

/** Dekoratives Icon (`aria-hidden`); die Bedeutung trägt immer ein Text oder `aria-label` daneben. */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', iconHref(name));
  svg.append(use);
  return svg;
}

/** Tauscht das Symbol eines mit `icon()` gebauten Elements, ohne es neu zu erzeugen. */
export function setIcon(svg: SVGSVGElement, name: IconName): void {
  const use = svg.firstElementChild;
  const href = iconHref(name);
  if (use && use.getAttribute('href') !== href) use.setAttribute('href', href);
}
