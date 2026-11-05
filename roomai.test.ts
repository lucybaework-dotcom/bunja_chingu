import { describe, expect, it } from 'vitest';
import { handle, type Deps } from './handler';
import { askGeminiRoom } from './gemini';
import { cleanRoomAdvice, demoRoomAdvice, guessSize } from './roomAdvisor';
import { moleculeById } from './molecules';
import { TERMS_VERSION } from './engine';
import type { State } from './types';

describe('교수님 분자 추천', () => {
  it('내 원소가 없는 분자나 중복은 버린다', () => {
    const r = cleanRoomAdvice({ reply: 'ok', roomName: '점심 모임', picks: [{ molecule: 'nacl', reason: 'x' }, { molecule: 'h2o', reason: '산소와 궁합' }, { molecule: 'h2o', reason: 'dup' }, { molecule: 'zzz', reason: '' }] }, 'H');
    expect(r.picks.map((p) => p.molecule)).toEqual(['h2o']);
    expect(() => cleanRoomAdvice({ picks: [{ molecule: 'nacl' }] }, 'H')).toThrow();
  });
  it('인원 짐작과 시연판 추천', () => {
    expect(guessSize('점심 같이 먹을 2명')).toEqual([2]); expect(guessSize('3~4명 카페')).toEqual([3, 4]); expect(guessSize('셋이서 놀자')).toEqual([3]);
    const a = demoRoomAdvice('O', '카페에서 수다 떨 3명');
    expect(a.picks.length).toBeGreaterThan(0);
    for (const p of a.picks) { const m = moleculeById(p.molecule)!; expect(m.totalAtoms).toBe(3); expect(m.atomCounts.O).toBeGreaterThan(0); }
  });
  it('서버: 원소를 정한 사람만, 하루 횟수에 같이 센다', async () => {
    let row: { version: number; state: State } | null = null;
    const deps: Deps = {
      getUser: async () => ({ id: 'A', email: 'a@x.com' }), load: async () => (row ? structuredClone(row) : null),
      save: async (p, n) => { if ((row?.version ?? null) !== p) return false; row = { version: (p ?? 0) + 1, state: structuredClone(n) }; return true; },
      bump: async () => {}, now: () => Date.UTC(2026, 10, 2),
      aiRoom: async (el) => ({ reply: '좋아요', roomName: '점심', picks: [{ molecule: el === 'H' ? 'h2o' : 'o2', reason: 'r' }] }),
    };
    const d = (cmd: object) => handle('t', { action: 'dispatch', cmd }, deps);
    await d({ type: 'createUser', intro: '', consentVersion: TERMS_VERSION });
    expect((await handle('t', { action: 'aiRoom', request: '점심 2명' }, deps)).status).toBe(400);
    await d({ type: 'updateProfile', nickname: '테스터' }); await d({ type: 'lockElement', elementId: 'H', acknowledged: true });
    expect((await handle('t', { action: 'aiRoom', request: 'a' }, deps)).status).toBe(400);
    const r = await handle('t', { action: 'aiRoom', request: '점심 같이 먹을 2명' }, deps);
    expect(r.status).toBe(200); expect((r.body.room as { picks: { molecule: string }[] }).picks[0].molecule).toBe('h2o');
    expect(row!.state.aiUsage!.A.n).toBe(1);
  });
  it('Gemini 요청에 내 원소의 분자 목록이 들어간다', async () => {
    let sys = '';
    const fetcher = (async (_u: string, init: RequestInit) => {
      sys = JSON.parse(init.body as string).systemInstruction.parts[0].text;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: '허허', roomName: '수다방', picks: [{ molecule: 'co2', reason: '산소와 찰떡' }] }) }] } }] }));
    }) as typeof fetch;
    const r = await askGeminiRoom('K', 'C', '카페 3명', ['m'], fetcher);
    expect(sys).toContain('co2:'); expect(sys).not.toContain('nacl:');
    expect(r.picks[0].molecule).toBe('co2'); expect(r.roomName).toBe('수다방');
  });
  it('화학식·이름으로 답해도 알아듣고, AI가 실패하면 기본 추천으로', async () => {
    const r = cleanRoomAdvice({ picks: [{ molecule: 'H2O', reason: 'a' }, { molecule: '물', reason: 'dup' }, { molecule: 'H₂', reason: 'b' }] }, 'H');
    expect(r.picks.map((p) => p.molecule)).toEqual(['h2o', 'h2']);
    let row: { version: number; state: State } | null = null;
    const deps: Deps = {
      getUser: async () => ({ id: 'A', email: 'a@x.com' }), load: async () => (row ? structuredClone(row) : null),
      save: async (p, n) => { if ((row?.version ?? null) !== p) return false; row = { version: (p ?? 0) + 1, state: structuredClone(n) }; return true; },
      bump: async () => {}, now: () => Date.UTC(2026, 10, 2),
      aiRoom: async () => { throw new Error('gemini 500'); },
    };
    const d = (cmd: object) => handle('t', { action: 'dispatch', cmd }, deps);
    await d({ type: 'createUser', intro: '', consentVersion: TERMS_VERSION });
    await d({ type: 'updateProfile', nickname: '테스터' }); await d({ type: 'lockElement', elementId: 'O', acknowledged: true });
    const res = await handle('t', { action: 'aiRoom', request: '시험공부 같이 할 사람' }, deps);
    expect(res.status).toBe(200); expect((res.body.room as { picks: unknown[] }).picks.length).toBeGreaterThan(0);
  });
  it('잘린 답이면 한 번 더 묻는다', async () => {
    let n = 0;
    const fetcher = (async () => {
      n++;
      const text = n === 1 ? '{"reply":"홍홍~","picks":[{"molec' : JSON.stringify({ reply: 'ok', roomName: '공부방', picks: [{ molecule: 'co2', reason: 'r' }] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    }) as typeof fetch;
    const r = await askGeminiRoom('K', 'C', '공부', ['m'], fetcher);
    expect(n).toBe(2); expect(r.picks[0].molecule).toBe('co2');
  });
});
