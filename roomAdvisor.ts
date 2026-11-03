// 새 실험실 열 때 벤 교수님이 원하는 모임에 맞는 분자를 추천한다. 서버(Gemini)와 시연판이 같은 검사 규칙을 쓴다.
import { ELEMENTS, pairContent } from './elements';
import { moleculeById, type ElementId } from './molecules';
import { moleculesWith } from './chemistry';
import { josaOf } from './josa';

export interface RoomPick { molecule: string; reason: string }
export interface RoomAdvice { reply: string; picks: RoomPick[]; roomName: string }

export const ROOM_REQ_MAX = 120;

export function roomSystemPrompt(el: ElementId): string {
  const me = ELEMENTS[el];
  const mols = moleculesWith(el).map((m) => {
    const others = (Object.keys(m.atomCounts) as ElementId[]).filter((e) => e !== el);
    const pairs = others.map((o) => pairContent(el, o)[0]?.title).filter(Boolean).join(', ');
    return `- ${m.id}: ${m.formula} ${m.name}, ${m.totalAtoms}명 (${Object.entries(m.atomCounts).map(([e, n]) => `${e}×${n}`).join(' ')})${pairs ? `, 궁합: ${pairs}` : ''}`;
  }).join('\n');
  return [
    '너는 대학생 친구 매칭 앱 "분자친구"의 캐릭터 "벤 교수님"(깜찍하고 다정한 유기화학 큐티 교수님)이야. 말투는 발랄한 해요체, 웃을 땐 "홍홍~". "~용" 같은 애교 어미와 반말은 쓰지 마.',
    `학생의 원소는 ${me.name}(${el})야. 성격 비유: ${me.personality}`,
    '학생이 원하는 모임을 말하면, 아래 분자 중 그 모임에 가장 잘 맞는 것을 1~3개 골라.',
    '고르는 기준: 모임 인원(분자의 인원 수), 모임 분위기, 학생 원소와 함께할 원소들의 궁합.',
    '',
    '[고를 수 있는 분자: id, 화학식, 이름, 인원, 구성, 궁합]',
    mols,
    '',
    '[출력] JSON 하나만:',
    '{"reply": "짧은 한마디(40자 이내, 예: 홍홍~ 산책하기 좋은 모임이에요!)", "roomName": "모임에 어울리는 실험실 이름(2~20자)", "picks": [{"molecule": "분자 id", "reason": "어떤 원소와 궁합이 좋아서 이 모임에 맞는지 귀여운 말투로 한 문장, 45자 이내"}]}',
    '- picks는 가장 잘 맞는 순서로. 목록에 없는 id는 쓰지 마. 이모지 금지. 건강·연애·정치 같은 민감한 모임은 무난한 모임으로 바꿔서 추천해.',
  ].join('\n');
}

/** 모델 답 검사: 내 원소가 들어가는 분자만, 최대 3개 */
export function cleanRoomAdvice(raw: unknown, el: ElementId): RoomAdvice {
  const o = (raw ?? {}) as { reply?: unknown; picks?: unknown; roomName?: unknown };
  const ok = new Set(moleculesWith(el).map((m) => m.id));
  const seen = new Set<string>(); const picks: RoomPick[] = [];
  if (Array.isArray(o.picks)) for (const p of o.picks as { molecule?: unknown; reason?: unknown }[]) {
    const id = typeof p?.molecule === 'string' ? p.molecule.trim() : '';
    if (!ok.has(id) || seen.has(id)) continue;
    seen.add(id); picks.push({ molecule: id, reason: typeof p.reason === 'string' ? p.reason.trim().slice(0, 80) : '' });
    if (picks.length === 3) break;
  }
  if (!picks.length) throw new Error('no picks');
  const name = typeof o.roomName === 'string' ? o.roomName.trim().slice(0, 30) : '';
  return { reply: typeof o.reply === 'string' ? o.reply.trim().slice(0, 80) : '', picks, roomName: name.length >= 2 ? name : '' };
}

/** 글에서 인원 수 짐작: "2명", "셋이서", "3~4명" */
export function guessSize(text: string): number[] {
  const m = /(\d)\s*[~\-]\s*(\d)\s*명/.exec(text);
  if (m) { const a = +m[1], b = +m[2]; return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i); }
  const n = /(\d)\s*명/.exec(text); if (n) return [+n[1]];
  const words: [RegExp, number][] = [[/둘|두 ?명|2인/, 2], [/셋|세 ?명|3인/, 3], [/넷|네 ?명|4인/, 4], [/다섯/, 5], [/여섯/, 6]];
  for (const [r, k] of words) if (r.test(text)) return [k];
  return [];
}

/** 시연판: AI 없이 인원과 궁합으로 고른다 */
export function demoRoomAdvice(el: ElementId, text: string): RoomAdvice {
  const sizes = guessSize(text);
  const score = (id: string) => {
    const m = moleculeById(id)!;
    const others = (Object.keys(m.atomCounts) as ElementId[]).filter((e) => e !== el);
    return others.filter((o) => pairContent(el, o).some((p) => p.kind === 'complement')).length * 2 + (m.kind === 'ionic' ? 0 : 1) - m.totalAtoms * 0.1;
  };
  let cands = moleculesWith(el).filter((m) => !sizes.length || sizes.includes(m.totalAtoms));
  if (!cands.length) cands = moleculesWith(el);
  const top = cands.sort((a, b) => score(b.id) - score(a.id)).slice(0, 3);
  const why = (id: string) => {
    const m = moleculeById(id)!;
    const o = (Object.keys(m.atomCounts) as ElementId[]).find((e) => e !== el);
    const p = o ? pairContent(el, o)[0] : undefined;
    return o && p ? `${ELEMENTS[o].name}${josaOf(ELEMENTS[o].name, '과/와')} '${p.title}' 궁합이라 잘 맞아요~` : `${m.totalAtoms}명이 모이기 딱 좋아요.`;
  };
  const name = text.replace(/\s+/g, ' ').trim().slice(0, 20);
  return { reply: '홍홍~ 이런 분자가 딱이에요!', picks: top.map((m) => ({ molecule: m.id, reason: why(m.id) })), roomName: name.length >= 2 ? name : '' };
}
