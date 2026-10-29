import { describe, expect, it } from 'vitest';
import { apply, emptyState, TERMS_VERSION, activeMembers, type Command } from './engine';
import { handle, pushesFor, type Deps } from './handler';
import type { State } from './types';
import type { ElementId } from './molecules';

function h() {
  let s: State = emptyState(); let t = 1_000_000;
  const run = (cmd: Command) => { const r = apply(s, cmd, (t += 1000)); s = r.state; return r; };
  const err = (cmd: Command) => { try { run(cmd); return null; } catch (e) { return (e as Error).message; } };
  const user = (el: ElementId, nickname?: string) => run({ type: 'createUser', intro: el, elementId: el, virtual: true, nickname }).createdId!;
  return { get s() { return s; }, run, err, user };
}

describe('약관 동의', () => {
  it('실제 사용자는 지금 약관에 동의해야 가입된다', () => {
    const x = h();
    expect(x.err({ type: 'createUser', intro: '안녕' })).toMatch(/동의/);
    expect(x.err({ type: 'createUser', intro: '안녕', consentVersion: 'old' })).toMatch(/동의/);
    const id = x.run({ type: 'createUser', intro: '안녕', consentVersion: TERMS_VERSION }).createdId!;
    expect(x.s.users[id].consentVersion).toBe(TERMS_VERSION);
    expect(x.err({ type: 'acceptTerms', actor: id, version: 'old' })).toMatch(/바뀌었/);
  });
});

describe('회원 탈퇴', () => {
  it('열린 실험실에서 나가고(방장은 넘김) 내 기록·닉네임을 지운다', () => {
    const x = h(); const me = x.user('O', '루시'), a = x.user('H'), b = x.user('H');
    const r = x.run({ type: 'createRoom', actor: me, moleculeId: 'h2o', chatPolicy: 'immediate', name: '점심' }).createdId!;
    x.run({ type: 'joinRoom', actor: a, roomId: r });
    x.run({ type: 'block', actor: me, target: b });
    expect(x.err({ type: 'deleteAccount', actor: me, confirm: '네' })).toMatch(/탈퇴/);
    const res = x.run({ type: 'deleteAccount', actor: me, confirm: '탈퇴' });
    expect(res.info).toBe('deleted');
    expect(activeMembers(x.s, r).map((m) => m.userId)).toEqual([a]);
    expect(x.s.rooms[r].hostId).toBe(a);
    expect(x.s.users[me].deletedAt).toBeTruthy();
    expect(x.s.users[me].nickname).toBeUndefined();
    expect(x.s.blocks).toEqual([]);
    expect(x.err({ type: 'createRoom', actor: me, moleculeId: 'h2', chatPolicy: 'immediate', name: '다시' })).toMatch(/탈퇴/);
    x.run({ type: 'updateProfile', actor: b, nickname: '루시' }); // 닉네임은 다른 사람이 쓸 수 있다
  });
});

describe('약속 장소', () => {
  it('방장만, 이름 2~30자, 학교에서 5km 안', () => {
    const x = h(); const o = x.user('O'), a = x.user('H');
    const r = x.run({ type: 'createRoom', actor: o, moleculeId: 'h2o', chatPolicy: 'immediate', name: '점심' }).createdId!;
    x.run({ type: 'joinRoom', actor: a, roomId: r });
    const P = { lat: 37.6105, lng: 126.997, label: '학생회관 1층' };
    expect(x.err({ type: 'setPlace', actor: a, roomId: r, place: P })).toMatch(/방장만/);
    expect(x.err({ type: 'setPlace', actor: o, roomId: r, place: { ...P, label: 'a' } })).toMatch(/2~30/);
    expect(x.err({ type: 'setPlace', actor: o, roomId: r, place: { lat: 35.1, lng: 129.0, label: '부산' } })).toMatch(/5km/);
    x.run({ type: 'setPlace', actor: o, roomId: r, place: P });
    expect(x.s.rooms[r].place).toEqual(P);
    expect(x.s.notifications.some((n) => n.userId === a && /약속 장소/.test(n.text))).toBe(true);
  });
});

describe('알림 보내기', () => {
  function fake() {
    let row: { version: number; state: State } | null = null;
    const sent: { endpoint: string; body: string }[] = []; const deleted: string[] = [];
    const users: Record<string, { id: string; email: string }> = { a: { id: 'A', email: 'a@x' }, b: { id: 'B', email: 'b@x' } };
    const deps: Deps = {
      getUser: async (t) => users[t] ?? null,
      load: async () => (row ? structuredClone(row) : null),
      save: async (prev, next) => { if ((row?.version ?? null) !== prev) return false; row = { version: (prev ?? 0) + 1, state: structuredClone(next) }; return true; },
      bump: async () => {}, now: () => 9_000_000,
      sendPush: async (sub, data) => { sent.push({ endpoint: sub.endpoint, body: data.body }); return sub.endpoint.includes('gone') ? 410 : 201; },
      deleteAuthUser: async (uid) => { deleted.push(uid); },
    };
    const d = async (t: string, cmd: object) => (await handle(t, { action: 'dispatch', cmd }, deps)).body as any;
    return { d, sent, deleted, get row() { return row; } };
  }
  async function pair(f: ReturnType<typeof fake>) {
    for (const [t, el, n] of [['a', 'O', '산소짱'], ['b', 'H', '수소짱']] as const) {
      await f.d(t, { type: 'createUser', intro: n, nickname: n, consentVersion: TERMS_VERSION });
      await f.d(t, { type: 'lockElement', elementId: el, acknowledged: true });
    }
    const room = (await f.d('a', { type: 'createRoom', moleculeId: 'h2o', chatPolicy: 'immediate', name: '점심 실험실' })).createdId;
    await f.d('b', { type: 'savePush', sub: { endpoint: 'https://push.example/b1', keys: { p256dh: 'x', auth: 'y' } } });
    await f.d('b', { type: 'savePush', sub: { endpoint: 'https://push.example/gone', keys: { p256dh: 'x', auth: 'y' } } });
    return room as string;
  }
  it('새 채팅과 알림이 구독한 다른 사람에게 가고, 사라진 구독은 정리된다', async () => {
    const f = fake(); const room = await pair(f);
    await f.d('b', { type: 'joinRoom', roomId: room });
    f.sent.length = 0;
    await f.d('a', { type: 'sendMessage', roomId: room, body: '학생회관에서 봬요' });
    expect(f.sent.map((x) => x.body)).toContain('산소짱: 학생회관에서 봬요');
    expect(f.row!.state.pushSubs.B.map((x) => x.endpoint)).toEqual(['https://push.example/b1']);
  });
  it('보낸 사람 자신에게는 채팅 알림을 보내지 않는다', () => {
    const s0 = emptyState();
    const s1: State = { ...s0, users: { A: { nickname: 'a' } as any }, rooms: { r: { id: 'r', name: 'x' } as any }, members: [{ roomId: 'r', userId: 'A', leftAt: null } as any],
      messages: [{ id: 'm', roomId: 'r', senderId: 'A', body: 'hi', createdAt: 1 }], pushSubs: { A: [{ endpoint: 'e', keys: { p256dh: '', auth: '' }, at: 1 }] } };
    expect(pushesFor(s0, s1, 'A')).toEqual([]);
  });
  it('탈퇴하면 로그인 계정도 지운다', async () => {
    const f = fake(); await pair(f);
    const r = await f.d('a', { type: 'deleteAccount', confirm: '탈퇴' });
    expect(r.ok).toBe(true); expect(f.deleted).toEqual(['A']);
  });
});
