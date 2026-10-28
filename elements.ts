// 편집용 성격 콘텐츠. 화학 데이터(molecules.ts)와 분리되어 있으며 서비스가 만든 비유일 뿐이다.
import type { ElementId } from './molecules';

export interface ElementContent {
  id: ElementId;
  symbol: string;
  name: string;
  factual: string;
  personality: string;
  strengths: string[];
  difficulties: string[];
  /** 0~1 사이 임시 성향 축. 추천 계산에만 쓰이며 진단 수치가 아니다. */
  axes: { spark: number; depth: number; steady: number };
}

export const ELEMENTS: Record<ElementId, ElementContent> = {
  H: {
    id: 'H', symbol: 'H', name: '수소',
    factual: '가장 가볍고 우주에서 가장 흔한 원소. 전자 하나로 다른 원자와 쉽게 결합해 수많은 분자에 들어간다.',
    personality: '어디든 가볍게 스며드는 연결자. 처음 보는 자리에서도 먼저 말을 걸고 분위기를 푼다.',
    strengths: ['모임의 첫 대화를 여는 편', '여러 사람 사이를 자연스럽게 잇는다', '부담 없이 같이 있기 편하다'],
    difficulties: ['가볍게 보일까 봐 진지한 얘기를 미루기도 한다', '여러 무리에 흩어져 에너지가 분산될 수 있다'],
    axes: { spark: 0.85, depth: 0.3, steady: 0.35 },
  },
  C: {
    id: 'C', symbol: 'C', name: '탄소',
    factual: '결합 네 개를 만들 수 있어 사슬과 고리 같은 다양한 골격을 이룬다. 생명체 분자의 뼈대가 되는 원소.',
    personality: '사람들을 엮어 판을 짜는 설계자. 모임에 구조와 방향을 만든다.',
    strengths: ['약속과 계획을 정리해 실제로 만나게 한다', '서로 다른 사람들을 한 자리에 묶는다', '모임의 중심을 잡아 준다'],
    difficulties: ['모든 연결을 혼자 책임지려다 지칠 수 있다', '계획대로 안 될 때 답답해하기 쉽다'],
    axes: { spark: 0.55, depth: 0.6, steady: 0.75 },
  },
  N: {
    id: 'N', symbol: 'N', name: '질소',
    factual: '공기의 약 78%를 차지한다. N₂는 삼중결합 때문에 매우 안정해서 상온에서 거의 반응하지 않는다.',
    personality: '쉽게 흔들리지 않는 차분함. 천천히 가까워지지만 한번 친해지면 오래 단단하다.',
    strengths: ['이야기를 끝까지 들어 준다', '분위기가 들뜰 때 균형을 잡는다', '오래 가는 관계를 만든다'],
    difficulties: ['처음엔 거리감 있어 보일 수 있다', '마음을 여는 데 시간이 걸린다'],
    axes: { spark: 0.2, depth: 0.8, steady: 0.9 },
  },
  O: {
    id: 'O', symbol: 'O', name: '산소',
    factual: '전자를 강하게 끌어당기는 원소(전기음성도가 높다). 연소를 돕고 많은 물질과 활발히 반응한다.',
    personality: '주변을 끌어당기는 에너지. 솔직하고 추진력 있게 일을 벌인다.',
    strengths: ['하고 싶은 걸 분명히 말한다', '모임에 활기와 추진력을 준다', '친구의 일에 진심으로 뛰어든다'],
    difficulties: ['끌어당기는 힘이 세서 상대가 지칠 수 있다', '속도가 다른 사람을 기다리기 어렵다'],
    axes: { spark: 0.9, depth: 0.55, steady: 0.3 },
  },
  Cl: {
    id: 'Cl', symbol: 'Cl', name: '염소',
    factual: '전자 하나를 강하게 얻으려는 할로젠 원소. 반응성이 커서 소독과 표백에 쓰인다.',
    personality: '기준과 취향이 뚜렷한 정리자. 흐린 상황을 맑게 정돈한다.',
    strengths: ['문제를 정확히 짚어 준다', '애매한 결정을 빨리 정리한다', '취향이 분명해 대화가 재밌다'],
    difficulties: ['직설적인 말이 날카롭게 들릴 수 있다', '자기 기준을 내려놓기 어려워할 때가 있다'],
    axes: { spark: 0.6, depth: 0.7, steady: 0.55 },
  },
};

export interface PairContent {
  kind: 'complement' | 'clash';
  title: string;
  body: string;
  /** 원소끼리의 반응인지, 완성된 분자 안의 결합인지 구분해 적는다. */
  chemistryContext: string;
}

const key = (a: ElementId, b: ElementId) => [a, b].sort().join('-');

const PAIRS: Record<string, PairContent[]> = {
  [key('H', 'O')]: [
    { kind: 'complement', title: '물이 되는 사이', body: '수소가 대화를 열고 산소가 방향을 잡으면 가장 편안한 조합이 돼요.', chemistryContext: '물(H₂O) 안의 O–H 결합은 매우 안정하다.' },
  ],
  [key('H', 'Cl')]: [
    { kind: 'complement', title: '선명한 한 쌍', body: '염소가 정리하고 수소가 부드럽게 전하면 결정이 빨라져요.', chemistryContext: 'HCl 분자 안의 H–Cl 결합은 안정한 공유 결합이다.' },
  ],
  [key('C', 'O')]: [
    { kind: 'complement', title: '이중결합 두 개', body: '탄소의 구조와 산소의 추진력이 맞물리면 오래 가는 균형이 생겨요.', chemistryContext: 'CO₂ 안의 C=O 결합은 안정하다.' },
  ],
  [key('C', 'H')]: [
    { kind: 'complement', title: '모든 유기물의 시작', body: '탄소가 뼈대를 세우고 수소가 빈 곳을 채우면 무엇이든 만들 수 있어요.', chemistryContext: 'C–H 결합은 메테인처럼 유기 분자의 기본 결합이다.' },
  ],
  [key('N', 'H')]: [
    { kind: 'complement', title: '천천히 녹아드는 사이', body: '수소의 가벼움이 질소의 벽을 낮추고, 질소는 수소에게 쉴 곳이 돼요.', chemistryContext: '암모니아(NH₃) 안의 N–H 결합.' },
  ],
  [key('N', 'O')]: [
    { kind: 'complement', title: '들뜸과 차분함', body: '산소가 들뜰 때 질소가 균형을 잡아 줘요. 서로의 속도를 배우는 조합.', chemistryContext: 'N₂O 분자 안에서 질소와 산소가 결합을 이룬다.' },
  ],
  [key('C', 'Cl')]: [
    { kind: 'complement', title: '단단한 용매', body: '탄소의 구조에 염소의 기준이 더해지면 쉽게 흔들리지 않는 모임이 돼요.', chemistryContext: 'CCl₄, CH₂Cl₂ 같은 분자 안의 C–Cl 결합.' },
  ],
  [key('O', 'Cl')]: [
    { kind: 'clash', title: '둘 다 끌어당기는 힘', body: '둘 다 원하는 게 분명해서 양보가 어려울 수 있어요. 차례를 정하면 좋아요.', chemistryContext: '산소와 염소는 둘 다 전자를 강하게 끌어당기는 원소다. 현재 시범 카탈로그에는 둘만으로 이루어진 분자가 없다.' },
  ],
  [key('C', 'N')]: [
    { kind: 'complement', title: '삼중결합의 신뢰', body: '설계자 탄소와 단단한 질소는 한번 맞으면 쉽게 끊어지지 않아요.', chemistryContext: 'HCN 분자 안의 C≡N 삼중결합.' },
  ],
  [key('N', 'Cl')]: [
    { kind: 'clash', title: '불안정한 조합', body: '차분한 질소와 날카로운 염소는 서로를 오해하기 쉬워요. 말의 온도를 맞춰 보세요.', chemistryContext: '질소와 염소로 된 화합물 중 상당수는 불안정하다. 현재 카탈로그에는 둘을 함께 쓰는 분자가 없다.' },
  ],
  [key('H', 'H')]: [{ kind: 'complement', title: '가장 단순한 결합', body: '닮은 둘이라 설명이 필요 없어요. 가볍게 시작해 금방 친해져요.', chemistryContext: 'H₂ 분자 안의 H–H 결합.' }],
  [key('O', 'O')]: [{ kind: 'complement', title: '숨 쉬는 사이', body: '에너지 많은 둘이 만나면 대화가 끊이지 않아요. 쉬는 시간도 함께 정해요.', chemistryContext: 'O₂ 분자 안의 O=O 결합.' }],
  [key('N', 'N')]: [{ kind: 'complement', title: '세 겹의 신뢰', body: '천천히, 그러나 가장 단단하게 친해지는 조합이에요.', chemistryContext: 'N₂ 분자 안의 N≡N 삼중결합.' }],
  [key('Cl', 'Cl')]: [{ kind: 'complement', title: '같은 기준', body: '취향과 기준이 통해서 결정이 빨라요. 다른 의견도 일부러 들어 보세요.', chemistryContext: 'Cl₂ 분자 안의 Cl–Cl 결합.' }],
  [key('C', 'C')]: [{ kind: 'complement', title: '사슬의 시작', body: '둘 다 판을 짜는 사람이라 계획이 금방 서요. 역할을 나누면 더 좋아요.', chemistryContext: '아세틸렌, 에틸렌 안의 C–C 다중결합.' }],
};

export function pairContent(a: ElementId, b: ElementId): PairContent[] {
  return PAIRS[key(a, b)] ?? [];
}

export const METAPHOR_NOTICE = '원소와 성격의 연결은 분자친구가 만든 비유예요. 성격 진단이나 관계 예측이 아니에요.';
