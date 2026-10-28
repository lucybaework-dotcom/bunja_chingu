// 원소 색: CPK 착색. 원조 6색(C 검정, H 흰색, N 파랑, O 빨강, Cl 초록, S 노랑)과
// 그 확장으로 널리 쓰이는 Jmol 색(F 연두, P 주황, Na·K 보라)을 쓴다. 글자색은 대비가 큰 쪽을 자동으로 고른다.
const CPK: Record<string, string> = {
  H: '#ffffff', C: '#262626', N: '#2f55e8', O: '#e3261c', F: '#90e050', Na: '#b26ef5',
  P: '#ff8000', S: '#f5d31b', Cl: '#1fb81f', K: '#8f40d4',
};
const OTHER = '#c8ced3'; // 아직 쓰지 않는 원소
const DARK_INK = '#17232c';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const DARK_LUM = lum(rgb(DARK_INK));

export interface ElColor { bg: string; ink: string; tint: string }

export function elementColor(symbol: string): ElColor {
  const bg = CPK[symbol] ?? OTHER;
  const L = lum(rgb(bg));
  const ink = contrast(L, 1) >= contrast(L, DARK_LUM) ? '#ffffff' : DARK_INK;
  return { bg, ink, tint: CPK[symbol] ? `${bg}26` : 'transparent' };
}

/** 대비 검사용: 배경과 고른 글자색의 대비율 */
export function inkContrast(symbol: string): number {
  const L = lum(rgb(CPK[symbol] ?? OTHER));
  return Math.max(contrast(L, 1), contrast(L, DARK_LUM));
}
