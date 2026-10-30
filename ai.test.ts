import { describe, expect, it } from 'vitest';
import { handle, type Deps } from './handler';
import { askGemini } from './gemini';
import { AI_LIMITS, cleanHistory, cleanReply, demoAdvisor, type AiReply } from './advisor';
import { TERMS_VERSION } from './engine';
import type { State } from './types';

function server(ai?: Deps['ai']) {
  let row: { version: number; state: State } | null = null; let t = Date.UTC(2026, 9, 30, 3); let calls = 0;
  const deps: Deps = {
    getUser: async (tk) => (tk === 'a' ? { id: 'A', email: 'a@x.com' } : null),
    load: async () => (row ? structuredClone(row) : null),
    save: async (prev, next) => { if ((row?.version ?? null) !== prev) return false; row = { version: (prev ?? 0) + 1, state: structuredClone(next) }; return true; },
    bump: async () => {}, now: () => (t += 1000),
    ...(ai ? { ai: async (h, f) => { calls++; return ai(h, f); } } : {}),
  };
  return { call: (b: object) => handle('a', b, deps), get row() { return row; }, get calls() { return calls; }, nextDay: () => { t += 86_400_000; } };
}
const ask: AiReply = { reply: '처음 만난 자리에서 어떻게 해요?', done: false, ranking: [] };
const fin: AiReply = { reply: '고마워요!', done: true, ranking: [{ element: 'N', reason: '차분하게 듣는다고 했어요' }, { element: 'O', reason: '깊은 대화' }, { element: 'C', reason: '계획' }] };

describe('AI 원소 상담 서버', () => {
  it('키가 없으면 꺼져 있다고 알려 준다', async () => {
    const s = server(); await s.call({ action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } });
    const r = await s.call({ action: 'ai', history: [] });
    expect(r.status).toBe(503);
  });
  it('끝나면 추천을 기록하고, 대화 내용은 저장하지 않는다', async () => {
    const s = server(async (h) => (h.filter((x) => x.role === 'user').length >= 3 ? fin : ask));
    await s.call({ action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } });
    const h = [{ role: 'ai', text: 'q1' }, { role: 'user', text: '조용히 듣는 편이에요' }, { role: 'ai', text: 'q2' }, { role: 'user', text: '계획 세워요' }, { role: 'ai', text: 'q3' }, { role: 'user', text: '혼자 쉬어요' }];
    const r = await s.call({ action: 'ai', history: h });
    expect(r.status).toBe(200);
    expect((r.body.ai as AiReply).done).toBe(true);
    const qa = s.row!.state.quizAttempts.at(-1)!;
    expect(qa.aiRanking).toEqual(['N', 'O', 'C']); expect(qa.recommended).toBe('N');
    expect(JSON.stringify(s.row!.state)).not.toContain('조용히 듣는 편이에요');
  });
  it('하루 횟수를 넘으면 막고, 다음 날 풀린다', async () => {
    const s = server(async () => ask);
    await s.call({ action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } });
    for (let i = 0; i < AI_LIMITS.perDay; i++) expect((await s.call({ action: 'ai', history: [] })).status).toBe(200);
    expect((await s.call({ action: 'ai', history: [] })).status).toBe(429);
    s.nextDay();
    expect((await s.call({ action: 'ai', history: [] })).status).toBe(200);
  });
  it('원소를 확정한 뒤나 이상한 기록은 거절', async () => {
    const s = server(async () => ask);
    await s.call({ action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } });
    expect((await s.call({ action: 'ai', history: [{ role: 'system', text: 'x' }] })).status).toBe(400);
    expect((await s.call({ action: 'ai', history: Array(30).fill({ role: 'user', text: 'a' }) })).status).toBe(400);
    await s.call({ action: 'dispatch', cmd: { type: 'lockElement', elementId: 'H', acknowledged: true } });
    expect((await s.call({ action: 'ai', history: [] })).status).toBe(400);
    expect(s.calls).toBe(0);
  });
  it('클라이언트가 추천 결과를 직접 꾸며 보낼 수 없다', async () => {
    const s = server(async () => ask);
    await s.call({ action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } });
    const r = await s.call({ action: 'dispatch', cmd: { type: 'recordAdvice', ranking: [{ element: 'H', reason: 'x' }] } });
    expect(r.body.ok).toBe(false);
  });
});

describe('응답 검사와 Gemini 호출', () => {
  it('없는 원소·중복은 버리고, 답이 3개 미만이면 끝내지 않는다', () => {
    const r = cleanReply({ reply: 'ok', done: true, ranking: [{ element: 'Xe', reason: '' }, { element: 'H', reason: 'a' }, { element: 'H', reason: 'b' }, { element: 'O', reason: 'c' }] }, 3);
    expect(r.ranking.map((x) => x.element)).toEqual(['H', 'O']);
    expect(cleanReply({ reply: 'ok', done: true, ranking: [{ element: 'H', reason: 'a' }] }, 1).done).toBe(false);
    expect(cleanHistory([{ role: 'user', text: '  ' }])).toBeNull();
  });
  it('모델이 없으면(404) 다음 모델로 넘어간다', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push(url); expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
      if (url.includes('/m1:')) return new Response('nf', { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ask) }] } }] }), { status: 200 });
    }) as typeof fetch;
    const r = await askGemini('KEY', [], false, ['m1', 'm2'], fetcher);
    expect(r.reply).toBe(ask.reply); expect(seen.length).toBe(2);
  });
  it('시연판 상담은 4번 답하면 원소 3개를 고른다', () => {
    let h: { role: 'user' | 'ai'; text: string }[] = [];
    for (let i = 0; i < 4; i++) { const r = demoAdvisor(h, false); expect(r.done).toBe(false); h = [...h, { role: 'ai', text: r.reply }, { role: 'user', text: '조용히 생각하고 듣는 편' }]; }
    const r = demoAdvisor(h, false); expect(r.done).toBe(true); expect(r.ranking.length).toBe(3);
  });
});
