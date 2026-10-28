// 주기율표 1~3주기 배치 (표시용 사실 데이터). 서비스에서 쓰는지 여부는 chemistry.usableElements()가 결정한다.
export interface PtCell { z: number; symbol: string; name: string; period: number; group: number; note: string }

export const PERIODIC: PtCell[] = [
  { z: 1, symbol: 'H', name: '수소', period: 1, group: 1, note: '' },
  { z: 2, symbol: 'He', name: '헬륨', period: 1, group: 18, note: '비활성 기체라 다른 원자와 분자를 거의 만들지 않아요.' },
  { z: 3, symbol: 'Li', name: '리튬', period: 2, group: 1, note: '주로 이온 결정(염)을 만들어 지금의 분자 규칙에 맞지 않아요.' },
  { z: 4, symbol: 'Be', name: '베릴륨', period: 2, group: 2, note: '일상 조건에서 안정한 작은 분자 후보가 아직 없어요.' },
  { z: 5, symbol: 'B', name: '붕소', period: 2, group: 13, note: '시범 카탈로그에 아직 분자가 없어요. 검토 후 추가될 수 있어요.' },
  { z: 6, symbol: 'C', name: '탄소', period: 2, group: 14, note: '' },
  { z: 7, symbol: 'N', name: '질소', period: 2, group: 15, note: '' },
  { z: 8, symbol: 'O', name: '산소', period: 2, group: 16, note: '' },
  { z: 9, symbol: 'F', name: '플루오린', period: 2, group: 17, note: '' },
  { z: 10, symbol: 'Ne', name: '네온', period: 2, group: 18, note: '비활성 기체라 분자를 만들지 않아요.' },
  { z: 11, symbol: 'Na', name: '소듐', period: 3, group: 1, note: '염화 소듐(NaCl) 같은 염·결정을 만들어 독립 분자로 다루지 않아요.' },
  { z: 12, symbol: 'Mg', name: '마그네슘', period: 3, group: 2, note: '주로 이온 결정을 만들어 지금의 분자 규칙에 맞지 않아요.' },
  { z: 13, symbol: 'Al', name: '알루미늄', period: 3, group: 13, note: '주로 금속·이온 결정이어서 지금의 분자 규칙에 맞지 않아요.' },
  { z: 14, symbol: 'Si', name: '규소', period: 3, group: 14, note: '' },
  { z: 15, symbol: 'P', name: '인', period: 3, group: 15, note: '' },
  { z: 16, symbol: 'S', name: '황', period: 3, group: 16, note: '' },
  { z: 17, symbol: 'Cl', name: '염소', period: 3, group: 17, note: '' },
  { z: 18, symbol: 'Ar', name: '아르곤', period: 3, group: 18, note: '비활성 기체라 분자를 만들지 않아요.' },
];

/** 화면 열 순서: 1, 2족 다음에 전이 금속 자리 표시, 13~18족. */
export const PT_GROUPS = [1, 2, 13, 14, 15, 16, 17, 18];
