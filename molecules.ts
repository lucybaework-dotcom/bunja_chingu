// 화학 데이터 (성격 콘텐츠와 분리).
// 상태: 'candidate' = 구현자가 준비한 시범 후보 (화학 검수 전), 'pending' = 검토 보류로 매칭에 쓰지 않음.
// 실제 서비스 전에는 담당자가 출처를 확인하고 status를 'approved'로 바꾸는 절차가 필요하다.
// 매칭 규칙은 isUsable()만 보므로, 검수 정책이 정해지면 그 함수 하나만 바꾸면 된다.

export type ElementId = 'H' | 'C' | 'N' | 'O' | 'F' | 'Na' | 'P' | 'S' | 'Cl' | 'K';
export type AtomCounts = Partial<Record<ElementId, number>>;
export type MoleculeStatus = 'approved' | 'candidate' | 'pending';
/** 'molecule' = 실제 분자, 'ionic' = 이온 결정의 화학식 단위 (분자가 아님. 사용자 결정으로 2026-10-28 허용) */
export type CompoundKind = 'molecule' | 'ionic';

export interface Molecule {
  id: string;
  name: string;
  formula: string; // 표시용 (아래첨자 포함)
  atomCounts: AtomCounts;
  totalAtoms: number;
  structureKey: string; // 같은 조성의 구조 구분용 (이성질체 정책 미정)
  stabilityNote: string;
  sources: string[];
  status: MoleculeStatus;
  kind?: CompoundKind;
}

type Raw = Omit<Molecule, 'totalAtoms'>;

const pc = (cid: number) => `PubChem CID ${cid}`;

const RAW: Raw[] = [
  { id: 'h2', name: '수소 분자', formula: 'H₂', atomCounts: { H: 2 }, structureKey: 'H-H', stabilityNote: '상온·상압에서 안정한 이원자 기체.', sources: [pc(783)], status: 'candidate' },
  { id: 'n2', name: '질소 분자', formula: 'N₂', atomCounts: { N: 2 }, structureKey: 'N#N', stabilityNote: '삼중결합으로 매우 안정. 공기의 약 78%.', sources: [pc(947)], status: 'candidate' },
  { id: 'o2', name: '산소 분자', formula: 'O₂', atomCounts: { O: 2 }, structureKey: 'O=O', stabilityNote: '상온에서 안정한 이원자 기체. 공기의 약 21%.', sources: [pc(977)], status: 'candidate' },
  { id: 'cl2', name: '염소 분자', formula: 'Cl₂', atomCounts: { Cl: 2 }, structureKey: 'Cl-Cl', stabilityNote: '상온에서 안정한 황록색 기체. 독성이 있음.', sources: [pc(24526)], status: 'candidate' },
  { id: 'hcl', name: '염화 수소', formula: 'HCl', atomCounts: { H: 1, Cl: 1 }, structureKey: 'H-Cl', stabilityNote: '상온에서 안정한 기체 분자. 물에 녹으면 염산.', sources: [pc(313)], status: 'candidate' },
  { id: 'co', name: '일산화 탄소', formula: 'CO', atomCounts: { C: 1, O: 1 }, structureKey: '[C-]#[O+]', stabilityNote: '상온에서 안정한 기체. 독성이 있음.', sources: [pc(281)], status: 'candidate' },
  { id: 'h2o', name: '물', formula: 'H₂O', atomCounts: { H: 2, O: 1 }, structureKey: 'O', stabilityNote: '일상 조건에서 가장 익숙한 안정 분자.', sources: [pc(962)], status: 'candidate' },
  { id: 'co2', name: '이산화 탄소', formula: 'CO₂', atomCounts: { C: 1, O: 2 }, structureKey: 'O=C=O', stabilityNote: '상온에서 안정한 선형 분자 기체.', sources: [pc(280)], status: 'candidate' },
  { id: 'n2o', name: '아산화 질소', formula: 'N₂O', atomCounts: { N: 2, O: 1 }, structureKey: 'N#[N+][O-]', stabilityNote: '상온에서 안정한 기체 (웃음 기체).', sources: [pc(948)], status: 'candidate' },
  { id: 'hcn', name: '사이안화 수소', formula: 'HCN', atomCounts: { H: 1, C: 1, N: 1 }, structureKey: 'C#N', stabilityNote: '상온 부근에서 존재하는 선형 분자. 맹독성.', sources: [pc(768)], status: 'candidate' },
  { id: 'o3', name: '오존', formula: 'O₃', atomCounts: { O: 3 }, structureKey: '[O-][O+]=O', stabilityNote: '실재 분자이지만 서서히 O₂로 분해되어 안정성 기준 검토 필요.', sources: [pc(24823)], status: 'pending' },
  { id: 'nh3', name: '암모니아', formula: 'NH₃', atomCounts: { N: 1, H: 3 }, structureKey: 'N', stabilityNote: '상온에서 안정한 피라미드형 분자 기체.', sources: [pc(222)], status: 'candidate' },
  { id: 'h2o2', name: '과산화 수소', formula: 'H₂O₂', atomCounts: { H: 2, O: 2 }, structureKey: 'OO', stabilityNote: '상온에서 존재하나 서서히 분해되어 안정성 기준 검토 필요.', sources: [pc(784)], status: 'pending' },
  { id: 'c2h2', name: '아세틸렌', formula: 'C₂H₂', atomCounts: { C: 2, H: 2 }, structureKey: 'C#C', stabilityNote: '상온에서 존재하는 기체. 가연성.', sources: [pc(6326)], status: 'candidate' },
  { id: 'ch4', name: '메테인', formula: 'CH₄', atomCounts: { C: 1, H: 4 }, structureKey: 'C', stabilityNote: '상온에서 안정한 정사면체 분자. 천연가스 주성분.', sources: [pc(297)], status: 'candidate' },
  { id: 'hcooh', name: '폼산', formula: 'HCOOH', atomCounts: { C: 1, H: 2, O: 2 }, structureKey: 'C(=O)O', stabilityNote: '상온에서 안정한 액체 분자.', sources: [pc(284)], status: 'candidate' },
  { id: 'ch3cl', name: '클로로메테인', formula: 'CH₃Cl', atomCounts: { C: 1, H: 3, Cl: 1 }, structureKey: 'CCl', stabilityNote: '상온에서 안정한 기체 분자.', sources: [pc(6327)], status: 'candidate' },
  { id: 'ch2cl2', name: '다이클로로메테인', formula: 'CH₂Cl₂', atomCounts: { C: 1, H: 2, Cl: 2 }, structureKey: 'ClCCl', stabilityNote: '상온에서 안정한 액체 분자 (용매).', sources: [pc(6344)], status: 'candidate' },
  { id: 'chcl3', name: '클로로폼', formula: 'CHCl₃', atomCounts: { C: 1, H: 1, Cl: 3 }, structureKey: 'ClC(Cl)Cl', stabilityNote: '상온에서 안정한 액체 분자.', sources: [pc(6212)], status: 'candidate' },
  { id: 'ccl4', name: '사염화 탄소', formula: 'CCl₄', atomCounts: { C: 1, Cl: 4 }, structureKey: 'ClC(Cl)(Cl)Cl', stabilityNote: '상온에서 안정한 액체 분자.', sources: [pc(5943)], status: 'candidate' },
  { id: 'c2h4', name: '에틸렌', formula: 'C₂H₄', atomCounts: { C: 2, H: 4 }, structureKey: 'C=C', stabilityNote: '상온에서 안정한 평면 분자 기체.', sources: [pc(6325)], status: 'candidate' },
  { id: 'ch3oh', name: '메탄올', formula: 'CH₃OH', atomCounts: { C: 1, H: 4, O: 1 }, structureKey: 'CO', stabilityNote: '상온에서 안정한 액체 분자. 독성이 있음.', sources: [pc(887)], status: 'candidate' },
  { id: 'ch3cn', name: '아세토나이트릴', formula: 'CH₃CN', atomCounts: { C: 2, H: 3, N: 1 }, structureKey: 'CC#N', stabilityNote: '상온에서 안정한 액체 분자 (용매).', sources: [pc(6342)], status: 'candidate' },
  { id: 'c2h3cl', name: '염화 비닐', formula: 'C₂H₃Cl', atomCounts: { C: 2, H: 3, Cl: 1 }, structureKey: 'C=CCl', stabilityNote: '상온에서 존재하는 기체 분자. 독성이 있음.', sources: [pc(6338)], status: 'candidate' },
  { id: 'h2co', name: '폼알데하이드', formula: 'H₂CO', atomCounts: { H: 2, C: 1, O: 1 }, structureKey: 'C=O', stabilityNote: '실재 분자이지만 순수한 기체는 쉽게 중합되어 안정성 기준 검토 필요.', sources: [pc(712)], status: 'pending' },
  // 플루오린
  { id: 'f2', name: '플루오린 분자', formula: 'F₂', atomCounts: { F: 2 }, structureKey: 'FF', stabilityNote: '상온에서 존재하는 이원자 기체. 반응성과 독성이 매우 큼.', sources: [pc(24524)], status: 'candidate' },
  { id: 'hf', name: '플루오린화 수소', formula: 'HF', atomCounts: { H: 1, F: 1 }, structureKey: 'F', stabilityNote: '상온 부근에서 존재하는 분자. 독성·부식성이 큼.', sources: [pc(14917)], status: 'candidate' },
  { id: 'ch3f', name: '플루오로메테인', formula: 'CH₃F', atomCounts: { C: 1, H: 3, F: 1 }, structureKey: 'CF', stabilityNote: '상온에서 안정한 기체 분자.', sources: [pc(11638)], status: 'candidate' },
  { id: 'ch2f2', name: '다이플루오로메테인', formula: 'CH₂F₂', atomCounts: { C: 1, H: 2, F: 2 }, structureKey: 'FCF', stabilityNote: '상온에서 안정한 기체 분자 (냉매).', sources: [pc(6345)], status: 'candidate' },
  { id: 'chf3', name: '플루오로폼', formula: 'CHF₃', atomCounts: { C: 1, H: 1, F: 3 }, structureKey: 'FC(F)F', stabilityNote: '상온에서 안정한 기체 분자.', sources: [pc(6373)], status: 'candidate' },
  { id: 'cf4', name: '사플루오린화 탄소', formula: 'CF₄', atomCounts: { C: 1, F: 4 }, structureKey: 'FC(F)(F)F', stabilityNote: '매우 안정한 정사면체 기체 분자.', sources: [pc(6393)], status: 'candidate' },
  { id: 'nf3', name: '삼플루오린화 질소', formula: 'NF₃', atomCounts: { N: 1, F: 3 }, structureKey: 'FN(F)F', stabilityNote: '상온에서 안정한 기체 분자.', sources: [pc(24553)], status: 'candidate' },
  { id: 'ccl2f2', name: '다이클로로다이플루오로메테인', formula: 'CCl₂F₂', atomCounts: { C: 1, Cl: 2, F: 2 }, structureKey: 'FC(F)(Cl)Cl', stabilityNote: '상온에서 매우 안정한 기체 분자 (옛 냉매 프레온-12).', sources: [pc(6391)], status: 'candidate' },
  { id: 'chclf2', name: '클로로다이플루오로메테인', formula: 'CHClF₂', atomCounts: { C: 1, H: 1, Cl: 1, F: 2 }, structureKey: 'FC(F)Cl', stabilityNote: '상온에서 안정한 기체 분자 (냉매).', sources: [pc(6372)], status: 'candidate' },
  // 인
  { id: 'ph3', name: '포스핀', formula: 'PH₃', atomCounts: { P: 1, H: 3 }, structureKey: 'P', stabilityNote: '상온에서 존재하는 피라미드형 기체 분자. 맹독성.', sources: [pc(24404)], status: 'candidate' },
  { id: 'pf3', name: '삼플루오린화 인', formula: 'PF₃', atomCounts: { P: 1, F: 3 }, structureKey: 'FP(F)F', stabilityNote: '상온에서 존재하는 기체 분자.', sources: [pc(24547)], status: 'candidate' },
  { id: 'pcl3', name: '삼염화 인', formula: 'PCl₃', atomCounts: { P: 1, Cl: 3 }, structureKey: 'ClP(Cl)Cl', stabilityNote: '건조한 조건에서 안정한 액체 분자. 물과 반응함.', sources: [pc(24387)], status: 'candidate' },
  { id: 'pocl3', name: '옥시염화 인', formula: 'POCl₃', atomCounts: { P: 1, O: 1, Cl: 3 }, structureKey: 'O=P(Cl)(Cl)Cl', stabilityNote: '건조한 조건에서 안정한 액체 분자. 물과 반응함.', sources: [pc(24813)], status: 'candidate' },
  { id: 'pf5', name: '오플루오린화 인', formula: 'PF₅', atomCounts: { P: 1, F: 5 }, structureKey: 'FP(F)(F)(F)F', stabilityNote: '건조한 조건에서 존재하는 삼각쌍뿔형 기체 분자.', sources: [pc(24295)], status: 'candidate' },
  { id: 'p4', name: '백린', formula: 'P₄', atomCounts: { P: 4 }, structureKey: 'P12P3P1P23', stabilityNote: '실재 분자이지만 공기 중에서 스스로 불붙어 안정성 기준 검토 필요.', sources: [pc(123286)], status: 'pending' },
  // 황
  { id: 'h2s', name: '황화 수소', formula: 'H₂S', atomCounts: { H: 2, S: 1 }, structureKey: 'S', stabilityNote: '상온에서 안정한 기체 분자. 달걀 썩는 냄새, 독성.', sources: [pc(402)], status: 'candidate' },
  { id: 'so2', name: '이산화 황', formula: 'SO₂', atomCounts: { S: 1, O: 2 }, structureKey: 'O=S=O', stabilityNote: '상온에서 안정한 굽은형 기체 분자.', sources: [pc(1119)], status: 'candidate' },
  { id: 'cs2', name: '이황화 탄소', formula: 'CS₂', atomCounts: { C: 1, S: 2 }, structureKey: 'S=C=S', stabilityNote: '상온에서 안정한 선형 액체 분자. 인화성.', sources: [pc(6348)], status: 'candidate' },
  { id: 'ocs', name: '황화 카보닐', formula: 'OCS', atomCounts: { O: 1, C: 1, S: 1 }, structureKey: 'O=C=S', stabilityNote: '상온에서 안정한 선형 기체 분자.', sources: [pc(10039)], status: 'candidate' },
  { id: 'ch3sh', name: '메테인싸이올', formula: 'CH₃SH', atomCounts: { C: 1, H: 4, S: 1 }, structureKey: 'CS', stabilityNote: '상온에서 존재하는 기체 분자. 강한 냄새.', sources: [pc(878)], status: 'candidate' },
  // 이온 화합물: 결정 속 화학식 단위 기준으로 인원을 센다 (독립 분자가 아님)
  { id: 'nacl', kind: 'ionic', name: '염화 소듐', formula: 'NaCl', atomCounts: { Na: 1, Cl: 1 }, structureKey: 'ionic:NaCl', stabilityNote: '소금. 상온에서 안정한 이온 결정.', sources: [pc(5234)], status: 'candidate' },
  { id: 'kcl', kind: 'ionic', name: '염화 포타슘', formula: 'KCl', atomCounts: { K: 1, Cl: 1 }, structureKey: 'ionic:KCl', stabilityNote: '상온에서 안정한 이온 결정 (저나트륨 소금).', sources: [pc(4873)], status: 'candidate' },
  { id: 'naf', kind: 'ionic', name: '플루오린화 소듐', formula: 'NaF', atomCounts: { Na: 1, F: 1 }, structureKey: 'ionic:NaF', stabilityNote: '상온에서 안정한 이온 결정 (치약 불소 성분).', sources: [pc(5235)], status: 'candidate' },
  { id: 'kf', kind: 'ionic', name: '플루오린화 포타슘', formula: 'KF', atomCounts: { K: 1, F: 1 }, structureKey: 'ionic:KF', stabilityNote: '상온에서 안정한 이온 결정. 습기를 잘 흡수함.', sources: [pc(522689)], status: 'candidate' },
  { id: 'naoh', kind: 'ionic', name: '수산화 소듐', formula: 'NaOH', atomCounts: { Na: 1, O: 1, H: 1 }, structureKey: 'ionic:NaOH', stabilityNote: '상온에서 안정한 이온 결정. 강한 염기, 부식성.', sources: [pc(14798)], status: 'candidate' },
  { id: 'koh', kind: 'ionic', name: '수산화 포타슘', formula: 'KOH', atomCounts: { K: 1, O: 1, H: 1 }, structureKey: 'ionic:KOH', stabilityNote: '상온에서 안정한 이온 결정. 강한 염기, 부식성.', sources: [pc(14797)], status: 'candidate' },
  { id: 'na2s', kind: 'ionic', name: '황화 소듐', formula: 'Na₂S', atomCounts: { Na: 2, S: 1 }, structureKey: 'ionic:Na2S', stabilityNote: '건조한 조건에서 안정한 이온 결정. 습기와 반응함.', sources: [pc(237873)], status: 'candidate' },
  { id: 'nano3', kind: 'ionic', name: '질산 소듐', formula: 'NaNO₃', atomCounts: { Na: 1, N: 1, O: 3 }, structureKey: 'ionic:NaNO3', stabilityNote: '상온에서 안정한 이온 결정.', sources: [pc(24268)], status: 'candidate' },
  { id: 'kno3', kind: 'ionic', name: '질산 포타슘', formula: 'KNO₃', atomCounts: { K: 1, N: 1, O: 3 }, structureKey: 'ionic:KNO3', stabilityNote: '상온에서 안정한 이온 결정 (초석).', sources: [pc(24434)], status: 'candidate' },
  { id: 'nahco3', kind: 'ionic', name: '탄산수소 소듐', formula: 'NaHCO₃', atomCounts: { Na: 1, H: 1, C: 1, O: 3 }, structureKey: 'ionic:NaHCO3', stabilityNote: '베이킹소다. 상온에서 안정한 이온 결정.', sources: [pc(516892)], status: 'candidate' },
  { id: 'na2co3', kind: 'ionic', name: '탄산 소듐', formula: 'Na₂CO₃', atomCounts: { Na: 2, C: 1, O: 3 }, structureKey: 'ionic:Na2CO3', stabilityNote: '상온에서 안정한 이온 결정 (세탁 소다).', sources: [pc(10340)], status: 'candidate' },
  { id: 'k2co3', kind: 'ionic', name: '탄산 포타슘', formula: 'K₂CO₃', atomCounts: { K: 2, C: 1, O: 3 }, structureKey: 'ionic:K2CO3', stabilityNote: '상온에서 안정한 이온 결정. 습기를 잘 흡수함.', sources: [pc(11430)], status: 'candidate' },
];

export const ELEMENT_ORDER: ElementId[] = ['H', 'C', 'N', 'O', 'F', 'Na', 'P', 'S', 'Cl', 'K'];

export function total(c: AtomCounts): number {
  return ELEMENT_ORDER.reduce((s, e) => s + (c[e] ?? 0), 0);
}

export const MOLECULES: Molecule[] = RAW.map((m) => ({ kind: 'molecule' as const, ...m, totalAtoms: total(m.atomCounts) }));

export const kindLabel = (m: Molecule) => (m.kind === 'ionic' ? '이온 결정 · 화학식 단위' : '분자');

/** 매칭·카드에 쓸 수 있는 분자인지. 프로토타입 기본안: 시범 후보까지 허용, 보류는 제외. */
export function isUsable(m: Molecule): boolean {
  return (m.status === 'approved' || m.status === 'candidate') && m.totalAtoms >= 2 && m.totalAtoms <= 6;
}

export const USABLE = () => MOLECULES.filter(isUsable);
export const moleculeById = (id: string) => MOLECULES.find((m) => m.id === id);
