import { describe, expect, it } from 'vitest';
import { handle, type Deps } from './handler';
import type { State } from './types';

function fakeServer() {
  let row: { version: number; state: State } | null = null;
  let t = 1_000_000; let bumps = 0; let failNextSave = false;
  const users: Record<string, { id: string; email: string }> = {
    'tok-a': { id: 'A', email: 'a@x.com' }, 'tok-b': { id: 'B', email: 'b@x.com' }, 'tok-c': { id: 'C', email: 'c@x.com' },
  };
  const deps: Deps = {
    getUser: async (tk) => users[tk] ?? null,
    load: async () => (row ? structuredClone(row) : null),
    save: async (prev, next) => {
      if (failNextSave) { failNextSave = false; row = { version: (row?.version ?? 0) + 1, state: row?.state ?? next }; return false; }
      if ((row?.version ?? null) !== prev) return false;
      row = { version: (prev ?? 0) + 1, state: structuredClone(next) }; return true;
    },
    bump: async () => { bumps++; },
    now: () => (t += 1000),
  };
  const call = (tok: string | null, body: unknown) => handle(tok, body, deps);
  const d = async (tok: string, cmd: object) => (await call(tok, { action: 'dispatch', cmd })).body as any;
  return { call, d, get row() { return row; }, get bumps() { return bumps; }, failOnce: () => { failNextSave = true; }, advance: (ms: number) => { t += ms; } };
}

async function onboard(f: ReturnType<typeof fakeServer>, tok: string, el: string) {
  await f.d(tok, { type: 'createUser', intro: `${el} 친구` });
  await f.d(tok, { type: 'lockElement', elementId: el, acknowledged: true });
}

describe('서버 처리', () => {
  it('로그인 없이는 거절', async () => {
    const f = fakeServer();
    expect((await f.call(null, { action: 'view' })).status).toBe(401);
    expect((await f.call('bad', { action: 'view' })).status).toBe(401);
  });

  it('두 사용자가 같은 방에서 실제로 만나 카드를 받는다', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'H'); await onboard(f, 'tok-b', 'H');
    const r = await f.d('tok-a', { type: 'createRoom', moleculeId: 'h2', chatPolicy: 'immediate' });
    expect(r.ok).toBe(true);
    const bView = (await f.call('tok-b', { action: 'view' })).body.view as State;
    expect(Object.keys(bView.rooms)).toContain(r.createdId);
    expect(bView.messages.length).toBe(0); // 남의 방 채팅은 안 보임
    await f.d('tok-b', { type: 'joinRoom', roomId: r.createdId });
    await f.d('tok-b', { type: 'sendMessage', roomId: r.createdId, body: '안녕!' });
    const aView = (await f.call('tok-a', { action: 'view' })).body.view as State;
    expect(aView.messages.some((m) => m.body === '안녕!')).toBe(true);
    expect(aView.rooms[r.createdId].recruitment).toBe('complete');
    const m = await f.d('tok-a', { type: 'proposeMeeting', roomId: r.createdId, attendeeIds: ['A', 'B'] });
    await f.d('tok-a', { type: 'respondMeeting', meetingId: m.createdId, response: 'confirm' });
    const done = await f.d('tok-b', { type: 'respondMeeting', meetingId: m.createdId, response: 'confirm' });
    expect((done.view as State).cards.map((c) => c.userId)).toEqual(['B']); // 내 카드만 보임
    expect(f.row!.state.cards.length).toBe(2);
    expect(f.bumps).toBeGreaterThan(0);
  });

  it('남을 사칭할 수 없다: actor는 항상 로그인한 본인', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'H'); await onboard(f, 'tok-b', 'H');
    const r = await f.d('tok-a', { type: 'createRoom', moleculeId: 'h2', chatPolicy: 'immediate' });
    await f.d('tok-b', { type: 'joinRoom', roomId: r.createdId });
    const m = await f.d('tok-a', { type: 'proposeMeeting', roomId: r.createdId, attendeeIds: ['A', 'B'] });
    await f.d('tok-a', { type: 'respondMeeting', actor: 'B', meetingId: m.createdId, response: 'confirm' }); // B인 척
    const meeting = f.row!.state.meetings.find((x) => x.id === m.createdId)!;
    expect(meeting.confirmations).toEqual({ A: 'confirmed' });
    expect((await f.d('tok-b', { type: 'closeRoom', roomId: r.createdId })).ok).toBe(false); // 방장 아님
  });

  it('시연용 명령과 남의 계정 만들기는 막힌다', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'H');
    expect((await f.d('tok-a', { type: 'expireRecruitment', roomId: 'r1' })).ok).toBe(false);
    expect((await f.d('tok-a', { type: 'createUser', intro: 'x' })).ok).toBe(false); // 이미 있음
    await f.d('tok-c', { type: 'createUser', id: 'A', intro: '사칭', elementId: 'O' });
    expect(f.row!.state.users['C'].elementId).toBeNull(); // id·원소는 무시하고 본인 계정만
    expect(f.row!.state.users['A'].intro).toBe('H 친구');
  });

  it('저장 충돌이 나면 최신 상태로 다시 처리한다', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'H');
    f.failOnce();
    const r = await f.d('tok-a', { type: 'createRoom', moleculeId: 'h2', chatPolicy: 'immediate' });
    expect(r.ok).toBe(true);
    expect(Object.keys(f.row!.state.rooms)).toContain(r.createdId);
  });

  it('모집 기한이 지나면 서버가 알아서 마감 처리', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'H');
    const r = await f.d('tok-a', { type: 'createRoom', moleculeId: 'h2o', chatPolicy: 'immediate', recruitDays: 1 });
    f.advance(2 * 86_400_000);
    const v = (await f.call('tok-a', { action: 'view' })).body.view as State;
    expect(v.rooms[r.createdId].recruitment).toBe('failed');
  });

  it('대기열에서 남의 정체는 숨긴다', async () => {
    const f = fakeServer();
    await onboard(f, 'tok-a', 'N'); await onboard(f, 'tok-b', 'C');
    await f.d('tok-a', { type: 'startAutoMatch' });
    const v = (await f.call('tok-b', { action: 'view' })).body.view as State;
    expect(v.queue.map((q) => q.userId)).toEqual(['hidden']);
  });
});

import { RemoteBackend, type RemoteTransport } from './backend';
describe('화면 쪽 서버 연결', () => {
  it('두 브라우저가 같은 서버를 보고, 한쪽이 바꾸면 다른 쪽이 갱신된다', async () => {
    const f = fakeServer();
    const listeners: (() => void)[] = [];
    const transport = (tok: string): RemoteTransport => ({
      call: async (body) => { const r = await f.call(tok, body); if ((body as any).action === 'dispatch') listeners.forEach((l) => l()); return { status: r.status, json: r.body }; },
      onChange: (fn) => { listeners.push(fn); return () => {}; },
      signOut: async () => {},
    });
    const a = new RemoteBackend(transport('tok-a')), b = new RemoteBackend(transport('tok-b'));
    await a.start(); await b.start(); a.stop(); b.stop();
    expect(a.getState().meId).toBeNull();
    expect((await a.dispatch({ type: 'createUser', intro: '산소예요' } as any)).ok).toBe(true);
    expect(a.getState().meId).toBe('A');
    await a.dispatch({ type: 'lockElement', actor: 'whoever', elementId: 'O', acknowledged: true });
    const room = await a.dispatch({ type: 'createRoom', actor: 'A', moleculeId: 'h2o', chatPolicy: 'immediate' });
    await new Promise((r) => setTimeout(r, 10));
    expect(Object.keys(b.getState().rooms)).toContain(room.createdId);
    expect(b.getState().users.A.intro).toBe('산소예요');
    const bad = await b.dispatch({ type: 'joinRoom', actor: 'B', roomId: room.createdId! });
    expect(bad.ok).toBe(false); expect(bad.error).toMatch(/사용자를 찾을 수 없어요|원소를 먼저/);
  });
});
