// 업적과 칭호. 모은 카드·만남·남긴 칭찬으로 계산한다 (서버와 화면이 같은 규칙을 쓴다).
import { moleculeById, USABLE, type ElementId } from './molecules';

export interface AchCtx { cards: string[]; meetings: number; metElements: Set<ElementId>; praisesGiven: number }
export interface Achievement { id: string; title: string; desc: string; goal: (c: AchCtx) => [number, number] }

const withEl = (c: AchCtx, el: ElementId) => c.cards.filter((id) => (moleculeById(id)?.atomCounts[el] ?? 0) > 0).length;
const ionic = (c: AchCtx) => c.cards.filter((id) => moleculeById(id)?.kind === 'ionic').length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', title: '첫 반응', desc: '분자 카드 첫 장 받기', goal: (c) => [c.cards.length, 1] },
  { id: 'five', title: '연구원', desc: '분자 카드 5장 모으기', goal: (c) => [c.cards.length, 5] },
  { id: 'ten', title: '선임 연구원', desc: '분자 카드 10장 모으기', goal: (c) => [c.cards.length, 10] },
  { id: 'twenty', title: '실험실장', desc: '분자 카드 20장 모으기', goal: (c) => [c.cards.length, 20] },
  { id: 'all', title: '노벨화학상', desc: '도감의 모든 분자 모으기', goal: (c) => [c.cards.length, USABLE().length] },
  { id: 'organic', title: '유기화학자', desc: '탄소(C)가 들어간 카드 5장', goal: (c) => [withEl(c, 'C'), 5] },
  { id: 'halogen', title: '할로젠 사냥꾼', desc: '플루오린(F)과 염소(Cl)가 든 카드를 각각 1장 이상', goal: (c) => [Math.min(withEl(c, 'F'), 1) + Math.min(withEl(c, 'Cl'), 1), 2] },
  { id: 'crystal', title: '결정 수집가', desc: '이온 결정 카드 3장', goal: (c) => [ionic(c), 3] },
  { id: 'big', title: '대가족', desc: '6명이 모이는 분자 카드 받기', goal: (c) => [Math.min(1, c.cards.filter((id) => moleculeById(id)?.totalAtoms === 6).length), 1] },
  { id: 'regular', title: '단골 손님', desc: '실제 만남 5번', goal: (c) => [c.meetings, 5] },
  { id: 'social', title: '마당발', desc: '서로 다른 원소 6종과 만나기', goal: (c) => [c.metElements.size, 6] },
  { id: 'kind', title: '칭찬 요정', desc: '함께한 사람에게 반응 5번 남기기', goal: (c) => [c.praisesGiven, 5] },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
export const isDone = (a: Achievement, c: AchCtx) => { const [n, g] = a.goal(c); return n >= g; };
