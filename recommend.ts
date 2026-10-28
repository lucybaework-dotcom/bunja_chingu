// 보완성 추천 (임시 규칙, 교체 가능). 분자 유효성 판정 이후에만 쓰인다.
import { ELEMENTS, pairContent } from '../data/elements';
import type { ElementId } from '../data/molecules';

export const RECOMMEND_CONFIG = {
  /** 성향 축 차이(보완)에 주는 비중 */
  differenceWeight: 1,
  /** 서로 다른 원소 비율에 주는 작은 가산점. 같은 원소 분자도 제외하지 않는다. */
  diversityWeight: 0.15,
  /** 기존 방 채우기: 완성에 가까운 방을 조금 더 우선 */
  fillWeight: 0.35,
};

const AXES = ['spark', 'depth', 'steady'] as const;

function distance(a: ElementId, b: ElementId): number {
  const x = ELEMENTS[a].axes, y = ELEMENTS[b].axes;
  return AXES.reduce((s, k) => s + Math.abs(x[k] - y[k]), 0) / AXES.length;
}

/** 0~1 근처의 해석 가능한 점수. 높을수록 서로 다른 성향이 섞여 있다. */
export function complementScore(group: ElementId[]): number {
  if (group.length < 2) return 0;
  let sum = 0, n = 0;
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) { sum += distance(group[i], group[j]); n++; }
  const diversity = new Set(group).size / group.length;
  return RECOMMEND_CONFIG.differenceWeight * (sum / n) + RECOMMEND_CONFIG.diversityWeight * diversity;
}

export interface MatchReason { mood: string; behavior: string }

/** 짧은 감성 문구 + 구체적인 관계 행동 설명. */
export function matchReason(me: ElementId, others: ElementId[]): MatchReason {
  const partner = [...others].sort((a, b) => distance(me, b) - distance(me, a))[0] ?? me;
  const pc = pairContent(me, partner).find((p) => p.kind === 'complement');
  const m = ELEMENTS[me], p = ELEMENTS[partner];
  const mood = pc ? `${pc.title} · ${pc.body}` : `${m.name}과 ${p.name}, 서로 다른 속도가 만나는 자리예요.`;
  const behavior = me === partner
    ? `같은 ${m.name}끼리: "${m.strengths[0]}" 성향이 겹치니 역할을 나눠 맡아 보세요.`
    : `${p.name}: "${p.strengths[0]}" / 나(${m.name}): "${m.strengths[1]}"`;
  return { mood, behavior };
}
