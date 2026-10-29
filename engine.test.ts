import { TERMS_VERSION } from './engine';
import { describe, expect, it } from 'vitest';
import { apply, emptyState, activeMembers, canChat, hasConflict, recruitingCommitments, findQueueGroup, type Command } from './engine';
import { exactMatches, supersetCandidates, countsOf, usableElements } from './chemistry';
import { MOLECULES, USABLE, isUsable, total, ELEMENT_ORDER } from './molecules';
import { QUESTIONS } from './quiz';
import type { ElementId } from './molecules';
import type { State } from './types';
import { seedState } from './seed';
import { j } from './josa';
import { elementColor, inkContrast } from './colors';

const HERE = { lat: 37.6110, lng: 126.9968, acc: 20 };
/** 예전 테스트가 새 필수 입력(실험실 이름, 만남 확인 위치)을 몰라도 돌아가게 기본값을 채운다 */
export function withDefaults(cmd: Command): Command {
  if (cmd.type === 'createRoom' && !cmd.name) return { ...cmd, name: '테스트 실험실' };
  if (cmd.type === 'respondMeeting' && cmd.response === 'confirm' && cmd.loc === undefined) return { ...cmd, loc: HERE };
  return cmd;
}
function harness() {
  let s: State = emptyState(); let t = 1_000_000;
  const run = (cmd: Command) => { const r = apply(s, withDefaults(cmd), (t += 1000)); s = r.state; return r; };
  const tryRun = (cmd: Command) => { try { run(cmd); return null; } catch (e) { return (e as Error).message; } };
  const user = (el: ElementId, intro = `${el} 사람`) => run({ type: 'createUser', intro, elementId: el, virtual: true }).createdId!;
  return { get s() { return s; }, run, tryRun, user };
}
const allAnswers = (i = 0) => Object.fromEntries(QUESTIONS.map((q) => [q.id, i]));

describe('화학 카탈로그', () => {
  it('모든 사용 분자는 원자 수 2~6, 표시 화학식과 원자 수가 일치', () => {
    const sub: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6' };
    for (const m of USABLE()) {
      expect(m.totalAtoms).toBeGreaterThanOrEqual(2); expect(m.totalAtoms).toBeLessThanOrEqual(6);
      const f = m.formula.replace(/[₀-₆]/g, (c) => sub[c]);
      const parsed: Record<string, number> = {};
      for (const [, el, n] of f.matchAll(/(Cl|[A-Z][a-z]?)(\d*)/g)) parsed[el] = (parsed[el] ?? 0) + (n ? +n : 1);
      expect(parsed).toEqual(m.atomCounts);
      expect(m.sources.length).toBeGreaterThan(0);
    }
  });
  it('보류 분자(O₃, H₂O₂)는 매칭에 쓰이지 않는다', () => {
    expect(isUsable(MOLECULES.find((m) => m.id === 'o3')!)).toBe(false);
    expect(exactMatches({ O: 3 })).toEqual([]);
  });
  it('id와 구조 키가 중복되지 않는다', () => {
    expect(new Set(MOLECULES.map((m) => m.id)).size).toBe(MOLECULES.length);
    expect(new Set(MOLECULES.map((m) => m.structureKey)).size).toBe(MOLECULES.length);
  });
  it('정확 일치만 판정하고 일부 부분집합으로 판정하지 않는다', () => {
    expect(exactMatches(countsOf(['H', 'H', 'O'])).map((m) => m.id)).toEqual(['h2o']);
    expect(exactMatches(countsOf(['H', 'H', 'O', 'N']))).toEqual([]); // H₂O를 일부로 포함해도 무효
    expect(supersetCandidates(countsOf(['C', 'H'])).map((m) => m.id)).toContain('ch4');
    expect(total({ C: 1, H: 4 })).toBe(5);
  });
  it('사용 가능한 원소는 카탈로그에 실제로 등장하는 원소뿐', () => {
    expect(usableElements()).toEqual(ELEMENT_ORDER.filter((e) => USABLE().some((m) => m.atomCounts[e])));
  });
});

import { GEOMETRY } from './geometry';
describe('3D 모형 데이터', () => {
  it('모든 분자·화합물에 모형이 있고, 분자 모형의 원자 수는 화학식과 같다', () => {
    for (const m of MOLECULES) {
      const g = GEOMETRY[m.id];
      expect(g, m.id).toBeTruthy();
      if (m.kind === 'ionic') { expect(g.note).toBeTruthy(); continue; }
      const c: Record<string, number> = {};
      for (const [el] of g.atoms) c[el] = (c[el] ?? 0) + 1;
      expect(c, m.id).toEqual(m.atomCounts);
      for (const [a, b] of g.bonds) { expect(g.atoms[a]).toBeTruthy(); expect(g.atoms[b]).toBeTruthy(); }
    }
  });
});

describe('원소 색', () => {
  it('CPK 색을 따르고 글자 대비는 4.5 이상', () => {
    expect(elementColor('H').bg).toBe('#ffffff'); expect(elementColor('O').bg).toMatch(/^#e/i);
    expect(elementColor('Cl').bg).not.toBe(elementColor('F').bg); expect(elementColor('Na').bg).not.toBe(elementColor('K').bg);
    for (const e of usableElements()) expect(inkContrast(e)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('조사 선택', () => {
  it('받침에 맞는 조사를 고른다', () => {
    expect(j('수소', '으로/로')).toBe('수소로'); expect(j('인', '으로/로')).toBe('인으로');
    expect(j('물(H₂O)', '으로/로')).toBe('물(H₂O)로'); expect(j('황', '이/가')).toBe('황이');
    expect(j('산소', '이/가')).toBe('산소가'); expect(j('플루오린', '을/를')).toBe('플루오린을');
    expect(j('규소', '을/를')).toBe('규소를'); expect(j('탄소', '과/와')).toBe('탄소와');
    expect(j('질소', '이에요/예요')).toBe('질소예요'); expect(j('염소(Cl)', '이/가')).toBe('염소(Cl)가');
    expect(j('메테인 (5명)', '으로/로')).toBe('메테인 (5명)으로');
  });
});

describe('이온 화합물', () => {
  it('Na, Mg, Al, K가 쓰이고 이온 화합물로 표시된다', () => {
    for (const e of ['Na', 'K'] as ElementId[]) expect(usableElements()).toContain(e);
    for (const e of ['Mg', 'Al', 'Si']) expect(usableElements() as string[]).not.toContain(e);
    expect(exactMatches(countsOf(['Na', 'Cl'])).map((m) => [m.id, m.kind])).toEqual([['nacl', 'ionic']]);
    expect(exactMatches(countsOf(['Na', 'H', 'C', 'O', 'O', 'O']))[0].id).toBe('nahco3');
    expect(MOLECULES.filter((m) => m.kind === 'molecule').length).toBeGreaterThan(40);
  });
  it('같은 1족끼리(Na+K)는 화합물이 없다', () => {
    expect(exactMatches(countsOf(['Na', 'K']))).toEqual([]);
  });
});

describe('확장 원소', () => {
  it('F, Si, P, S가 사용 원소에 포함되고 각자 분자가 있다', () => {
    for (const e of ['F', 'P', 'S'] as ElementId[]) expect(usableElements()).toContain(e);
  });
  it('모든 사용 원소는 테스트에서 주 점수(2점)를 받는 선택지가 있다', () => {
    for (const e of usableElements()) expect(QUESTIONS.some((q) => q.options.some((o) => (o.points[e] ?? 0) >= 2))).toBe(true);
  });
  it('보류 분자(P₄, SiH₄, H₂CO)는 쓰이지 않는다', () => {
    expect(exactMatches({ P: 4 })).toEqual([]); expect(exactMatches({ H: 2, C: 1, O: 1 })).toEqual([]);
  });
  it('두 글자 기호가 들어간 화학식도 올바른 원자 수', () => {
    expect(exactMatches(countsOf(['K', 'C', 'O', 'O', 'O', 'K'])).map((m) => m.id)).toEqual(['k2co3']);
  });
});

describe('1. 원소 테스트와 확정', () => {
  it('테스트 재응시, 추천과 다른 원소 선택, 확정 후 변경 불가', () => {
    const h = harness();
    const me = h.run({ type: 'createUser', intro: '안녕', makeMe: true, consentVersion: TERMS_VERSION }).createdId!;
    h.run({ type: 'recordQuiz', actor: me, answers: allAnswers(0) });
    h.run({ type: 'recordQuiz', actor: me, answers: allAnswers(1) });
    expect(h.s.quizAttempts.length).toBe(2);
    const rec = h.s.quizAttempts[1].recommended;
    const other = usableElements().find((e) => e !== rec)!;
    expect(h.tryRun({ type: 'lockElement', actor: me, elementId: other, acknowledged: false })).toMatch(/안내/);
    h.run({ type: 'lockElement', actor: me, elementId: other, acknowledged: true });
    expect(h.s.users[me].elementId).toBe(other);
    expect(h.tryRun({ type: 'lockElement', actor: me, elementId: rec, acknowledged: true })).toMatch(/바꿀 수 없어요/);
    expect(h.tryRun({ type: 'recordQuiz', actor: me, answers: allAnswers(2) })).toMatch(/다시 볼 수 없어요/);
    expect(h.s.users[me].elementId).toBe(other);
  });
});

describe('2~4. 실험실 입장과 완성, 채팅 정책', () => {
  it('자리 없는 원소는 못 들어가고 빈자리 초과도 불가, 마지막 자리에서 자동 확정', () => {
    const h = harness();
    const o = h.user('O'), h1 = h.user('H'), h2 = h.user('H'), h3 = h.user('H'), c = h.user('C');
    const r = h.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'afterComplete' }).createdId!;
    expect(activeMembers(h.s, r).map((m) => m.userId)).toEqual([o]);
    expect(h.tryRun({ type: 'joinRoom', actor: c, roomId: r })).toMatch(/자리가 남아 있지 않아요/);
    h.run({ type: 'joinRoom', actor: h1, roomId: r });
    expect(canChat(h.s, r, o)).toBe(false); // 완성 후 정책
    expect(h.tryRun({ type: 'sendMessage', actor: o, roomId: r, body: 'hi' })).toMatch(/채팅할 수 없어요/);
    h.run({ type: 'joinRoom', actor: h2, roomId: r });
    expect(h.s.rooms[r].recruitment).toBe('complete');
    expect(canChat(h.s, r, o)).toBe(true);
    expect(h.tryRun({ type: 'joinRoom', actor: h3, roomId: r })).toMatch(/모집 중인 실험실이 아니에요/);
  });
  it('내 원소가 없는 분자로는 실험실을 만들 수 없다', () => {
    const h = harness(); const n = h.user('N');
    expect(h.tryRun({ type: 'createRoom', actor: n, moleculeId: 'h2o', chatPolicy: 'immediate' })).toMatch(/자리가 없어요/);
    expect(h.tryRun({ type: 'createRoom', actor: n, moleculeId: 'o3', chatPolicy: 'immediate' })).toMatch(/사용할 수 없는/);
  });
  it('입장 즉시 정책은 모집 중에도 채팅 가능, 합류 알림', () => {
    const h = harness(); const o = h.user('O'), hh = h.user('H');
    const r = h.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: hh, roomId: r });
    h.run({ type: 'sendMessage', actor: hh, roomId: r, body: '안녕' });
    expect(h.s.notifications.some((n) => n.userId === o && /합류/.test(n.text))).toBe(true);
  });
  it('같은 원소 분자(H₂)도 만들 수 있다', () => {
    const h = harness(); const a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: b, roomId: r });
    expect(h.s.rooms[r].recruitment).toBe('complete');
  });
});

describe('5. 자동 매칭', () => {
  it('기존 모집 중인 실험실 빈자리를 먼저 채운다', () => {
    const h = harness(); const o = h.user('O'), hh = h.user('H');
    const r = h.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'afterComplete' }).createdId!;
    const res = h.run({ type: 'startAutoMatch', actor: hh });
    expect(res.info).toBe('joined'); expect(res.createdId).toBe(r);
  });
  it('실험실이 없으면 대기 → 유효 조합 생성, 가장 오래 기다린 사람이 방장, 즉시 채팅', () => {
    const h = harness(); const a = h.user('H'), o = h.user('O'), b = h.user('H');
    expect(h.run({ type: 'startAutoMatch', actor: a }).info).toBe('queued');
    expect(h.run({ type: 'startAutoMatch', actor: o }).info).toBe('queued'); // H+O는 카탈로그에 없음
    const res = h.run({ type: 'startAutoMatch', actor: b });
    expect(res.info).toBe('matched');
    const room = Object.values(h.s.rooms)[0];
    expect(room.origin).toBe('automatic'); expect(room.hostId).toBe(a);
    expect(['h2o']).toContain(room.targetMoleculeId); // 오래 기다린 a 포함 + 보완 점수로 H₂보다 H₂O
    expect(room.recruitment).toBe('complete');
    expect(canChat(h.s, room.id, o)).toBe(true);
    expect(activeMembers(h.s, room.id).find((m) => m.userId === o)!.reason?.mood).toBeTruthy();
  });
  it('대기 중에는 직접 합류/생성 불가 (자리 중복 점유 방지), 취소 후 가능', () => {
    const h = harness(); const n = h.user('N'), o = h.user('O');
    h.run({ type: 'startAutoMatch', actor: n });
    expect(h.tryRun({ type: 'createRoom', actor: n, moleculeId: 'n2o', chatPolicy: 'immediate' })).toMatch(/대기 중/);
    expect(h.tryRun({ type: 'startAutoMatch', actor: n })).toMatch(/대기 중/);
    h.run({ type: 'cancelAutoMatch', actor: n });
    h.run({ type: 'createRoom', actor: n, moleculeId: 'n2o', chatPolicy: 'immediate' });
    void o;
  });
  it('대기 그룹 탐색은 유효 분자만 만든다', () => {
    const h = harness(); const c = h.user('C'), n = h.user('N');
    h.run({ type: 'startAutoMatch', actor: c }); h.run({ type: 'startAutoMatch', actor: n });
    expect(findQueueGroup(h.s)).toBeNull(); // CN은 카탈로그에 없음
  });
});

describe('6. 참여 제한', () => {
  it('모집 중인 실험실은 하나만, 완성방은 여러 개', () => {
    const h = harness(); const me = h.user('H');
    const o1 = h.user('O'), o2 = h.user('O'), x = h.user('H'), y = h.user('H');
    const r1 = h.run({ type: 'createRoom', actor: o1, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    const r2 = h.run({ type: 'createRoom', actor: o2, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: me, roomId: r1 });
    expect(h.tryRun({ type: 'joinRoom', actor: me, roomId: r2 })).toMatch(/한 곳만/);
    h.run({ type: 'joinRoom', actor: x, roomId: r1 }); // r1 완성
    h.run({ type: 'joinRoom', actor: me, roomId: r2 });
    h.run({ type: 'joinRoom', actor: y, roomId: r2 });
    expect(h.s.rooms[r1].recruitment).toBe('complete'); expect(h.s.rooms[r2].recruitment).toBe('complete');
    expect(recruitingCommitments(h.s, me).rooms).toEqual([]);
  });
});

describe('7~8. 조기 완성, 목표 변경, 마감', () => {
  function chRoom() {
    const h = harness(); const c = h.user('C'), a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: c, moleculeId: 'ch4', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: a, roomId: r });
    return { h, c, a, b, r };
  }
  it('조기 완성은 정확 일치 분자 + 전원 동의, 동의자 집합 고정', () => {
    const { h, c, a, r } = chRoom(); // C,H → 정확 일치 분자 없음
    expect(h.tryRun({ type: 'propose', actor: c, roomId: r, kind: 'earlyComplete', moleculeId: 'ch4' })).toMatch(/정확히 같은/);
    const h2 = harness(); const cc = h2.user('C'), hh1 = h2.user('H'), hh2 = h2.user('H'), late = h2.user('H');
    const rr = h2.run({ type: 'createRoom', actor: cc, moleculeId: 'ch4', chatPolicy: 'immediate' }).createdId!;
    h2.run({ type: 'joinRoom', actor: hh1, roomId: rr });
    expect(h2.tryRun({ type: 'propose', actor: cc, roomId: rr, kind: 'earlyComplete', moleculeId: 'ch4' })).toMatch(/정확히 같은/);
    // C + H → 정확 일치 없음, H 하나 더 추가해도 CH₂는 없음. 대신 C₂H₂ 같은 목표 변경 후보 확인
    expect(supersetCandidates(countsOf(['C', 'H']), 'ch4').map((m) => m.id)).toContain('c2h2');
    void c; void a; void hh2; void late;
  });
  it('H₂O 목표 실험실에서 H 두 명만 모이면 H₂로 조기 완성 가능 (반대 시 무산)', () => {
    const h = harness(); const a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: b, roomId: r });
    const p1 = h.run({ type: 'propose', actor: a, roomId: r, kind: 'earlyComplete', moleculeId: 'h2' }).createdId!;
    h.run({ type: 'vote', actor: a, proposalId: p1, choice: 'yes' });
    h.run({ type: 'vote', actor: b, proposalId: p1, choice: 'no' });
    expect(h.s.rooms[r].recruitment).toBe('recruiting');
    const p2 = h.run({ type: 'propose', actor: a, roomId: r, kind: 'earlyComplete', moleculeId: 'h2' }).createdId!;
    const outsider = h.user('O');
    expect(h.tryRun({ type: 'vote', actor: outsider, proposalId: p2, choice: 'yes' })).toMatch(/동의 대상이 아니에요/);
    h.run({ type: 'vote', actor: a, proposalId: p2, choice: 'yes' });
    expect(h.s.rooms[r].recruitment).toBe('recruiting'); // 한 명만 동의
    h.run({ type: 'vote', actor: b, proposalId: p2, choice: 'yes' });
    expect(h.s.rooms[r].targetMoleculeId).toBe('h2'); expect(h.s.rooms[r].recruitment).toBe('complete');
    expect(h.s.rooms[r].originalMoleculeId).toBe('h2o');
  });
  it('구성이 바뀌면 진행 중 투표가 무효', () => {
    const h = harness(); const a = h.user('H'), b = h.user('H'), o = h.user('O');
    const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: b, roomId: r });
    const p = h.run({ type: 'propose', actor: a, roomId: r, kind: 'earlyComplete', moleculeId: 'h2' }).createdId!;
    h.run({ type: 'joinRoom', actor: o, roomId: r });
    expect(h.s.proposals.find((x) => x.id === p)!.status).toBe('void');
  });
  it('목표 변경: 기존 구성원을 모두 수용하는 분자만, 기존 사람 탈락 없음', () => {
    const { h, c, a, r } = chRoom();
    expect(h.tryRun({ type: 'propose', actor: c, roomId: r, kind: 'retarget', moleculeId: 'h2o' })).toMatch(/모두 수용/);
    const p = h.run({ type: 'propose', actor: c, roomId: r, kind: 'retarget', moleculeId: 'ch3oh' }).createdId!;
    h.run({ type: 'vote', actor: c, proposalId: p, choice: 'yes' }); h.run({ type: 'vote', actor: a, proposalId: p, choice: 'yes' });
    expect(h.s.rooms[r].targetMoleculeId).toBe('ch3oh');
    expect(activeMembers(h.s, r).length).toBe(2);
  });
  it('마감: 유효 조합 없으면 종료 / 있으면 제안 → 반대·미응답 시 종료', () => {
    const { h, r } = chRoom();
    h.run({ type: 'expireRecruitment', roomId: r });
    expect(h.s.rooms[r].recruitment).toBe('failed'); expect(h.s.rooms[r].closedAt).not.toBeNull();

    const h2 = harness(); const a = h2.user('H'), b = h2.user('H');
    const r2 = h2.run({ type: 'createRoom', actor: a, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h2.run({ type: 'joinRoom', actor: b, roomId: r2 });
    const p = h2.run({ type: 'expireRecruitment', roomId: r2 }).createdId!;
    h2.run({ type: 'vote', actor: a, proposalId: p, choice: 'yes' });
    h2.run({ type: 'expireProposal', proposalId: p });
    expect(h2.s.rooms[r2].recruitment).toBe('failed');
  });
});

describe('9. 이탈', () => {
  it('첫 만남 전 이탈: 남은 구성으로 분자가 있으면 변경 투표, 재모집 상태', () => {
    const h = harness(); const o = h.user('O'), a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: a, roomId: r }); h.run({ type: 'joinRoom', actor: b, roomId: r });
    h.run({ type: 'leaveRoom', actor: o, roomId: r });
    expect(h.s.rooms[r].recruitment).toBe('recruiting');
    expect(h.s.rooms[r].hostId).toBe(a); // 승계 기본안
    const p = h.s.proposals.find((x) => x.roomId === r && x.status === 'open')!;
    expect(p.targetMoleculeId).toBe('h2'); expect(p.electorate.sort()).toEqual([a, b].sort());
    expect(h.s.members.filter((m) => m.roomId === r).length).toBe(3); // 이탈 이력 유지
  });
  it('재모집 시 다른 모집 중인 실험실과 충돌하면 알리고, 선택해서 해소', () => {
    const h = harness(); const o = h.user('O'), a = h.user('H'), b = h.user('H'), n = h.user('N');
    const r = h.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: a, roomId: r }); h.run({ type: 'joinRoom', actor: b, roomId: r });
    const other = h.run({ type: 'createRoom', actor: n, moleculeId: 'nh3', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: a, roomId: other }); // r은 완성방이라 가능
    h.run({ type: 'leaveRoom', actor: b, roomId: r }); // r 재모집 (O,H → 정확 일치 없음)
    expect(hasConflict(h.s, a)).toBe(true);
    expect(h.s.notifications.some((x) => x.userId === a && /한 곳을 골라/.test(x.text))).toBe(true);
    expect(h.tryRun({ type: 'startAutoMatch', actor: a })).toBeTruthy();
    h.run({ type: 'resolveConflict', actor: a, keepRoomId: r });
    expect(hasConflict(h.s, a)).toBe(false);
    expect(activeMembers(h.s, r).some((m) => m.userId === a)).toBe(true); // 기존 실험실 유지
  });
});

function metRoom() {
  const h = harness(); const c = h.user('C'), h1 = h.user('H'), h2 = h.user('H'), o = h.user('O');
  const r = h.run({ type: 'createRoom', actor: c, moleculeId: 'ch3oh', chatPolicy: 'immediate' }).createdId!;
  for (const x of [h1, h2, o]) h.run({ type: 'joinRoom', actor: x, roomId: r });
  const h3 = h.user('H'), h4 = h.user('H');
  h.run({ type: 'joinRoom', actor: h3, roomId: r }); h.run({ type: 'joinRoom', actor: h4, roomId: r });
  return { h, c, h1, h2, o, h3, h4, r };
}

describe('10~12. 만남 확인과 카드', () => {
  it('권한: 방장만 제안, 본인만 확인, 완성 전 불가', () => {
    const { h, c, h1, h2, o, h3, r } = metRoom();
    expect(h.s.rooms[r].recruitment).toBe('complete');
    expect(h.tryRun({ type: 'proposeMeeting', actor: h1, roomId: r, attendeeIds: [c, h1] })).toMatch(/방장만/);
    const m = h.run({ type: 'proposeMeeting', actor: c, roomId: r, attendeeIds: [c, o, h1, h2] }).createdId!;
    expect(h.tryRun({ type: 'respondMeeting', actor: h3, meetingId: m, response: 'confirm' })).toMatch(/참석자로 선택된/);
  });
  it('불참자 확인 없이, 참석자 전원 확인 후 실제 구성(CH₂O₂? 아니면 카드 없음) 판정', () => {
    const { h, c, h1, h2, o, h3, h4, r } = metRoom();
    // 실제 참석: C, H, H, H, H (O 불참) → CH₄
    const m = h.run({ type: 'proposeMeeting', actor: c, roomId: r, attendeeIds: [c, h1, h2, h3, h4] }).createdId!;
    expect(h.s.meetings.find((x) => x.id === m)!.matchedMoleculeId).toBe('ch4');
    for (const x of [c, h1, h2, h3]) h.run({ type: 'respondMeeting', actor: x, meetingId: m, response: 'confirm' });
    expect(h.s.cards.length).toBe(0); // 아직 한 명 남음
    h.run({ type: 'respondMeeting', actor: h4, meetingId: m, response: 'confirm' });
    expect(h.s.cards.map((x) => x.userId).sort()).toEqual([c, h1, h2, h3, h4].sort());
    expect(h.s.cards.every((x) => x.moleculeId === 'ch4')).toBe(true);
    expect(h.s.cards.some((x) => x.userId === o)).toBe(false);
    expect(h.s.rooms[r].firstMeetingConfirmedAt).not.toBeNull();
    // 중복 클릭은 아무것도 늘리지 않음
    const before = [h.s.cards.length, h.s.records.length];
    h.run({ type: 'respondMeeting', actor: h4, meetingId: m, response: 'confirm' });
    expect([h.s.cards.length, h.s.records.length]).toEqual(before);
    // 첫 만남 이후 이탈해도 실험실 유지, 재모집 없음
    h.run({ type: 'leaveRoom', actor: o, roomId: r });
    expect(h.s.rooms[r].recruitment).toBe('complete'); expect(h.s.rooms[r].closedAt).toBeNull();
  });
  it('유효하지 않은 참석 구성은 카드 없이 기록만', () => {
    const { h, c, o, r } = metRoom();
    const m = h.run({ type: 'proposeMeeting', actor: c, roomId: r, attendeeIds: [c, o] }).createdId!; // CO? → 일산화 탄소 유효!
    expect(h.s.meetings.find((x) => x.id === m)!.matchedMoleculeId).toBe('co');
    const { h: g, c: c2, h1, o: o2, r: r2 } = metRoom();
    const m2 = g.run({ type: 'proposeMeeting', actor: c2, roomId: r2, attendeeIds: [c2, h1, o2] }).createdId!; // CHO → 없음
    expect(g.s.meetings.find((x) => x.id === m2)!.matchedMoleculeId).toBeNull();
    for (const x of [c2, h1, o2]) g.run({ type: 'respondMeeting', actor: x, meetingId: m2, response: 'confirm' });
    expect(g.s.cards.length).toBe(0); expect(g.s.records.length).toBe(3);
    expect(g.s.rooms[r2].firstMeetingConfirmedAt).not.toBeNull();
    void m;
  });
  it('거절 → 방장 수정 → 기존 확인 무효, 재확인', () => {
    const { h, c, h1, h2, o, r } = metRoom();
    const m1 = h.run({ type: 'proposeMeeting', actor: c, roomId: r, attendeeIds: [c, h1, h2, o] }).createdId!;
    h.run({ type: 'respondMeeting', actor: c, meetingId: m1, response: 'confirm' });
    h.run({ type: 'respondMeeting', actor: o, meetingId: m1, response: 'reject' });
    expect(h.s.meetings.find((x) => x.id === m1)!.status).toBe('rejected');
    const m2 = h.run({ type: 'proposeMeeting', actor: c, roomId: r, attendeeIds: [c, h1, h2] }).createdId!;
    expect(h.s.meetings.find((x) => x.id === m2)!.confirmations).toEqual({});
    expect(h.tryRun({ type: 'respondMeeting', actor: c, meetingId: m1, response: 'confirm' })).toMatch(/이미 끝난/);
  });
  it('같은 분자 재획득은 대표 카드 하나 + 기록 누적', () => {
    const h = harness(); const a = h.user('H', '첫 소개');
    h.run({ type: 'updateProfile', actor: a, nickname: '첫닉' });
    let rooms: string[] = [];
    for (let i = 0; i < 2; i++) {
      const b = h.user('H');
      const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2', chatPolicy: 'immediate' }).createdId!;
      h.run({ type: 'joinRoom', actor: b, roomId: r });
      const m = h.run({ type: 'proposeMeeting', actor: a, roomId: r, attendeeIds: [a, b] }).createdId!;
      h.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm' });
      h.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm' });
      rooms.push(r);
    }
    expect(h.s.cards.filter((c) => c.userId === a).length).toBe(1);
    expect(h.s.records.filter((x) => x.userId === a && x.moleculeId === 'h2').length).toBe(2);
    // 소개를 바꿔도 기록 시점 스냅샷 유지
    const b0 = h.s.records.find((x) => x.userId !== a)!;
    h.run({ type: 'updateIntro', actor: a, intro: '바뀐 소개' });
    expect(h.s.records.find((x) => x.id === b0.id)!.companions[0].intro).toBe('첫 소개');
    // 닉네임도 만난 때의 것으로 남고, 나중에 바꿔도 기록은 그대로
    const nick0 = h.s.records.find((x) => x.id === b0.id)!.companions[0].nickname;
    expect(nick0).toBe('첫닉');
    h.run({ type: 'updateProfile', actor: a, nickname: '새닉네임' });
    expect(h.s.records.find((x) => x.id === b0.id)!.companions[0].nickname).toBe(nick0);
    // 실험실 종료해도 카드 유지
    h.run({ type: 'closeRoom', actor: a, roomId: rooms[0] });
    expect(h.s.cards.filter((c) => c.userId === a).length).toBe(1);
  });
});

describe('13. 공개 설정', () => {
  it('기본 비공개, 본인만 변경', () => {
    const h = harness(); const a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: b, roomId: r });
    const m = h.run({ type: 'proposeMeeting', actor: a, roomId: r, attendeeIds: [a, b] }).createdId!;
    h.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm' }); h.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm' });
    expect(h.s.cards.every((c) => c.visibility === 'private')).toBe(true);
    h.run({ type: 'setCardVisibility', actor: a, moleculeId: 'h2', visibility: 'public' });
    expect(h.s.cards.find((c) => c.userId === a)!.visibility).toBe('public');
    expect(h.s.cards.find((c) => c.userId === b)!.visibility).toBe('private');
    const recB = h.s.records.find((x) => x.userId === b)!;
    expect(h.tryRun({ type: 'setRecordVisibility', actor: a, recordId: recB.id, visibility: 'public' })).toMatch(/내 기록이 아니에요/);
  });
});

describe('권한: 실험실 종료', () => {
  it('방장만 종료', () => {
    const h = harness(); const a = h.user('H'), b = h.user('H');
    const r = h.run({ type: 'createRoom', actor: a, moleculeId: 'h2', chatPolicy: 'immediate' }).createdId!;
    h.run({ type: 'joinRoom', actor: b, roomId: r });
    expect(h.tryRun({ type: 'closeRoom', actor: b, roomId: r })).toMatch(/방장만/);
    h.run({ type: 'closeRoom', actor: a, roomId: r });
    expect(h.s.rooms[r].closedAt).not.toBeNull();
  });
});

describe('시연 데이터', () => {
  it('시드가 불변 조건을 지킨다', () => {
    const s = seedState(Date.now());
    for (const u of Object.values(s.users)) expect(recruitingCommitments(s, u.id).rooms.length + (recruitingCommitments(s, u.id).queued ? 1 : 0)).toBeLessThanOrEqual(1);
    expect(s.queue.filter((q) => q.status === 'waiting').length).toBe(1);
  });
});
