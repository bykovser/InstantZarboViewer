/*
 * Blackbody color: Planck spectrum × CIE 1931 observer -> XYZ -> linear Rec.709/sRGB, max channel = 1.
 * Same physics as Blender's Blackbody node. CIE curves use the Wyman–Sloan–Shirley (2013) multi-lobe fit.
 */

const g = (x, mu, s1, s2) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

const cie = (l) => [
  1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
  0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
  1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
];

const C2 = 1.4388e7; // second radiation constant, nm·K
const planck = (l, T) => 1 / (l ** 5 * (Math.exp(C2 / (l * T)) - 1));

const cache = new Map();

export function blackbodyLinear(kelvin) {
  const T = Math.round(Math.min(40000, Math.max(800, kelvin)));
  if (cache.has(T)) return cache.get(T);
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const p = planck(l, T);
    const [x, y, z] = cie(l);
    X += p * x;
    Y += p * y;
    Z += p * z;
  }
  const rgb = [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ].map((v) => Math.max(0, v));
  const max = Math.max(...rgb);
  const out = rgb.map((v) => v / max);
  cache.set(T, out);
  return out;
}

export const KELVIN_PRESETS = [
  { k: 1900, label: 'Свеча' },
  { k: 2700, label: 'Лампа накал.' },
  { k: 4000, label: 'Нейтр.' },
  { k: 5500, label: 'День' },
  { k: 6500, label: 'D65' },
  { k: 9000, label: 'Небо' },
];
