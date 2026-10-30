// Google Gemini 호출 (키는 Supabase 비밀값 GEMINI_API_KEY에만 둔다)
import { cleanReply, systemPrompt, type AiReply, type AiTurn } from './advisor';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    done: { type: 'BOOLEAN' },
    ranking: { type: 'ARRAY', items: { type: 'OBJECT', properties: { element: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['element', 'reason'] } },
  },
  required: ['reply', 'done', 'ranking'],
};

/** 기본 모델이 없어졌을 때를 대비해 차례로 시도한다 */
export const DEFAULT_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash'];

export async function askGemini(key: string, history: AiTurn[], finish: boolean, models: string[] = DEFAULT_MODELS, fetcher: typeof fetch = fetch): Promise<AiReply> {
  const contents = history.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] }));
  const answers = history.filter((t) => t.role === 'user').length;
  const nudge = finish ? '학생이 결과를 보고 싶어 해요. 지금 바로 마무리하고 원소 3개를 추천해 주세요.' : answers === 0 ? '대화를 시작해 주세요. 짧게 인사하고 첫 질문을 하나 해 주세요.' : '';
  if (nudge) contents.push({ role: 'user', parts: [{ text: `[앱 안내] ${nudge}` }] });
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.8, maxOutputTokens: 800 },
  });
  let last = '';
  for (const model of models) {
    const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body,
    });
    if (r.status === 404) { last = `${model} 404`; continue; }
    if (r.status === 429) throw Object.assign(new Error('busy'), { status: 429 });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return cleanReply(JSON.parse(text), answers);
  }
  throw new Error(`no model: ${last}`);
}
