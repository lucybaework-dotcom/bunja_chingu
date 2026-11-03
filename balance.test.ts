import { describe, expect, it } from 'vitest';
import { balancePick, crowdedElements, crowdedNote, demandShare } from './balance';
import { handle, type Deps } from './handler';
import { emptyState } from './engine';
import type { ElementId } from './molecules';

const st = (counts: Partial<Record<ElementId, number>>) => ({ counts, total: Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) });

describe('원소 쏠림 맞추기', () => {
  it('수소는 자리가 많아 원래 많이 필요하다', () => {
    const d = demandShare(); expect(d.H).toBeGreaterThan(d.K);
  });
  it('사람이 적을 땐 건드리지 않는다', () => {
    expect(crowdedElements(st({ O: 8, H: 1 })).size).toBe(0);
    expect(balancePick(['O', 'N', 'H'], st({ O: 8, H: 1 })).swapped).toBe(false);
  });
  it('산소가 몰리면 비슷하고 덜 붐비는 원소를 추천, 점수 차가 크면 그대로', () => {
    const s = st({ O: 14, H: 6, C: 3, N: 2, Cl: 1 });
    expect(crowdedElements(s).has('O')).toBe(true);
    const r = balancePick(['O', 'N', 'H', 'C'], s, { O: 10, N: 8, H: 9, C: 2 });
    expect(r.swapped).toBe(true); expect(r.original).toBe('O'); expect(r.pick).not.toBe('O');
    expect(balancePick(['O', 'N', 'H'], s, { O: 10, N: 2, H: 3 }).swapped).toBe(false);
    expect(crowdedNote(s)).toContain('산소');
  });
  it('공개 숫자는 로그인 없이 원소별 인원만', async () => {
    const s = emptyState();
    s.users.a = { id: 'a', elementId: 'H', elementLockedAt: 1, nickname: '비밀' } as never;
    const deps: Deps = { getUser: async () => null, load: async () => ({ version: 1, state: s }), save: async () => true, bump: async () => {}, now: () => 0 };
    const r = await handle(null, { action: 'publicStats' }, deps);
    expect(r.status).toBe(200); expect(JSON.stringify(r.body)).not.toContain('비밀');
    expect((r.body.stats as { total: number }).total).toBe(1);
  });
});
