import { TERMS_VERSION } from './engine';
import { describe, expect, it } from 'vitest';
import { apply, emptyState, canViewProfile, hostPins, joinableRoomsFor, reactionOf, type Command } from './engine';
import { viewFor } from './view';
import { isOnCampus, distanceM, CAMPUS } from './campus';
import type { State } from './types';
import type { ElementId } from './molecules';
import { handle, type Deps } from './handler';

const C = CAMPUS.center;
const at = (dLatM: number, dLngM = 0, acc = 20) => ({ lat: C.lat + dLatM / 111_000, lng: C.lng + dLngM / 88_000, acc });

function h() {
  let s: State = emptyState(); let t = 1_000_000;
  const run = (cmd: Command) => { const r = apply(s, cmd, (t += 1000)); s = r.state; return r; };
  const err = (cmd: Command) => { try { run(cmd); return null; } catch (e) { return (e as Error).message; } };
  const user = (el: ElementId, nickname?: string) => run({ type: 'createUser', intro: `${el}`, elementId: el, virtual: true, nickname }).createdId!;
  const room = (host: string, mol: string, name = '테스트') => run({ type: 'createRoom', actor: host, moleculeId: mol, chatPolicy: 'immediate', name }).createdId!;
  return { get s() { return s; }, run, err, user, room, tick: (ms: number) => { t += ms; }, get now() { return t; } };
}
function metH2() {
  const x = h(); const a = x.user('H'), b = x.user('H');
  const r = x.room(a, 'h2'); x.run({ type: 'joinRoom', actor: b, roomId: r });
  const m = x.run({ type: 'proposeMeeting', actor: a, roomId: r, attendeeIds: [a, b] }).createdId!;
  return { x, a, b, r, m };
}

describe('실험실 이름과 시각', () => {
  it('직접 만들 때 이름 필수, 방장만 수정, 자동 매칭 실험실은 이름 없이 시작', () => {
    const x = h(); const o = x.user('O'), a = x.user('H'), b = x.user('H');
    expect(x.err({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'immediate' })).toMatch(/이름은/);
    const r = x.room(o, 'h2o', '2시에 밥 먹을 사람');
    expect(x.s.rooms[r].name).toBe('2시에 밥 먹을 사람');
    x.run({ type: 'joinRoom', actor: a, roomId: r });
    expect(x.err({ type: 'renameRoom', actor: a, roomId: r, name: '바꿈', meetAt: null })).toMatch(/방장만/);
    x.run({ type: 'renameRoom', actor: o, roomId: r, name: '3시 카페', meetAt: x.now + 3_600_000 });
    expect(x.s.rooms[r].meetAt).toBeGreaterThan(x.now);
    expect(x.err({ type: 'renameRoom', actor: o, roomId: r, name: '과거', meetAt: x.now - 5 * 3_600_000 })).toMatch(/지난/);
    const y = h(); const p = y.user('H'), q = y.user('H');
    y.run({ type: 'startAutoMatch', actor: p }); y.run({ type: 'startAutoMatch', actor: q });
    expect(Object.values(y.s.rooms)[0].name ?? null).toBeNull();
    void b;
  });
});

describe('닉네임과 프로필', () => {
  it('닉네임 없으면 실험실 이용 불가, 중복 불가', () => {
    const x = h();
    const me = x.run({ type: 'createUser', intro: '안녕', consentVersion: TERMS_VERSION }).createdId!;
    x.run({ type: 'lockElement', actor: me, elementId: 'H', acknowledged: true });
    expect(x.err({ type: 'createRoom', actor: me, moleculeId: 'h2', chatPolicy: 'immediate', name: '방' })).toMatch(/닉네임/);
    x.user('O', '산소짱');
    expect(x.err({ type: 'updateProfile', actor: me, nickname: '산소짱' })).toMatch(/이미/);
    expect(x.err({ type: 'updateProfile', actor: me, nickname: 'a' })).toMatch(/2~10/);
    x.run({ type: 'updateProfile', actor: me, nickname: '수소왕', tags: ['카페', '산책'] });
    expect(x.err({ type: 'updateProfile', actor: me, tags: ['카페', '산책', '영화', '음악', '공부', '여행'] })).toMatch(/5개/);
    expect(x.s.users[me].tags).toEqual(['카페', '산책']);
  });
  it('같은 실험실이 열려 있는 동안만 서로 프로필을 본다 (나간 사람 포함)', () => {
    const x = h(); const o = x.user('O'), a = x.user('H'), out = x.user('C');
    const r = x.room(o, 'h2o'); x.run({ type: 'joinRoom', actor: a, roomId: r });
    expect(canViewProfile(x.s, o, a)).toBe(true);
    expect(canViewProfile(x.s, out, a)).toBe(false);
    x.run({ type: 'leaveRoom', actor: a, roomId: r });
    expect(canViewProfile(x.s, o, a)).toBe(true); // 나간 사람도
    x.run({ type: 'closeRoom', actor: o, roomId: r });
    expect(canViewProfile(x.s, o, a)).toBe(false);
  });
});

describe('만남 확인 100m 규칙', () => {
  it('위치 없음·오차 큼·100m 초과는 거절, 가까우면 확정', () => {
    const { x, a, b, m } = metH2();
    expect(x.err({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm' })).toMatch(/위치를 켜야/);
    expect(x.err({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(0, 0, 400) })).toMatch(/정확하지/);
    x.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(0) });
    expect(x.err({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm', loc: at(150) })).toMatch(/떨어져/);
    x.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm', loc: at(60) });
    const mt = x.s.meetings.find((y) => y.id === m)!;
    expect(mt.status).toBe('confirmed');
    expect(mt.confirmLoc).toBeUndefined(); // 확정 뒤 위치는 지운다
  });
  it('2시간이 지난 확인은 다시 받는다', () => {
    const { x, a, b, m } = metH2();
    x.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(0) });
    x.tick(3 * 3_600_000);
    x.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm', loc: at(10) });
    const mt = x.s.meetings.find((y) => y.id === m)!;
    expect(mt.status).toBe('pending'); expect(mt.confirmations[a]).toBeUndefined();
    x.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(5) });
    expect(x.s.meetings.find((y) => y.id === m)!.status).toBe('confirmed');
  });
});

describe('카드 받기', () => {
  it('확정 뒤 받기를 눌러야 받은 카드가 되고, 여러 번 눌러도 한 번만', () => {
    const { x, a, b, m } = metH2();
    x.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(0) });
    x.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm', loc: at(0) });
    const rec = x.s.records.find((r) => r.userId === a)!;
    expect(rec.claimedAt ?? null).toBeNull();
    const first = x.run({ type: 'claimCard', actor: a, recordId: rec.id });
    expect(first.createdId).toBe('h2');
    const t1 = x.s.records.find((r) => r.id === rec.id)!.claimedAt;
    expect(x.run({ type: 'claimCard', actor: a, recordId: rec.id }).info).toBe('noop');
    expect(x.s.records.find((r) => r.id === rec.id)!.claimedAt).toBe(t1);
    expect(x.err({ type: 'claimCard', actor: b, recordId: rec.id })).toMatch(/내 만남/);
  });
});

describe('반응도 리뷰', () => {
  it('만난 사람에게만 한 번, 3개 이상일 때 점수 공개, 서버 보기에서는 익명', () => {
    const x = h(); const host = x.user('C'); const hs = [x.user('H'), x.user('H'), x.user('H'), x.user('H')];
    const r = x.room(host, 'ch4'); for (const u of hs) x.run({ type: 'joinRoom', actor: u, roomId: r });
    const m = x.run({ type: 'proposeMeeting', actor: host, roomId: r, attendeeIds: [host, ...hs] }).createdId!;
    expect(x.err({ type: 'review', actor: hs[0], meetingId: m, to: host, tags: ['kind'] })).toMatch(/확인된 뒤/);
    for (const u of [host, ...hs]) x.run({ type: 'respondMeeting', actor: u, meetingId: m, response: 'confirm', loc: at(0) });
    x.run({ type: 'review', actor: hs[0], meetingId: m, to: host, tags: ['kind', 'fun'] });
    expect(x.err({ type: 'review', actor: hs[0], meetingId: m, to: host, tags: ['kind'] })).toMatch(/이미/);
    expect(x.err({ type: 'review', actor: host, meetingId: m, to: host, tags: ['kind'] })).toMatch(/나에게|함께/);
    expect(x.err({ type: 'review', actor: hs[1], meetingId: m, to: host, tags: ['kind', 'fun', 'again', 'reply'] })).toMatch(/1~3/);
    x.run({ type: 'review', actor: hs[1], meetingId: m, to: host, tags: ['kind'] });
    expect(reactionOf(x.s, host).score).toBeNull();
    x.run({ type: 'review', actor: hs[2], meetingId: m, to: host, tags: ['again'] });
    expect(reactionOf(x.s, host)).toMatchObject({ score: 54, reviews: 3, praise: { kind: 2, fun: 1, again: 1 } });
    const v = viewFor(x.s, host, null, x.now);
    expect(v.reviews).toEqual([]); // 받은 리뷰 원본(누가 남겼는지)은 안 보냄
    expect(v.profiles[host].reaction.score).toBe(54);
  });
});

describe('신고·차단·관리자', () => {
  it('서로 다른 3명이 신고하면 자동 정지, 관리자 확정은 반응도 -5', () => {
    const x = h(); const bad = x.user('H'), r1 = x.user('O'), r2 = x.user('O'), r3 = x.user('O');
    const admin = x.run({ type: 'createUser', intro: '관리', makeMe: true, consentVersion: TERMS_VERSION }).createdId!;
    x.run({ type: 'report', actor: r1, target: bad, reason: 'rude', detail: '' });
    expect(x.err({ type: 'report', actor: r1, target: bad, reason: 'rude', detail: '' })).toMatch(/이미/);
    expect(x.err({ type: 'report', actor: r2, target: bad, reason: 'other', detail: '' })).toMatch(/내용/);
    x.run({ type: 'report', actor: r2, target: bad, reason: 'spam', detail: '' });
    expect(x.s.users[bad].suspendedAt ?? null).toBeNull();
    x.run({ type: 'report', actor: r3, target: bad, reason: 'noshow', detail: '' });
    expect(x.s.users[bad].suspendedAt).toBeTruthy();
    expect(x.err({ type: 'createRoom', actor: bad, moleculeId: 'h2', chatPolicy: 'immediate', name: '방' })).toMatch(/정지/);
    expect(x.err({ type: 'adminResolveReport', actor: r1, reportId: x.s.reports[0].id, decision: 'upheld' })).toMatch(/관리자만/);
    x.run({ type: 'adminResolveReport', actor: admin, reportId: x.s.reports[0].id, decision: 'upheld' });
    expect(reactionOf(x.s, bad).reviews).toBe(0);
    x.run({ type: 'adminSetSuspended', actor: admin, target: bad, suspended: false });
    expect(x.s.users[bad].suspendedAt).toBeNull();
    expect(viewFor(x.s, r1, null, x.now).reports.length).toBe(1); // 내가 한 신고만
    expect(viewFor(x.s, admin, null, x.now).reports.length).toBe(3);
  });
  it('차단한 사람이 있는 실험실에는 들어갈 수 없고 목록에서도 빠진다', () => {
    const x = h(); const o = x.user('O'), a = x.user('H');
    const r = x.room(o, 'h2o');
    x.run({ type: 'block', actor: a, target: o });
    expect(joinableRoomsFor(x.s, a).map((y) => y.id)).not.toContain(r);
    expect(x.err({ type: 'joinRoom', actor: a, roomId: r })).toMatch(/함께할 수 없는/);
    x.run({ type: 'unblock', actor: a, target: o });
    x.run({ type: 'joinRoom', actor: a, roomId: r });
  });
  it('자동 매칭도 서로 차단한 사람끼리는 묶지 않는다', () => {
    const x = h(); const a = x.user('H'), b = x.user('H');
    x.run({ type: 'block', actor: a, target: b });
    x.run({ type: 'startAutoMatch', actor: a }); x.run({ type: 'startAutoMatch', actor: b });
    expect(Object.keys(x.s.rooms).length).toBe(0);
  });
});

describe('캠퍼스 위치', () => {
  it('캠퍼스 판정과 거리', () => {
    expect(isOnCampus(C.lat, C.lng)).toBe(true);
    expect(isOnCampus(37.5665, 126.978)).toBe(false); // 서울시청
    expect(Math.round(distanceM(at(0), at(100)))).toBeGreaterThan(95);
  });
  it('방장만 공유, 캠퍼스 밖이면 자동으로 꺼짐, 캠퍼스 안 사용자에게만 보임, 첫 만남 뒤 꺼짐', () => {
    const x = h(); const a = x.user('H'), b = x.user('H'), viewer = x.user('O');
    expect(x.err({ type: 'setSharing', actor: a, on: true })).toMatch(/방장만/);
    const r = x.room(a, 'h2');
    x.run({ type: 'setSharing', actor: a, on: true });
    x.run({ type: 'setLocation', actor: a, loc: at(10) });
    expect(hostPins(x.s, x.now).map((p) => p.userId)).toEqual([a]);
    expect(Object.keys(viewFor(x.s, viewer, at(0), x.now).locations)).toEqual([a]);
    expect(Object.keys(viewFor(x.s, viewer, { lat: 37.5665, lng: 126.978 }, x.now).locations)).toEqual([]);
    expect(Object.keys(viewFor(x.s, viewer, null, x.now).locations)).toEqual([]);
    x.tick(20 * 60_000);
    expect(hostPins(x.s, x.now)).toEqual([]); // 15분 넘게 갱신 없으면 숨김
    x.run({ type: 'setLocation', actor: a, loc: { lat: 37.5665, lng: 126.978, acc: 10 } });
    expect(x.s.users[a].sharingLocation).toBe(false); expect(x.s.locations[a]).toBeUndefined();
    x.run({ type: 'setSharing', actor: a, on: true }); x.run({ type: 'setLocation', actor: a, loc: at(0) });
    x.run({ type: 'joinRoom', actor: b, roomId: r });
    const m = x.run({ type: 'proposeMeeting', actor: a, roomId: r, attendeeIds: [a, b] }).createdId!;
    x.run({ type: 'respondMeeting', actor: a, meetingId: m, response: 'confirm', loc: at(0) });
    x.run({ type: 'respondMeeting', actor: b, meetingId: m, response: 'confirm', loc: at(0) });
    expect(x.s.users[a].sharingLocation).toBe(false);
  });
});

describe('서버: 관리자 메일', () => {
  it('lucybae@kookmin.ac.kr 계정은 관리자가 되고 다른 사람은 아니다', async () => {
    let row: { version: number; state: State } | null = null;
    const deps: Deps = {
      getUser: async (tk) => (tk === 'lucy' ? { id: 'L', email: 'LucyBae@kookmin.ac.kr' } : tk === 'x' ? { id: 'X', email: 'x@x.com' } : null),
      load: async () => (row ? structuredClone(row) : null),
      save: async (prev, next) => { if ((row?.version ?? null) !== prev) return false; row = { version: (prev ?? 0) + 1, state: structuredClone(next) }; return true; },
      bump: async () => {}, now: () => 5_000_000,
    };
    const L = await handle('lucy', { action: 'dispatch', cmd: { type: 'createUser', intro: '관리자', nickname: '루시', consentVersion: TERMS_VERSION } }, deps);
    expect((L.body.view as any).isAdmin).toBe(true);
    const X = await handle('x', { action: 'dispatch', cmd: { type: 'createUser', intro: 'x', nickname: '엑스', consentVersion: TERMS_VERSION } }, deps);
    expect((X.body.view as any).isAdmin).toBe(false);
    const bad = await handle('x', { action: 'dispatch', cmd: { type: 'adminSetSuspended', target: 'L', suspended: true } }, deps);
    expect(bad.body.ok).toBe(false);
    const sneaky = await handle('x', { action: 'dispatch', cmd: { type: 'makeAdmin', userId: 'X' } }, deps);
    expect(sneaky.body.ok).toBe(false);
  });
});
