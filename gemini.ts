// Google Gemini 호출 (키는 Supabase 비밀값 GEMINI_API_KEY에만 둔다)
// 빠르게: 생각(thinking)을 최소로 하고, 답을 조금씩 받아(스트리밍) 화면에 바로 흘려보낸다.
import { cleanReply, partialReply, systemPrompt, type AiReply, type AiTurn } from './advisor';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    done: { type: 'BOOLEAN' },
    ranking: { type: 'ARRAY', items: { type: 'OBJECT', properties: { element: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['element', 'reason'] } },
  },
  required: ['reply', 'done', 'ranking'],
  propertyOrdering: ['reply', 'done', 'ranking'],
};

/** 기본 모델이 없어졌을 때를 대비해 차례로 시도한다 */
export const DEFAULT_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash'];
let working: string | null = null; // 한 번 된 모델은 기억해서 다음엔 바로 쓴다

/** 모델마다 생각을 최소로 줄이는 설정 (기본값은 '많이 생각'이라 느리다) */
export function thinkingFor(model: string): Record<string, unknown> | null {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-(3|flash)/.test(model)) return { thinkingLevel: 'minimal' };
  return null;
}

export async function askGemini(key: string, history: AiTurn[], finish: boolean, models: string[] = DEFAULT_MODELS,
  fetcher: typeof fetch = fetch, onText?: (replySoFar: string) => void): Promise<AiReply> {
  const contents = history.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] }));
  const answers = history.filter((t) => t.role === 'user').length;
  const nudge = finish ? '학생이 결과를 보고 싶어 해요. 지금 바로 마무리하고 원소 3개를 추천해 주세요.' : answers === 0 ? '대화를 시작해 주세요. 짧게 인사하고 첫 질문을 하나 해 주세요.' : '';
  if (nudge) contents.push({ role: 'user', parts: [{ text: `[앱 안내] ${nudge}` }] });
  const order = working ? [working, ...models.filter((m) => m !== working)] : models;
  let last = '';
  for (const model of order) {
    for (const think of [thinkingFor(model), null]) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] }, contents,
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.8, maxOutputTokens: 800, ...(think ? { thinkingConfig: think } : {}) },
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${onText ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
      const r = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body });
      if (r.status === 404) { last = `${model} 404`; break; }
      if (r.status === 429) throw Object.assign(new Error('busy'), { status: 429 });
      if (r.status === 400 && think) { last = `${model} 400 thinking`; continue; } // 이 모델이 그 설정을 모르면 빼고 다시
      if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
      working = model;
      const text = onText ? await readSse(r, onText) : partsText(await r.json());
      return cleanReply(JSON.parse(text), answers);
    }
  }
  throw new Error(`no model: ${last}`);
}

type Chunk = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
const partsText = (j: Chunk) => j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';

/** SSE로 온 조각을 이어 붙이면서, 지금까지의 reply 글자를 알려 준다 */
async function readSse(r: Response, onText: (s: string) => void): Promise<string> {
  const reader = r.body!.getReader(); const dec = new TextDecoder();
  let buf = '', full = '', shown = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try { full += partsText(JSON.parse(line.slice(5))); } catch { continue; }
      const p = partialReply(full);
      if (p !== null && p !== shown) { shown = p; onText(p); }
    }
    if (done) break;
  }
  return full;
}
