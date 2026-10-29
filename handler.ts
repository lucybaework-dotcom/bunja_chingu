// 서버 규칙 실행기. 저장소·인증은 deps로 주입받아 로컬 테스트와 실제 Edge Function이 같은 코드를 쓴다.
import { apply, emptyState, normalize, remindMeetings, roomTitle, type Command } from './engine';
import { ADMIN_EMAILS } from './socialData';
import { DomainError, type PushSub, type State } from './types';
import { viewFor } from './view';

export interface Deps {
  getUser(token: string): Promise<{ id: string; email: string } | null>;
  load(): Promise<{ version: number; state: State } | null>;
  /** version이 그대로일 때만 저장. 성공하면 true */
  save(prevVersion: number | null, next: State): Promise<boolean>;
  bump(): Promise<void>;
  now(): number;
  /** 알림 보내기. HTTP 상태를 돌려준다 (없으면 알림을 보내지 않음) */
  sendPush?(sub: PushSub, data: PushData): Promise<number>;
  /** 탈퇴한 사람의 로그인 계정 지우기 */
  deleteAuthUser?(uid: string): Promise<void>;
}

export interface PushData { title: string; body: string; url: string; tag: string }

/** 저장 전후를 비교해 보낼 알림을 만든다: 새 알림 + 새 채팅 메시지 */
export function pushesFor(before: State, after: State, actor: string): { uid: string; data: PushData }[] {
  const out: { uid: string; data: PushData }[] = [];
  const old = new Set(before.notifications.map((n) => n.id));
  for (const n of after.notifications) if (!old.has(n.id) && after.pushSubs[n.userId]?.length)
    out.push({ uid: n.userId, data: { title: '분자친구', body: n.text, url: n.roomId ? `./#room-${n.roomId}` : './', tag: n.roomId ?? 'bunja' } });
  const oldMsg = new Set(before.messages.map((m) => m.id));
  for (const m of after.messages) {
    if (oldMsg.has(m.id) || !m.senderId) continue;
    const r = after.rooms[m.roomId]; if (!r) continue;
    const who = after.users[m.senderId]?.nickname ?? '누군가';
    for (const mem of after.members) if (mem.roomId === r.id && mem.leftAt === null && mem.userId !== m.senderId && mem.userId !== actor && after.pushSubs[mem.userId]?.length)
      out.push({ uid: mem.userId, data: { title: roomTitle(r), body: `${who}: ${m.body.slice(0, 80)}`, url: `./#room-${r.id}`, tag: `chat-${r.id}` } });
  }
  return out;
}

/** 학교 메일만 허용하려면 예: '@kookmin.ac.kr' (정책 미정 → 기본은 제한 없음) */
export const ALLOWED_EMAIL_SUFFIX = '';

const CLIENT_COMMANDS = new Set<Command['type']>([
  'createUser', 'recordQuiz', 'lockElement', 'updateIntro', 'createRoom', 'joinRoom', 'leaveRoom', 'startAutoMatch',
  'cancelAutoMatch', 'sendMessage', 'propose', 'vote', 'closeRoom', 'proposeMeeting', 'respondMeeting',
  'setCardVisibility', 'setRecordVisibility', 'resolveConflict', 'readNotifications',
  'renameRoom', 'claimCard', 'updateProfile', 'review', 'report', 'block', 'unblock', 'setSharing', 'setLocation',
  'adminResolveReport', 'adminSetSuspended', 'deleteAccount', 'setPlace', 'savePush', 'removePush', 'acceptTerms',
  'setVacancyAlert', 'setTitle',
]);

export interface Reply { status: number; body: Record<string, unknown> }

/** 클라이언트가 보낸 명령을 받아들일 수 있는 모양으로 고친다. 행동 주체는 항상 로그인한 본인. */
export function sanitize(raw: unknown, uid: string, s: State): Command {
  const c = raw as Record<string, unknown>;
  if (!c || typeof c.type !== 'string' || !CLIENT_COMMANDS.has(c.type as Command['type'])) throw new DomainError('허용되지 않는 요청이에요.');
  if (c.type === 'createUser') {
    if (s.users[uid]) throw new DomainError('이미 가입된 계정이에요.');
    return { type: 'createUser', id: uid, intro: String(c.intro ?? '').slice(0, 40), ...(typeof c.nickname === 'string' ? { nickname: c.nickname } : {}),
      ...(typeof c.consentVersion === 'string' ? { consentVersion: c.consentVersion } : {}) };
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
  const rem = remindMeetings(state, now);
  if (rem.changed) { state = rem.state; changed = true; }
  return { state, changed };
}

async function sendPushes(deps: Deps, before: State, after: State, actor: string) {
  const jobs = pushesFor(before, after, actor);
  const dead: { uid: string; endpoint: string }[] = [];
  await Promise.allSettled(jobs.flatMap((j) => (after.pushSubs[j.uid] ?? []).map(async (sub) => {
    const status = await deps.sendPush!(sub, j.data);
    if (status === 404 || status === 410) dead.push({ uid: j.uid, endpoint: sub.endpoint });
  })));
  if (!dead.length) return;
  // 사라진 구독은 한 번만 정리 시도 (실패해도 다음에 다시 정리된다)
  const cur = await deps.load(); if (!cur) return;
  let st = normalize(cur.state);
  for (const d of dead) st = apply(st, { type: 'removePush', actor: d.uid, endpoint: d.endpoint }, deps.now()).state;
  await deps.save(cur.version, st);
}

/** 1분마다 Supabase 예약 작업(pg_cron)이 부른다: 기한 처리와 10분 전 알림. 비밀값이 맞아야 한다 */
export async function handleCron(secret: unknown, deps: Deps & { cronSecret?: string }): Promise<Reply> {
  if (!deps.cronSecret || secret !== deps.cronSecret) return { status: 401, body: { error: 'unauthorized' } };
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await deps.load(); if (!loaded) return { status: 200, body: { ok: true, changed: false } };
    const base = normalize(loaded.state);
    const { state, changed } = sweep(base, deps.now());
    if (!changed) return { status: 200, body: { ok: true, changed: false } };
    if (!(await deps.save(loaded.version, state))) continue;
    await deps.bump();
    if (deps.sendPush) await sendPushes(deps, base, state, '');
    return { status: 200, body: { ok: true, changed: true } };
  }
  return { status: 409, body: { ok: false } };
}

export async function handle(token: string | null, body: unknown, deps: Deps): Promise<Reply> {
  if (!token) return { status: 401, body: { error: '로그인이 필요해요.' } };
  const user = await deps.getUser(token);
  if (!user) return { status: 401, body: { error: '로그인이 만료됐어요. 다시 로그인해 주세요.' } };
  if (ALLOWED_EMAIL_SUFFIX && !user.email.toLowerCase().endsWith(ALLOWED_EMAIL_SUFFIX)) return { status: 403, body: { error: '학교 메일로 가입한 계정만 쓸 수 있어요.' } };
  const b = (body ?? {}) as { action?: string; cmd?: unknown; here?: { lat?: unknown; lng?: unknown } };
  const here = b.here && typeof b.here.lat === 'number' && typeof b.here.lng === 'number' ? { lat: b.here.lat, lng: b.here.lng } : null;
  const isAdminEmail = ADMIN_EMAILS.includes(user.email.toLowerCase());

  for (let attempt = 0; attempt < 6; attempt++) {
    const loaded = await deps.load();
    const now = deps.now();
    const base = normalize(loaded?.state ?? emptyState());
    const swept = sweep(base, now);
    let next = swept.state, changed = swept.changed || !loaded;
    if (isAdminEmail && next.users[user.id] && !next.admins.includes(user.id)) { next = apply(next, { type: 'makeAdmin', userId: user.id }, now).state; changed = true; }
    let out: Record<string, unknown> = { ok: true };
    if (b.action === 'dispatch') {
      try {
        const cmd = sanitize(b.cmd, user.id, next);
        let r = apply(next, cmd, now);
        if (cmd.type === 'createUser' && isAdminEmail) r = { ...r, state: apply(r.state, { type: 'makeAdmin', userId: user.id }, now).state };
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
      if (out.info === 'deleted' && deps.deleteAuthUser) await deps.deleteAuthUser(user.id).catch(() => undefined);
      if (deps.sendPush) await sendPushes(deps, base, next, user.id);
    }
    return { status: 200, body: { ...out, view: viewFor(next, user.id, here, now) } };
  }
  return { status: 409, body: { error: '사람이 많이 몰려 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' } };
}
