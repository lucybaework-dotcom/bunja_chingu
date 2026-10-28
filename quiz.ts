// 임시 테스트 문항과 점수 규칙 (교체 가능한 설정). 검증된 심리검사가 아니다.
import type { ElementId } from './molecules';

export type Context = 'usual' | 'friends' | 'future';
export const CONTEXT_LABEL: Record<Context, string> = { usual: '평소의 나', friends: '친구들과 있을 때', future: '앞으로 원하는 나' };
/** 친구들과 있을 때의 행동에 가장 큰 비중. */
export const CONTEXT_WEIGHT: Record<Context, number> = { usual: 1, friends: 2, future: 1 };

export interface Option { text: string; points: Partial<Record<ElementId, number>> }
export interface Question { id: string; context: Context; text: string; options: Option[] }

export const QUIZ_VERSION = 'v0-prototype';

export const QUESTIONS: Question[] = [
  { id: 'u1', context: 'usual', text: '할 일 없는 주말 오후, 나는', options: [
    { text: '일단 밖으로 나가 본다', points: { H: 2, O: 1 } },
    { text: '해 보고 싶던 걸 계획한다', points: { C: 2 } },
    { text: '조용히 내 시간을 보낸다', points: { N: 2 } },
    { text: '미뤄 둔 걸 깔끔히 정리한다', points: { Cl: 2 } },
  ] },
  { id: 'u2', context: 'usual', text: '새로운 일을 시작할 때 나는', options: [
    { text: '바로 뛰어든다', points: { O: 2 } },
    { text: '전체 그림부터 그린다', points: { C: 2 } },
    { text: '충분히 지켜본 뒤 시작한다', points: { N: 2 } },
    { text: '기준과 규칙부터 세운다', points: { Cl: 2 } },
  ] },
  { id: 'u3', context: 'usual', text: '사람들이 나를 처음 보면 자주 듣는 말은', options: [
    { text: '편하다, 친근하다', points: { H: 2 } },
    { text: '듬직하다, 믿음직하다', points: { C: 1, N: 1 } },
    { text: '에너지가 넘친다', points: { O: 2 } },
    { text: '취향이 확실하다', points: { Cl: 2 } },
  ] },
  { id: 'u4', context: 'usual', text: '나를 가장 잘 나타내는 말은', options: [
    { text: '호불호 갈려도 확실한 개성', points: { S: 2 } },
    { text: '확 타오르는 열정, 가끔 방전', points: { P: 2 } },
    { text: '묵묵한 실력파', points: { Si: 2 } },
    { text: '강렬한 첫인상', points: { F: 2 } },
  ] },
  { id: 'u5', context: 'usual', text: '내가 좋아하는 내 모습은', options: [
    { text: '아낌없이 퍼주는 나', points: { Na: 2 } },
    { text: '생각나면 바로 떠나는 나', points: { K: 2 } },
    { text: '든든하게 받쳐 주는 나', points: { Mg: 2 } },
    { text: '어디서든 적응하는 나', points: { Al: 2 } },
  ] },
  { id: 'f1', context: 'friends', text: '처음 모인 자리에서 정적이 흐르면', options: [
    { text: '내가 먼저 아무 말이나 꺼낸다', points: { H: 2 } },
    { text: '다 같이 할 만한 걸 제안한다', points: { C: 2 } },
    { text: '누가 말을 꺼낼 때까지 기다린다', points: { N: 2 } },
    { text: '하고 싶은 얘기를 솔직하게 던진다', points: { O: 1, Cl: 1 } },
  ] },
  { id: 'f2', context: 'friends', text: '친구가 고민을 털어놓으면', options: [
    { text: '분위기를 바꿔 기분을 풀어 준다', points: { H: 2 } },
    { text: '끝까지 들어 준다', points: { N: 2 } },
    { text: '같이 해결하자고 바로 움직인다', points: { O: 2 } },
    { text: '문제를 정리해서 짚어 준다', points: { Cl: 2 } },
  ] },
  { id: 'f3', context: 'friends', text: '약속 장소를 정할 때 나는', options: [
    { text: '아무 데나 좋다, 모이는 게 중요', points: { H: 2 } },
    { text: '후보를 모아 정리해 올린다', points: { C: 2 } },
    { text: '정해지면 따라간다', points: { N: 2 } },
    { text: '가고 싶은 곳을 분명히 말한다', points: { O: 1, Cl: 1 } },
  ] },
  { id: 'f4', context: 'friends', text: '의견이 갈릴 때 나는', options: [
    { text: '웃으며 분위기를 풀어 둔다', points: { H: 2 } },
    { text: '모두 납득할 방법을 짠다', points: { C: 2 } },
    { text: '흥분이 가라앉도록 기다린다', points: { N: 2 } },
    { text: '내 의견의 이유를 분명히 말한다', points: { O: 1, Cl: 1 } },
  ] },
  { id: 'f5', context: 'friends', text: '친구들 사이에서 내가 자주 맡는 역할은', options: [
    { text: '분위기 메이커, 웃음 담당', points: { S: 2, H: 1 } },
    { text: '응원단장, 다들 움직이게 함', points: { P: 2, O: 1 } },
    { text: '해결사, 막히면 다들 나한테 옴', points: { Si: 2, C: 1 } },
    { text: '절친 한두 명을 끝까지 챙김', points: { F: 2, N: 1 } },
  ] },
  { id: 'f6', context: 'friends', text: '친구가 힘들어 보일 때 나는', options: [
    { text: '맛있는 거 사 들고 찾아간다', points: { Na: 2, H: 1 } },
    { text: '기분 변화를 바로 알아채고 연락한다', points: { K: 2, O: 1 } },
    { text: '말없이 곁을 지킨다', points: { Mg: 2, N: 1 } },
    { text: '현실적인 해결책을 찾아 준다', points: { Al: 2, Si: 1 } },
  ] },
  { id: 'w1', context: 'future', text: '친구들 사이에서 앞으로 되고 싶은 모습은', options: [
    { text: '어디서든 반가운 사람', points: { H: 2 } },
    { text: '모임을 이어 가는 사람', points: { C: 2 } },
    { text: '언제든 기댈 수 있는 사람', points: { N: 2 } },
    { text: '함께 새로운 걸 해 보는 사람', points: { O: 2 } },
  ] },
  { id: 'w2', context: 'future', text: '이번 학기에 더 갖고 싶은 건', options: [
    { text: '넓은 인맥', points: { H: 2 } },
    { text: '같이 무언가 만드는 경험', points: { C: 2 } },
    { text: '오래 갈 친구 몇 명', points: { N: 2 } },
    { text: '나를 정확히 알아주는 사람', points: { Cl: 2 } },
  ] },
  { id: 'w3', context: 'future', text: '앞으로 친구들에게 듣고 싶은 말은', options: [
    { text: '너 없으면 재미없어', points: { S: 2, H: 1 } },
    { text: '너 덕분에 시작했어', points: { P: 2, O: 1 } },
    { text: '너라면 믿고 맡길게', points: { Si: 2, C: 1 } },
    { text: '넌 진짜 의리 있어', points: { F: 2, N: 1 } },
  ] },
];

export interface QuizResult { scores: Record<ElementId, number>; recommended: ElementId; ranking: ElementId[] }

export function scoreQuiz(answers: Record<string, number>, usable: ElementId[]): QuizResult {
  const scores = Object.fromEntries(usable.map((e) => [e, 0])) as Record<ElementId, number>;
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (idx === undefined) continue;
    const opt = q.options[idx];
    for (const [el, p] of Object.entries(opt.points) as [ElementId, number][]) {
      if (el in scores) scores[el] += p * CONTEXT_WEIGHT[q.context];
    }
  }
  const ranking = [...usable].sort((a, b) => scores[b] - scores[a] || usable.indexOf(a) - usable.indexOf(b));
  return { scores, recommended: ranking[0], ranking };
}
