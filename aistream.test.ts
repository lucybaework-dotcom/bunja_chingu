import { describe, expect, it } from 'vitest';
import { handle, type Deps } from './handler';
import { askGemini, thinkingFor } from './gemini';
import { partialReply, type AiReply } from './advisor';
import { TERMS_VERSION } from './engine';
import type { State } from './types';

const fin: AiReply = { reply: '허허, 좋아요!', done: true, ranking: [{ element: 'N', reason: '차분' }, { element: 'O', reason: '깊이' }, { element: 'C', reason: '계획' }] };

async function readAll(st: ReadableStream<Uint8Array>) {
  const r = st.getReader(); let s = ''; const d = new TextDecoder();
  for (;;) { const { value, done } = await r.read(); if (value) s += d.decode(value); if (done) break; }
  return s.trim().split('\n').map((l) => JSON.parse(l));
}

describe('교수님 답 흘려보내기', () => {
  it('글자가 조금씩 오고, 끝나면 추천이 저장된 보기가 온다', async () => {
    let row: { version: number; state: State } | null = null;
    const deps: Deps = {
      getUser: async () => ({ id: 'A', email: 'a@x.com' }), load: async () => (row ? structuredClone(row) : null),
      save: async (p, n) => { if ((row?.version ?? null) !== p) return false; row = { version: (p ?? 0) + 1, state: structuredClone(n) }; return true; },
      bump: async () => {}, now: () => Date.UTC(2026, 10, 2),
      ai: async (_h, _f, onText) => { onText?.('허허'); onText?.('허허, 좋아요!'); return fin; },
    };
    await handle('t', { action: 'dispatch', cmd: { type: 'createUser', intro: '', consentVersion: TERMS_VERSION } }, deps);
    const h = [{ role: 'ai', text: 'q' }, { role: 'user', text: 'a' }, { role: 'ai', text: 'q' }, { role: 'user', text: 'b' }, { role: 'ai', text: 'q' }, { role: 'user', text: 'c' }];
    const r = await handle('t', { action: 'ai', stream: true, history: h }, deps);
    expect(r.stream).toBeDefined();
    const lines = await readAll(r.stream!);
    expect(lines.filter((l) => l.t === 'delta').map((l) => l.text)).toEqual(['허허', '허허, 좋아요!']);
    const done = lines.at(-1); expect(done.t).toBe('done');
    expect(done.view.quizAttempts.at(-1).aiRanking).toEqual(['N', 'O', 'C']);
    expect(row!.state.aiUsage!.A.n).toBe(1);
  });
  it('미리 확인에서 걸리면 흘려보내지 않고 바로 오류', async () => {
    const deps: Deps = { getUser: async () => ({ id: 'A', email: 'a@x.com' }), load: async () => null, save: async () => true, bump: async () => {}, now: () => 0 };
    const r = await handle('t', { action: 'ai', stream: true, history: [] }, deps);
    expect(r.stream).toBeUndefined(); expect(r.status).toBe(503);
  });
});

describe('Gemini 빠르게', () => {
  it('생각 최소 설정을 보내고, 모르는 모델이면(400) 설정 없이 다시', async () => {
    const bodies: { thinkingConfig?: unknown }[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => {
      const g = JSON.parse(init.body as string).generationConfig; bodies.push(g);
      if (g.thinkingConfig) return new Response('bad', { status: 400 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: '안녕', done: false, ranking: [] }) }] } }] }));
    }) as typeof fetch;
    const r = await askGemini('K', [], false, ['gemini-3.1-flash-lite'], fetcher);
    expect(r.reply).toBe('안녕');
    expect(bodies[0].thinkingConfig).toEqual({ thinkingLevel: 'minimal' }); expect(bodies[1].thinkingConfig).toBeUndefined();
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
  });
  it('SSE 조각에서 reply 글자를 이어서 알려 준다', async () => {
    const full = JSON.stringify({ reply: '어서 와요, "벤" 교수예요.\n반가워요', done: false, ranking: [] });
    const parts = [full.slice(0, 15), full.slice(15, 30), full.slice(30)];
    const sse = parts.map((p) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: p }] } }] })}\n\n`).join('');
    const fetcher = (async (url: string) => { expect(url).toContain('streamGenerateContent?alt=sse'); return new Response(sse); }) as typeof fetch;
    const seen: string[] = [];
    const r = await askGemini('K', [], false, ['m'], fetcher, (t) => seen.push(t));
    expect(r.reply).toBe('어서 와요, "벤" 교수예요.\n반가워요');
    expect(seen.length).toBeGreaterThan(1); expect(seen.at(-1)).toBe(r.reply);
    expect(partialReply('{"reply": "a\\"b\\u00e9')).toBe('a"bé');
  });
});
