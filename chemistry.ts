import { ELEMENT_ORDER, USABLE, type AtomCounts, type ElementId, type Molecule } from './molecules';

export function countsOf(elements: ElementId[]): AtomCounts {
  const c: AtomCounts = {};
  for (const e of elements) c[e] = (c[e] ?? 0) + 1;
  return c;
}

export function sameCounts(a: AtomCounts, b: AtomCounts): boolean {
  return ELEMENT_ORDER.every((e) => (a[e] ?? 0) === (b[e] ?? 0));
}

/** a가 b를 포함하는가 (모든 원소에서 a >= b). */
export function contains(a: AtomCounts, b: AtomCounts): boolean {
  return ELEMENT_ORDER.every((e) => (a[e] ?? 0) >= (b[e] ?? 0));
}

/** 현재 구성과 원소 수가 정확히 같은 사용 가능 분자. 일부만 골라 판정하지 않는다. */
export function exactMatches(counts: AtomCounts): Molecule[] {
  return USABLE().filter((m) => sameCounts(m.atomCounts, counts));
}

/** 현재 구성을 모두 수용하면서 더 큰 사용 가능 분자 (목표 변경 후보). */
export function supersetCandidates(counts: AtomCounts, excludeId?: string): Molecule[] {
  return USABLE().filter((m) => m.id !== excludeId && contains(m.atomCounts, counts) && !sameCounts(m.atomCounts, counts));
}

export function hasVacancy(target: AtomCounts, current: AtomCounts, e: ElementId): boolean {
  return (current[e] ?? 0) < (target[e] ?? 0);
}

export function vacancies(target: AtomCounts, current: AtomCounts): AtomCounts {
  const v: AtomCounts = {};
  for (const e of ELEMENT_ORDER) {
    const n = (target[e] ?? 0) - (current[e] ?? 0);
    if (n > 0) v[e] = n;
  }
  return v;
}

export function moleculesWith(e: ElementId): Molecule[] {
  return USABLE().filter((m) => (m.atomCounts[e] ?? 0) > 0);
}

/** 승인된 분자에서 실제로 쓸 수 있는 원소만. */
export function usableElements(): ElementId[] {
  return ELEMENT_ORDER.filter((e) => moleculesWith(e).length > 0);
}

/** 슬롯 목록: 목표 분자의 원자 자리를 원소 순서대로 펼친다. */
export function slotsOf(target: AtomCounts, formula?: string): ElementId[] {
  const order = formula ? [...new Set([...formula.matchAll(/Cl|Si|[A-Z]/g)].map((m) => m[0] as ElementId))] : [];
  const seq = [...order, ...ELEMENT_ORDER.filter((e) => !order.includes(e))];
  return seq.flatMap((e) => Array.from({ length: target[e] ?? 0 }, () => e));
}
