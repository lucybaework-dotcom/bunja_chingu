// 원소 색 규칙: 같은 족은 같은 색상(hue), 주기가 내려갈수록 진해진다(명도 감소).
// 글자색은 배경 대비가 더 큰 쪽(흰색/진한 남색)을 자동으로 고른다.
import { PERIODIC } from './periodic';

const GROUP_HUE: Record<number, number> = { 1: 352, 2: 24, 13: 44, 14: 138, 15: 205, 16: 250, 17: 292, 18: 210 };
const GROUP_SAT: Record<number, number> = { 18: 12 };
const PERIOD_L: Record<number, number> = { 1: 88, 2: 70, 3: 42, 4: 28 };
const DARK_INK = '#17232c';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const DARK_LUM = lum([0x17 / 255, 0x23 / 255, 0x2c / 255]);

export interface ElColor { bg: string; ink: string; hue: number; tint: string }

const cache = new Map<string, ElColor>();
export function elementColor(symbol: string): ElColor {
  const hit = cache.get(symbol);
  if (hit) return hit;
  const cell = PERIODIC.find((c) => c.symbol === symbol);
  const group = cell?.group ?? 18, period = cell?.period ?? 2;
  const h = GROUP_HUE[group] ?? 210, sat = GROUP_SAT[group] ?? 62, l = PERIOD_L[period] ?? 60;
  const L = lum(hslToRgb(h, sat, l));
  const ink = contrast(L, 1) >= contrast(L, DARK_LUM) ? '#ffffff' : DARK_INK;
  const c = { bg: `hsl(${h} ${sat}% ${l}%)`, ink, hue: h, tint: `hsl(${h} ${sat}% ${l}% / 0.14)` };
  cache.set(symbol, c);
  return c;
}

/** 대비 검사용: 배경과 글자의 대비율 */
export function inkContrast(symbol: string): number {
  const cell = PERIODIC.find((c) => c.symbol === symbol);
  const group = cell?.group ?? 18, period = cell?.period ?? 2;
  const L = lum(hslToRgb(GROUP_HUE[group] ?? 210, GROUP_SAT[group] ?? 62, PERIOD_L[period] ?? 60));
  return Math.max(contrast(L, 1), contrast(L, DARK_LUM));
}
