// 시연용 가상 데이터. 실제 사람이 아니다.
import { apply, emptyState, type Command } from './engine';
import type { ElementId } from './molecules';
import type { State } from './types';

const V: [ElementId, string][] = [
  ['O', '아침형 인간, 산책 좋아해요'], ['H', '새로운 사람 만나는 거 좋아해요'],
  ['C', '맛집 리스트 정리하는 게 취미'], ['O', '영화 보고 수다 떠는 거 최고'],
  ['C', '보드게임 모임 만들고 싶어요'], ['H', '고양이 두 마리랑 살아요'],
  ['N', '말수는 적지만 잘 들어요'], ['H', '노래방 가면 탬버린 담당'],
  ['Cl', '취향 확실한 편, 음악 추천 자신 있음'], ['N', '조용한 카페 좋아해요'],
  ['S', '밈 수집가, 웃기는 거 자신 있어요'], ['F', '친해지면 오래 가는 스타일'],
  ['P', '같이 뭐 하자고 먼저 말하는 편'], ['Si', '공대생, 고장 난 거 잘 고쳐요'],
];

export function seedState(now: number): State {
  let s = emptyState();
  let t = now - 6 * 3_600_000;
  const run = (cmd: Command) => { const r = apply(s, cmd, (t += 60_000)); s = r.state; return r.createdId!; };
  const ids = V.map(([el, intro], i) => run({ type: 'createUser', intro, elementId: el, virtual: true, demoLabel: `가상 ${i + 1} · ${el}` }));
  // 모집 중인 방들
  const r1 = run({ type: 'createRoom', actor: ids[0], moleculeId: 'h2o', chatPolicy: 'immediate' });
  run({ type: 'joinRoom', actor: ids[1], roomId: r1 });
  run({ type: 'sendMessage', actor: ids[0], roomId: r1, body: '안녕하세요! 수소 한 분만 더 오시면 완성이에요.' });
  run({ type: 'sendMessage', actor: ids[1], roomId: r1, body: '반가워요 :) 학생회관 근처 어때요?' });
  const r2 = run({ type: 'createRoom', actor: ids[2], moleculeId: 'co2', chatPolicy: 'afterComplete' });
  run({ type: 'joinRoom', actor: ids[3], roomId: r2 });
  run({ type: 'createRoom', actor: ids[4], moleculeId: 'ch4', chatPolicy: 'immediate' });
  run({ type: 'createRoom', actor: ids[6], moleculeId: 'nh3', chatPolicy: 'afterComplete' });
  run({ type: 'joinRoom', actor: ids[5], roomId: Object.keys(s.rooms).at(-1)! });
  run({ type: 'createRoom', actor: ids[8], moleculeId: 'ch2cl2', chatPolicy: 'immediate' });
  run({ type: 'createRoom', actor: ids[10], moleculeId: 'so2', chatPolicy: 'immediate' });
  run({ type: 'createRoom', actor: ids[11], moleculeId: 'cf4', chatPolicy: 'afterComplete' });
  run({ type: 'createRoom', actor: ids[12], moleculeId: 'ph3', chatPolicy: 'immediate' });
  // 자동 매칭 대기 중인 질소 한 명
  run({ type: 'startAutoMatch', actor: ids[9] });
  void ids[7]; // 가상 7은 아무 방에도 없는 수소 (시연 도구에서 사용)
  return s;
}
