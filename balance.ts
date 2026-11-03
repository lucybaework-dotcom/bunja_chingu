// 원소 쏠림 맞추기: 어떤 원소가 분자에 필요한 것보다 훨씬 많으면, 성향이 비슷하고 덜 붐비는 원소를 대신 추천한다.
import { ELEMENTS } from './elements';
import { USABLE, type ElementId } from './molecules';
import { usableElements } from './chemistry';

export interface Stats { counts: Partial<Record<ElementId, number>>; total: number }

/** 이 원소가 들어갈 자리가 분자 도감 전체에서 차지하는 몫 (수소는 자리가 많아서 원래 많이 필요하다) */
export function demandShare(): Record<ElementId, number> {
  const seats: Partial<Record<ElementId, number>> = {}; let all = 0;
  for (const m of USABLE()) for (const [e, n] of Object.entries(m.atomCounts) as [ElementId, number][]) { seats[e] = (seats[e] ?? 0) + n; all += n; }
  return Object.fromEntries(usableElements().map((e) => [e, (seats[e] ?? 0) / all])) as Record<ElementId, number>;
}

export const BALANCE = { minTotal: 12, minCount: 4, ratio: 1.6, closeScore: 0.6 };

/** 필요한 몫보다 1.6배 넘게 몰린 원소 (사람이 충분히 모였을 때만 따진다) */
export function crowdedElements(st: Stats | null | undefined): Set<ElementId> {
  const out = new Set<ElementId>();
  if (!st || st.total < BALANCE.minTotal) return out;
  const d = demandShare();
  for (const e of usableElements()) {
    const n = st.counts[e] ?? 0;
    if (n >= BALANCE.minCount && n / st.total > d[e] * BALANCE.ratio) out.add(e);
  }
  return out;
}

const dist = (a: ElementId, b: ElementId) => {
  const x = ELEMENTS[a].axes, y = ELEMENTS[b].axes;
  return Math.hypot(x.spark - y.spark, x.depth - y.depth, x.steady - y.steady);
};

/**
 * 추천 1위가 붐비면, 위쪽 순위 안에서 점수가 충분히 가깝고 덜 붐비는 원소 중 성향이 가장 비슷한 것을 고른다.
 * scores가 없으면(AI 상담) 순위만 본다.
 */
export function balancePick(ranking: ElementId[], st: Stats | null | undefined, scores?: Partial<Record<ElementId, number>>):
  { pick: ElementId; original: ElementId; swapped: boolean } {
  const original = ranking[0];
  const crowded = crowdedElements(st);
  if (!crowded.has(original)) return { pick: original, original, swapped: false };
  const top = scores?.[original] ?? 0;
  const cands = ranking.slice(1, 4).filter((e) => !crowded.has(e) && (!scores || top <= 0 || (scores[e] ?? 0) >= top * BALANCE.closeScore));
  if (!cands.length) return { pick: original, original, swapped: false };
  const pick = cands.sort((a, b) => dist(original, a) - dist(original, b))[0];
  return { pick, original, swapped: true };
}

/** AI 상담 지시문에 덧붙일 한 줄 */
export function crowdedNote(st: Stats | null | undefined): string {
  const c = [...crowdedElements(st)];
  if (!c.length || !st) return '';
  return `[참고] 지금 우리 학교에 너무 많은 원소: ${c.map((e) => `${ELEMENTS[e].name}(${e}) ${Math.round(((st.counts[e] ?? 0) / st.total) * 100)}%`).join(', ')}. 학생과 잘 맞는 정도가 비슷하면 이 원소들보다 다른 원소를 1위로 추천해 줘 (매칭이 빨라진다).`;
}
