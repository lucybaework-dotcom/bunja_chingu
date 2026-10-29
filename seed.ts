// 시연용 가상 데이터. 실제 사람이 아니다.
import { apply, emptyState, type Command } from './engine';
import type { ElementId } from './molecules';
import type { State } from './types';

const NICK = ['아침산소', '수소방울', '맛집탄소', '영화산소', '보드탄소', '냥집사', '조용질소', '탬버린', '음악염소', '카페질소', '밈수집가', '의리불소', '불씨인', '공대산소', '간식소듐', '즉흥칼륨', '운동수소', '살림염소'];
const V: [ElementId, string][] = [
  ['O', '아침형 인간, 산책 좋아해요'], ['H', '새로운 사람 만나는 거 좋아해요'],
  ['C', '맛집 리스트 정리하는 게 취미'], ['O', '영화 보고 수다 떠는 거 최고'],
  ['C', '보드게임 모임 만들고 싶어요'], ['H', '고양이 두 마리랑 살아요'],
  ['N', '말수는 적지만 잘 들어요'], ['H', '노래방 가면 탬버린 담당'],
  ['Cl', '취향 확실한 편, 음악 추천 자신 있음'], ['N', '조용한 카페 좋아해요'],
  ['S', '밈 수집가, 웃기는 거 자신 있어요'], ['F', '친해지면 오래 가는 스타일'],
  ['P', '같이 뭐 하자고 먼저 말하는 편'], ['O', '공대생, 고장 난 거 잘 고쳐요'],
  ['Na', '간식 항상 들고 다녀요'], ['K', '즉흥 여행 좋아해요'],
  ['H', '운동 메이트 구해요'], ['Cl', '자취 9년 차, 살림 고수'],
];

export function seedState(now: number): State {
  let s = emptyState();
  let t = now - 6 * 3_600_000;
  const run = (cmd: Command) => { const r = apply(s, cmd, (t += 60_000)); s = r.state; return r.createdId!; };
  const ids = V.map(([el, intro], i) => run({ type: 'createUser', intro, elementId: el, virtual: true, demoLabel: `가상 ${i + 1} · ${el}`, nickname: NICK[i] }));
  // 모집 중인 방들
  const r1 = run({ type: 'createRoom', actor: ids[0], moleculeId: 'h2o', chatPolicy: 'immediate', name: '오늘 점심 같이 먹을 사람' });
  run({ type: 'joinRoom', actor: ids[1], roomId: r1 });
  run({ type: 'sendMessage', actor: ids[0], roomId: r1, body: '안녕하세요! 수소 한 분만 더 오시면 완성이에요.' });
  run({ type: 'sendMessage', actor: ids[1], roomId: r1, body: '반가워요 :) 학생회관 근처 어때요?' });
  const r2 = run({ type: 'createRoom', actor: ids[2], moleculeId: 'co2', chatPolicy: 'afterComplete', name: '공강 때 카페 가요' });
  run({ type: 'joinRoom', actor: ids[3], roomId: r2 });
  run({ type: 'createRoom', actor: ids[4], moleculeId: 'ch4', chatPolicy: 'immediate', name: '보드게임 한 판' });
  run({ type: 'createRoom', actor: ids[6], moleculeId: 'nh3', chatPolicy: 'afterComplete', name: '조용히 같이 공부해요' });
  run({ type: 'joinRoom', actor: ids[5], roomId: Object.keys(s.rooms).at(-1)! });
  run({ type: 'createRoom', actor: ids[8], moleculeId: 'ch2cl2', chatPolicy: 'immediate', name: '음악 얘기할 사람' });
  run({ type: 'createRoom', actor: ids[10], moleculeId: 'so2', chatPolicy: 'immediate', name: '밈 공유회' });
  run({ type: 'createRoom', actor: ids[11], moleculeId: 'cf4', chatPolicy: 'afterComplete', name: '의리 있는 사람 구함' });
  run({ type: 'createRoom', actor: ids[12], moleculeId: 'ph3', chatPolicy: 'immediate', name: '저녁 러닝 크루' });
  run({ type: 'createRoom', actor: ids[14], moleculeId: 'nacl', chatPolicy: 'immediate', name: '편의점 간식 털기' });
  run({ type: 'createRoom', actor: ids[15], moleculeId: 'k2co3', chatPolicy: 'afterComplete', name: '즉흥 산책' });
  run({ type: 'createRoom', actor: ids[17], moleculeId: 'kcl', chatPolicy: 'immediate', name: '자취 반찬 나눔' });
  // 방장 몇 명은 캠퍼스 안에서 위치를 공유 중
  const spots: [number, number, number][] = [[0, 37.6118, 126.9958], [12, 37.6101, 126.9979], [14, 37.6127, 126.9985]];
  for (const [i, lat, lng] of spots) {
    run({ type: 'setSharing', actor: ids[i], on: true });
    run({ type: 'setLocation', actor: ids[i], loc: { lat, lng, acc: 15 } });
  }
  const firstRoom = Object.values(s.rooms)[0];
  s.rooms[firstRoom.id].meetAt = now + 2 * 3_600_000;
  // 자동 매칭 대기 중인 질소 한 명
  run({ type: 'startAutoMatch', actor: ids[9] });
  void ids[7]; // 가상 7은 아무 방에도 없는 수소 (시연 도구에서 사용)
  return s;
}
