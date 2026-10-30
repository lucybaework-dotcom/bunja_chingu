// AI 원소 상담: 프롬프트, 응답 검사, 시연판용 대본 상담. 서버와 화면이 같이 쓴다.
import { ELEMENTS } from './elements';
import type { ElementId } from './molecules';
import { usableElements } from './chemistry';

export interface AiTurn { role: 'user' | 'ai'; text: string }
export interface AiPick { element: ElementId; reason: string }
export interface AiReply { reply: string; done: boolean; ranking: AiPick[] }

export const AI_LIMITS = { maxTurns: 20, maxChars: 300, perDay: 40, minAnswersToFinish: 3, forceFinishAfter: 7 };

export function systemPrompt(): string {
  const els = usableElements().map((e) => {
    const c = ELEMENTS[e];
    return `- ${e} (${c.name}): ${c.personality} 강점: ${c.strengths.join(', ')}. 어려운 점: ${c.difficulties.join(', ')}.`;
  }).join('\n');
  return [
    '너는 대학생 친구 매칭 앱 "분자친구"의 캐릭터 "벤 교수님"이야. 유기화학 연구실을 30년 넘게 지킨 다정하고 살짝 엉뚱한 노교수야. 흰 가운에 동그란 안경, 벤젠 고리처럼 뻗친 흰머리가 특징이고, 연구실 커피(카페인 분자)를 좋아해.',
    '학생과 짧게 상담하면서 사람을 만나고 어울리는 방식을 알아내고, 아래 원소 중 가장 잘 어울리는 원소 3개를 추천해.',
    '원소와 성격을 잇는 건 앱이 만든 재미있는 비유일 뿐 성격 진단이 아니야. 진단처럼 단정하지 마.',
    '',
    '[고를 수 있는 원소]',
    els,
    '',
    '[대화 규칙]',
    '- 말투: 학생을 아끼는 교수님처럼 다정한 해요체. "허허", "오호", "흥미롭군요" 같은 감탄을 가끔 섞고, 학생의 답을 결합·촉매·끓는점 같은 화학 비유로 한 마디 받아 준 뒤 다음 질문으로 넘어가. 반말이나 "자네"는 쓰지 마.',
    '- 짧게: 한 번에 2~3문장, 200자 이내. 이모지는 쓰지 마. 화학 지식 강의는 하지 마.',
    '- 첫 인사에서는 자기를 벤 교수님이라고 소개하고, 원소 하나를 찾는 짧은 상담이라고 알려 줘.',
    '- 한 번에 질문은 하나만. 모임에서의 역할, 처음 만난 사람과의 대화, 약속과 계획, 에너지를 채우는 방식, 친구에게 듣는 말 같은 일상적인 주제로 물어봐.',
    '- 건강, 종교, 정치, 연애, 가족사, 돈 같은 민감한 주제는 묻지 마. 학생이 꺼내도 깊이 들어가지 말고 부드럽게 원래 주제로 돌아와.',
    '- 학생의 답이 짧거나 애매하면 예시를 들어 다시 물어봐.',
    `- 학생의 답이 ${AI_LIMITS.minAnswersToFinish + 1}~5개 쌓이면 마무리해. 학생이 결과를 보고 싶다고 하면 답이 ${AI_LIMITS.minAnswersToFinish}개 이상일 때 바로 마무리해.`,
    '',
    '[출력 형식] 반드시 JSON 하나로만 답해.',
    '- 아직 질문 중이면: {"reply": "다음 질문", "done": false, "ranking": []}',
    '- 마무리할 때: {"reply": "교수님다운 짧은 마무리 한마디", "done": true, "ranking": [{"element": "원소 기호", "reason": "학생이 한 말을 근거로 1~2문장"}, ...]} 서로 다른 원소 정확히 3개, 가장 잘 맞는 순서로.',
  ].join('\n');
}

/** 모델이 준 값을 믿지 않고 검사한다 */
export function cleanReply(raw: unknown, userAnswers: number): AiReply {
  const o = (raw ?? {}) as { reply?: unknown; done?: unknown; ranking?: unknown };
  const reply = typeof o.reply === 'string' ? o.reply.trim().slice(0, 400) : '';
  const ok = usableElements() as string[];
  const seen = new Set<string>();
  const ranking: AiPick[] = [];
  if (Array.isArray(o.ranking)) for (const p of o.ranking as { element?: unknown; reason?: unknown }[]) {
    const e = typeof p?.element === 'string' ? p.element.trim() : '';
    if (!ok.includes(e) || seen.has(e)) continue;
    seen.add(e); ranking.push({ element: e as ElementId, reason: typeof p.reason === 'string' ? p.reason.trim().slice(0, 200) : '' });
    if (ranking.length === 3) break;
  }
  const done = o.done === true && ranking.length > 0 && userAnswers >= AI_LIMITS.minAnswersToFinish;
  if (!reply && !done) throw new Error('empty');
  return { reply: reply || '허허, 좋은 이야기였어요. 결과를 정리해 봤어요.', done, ranking: done ? ranking : [] };
}

/** 받은 대화 기록을 정리한다. 이상하면 null */
export function cleanHistory(h: unknown): AiTurn[] | null {
  if (!Array.isArray(h) || h.length > AI_LIMITS.maxTurns) return null;
  const out: AiTurn[] = [];
  for (const t of h as { role?: unknown; text?: unknown }[]) {
    if ((t?.role !== 'user' && t?.role !== 'ai') || typeof t.text !== 'string') return null;
    const text = t.text.trim().slice(0, t.role === 'user' ? AI_LIMITS.maxChars : 600);
    if (!text) return null;
    out.push({ role: t.role, text });
  }
  return out;
}

// ───── 시연판: 서버 없이 정해진 질문과 낱말로 추천 ─────
const DEMO_Q = [
  '어서 와요, 벤 교수예요. 허허, 커피 한 잔 하면서 학생한테 어울리는 원소를 같이 찾아봅시다. 처음 만난 사람들이 모인 자리에 가면 보통 어떻게 하는 편이에요?',
  '오호, 반응 속도가 보이는군요. 친구들과 약속을 잡을 때는 어떤 역할을 많이 해요? 먼저 계획을 짜는 편인지, 정해지면 따라가는 편인지 궁금해요.',
  '흥미롭군요. 그럼 지칠 때는 에너지를 어떻게 채워요? 사람을 만나서 충전하는 쪽인지, 혼자 조용히 식히는 쪽인지요.',
  '거의 다 왔어요. 친구들한테 "너는 이런 사람이야"라는 말을 들은 적 있다면 어떤 말이었어요?',
];
const WORDS: Record<'spark' | 'depth' | 'steady', string[]> = {
  spark: ['먼저', '말 걸', '활발', '신나', '재밌', '즉흥', '새로운', '사람 만나', '분위기', '웃', '시끄', '외향', '파티', '놀'],
  depth: ['조용', '혼자', '생각', '듣', '진지', '깊', '책', '관찰', '내향', '천천히', '공감', '고민'],
  steady: ['계획', '약속', '정리', '꾸준', '안정', '책임', '시간', '규칙', '챙기', '리더', '믿음', '든든'],
};
export function demoAdvisor(history: AiTurn[], finish: boolean): AiReply {
  const answers = history.filter((t) => t.role === 'user');
  if ((finish && answers.length >= AI_LIMITS.minAnswersToFinish) || answers.length >= DEMO_Q.length) {
    const text = answers.map((a) => a.text).join(' ');
    const v = { spark: 0.5, depth: 0.5, steady: 0.5 };
    for (const k of Object.keys(WORDS) as (keyof typeof WORDS)[]) for (const w of WORDS[k]) if (text.includes(w)) v[k] = Math.min(1, v[k] + 0.15);
    const d = (e: ElementId) => { const a = ELEMENTS[e].axes; return (a.spark - v.spark) ** 2 + (a.depth - v.depth) ** 2 + (a.steady - v.steady) ** 2; };
    const top = [...usableElements()].sort((a, b) => d(a) - d(b)).slice(0, 3);
    return { reply: '허허, 좋은 실험이었어요! 학생 이야기를 바탕으로 잘 맞을 원소 세 개를 골라 봤어요. (시연판의 교수님은 AI 대신 정해진 규칙으로 골라요)', done: true,
      ranking: top.map((e) => ({ element: e, reason: `${ELEMENTS[e].personality} 이야기해 준 모습과 잘 겹쳐 보여요.` })) };
  }
  return { reply: DEMO_Q[answers.length], done: false, ranking: [] };
}
