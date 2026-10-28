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
  F: {
    id: 'F', symbol: 'F', name: '플루오린',
    factual: '전자를 끌어당기는 힘(전기음성도)이 모든 원소 중 가장 크다. 한번 결합하면 C–F처럼 매우 강하고 안정한 결합을 만든다.',
    personality: '강렬한 첫인상과 끝까지 가는 의리. 한번 마음을 주면 쉽게 놓지 않는다.',
    strengths: ['친한 친구를 끝까지 챙긴다', '좋고 싫음을 빠르게 결정한다', '약속한 건 반드시 지킨다'],
    difficulties: ['처음에 너무 강하게 다가가 부담을 줄 수 있다', '감정의 온도가 높아 쉽게 서운해한다'],
    axes: { spark: 0.95, depth: 0.85, steady: 0.4 },
  },
  Si: {
    id: 'Si', symbol: 'Si', name: '규소',
    factual: '탄소와 같은 14족이라 결합 네 개를 만든다. 지각에서 산소 다음으로 흔하고, 반도체 칩의 재료가 된다.',
    personality: '말보다 실력으로 보여 주는 해결사. 조용히 맡은 일을 끝까지 해낸다.',
    strengths: ['막힌 문제를 차분히 풀어 준다', '믿고 맡길 수 있다', '꼼꼼하게 챙긴다'],
    difficulties: ['표현이 적어 차가워 보일 수 있다', '도움을 요청하지 않고 혼자 떠안기도 한다'],
    axes: { spark: 0.25, depth: 0.7, steady: 0.85 },
  },
  P: {
    id: 'P', symbol: 'P', name: '인',
    factual: 'DNA와 ATP의 뼈대를 이루어 생명체의 에너지 전달을 맡는다. 백린은 공기 중에서 스스로 불이 붙을 만큼 반응성이 크다.',
    personality: '주변을 움직이게 하는 에너지 전달자. 같이 하자고 불을 붙이는 사람.',
    strengths: ['친구들을 응원하고 동기를 준다', '모임을 시작하게 만든다', '열정을 나눠 준다'],
    difficulties: ['확 타올랐다가 금방 방전되기도 한다', '쉬는 시간이 꼭 필요하다'],
    axes: { spark: 0.9, depth: 0.4, steady: 0.25 },
  },
  S: {
    id: 'S', symbol: 'S', name: '황',
    factual: '노란색 고체 원소. 산화 상태가 다양해서 여러 종류의 화합물을 만들고, 황 화합물 중에는 냄새가 강한 것이 많다.',
    personality: '호불호가 갈려도 확실한 개성. 어디서든 존재감 있는 분위기 메이커.',
    strengths: ['독특한 유머로 분위기를 바꾼다', '상황에 따라 여러 역할을 한다', '솔직한 취향으로 대화를 연다'],
    difficulties: ['첫인상이 오해를 사기도 한다', '개성이 강해 맞추는 데 시간이 걸릴 수 있다'],
    axes: { spark: 0.75, depth: 0.5, steady: 0.45 },
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
  [key('H', 'F')]: [{ kind: 'complement', title: '가장 단단한 악수', body: '가벼운 수소가 강렬한 플루오린의 마음을 편하게 풀어 줘요.', chemistryContext: 'HF 분자 안의 H–F 결합은 매우 강한 결합이다.' }],
  [key('C', 'F')]: [{ kind: 'complement', title: '끊어지지 않는 결합', body: '판을 짜는 탄소와 의리의 플루오린, 한번 맞으면 오래가요.', chemistryContext: 'C–F 결합은 유기 분자의 단일 결합 중 가장 강한 편이다 (CF₄).' }],
  [key('N', 'F')]: [{ kind: 'complement', title: '차분함과 강렬함', body: '질소의 안정감이 플루오린의 높은 온도를 식혀 줘요.', chemistryContext: 'NF₃ 분자 안의 N–F 결합.' }],
  [key('F', 'F')]: [{ kind: 'clash', title: '강한 둘의 거리', body: '둘 다 강해서 오히려 서로 밀어낼 수 있어요. 한 발씩 물러서면 좋아요.', chemistryContext: 'F₂의 F–F 결합은 원자 사이 비공유 전자쌍의 반발 때문에 생각보다 약한 편이다.' }],
  [key('F', 'Cl')]: [{ kind: 'complement', title: '같은 할로젠 동료', body: '기준이 뚜렷한 둘이 탄소 곁에서 만나면 단단한 모임이 돼요.', chemistryContext: 'CCl₂F₂ 분자처럼 탄소에 함께 결합한다.' }],
  [key('F', 'O')]: [{ kind: 'clash', title: '누가 더 끌어당기나', body: '산소도 세지만 플루오린은 더 세요. 주도권 다툼보다 역할 분담을 해 보세요.', chemistryContext: '플루오린은 산소보다 전기음성도가 큰 유일한 원소다.' }],
  [key('Si', 'F')]: [{ kind: 'complement', title: '실력자와 의리파', body: '묵묵한 규소에게 플루오린이 먼저 손을 내밀면 아주 단단한 사이가 돼요.', chemistryContext: 'SiF₄ 안의 Si–F 결합은 매우 강한 결합이다.' }],
  [key('Si', 'Cl')]: [{ kind: 'complement', title: '정리의 달인들', body: '해결사 규소와 정리자 염소가 만나면 일이 깔끔하게 끝나요.', chemistryContext: 'SiCl₄ 분자 안의 Si–Cl 결합.' }],
  [key('Si', 'C')]: [{ kind: 'clash', title: '닮은꼴 라이벌', body: '같은 14족이라 서로 닮았지만, 판을 짜는 방식이 달라 부딪힐 수 있어요.', chemistryContext: '규소도 결합 네 개를 만들지만 탄소처럼 긴 사슬을 잘 이루지는 못한다. 원소 성질의 차이다.' }],
  [key('Si', 'O')]: [{ kind: 'complement', title: '땅을 이루는 짝', body: '규소의 실력과 산소의 추진력이 만나면 기반이 단단해져요.', chemistryContext: 'Si–O 결합은 매우 강하다. 다만 모래(SiO₂)는 분자가 아니라 결정이라 카탈로그에는 없다.' }],
  [key('P', 'H')]: [{ kind: 'complement', title: '불씨와 바람', body: '인이 불을 붙이고 수소가 사람들을 데려와요.', chemistryContext: 'PH₃ 분자 안의 P–H 결합.' }],
  [key('P', 'Cl')]: [{ kind: 'complement', title: '열정에 방향을', body: '인의 에너지에 염소의 기준이 더해지면 실제로 일이 굴러가요.', chemistryContext: 'PCl₃, POCl₃ 분자 안의 P–Cl 결합.' }],
  [key('P', 'F')]: [{ kind: 'complement', title: '뜨거운 두 사람', body: '둘 다 뜨거워서 금방 친해져요. 쉬는 타이밍을 같이 정하면 오래가요.', chemistryContext: 'PF₃, PF₅ 분자 안의 P–F 결합.' }],
  [key('P', 'O')]: [{ kind: 'complement', title: '단단한 이중결합', body: '산소가 방향을 잡아 주면 인의 열정이 쉽게 방전되지 않아요.', chemistryContext: 'POCl₃ 안의 P=O 결합은 강한 결합이다.' }],
  [key('S', 'H')]: [{ kind: 'complement', title: '잊히지 않는 사이', body: '수소의 친근함 덕분에 황의 개성이 더 빛나요.', chemistryContext: 'H₂S 분자 안의 S–H 결합.' }],
  [key('S', 'O')]: [{ kind: 'complement', title: '개성과 추진력', body: '황의 아이디어를 산소가 실행으로 옮겨요.', chemistryContext: 'SO₂ 분자 안의 S=O 결합.' }],
  [key('S', 'C')]: [{ kind: 'complement', title: '선형의 균형', body: '탄소가 가운데서 잡아 주면 황의 개성이 모임의 색깔이 돼요.', chemistryContext: 'CS₂, OCS 같은 선형 분자 안의 C=S 결합.' }],
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
