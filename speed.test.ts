import { describe, expect, it } from 'vitest';
import { pruneNotifications } from './handler';
import { RemoteBackend, type RemoteTransport } from './backend';
import { emptyState } from './engine';
import type { State } from './types';

describe('속도 개선', () => {
  it('알림은 사람마다 최근 60개, 읽은 지 30일 넘은 건 정리', () => {
    const s = emptyState(); const now = 100 * 86_400_000;
    for (let i = 0; i < 70; i++) s.notifications.push({ id: `n${i}`, userId: 'A', text: `${i}`, createdAt: i, readAt: null });
    s.notifications.push({ id: 'old', userId: 'B', text: 'old', createdAt: 0, readAt: 1 });
    s.notifications.push({ id: 'new', userId: 'B', text: 'new', createdAt: now, readAt: now });
    const k = pruneNotifications(s, now)!;
    expect(k.filter((n) => n.userId === 'A').length).toBe(60);
    expect(k.find((n) => n.userId === 'A')!.id).toBe('n10'); // 오래된 것부터 지움, 순서 유지
    expect(k.some((n) => n.id === 'old')).toBe(false); expect(k.some((n) => n.id === 'new')).toBe(true);
    expect(pruneNotifications({ ...s, notifications: k }, now)).toBeNull();
  });
  it('지난 화면을 먼저 보여 주고, 동시에 여러 번 새로고침해도 서버엔 한 번만 묻는다', async () => {
    const mem: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    let calls = 0; let release: () => void = () => {};
    const view: State = { ...emptyState(), meId: 'U' };
    const t: RemoteTransport = {
      call: async () => { calls++; await new Promise<void>((r) => { release = r; }); return { status: 200, json: { view } }; },
      onChange: () => () => {}, signOut: async () => {},
    };
    const a = new RemoteBackend(t, () => null, 'U');
    expect(a.primeFromCache()).toBe(false);
    const p1 = a.refresh(), p2 = a.refresh(); release(); await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    const b = new RemoteBackend(t, () => null, 'U');
    expect(b.primeFromCache()).toBe(true); expect(b.getState().meId).toBe('U');
    await b.signOut(); expect(new RemoteBackend(t, () => null, 'U').primeFromCache()).toBe(false);
  });
});
