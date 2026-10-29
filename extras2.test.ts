import { describe, expect, it } from 'vitest';
import { apply, emptyState, earnedTitles, elementStats, remindMeetings, TERMS_VERSION, VACANCY_ALERT_GAP_MS, type Command } from './engine';
import { viewFor } from './view';
import { handleCron, type Deps } from './handler';
import type { State } from './types';
import type { ElementId } from './molecules';

function h() {
  let s: State = emptyState(); let t = 1_000_000;
  const run = (cmd: Command) => { const r = apply(s, cmd, (t += 1000)); s = r.state; return r; };
  const err = (cmd: Command) => { try { run(cmd); return null; } catch (e) { return (e as Error).message; } };
  const user = (el: ElementId, nickname?: string) => run({ type: 'createUser', intro: `${el}`, elementId: el, virtual: true, nickname }).createdId!;
  const real = (el: ElementId, nickname: string) => {
    const id = run({ type: 'createUser', intro: '안녕', consentVersion: TERMS_VERSION }).createdId!;
    run({ type: 'lockElement', actor: id, elementId: el, acknowledged: true });
    run({ type: 'updateProfile', actor: id, nickname }); return id;
  };
  const room = (host: string, mol: string, name = '테스트') => run({ type: 'createRoom', actor: host, moleculeId: mol, chatPolicy: 'immediate', name }).createdId!;
  return { get s() { return s; }, set s(v) { s = v; }, run, err, user, real, room, tick: (ms: number) => { t += ms; }, get now() { return t; } };
}
const notes = (s: State, uid: string) => s.notifications.filter((n) => n.userId === uid).map((n) => n.text);

describe('내 원소 빈자리 알림', () => {
  it('켠 사람에게만, 내 원소 자리가 있을 때만, 30분에 한 번', () => {
    const x = h(); const me = x.real('H', '수소'); const other = x.real('C', '탄소');
    x.run({ type: 'setVacancyAlert', actor: me, on: true }); x.run({ type: 'setVacancyAlert', actor: other, on: true });
    const o1 = x.user('O'); x.room(o1, 'h2o', '물 만들 사람');
    expect(notes(x.s, me).some((t) => t.includes('물 만들 사람'))).toBe(true);
    expect(notes(x.s, other).length).toBe(0); // 탄소 자리는 없음
    const o2 = x.user('O'); x.room(o2, 'h2o', '두번째');
    expect(notes(x.s, me).some((t) => t.includes('두번째'))).toBe(false); // 30분 안
    x.tick(VACANCY_ALERT_GAP_MS);
    const o3 = x.user('O'); x.room(o3, 'h2o', '세번째');
    expect(notes(x.s, me).some((t) => t.includes('세번째'))).toBe(true);
    x.run({ type: 'setVacancyAlert', actor: me, on: false }); x.tick(VACANCY_ALERT_GAP_MS);
    const o4 = x.user('O'); x.room(o4, 'h2o', '네번째');
    expect(notes(x.s, me).some((t) => t.includes('네번째'))).toBe(false);
  });
  it('이미 모집 중인 실험실이 있으면 알리지 않는다', () => {
    const x = h(); const me = x.real('H', '수소'); x.run({ type: 'setVacancyAlert', actor: me, on: true });
    x.room(me, 'h2', '내 방');
    const o = x.user('O'); x.room(o, 'h2o', '물 모임');
    expect(notes(x.s, me).some((t) => t.includes('물 모임'))).toBe(false);
  });
});

describe('모이기 10분 전 알림', () => {
  it('10분 안으로 들어오면 구성원 모두에게 한 번, 시각을 바꾸면 다시', () => {
    const x = h(); const a = x.user('H'), b = x.user('H');
    const r = x.room(a, 'h2', '점심'); x.run({ type: 'joinRoom', actor: b, roomId: r });
    x.run({ type: 'renameRoom', actor: a, roomId: r, name: '점심', meetAt: x.now + 30 * 60_000 });
    expect(remindMeetings(x.s, x.now).changed).toBe(false);
    x.tick(21 * 60_000);
    const r1 = remindMeetings(x.s, x.now); expect(r1.changed).toBe(true); x.s = r1.state;
    expect(notes(x.s, a).concat(notes(x.s, b)).filter((t) => t.includes('분 뒤예요')).length).toBe(2);
    expect(remindMeetings(x.s, x.now).changed).toBe(false);
    x.run({ type: 'renameRoom', actor: a, roomId: r, name: '점심', meetAt: x.now + 5 * 60_000 });
    expect(remindMeetings(x.s, x.now).changed).toBe(true);
  });
  it('예약 작업은 비밀값이 맞아야 하고, 알림을 저장한다', async () => {
    const x = h(); const a = x.user('H'), b = x.user('H');
    const r = x.room(a, 'h2', '점심'); x.run({ type: 'joinRoom', actor: b, roomId: r });
    x.run({ type: 'renameRoom', actor: a, roomId: r, name: '점심', meetAt: x.now + 5 * 60_000 });
    let store = { version: 1, state: x.s }; const now = x.now;
    const deps: Deps & { cronSecret?: string } = { getUser: async () => null, load: async () => store, save: async (v, n) => { if (v !== store.version) return false; store = { version: v + 1, state: n }; return true; }, bump: async () => {}, now: () => now, cronSecret: 'abc' };
    expect((await handleCron('wrong', deps)).status).toBe(401);
    expect((await handleCron('abc', deps)).body.changed).toBe(true);
    expect(store.state.rooms[r].remindedAt).toBe(now);
  });
});

describe('업적·칭호, 원소 분포, 메시지 신고', () => {
  it('얻은 칭호만 고를 수 있다', () => {
    const x = h(); const a = x.user('H'), b = x.user('H');
    expect(x.err({ type: 'setTitle', actor: a, title: 'first' })).toMatch(/아직/);
    const r = x.room(a, 'h2'); x.run({ type: 'joinRoom', actor: b, roomId: r });
    const m = x.run({ type: 'proposeMeeting', actor: a, roomId: r, attendeeIds: [a, b] }).createdId!;
    for (const u of [a, b]) x.run({ type: 'respondMeeting', actor: u, meetingId: m, response: 'confirm', loc: { lat: 37.611, lng: 126.9968, acc: 10 } } as Command);
    const rec = x.s.records.find((q) => q.userId === a)!;
    x.run({ type: 'claimCard', actor: a, recordId: rec.id });
    expect(earnedTitles(x.s, a)).toContain('first');
    x.run({ type: 'setTitle', actor: a, title: 'first' });
    expect(viewFor(x.s, b, null, x.now).profiles[a].title).toBe('first');
    expect(x.err({ type: 'setTitle', actor: a, title: 'all' })).toMatch(/아직/);
  });
  it('원소 분포는 원소를 확정한 사람만 센다', () => {
    const x = h(); x.user('H'); x.user('H'); x.user('O');
    x.run({ type: 'createUser', intro: 'x', consentVersion: TERMS_VERSION });
    const st = elementStats(x.s); expect(st.total).toBe(3); expect(st.counts.H).toBe(2);
    expect(viewFor(x.s, Object.keys(x.s.users)[0], null, x.now).stats?.total).toBe(3);
  });
  it('메시지 하나를 골라 신고하면 내용이 남고, 남의 메시지로 꾸밀 수 없다', () => {
    const x = h(); const a = x.user('H'), b = x.user('H'), c = x.user('O');
    const r = x.room(a, 'h2'); x.run({ type: 'joinRoom', actor: b, roomId: r });
    x.run({ type: 'sendMessage', actor: b, roomId: r, body: '나쁜 말' });
    const msg = x.s.messages.find((m) => m.body === '나쁜 말')!;
    expect(x.err({ type: 'report', actor: a, target: a === b ? c : c, reason: 'rude', detail: '', messageId: msg.id } as Command)).toMatch(/보낸 메시지가 아니에요/);
    expect(x.err({ type: 'report', actor: c, target: b, reason: 'rude', detail: '', messageId: msg.id } as Command)).toMatch(/내가 있던/);
    x.run({ type: 'report', actor: a, target: b, reason: 'rude', detail: '', messageId: msg.id } as Command);
    const rp = x.s.reports.at(-1)!; expect(rp.quote).toBe('나쁜 말'); expect(rp.roomId).toBe(r);
    expect(x.err({ type: 'report', actor: a, target: b, reason: 'rude', detail: '', messageId: msg.id } as Command)).toMatch(/이미 신고한 메시지/);
  });
});
