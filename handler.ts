// 서버 규칙 실행기. 저장소·인증은 deps로 주입받아 로컬 테스트와 실제 Edge Function이 같은 코드를 쓴다.
import { apply, emptyState, type Command } from './engine';
import { DomainError, type State } from './types';
import { viewFor } from './view';

export interface Deps {
  getUser(token: string): Promise<{ id: string; email: string } | null>;
  load(): Promise<{ version: number; state: State } | null>;
  /** version이 그대로일 때만 저장. 성공하면 true */
  save(prevVersion: number | null, next: State): Promise<boolean>;
  bump(): Promise<void>;
  now(): number;
}

/** 학교 메일만 허용하려면 예: '@kookmin.ac.kr' (정책 미정 → 기본은 제한 없음) */
export const ALLOWED_EMAIL_SUFFIX = '';

const CLIENT_COMMANDS = new Set<Command['type']>([
  'createUser', 'recordQuiz', 'lockElement', 'updateIntro', 'createRoom', 'joinRoom', 'leaveRoom', 'startAutoMatch',
  'cancelAutoMatch', 'sendMessage', 'propose', 'vote', 'closeRoom', 'proposeMeeting', 'respondMeeting',
  'setCardVisibility', 'setRecordVisibility', 'resolveConflict', 'readNotifications',
]);

export interface Reply { status: number; body: Record<string, unknown> }

/** 클라이언트가 보낸 명령을 받아들일 수 있는 모양으로 고친다. 행동 주체는 항상 로그인한 본인. */
export function sanitize(raw: unknown, uid: string, s: State): Command {
  const c = raw as Record<string, unknown>;
  if (!c || typeof c.type !== 'string' || !CLIENT_COMMANDS.has(c.type as Command['type'])) throw new DomainError('허용되지 않는 요청이에요.');
  if (c.type === 'createUser') {
    if (s.users[uid]) throw new DomainError('이미 가입된 계정이에요.');
    return { type: 'createUser', id: uid, intro: String(c.intro ?? '').slice(0, 40) };
  }
  return { ...(c as object), actor: uid } as Command;
}

/** 지난 모집 기한·투표 기한을 처리한다 (서버 시각 기준). */
export function sweep(s: State, now: number): { state: State; changed: boolean } {
  let state = s, changed = false;
  for (const p of state.proposals.filter((x) => x.status === 'open' && x.expiresAt <= now)) {
    try { state = apply(state, { type: 'expireProposal', proposalId: p.id }, now).state; changed = true; } catch { /* 이미 처리됨 */ }
  }
  for (const r of Object.values(state.rooms)) {
    const live = state.rooms[r.id];
    if (live.recruitment !== 'recruiting' || live.closedAt !== null || live.deadline > now) continue;
    if (state.proposals.some((p) => p.roomId === r.id && p.status === 'open')) continue;
    try { state = apply(state, { type: 'expireRecruitment', roomId: r.id }, now).state; changed = true; } catch { /* 무시 */ }
  }
  return { state, changed };
}

export async function handle(token: string | null, body: unknown, deps: Deps): Promise<Reply> {
  if (!token) return { status: 401, body: { error: '로그인이 필요해요.' } };
  const user = await deps.getUser(token);
  if (!user) return { status: 401, body: { error: '로그인이 만료됐어요. 다시 로그인해 주세요.' } };
  if (ALLOWED_EMAIL_SUFFIX && !user.email.toLowerCase().endsWith(ALLOWED_EMAIL_SUFFIX)) return { status: 403, body: { error: '학교 메일로 가입한 계정만 쓸 수 있어요.' } };
  const b = (body ?? {}) as { action?: string; cmd?: unknown };

  for (let attempt = 0; attempt < 6; attempt++) {
    const loaded = await deps.load();
    const now = deps.now();
    const base = loaded?.state ?? emptyState();
    const swept = sweep(base, now);
    let next = swept.state, changed = swept.changed || !loaded;
    let out: Record<string, unknown> = { ok: true };
    if (b.action === 'dispatch') {
      try {
        const cmd = sanitize(b.cmd, user.id, next);
        const r = apply(next, cmd, now);
        next = r.state; changed = true;
        out = { ok: true, createdId: r.createdId, info: r.info };
      } catch (e) {
        out = { ok: false, error: e instanceof DomainError ? e.message : '요청을 처리하지 못했어요. 다시 시도해 주세요.' };
      }
    } else if (b.action !== 'view') {
      return { status: 400, body: { error: '알 수 없는 요청이에요.' } };
    }
    if (changed) {
      const saved = await deps.save(loaded ? loaded.version : null, next);
      if (!saved) continue; // 다른 사람이 먼저 저장함 → 최신 상태로 다시 처리
      await deps.bump();
    }
    return { status: 200, body: { ...out, view: viewFor(next, user.id) } };
  }
  return { status: 409, body: { error: '사람이 많이 몰려 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' } };
}
