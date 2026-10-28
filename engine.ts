import { j } from './josa';
// 상태 전이 규칙 (순수 함수). 실제 서비스에서는 같은 규칙을 서버에서 원자적으로 실행해야 한다.
import { ELEMENTS } from './elements';
import { moleculeById, USABLE, type ElementId } from './molecules';
import { QUESTIONS, QUIZ_VERSION, scoreQuiz } from './quiz';
import { contains, countsOf, exactMatches, hasVacancy, sameCounts, supersetCandidates, usableElements } from './chemistry';
import { complementScore, matchReason, RECOMMEND_CONFIG } from './recommend';
import { DomainError, type ChatPolicy, type Id, type Proposal, type Room, type State, type Visibility } from './types';

export type Command =
  | { type: 'createUser'; id?: Id; intro: string; virtual?: boolean; demoLabel?: string; elementId?: ElementId; makeMe?: boolean }
  | { type: 'recordQuiz'; actor: Id; answers: Record<string, number> }
  | { type: 'lockElement'; actor: Id; elementId: ElementId; acknowledged: boolean }
  | { type: 'updateIntro'; actor: Id; intro: string }
  | { type: 'createRoom'; actor: Id; moleculeId: string; chatPolicy: ChatPolicy; recruitDays?: number }
  | { type: 'joinRoom'; actor: Id; roomId: Id }
  | { type: 'leaveRoom'; actor: Id; roomId: Id }
  | { type: 'startAutoMatch'; actor: Id }
  | { type: 'cancelAutoMatch'; actor: Id }
  | { type: 'sendMessage'; actor: Id; roomId: Id; body: string }
  | { type: 'propose'; actor: Id; roomId: Id; kind: 'earlyComplete' | 'retarget'; moleculeId: string }
  | { type: 'vote'; actor: Id; proposalId: Id; choice: 'yes' | 'no' }
  | { type: 'expireRecruitment'; roomId: Id }
  | { type: 'expireProposal'; proposalId: Id }
  | { type: 'closeRoom'; actor: Id; roomId: Id }
  | { type: 'proposeMeeting'; actor: Id; roomId: Id; attendeeIds: Id[] }
  | { type: 'respondMeeting'; actor: Id; meetingId: Id; response: 'confirm' | 'reject' }
  | { type: 'setCardVisibility'; actor: Id; moleculeId: string; visibility: Visibility }
  | { type: 'setRecordVisibility'; actor: Id; recordId: Id; visibility: Visibility }
  | { type: 'resolveConflict'; actor: Id; keepRoomId: Id }
  | { type: 'readNotifications'; actor: Id };

export const INTRO_MAX = 40;
const DAY = 86_400_000, HOUR = 3_600_000;

export function emptyState(): State {
  return {
    version: 1, seq: 1, meId: null, users: {}, rooms: {}, members: [], queue: [], proposals: [], messages: [],
    meetings: [], cards: [], records: [], notifications: [], quizAttempts: [],
    config: { defaultRecruitDays: 3, proposalHours: 24 },
  };
}

// ───────── 조회 헬퍼 ─────────
export const activeMembers = (s: State, roomId: Id) => s.members.filter((m) => m.roomId === roomId && m.leftAt === null);
export const isMember = (s: State, roomId: Id, uid: Id) => activeMembers(s, roomId).some((m) => m.userId === uid);
export const roomCounts = (s: State, roomId: Id) => countsOf(activeMembers(s, roomId).map((m) => m.elementSnapshot));
export const openProposal = (s: State, roomId: Id) => s.proposals.find((p) => p.roomId === roomId && p.status === 'open');
export const pendingMeeting = (s: State, roomId: Id) => s.meetings.find((m) => m.roomId === roomId && m.status === 'pending');
export const waitingEntry = (s: State, uid: Id) => s.queue.find((q) => q.userId === uid && q.status === 'waiting');

export function isRecruitingOpen(r: Room) { return r.recruitment === 'recruiting' && r.closedAt === null; }

/** 사용자가 점유 중인 모집 자리 (모집 중인 실험실 + 자동 매칭 대기). */
export function recruitingCommitments(s: State, uid: Id): { rooms: Id[]; queued: boolean } {
  const rooms = s.members.filter((m) => m.userId === uid && m.leftAt === null && isRecruitingOpen(s.rooms[m.roomId])).map((m) => m.roomId);
  return { rooms, queued: !!waitingEntry(s, uid) };
}

export function hasConflict(s: State, uid: Id) {
  const c = recruitingCommitments(s, uid);
  return c.rooms.length + (c.queued ? 1 : 0) > 1;
}

export function canChat(s: State, roomId: Id, uid: Id): boolean {
  const r = s.rooms[roomId];
  if (!r || r.closedAt !== null || !isMember(s, roomId, uid)) return false;
  if (r.origin === 'automatic' || r.chatPolicy === 'immediate') return true;
  return r.recruitment === 'complete' || r.firstMeetingConfirmedAt !== null;
}

export function joinableRoomsFor(s: State, uid: Id): Room[] {
  const u = s.users[uid];
  if (!u?.elementId) return [];
  return Object.values(s.rooms).filter((r) => isRecruitingOpen(r) && !isMember(s, r.id, uid)
    && hasVacancy(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, r.id), u.elementId!));
}

// ───────── 내부 변경 헬퍼 (draft를 직접 수정) ─────────
function nid(s: State, p: string) { return `${p}${s.seq++}`; }
function fail(msg: string): never { throw new DomainError(msg); }
function lockedUser(s: State, uid: Id) {
  const u = s.users[uid] ?? fail('사용자를 찾을 수 없어요.');
  if (!u.elementId || !u.elementLockedAt) fail('원소를 먼저 확정해 주세요.');
  return u as typeof u & { elementId: ElementId };
}
function room(s: State, id: Id) { return s.rooms[id] ?? fail('실험실을 찾을 수 없어요.'); }
function notify(s: State, uid: Id, text: string, roomId: Id | undefined, now: number) {
  s.notifications.push({ id: nid(s, 'n'), userId: uid, text, roomId, createdAt: now, readAt: null });
}
function notifyRoom(s: State, roomId: Id, text: string, now: number, except?: Id) {
  for (const m of activeMembers(s, roomId)) if (m.userId !== except) notify(s, m.userId, text, roomId, now);
}
function sys(s: State, roomId: Id, body: string, now: number) {
  s.messages.push({ id: nid(s, 'm'), roomId, senderId: null, body, createdAt: now });
}
function assertFree(s: State, uid: Id) {
  const c = recruitingCommitments(s, uid);
  if (c.queued) fail('자동 매칭 대기 중이에요. 대기를 취소한 뒤 다시 시도해 주세요.');
  if (c.rooms.length) fail('모집 중인 실험실은 한 곳만 참여할 수 있어요.');
}
function voidOpenProposals(s: State, roomId: Id, now: number) {
  for (const p of s.proposals) if (p.roomId === roomId && p.status === 'open') {
    p.status = 'void';
    sys(s, roomId, '구성원이 바뀌어 진행 중이던 투표가 취소됐어요. 필요하면 다시 제안해 주세요.', now);
  }
}
const molName = (id: string) => { const m = moleculeById(id)!; return `${m.name}(${m.formula})`; };

function addMember(s: State, roomId: Id, uid: Id, via: 'create' | 'join' | 'auto', now: number) {
  const r = room(s, roomId), u = lockedUser(s, uid);
  if (!isRecruitingOpen(r)) fail('지금은 모집 중인 실험실이 아니에요.');
  if (isMember(s, roomId, uid)) fail('이미 이 실험실에 있어요.');
  const target = moleculeById(r.targetMoleculeId)!.atomCounts;
  if (!hasVacancy(target, roomCounts(s, roomId), u.elementId)) fail(`이 실험실에는 ${ELEMENTS[u.elementId].name} 자리가 남아 있지 않아요.`);
  const others = activeMembers(s, roomId).map((m) => m.elementSnapshot);
  s.members.push({ roomId, userId: uid, elementSnapshot: u.elementId, introSnapshot: u.intro, joinedAt: now, leftAt: null, via,
    reason: via === 'auto' && others.length ? matchReason(u.elementId, others) : undefined });
  voidOpenProposals(s, roomId, now);
  if (via !== 'create') {
    sys(s, roomId, `${j(`${ELEMENTS[u.elementId].name}(${u.elementId})`, '이/가')} 합류했어요.`, now);
    if (canChat(s, roomId, uid)) notifyRoom(s, roomId, `${molName(r.targetMoleculeId)} 실험실에 ${j(ELEMENTS[u.elementId].name, '이/가')} 합류했어요.`, now, uid);
  }
  checkComplete(s, roomId, now);
}

function checkComplete(s: State, roomId: Id, now: number) {
  const r = s.rooms[roomId];
  if (r.recruitment !== 'recruiting') return;
  if (sameCounts(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, roomId))) {
    r.recruitment = 'complete'; r.completedAt = now;
    voidOpenProposals(s, roomId, now);
    sys(s, roomId, `${j(molName(r.targetMoleculeId), '이/가')} 완성됐어요. 채팅에서 첫 만남 날짜와 장소를 정해 보세요.`, now);
    notifyRoom(s, roomId, `${molName(r.targetMoleculeId)} 분자가 완성됐어요.`, now);
  }
}

function createRoomInternal(s: State, hostId: Id, moleculeId: string, chatPolicy: ChatPolicy, origin: 'manual' | 'automatic', now: number, days: number): Id {
  const m = moleculeById(moleculeId);
  if (!m || !USABLE().includes(m)) fail('사용할 수 없는 분자예요.');
  const id = nid(s, 'r');
  s.rooms[id] = { id, targetMoleculeId: moleculeId, originalMoleculeId: moleculeId, hostId, origin,
    chatPolicy: origin === 'automatic' ? 'immediate' : chatPolicy, recruitment: 'recruiting', createdAt: now, completedAt: null,
    deadline: now + days * DAY, firstMeetingConfirmedAt: null, firstMeetingMoleculeId: null, closedAt: null, closeReason: null };
  return id;
}

function openProposalInternal(s: State, roomId: Id, type: Proposal['type'], reason: Proposal['reason'], moleculeId: string, by: Id | null, now: number) {
  voidOpenProposals(s, roomId, now);
  const electorate = activeMembers(s, roomId).map((m) => m.userId);
  const p: Proposal = { id: nid(s, 'p'), roomId, type, reason, targetMoleculeId: moleculeId, proposedBy: by, electorate,
    votes: {}, status: 'open', createdAt: now, expiresAt: now + s.config.proposalHours * HOUR };
  s.proposals.push(p);
  const text = type === 'earlyComplete' ? `반응을 종결시키겠습니까? 지금 구성으로 ${j(molName(moleculeId), '을/를')} 확정하는 투표가 열렸어요.`
    : `목표를 ${j(molName(moleculeId), '으로/로')} 바꾸는 투표가 열렸어요.`;
  sys(s, roomId, text, now);
  notifyRoom(s, roomId, text, now);
  return p;
}

function rejectProposal(s: State, p: Proposal, status: 'rejected' | 'expired', now: number) {
  p.status = status;
  const r = s.rooms[p.roomId];
  if (p.reason === 'deadline') {
    r.recruitment = 'failed'; r.closedAt = now; r.closeReason = 'deadline';
    sys(s, r.id, '모집 기한이 지나고 전원 동의를 얻지 못해 실험실이 종료됐어요.', now);
    notifyRoom(s, r.id, `${molName(r.targetMoleculeId)} 실험실이 모집 마감으로 종료됐어요.`, now);
  } else {
    sys(s, r.id, status === 'expired' ? '응답 기한이 지나 제안이 무산됐어요.' : '전원 동의를 얻지 못해 제안이 무산됐어요.', now);
  }
}

function finalizeMeetingIfReady(s: State, meetingId: Id, now: number) {
  const mt = s.meetings.find((m) => m.id === meetingId)!;
  if (mt.status !== 'pending' || !mt.attendees.every((a) => mt.confirmations[a.userId] === 'confirmed')) return;
  mt.status = 'confirmed'; mt.confirmedAt = now;
  const r = s.rooms[mt.roomId];
  if (r.firstMeetingConfirmedAt === null) { r.firstMeetingConfirmedAt = now; r.firstMeetingMoleculeId = mt.matchedMoleculeId; }
  for (const a of mt.attendees) {
    if (!s.records.some((x) => x.userId === a.userId && x.meetingId === mt.id)) {
      s.records.push({ id: nid(s, 'rec'), userId: a.userId, meetingId: mt.id, roomId: r.id, moleculeId: mt.matchedMoleculeId,
        targetMoleculeId: r.targetMoleculeId, companions: mt.attendees.filter((o) => o.userId !== a.userId).map((o) => ({ element: o.element, intro: o.intro })),
        visibility: 'private', createdAt: now });
    }
    if (mt.matchedMoleculeId && !s.cards.some((c) => c.userId === a.userId && c.moleculeId === mt.matchedMoleculeId)) {
      s.cards.push({ userId: a.userId, moleculeId: mt.matchedMoleculeId, visibility: 'private', firstEarnedAt: now });
    }
  }
  const text = mt.matchedMoleculeId ? `첫 만남이 확인됐어요. 참석자 모두 ${molName(mt.matchedMoleculeId)} 카드를 얻었어요.`
    : '첫 만남이 확인됐어요. 참석 구성이 유효한 분자가 아니어서 카드 없이 만남 기록만 남았어요.';
  sys(s, r.id, text, now);
  sys(s, r.id, '연락처는 실제로 만난 친구끼리 직접 주고받아 주세요. 앱 안에는 개인 채팅이 없어요.', now);
  for (const a of mt.attendees) notify(s, a.userId, text, r.id, now);
}

// ───────── 자동 매칭 ─────────
function bestRoomFor(s: State, uid: Id): Room | undefined {
  const el = s.users[uid].elementId!;
  return joinableRoomsFor(s, uid)
    .map((r) => {
      const group = [...activeMembers(s, r.id).map((m) => m.elementSnapshot), el];
      return { r, score: complementScore(group) + RECOMMEND_CONFIG.fillWeight * (group.length / moleculeById(r.targetMoleculeId)!.totalAtoms) };
    })
    .sort((a, b) => b.score - a.score || a.r.createdAt - b.r.createdAt)[0]?.r;
}

/** 대기자들로 만들 수 있는 유효 분자 조합을 찾는다. 유효성이 우선, 그다음 가장 오래 기다린 사람 포함, 그다음 보완 점수. */
export function findQueueGroup(s: State): { moleculeId: string; userIds: Id[] } | null {
  const waiting = s.queue.filter((q) => q.status === 'waiting').sort((a, b) => a.enteredAt - b.enteredAt);
  if (waiting.length < 2) return null;
  const cands: { moleculeId: string; userIds: Id[]; oldest: boolean; score: number; age: number }[] = [];
  for (const m of USABLE()) {
    const picked: Id[] = [];
    let ok = true;
    for (const [el, n] of Object.entries(m.atomCounts) as [ElementId, number][]) {
      const pool = waiting.filter((q) => s.users[q.userId].elementId === el).slice(0, n);
      if (pool.length < n) { ok = false; break; }
      picked.push(...pool.map((q) => q.userId));
    }
    if (!ok) continue;
    const els = picked.map((id) => s.users[id].elementId!);
    cands.push({ moleculeId: m.id, userIds: picked, oldest: picked.includes(waiting[0].userId), score: complementScore(els),
      age: picked.reduce((t, id) => t + waiting.findIndex((q) => q.userId === id), 0) / picked.length });
  }
  cands.sort((a, b) => Number(b.oldest) - Number(a.oldest) || b.score - a.score || a.age - b.age);
  return cands[0] ?? null;
}

function drainQueue(s: State, now: number) {
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const q of s.queue.filter((x) => x.status === 'waiting').sort((a, b) => a.enteredAt - b.enteredAt)) {
      const r = bestRoomFor(s, q.userId);
      if (r) {
        q.status = 'matched'; q.resolvedAt = now;
        addMember(s, r.id, q.userId, 'auto', now);
        notify(s, q.userId, `자동 매칭으로 ${molName(r.targetMoleculeId)} 실험실에 들어갔어요.`, r.id, now);
        changed = true;
      }
    }
    const g = findQueueGroup(s);
    if (g) {
      const entries = s.queue.filter((q) => q.status === 'waiting' && g.userIds.includes(q.userId)).sort((a, b) => a.enteredAt - b.enteredAt);
      const host = entries[0].userId;
      const rid = createRoomInternal(s, host, g.moleculeId, 'immediate', 'automatic', now, s.config.defaultRecruitDays);
      for (const e of entries) { e.status = 'matched'; e.resolvedAt = now; }
      for (const e of entries) addMember(s, rid, e.userId, e.userId === host ? 'create' : 'auto', now);
      // 방장의 추천 이유도 채운다
      const hm = s.members.find((m) => m.roomId === rid && m.userId === host)!;
      hm.reason = matchReason(hm.elementSnapshot, entries.filter((e) => e.userId !== host).map((e) => s.users[e.userId].elementId!));
      sys(s, rid, '자동 매칭으로 만들어진 실험실이에요. 가장 먼저 기다린 분이 방장이 됐어요.', now);
      for (const e of entries) notify(s, e.userId, `자동 매칭 완료! ${molName(g.moleculeId)} 실험실이 만들어졌어요.`, rid, now);
      changed = true;
    }
    if (!changed) return;
  }
}

// ───────── 명령 처리 ─────────
export interface ApplyResult { state: State; createdId?: Id; info?: string }

export function apply(prev: State, cmd: Command, now: number): ApplyResult {
  const s: State = structuredClone(prev);
  let createdId: Id | undefined; let info: string | undefined;

  switch (cmd.type) {
    case 'createUser': {
      if (cmd.id && s.users[cmd.id]) fail('이미 가입된 계정이에요.');
      const id = cmd.id ?? nid(s, 'u');
      const intro = cmd.intro.trim().slice(0, INTRO_MAX);
      s.users[id] = { id, universityId: 'demo-univ', elementId: null, elementLockedAt: null, intro, createdAt: now,
        virtual: !!cmd.virtual, demoLabel: cmd.demoLabel ?? '나' };
      if (cmd.elementId) { s.users[id].elementId = cmd.elementId; s.users[id].elementLockedAt = now; }
      if (cmd.makeMe) s.meId = id;
      createdId = id; break;
    }
    case 'recordQuiz': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      if (u.elementLockedAt) fail('원소를 확정한 뒤에는 테스트를 다시 볼 수 없어요.');
      if (QUESTIONS.some((q) => cmd.answers[q.id] === undefined)) fail('모든 문항에 답해 주세요.');
      const r = scoreQuiz(cmd.answers, usableElements());
      const id = nid(s, 'qa');
      s.quizAttempts.push({ id, userId: u.id, version: QUIZ_VERSION, answers: cmd.answers, recommended: r.recommended, createdAt: now });
      createdId = id; break;
    }
    case 'lockElement': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      if (u.elementLockedAt) fail('원소는 한 번 확정하면 바꿀 수 없어요. 바꾸려면 탈퇴 후 다시 가입해야 해요.');
      if (!cmd.acknowledged) fail('변경할 수 없다는 안내를 확인해 주세요.');
      if (!usableElements().includes(cmd.elementId)) fail('지금 고를 수 없는 원소예요.');
      u.elementId = cmd.elementId; u.elementLockedAt = now; break;
    }
    case 'updateIntro': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      const t = cmd.intro.trim();
      if (!t) fail('한 줄 소개를 입력해 주세요.');
      if (t.length > INTRO_MAX) fail(`한 줄 소개는 ${INTRO_MAX}자까지 쓸 수 있어요.`);
      u.intro = t; break; // 이미 저장된 만남 기록은 기록 시점 소개를 그대로 유지한다.
    }
    case 'createRoom': {
      const u = lockedUser(s, cmd.actor);
      assertFree(s, u.id);
      const m = moleculeById(cmd.moleculeId);
      if (!m || !USABLE().includes(m)) fail('사용할 수 없는 분자예요.');
      if (!(m.atomCounts[u.elementId] ?? 0)) fail(`${m.formula}에는 ${ELEMENTS[u.elementId].name} 자리가 없어요.`);
      const days = Math.max(1, Math.min(14, Math.round(cmd.recruitDays ?? s.config.defaultRecruitDays)));
      const id = createRoomInternal(s, u.id, m.id, cmd.chatPolicy, 'manual', now, days);
      addMember(s, id, u.id, 'create', now);
      sys(s, id, cmd.chatPolicy === 'immediate' ? '실험실이 열렸어요. 들어오는 대로 대화할 수 있어요.' : '실험실이 열렸어요. 분자가 완성되면 채팅이 열려요.', now);
      createdId = id; break;
    }
    case 'joinRoom': {
      lockedUser(s, cmd.actor); assertFree(s, cmd.actor);
      addMember(s, cmd.roomId, cmd.actor, 'join', now); break;
    }
    case 'leaveRoom': {
      const r = room(s, cmd.roomId);
      const mem = s.members.find((m) => m.roomId === r.id && m.userId === cmd.actor && m.leftAt === null) ?? fail('이 실험실의 구성원이 아니에요.');
      if (r.closedAt) fail('이미 종료된 실험실이에요.');
      const wasComplete = r.recruitment === 'complete';
      mem.leftAt = now; // 이탈 이력은 삭제하지 않는다.
      sys(s, r.id, `${j(`${ELEMENTS[mem.elementSnapshot].name}(${mem.elementSnapshot})`, '이/가')} 실험실을 나갔어요.`, now);
      voidOpenProposals(s, r.id, now);
      const pm = pendingMeeting(s, r.id);
      if (pm && pm.attendees.some((a) => a.userId === cmd.actor)) {
        pm.status = 'superseded'; sys(s, r.id, '참석자가 나가서 만남 확인이 취소됐어요. 방장이 다시 제안해 주세요.', now);
      }
      const rest = activeMembers(s, r.id);
      if (!rest.length) { r.closedAt = now; r.closeReason = 'empty'; break; }
      if (r.hostId === cmd.actor) { // 방장 승계는 미정. 기본안: 가장 먼저 들어온 남은 구성원.
        r.hostId = [...rest].sort((a, b) => a.joinedAt - b.joinedAt)[0].userId;
        sys(s, r.id, '방장이 나가서 가장 먼저 들어온 구성원이 방장이 됐어요.', now);
      }
      if (r.firstMeetingConfirmedAt === null && wasComplete) {
        r.recruitment = 'recruiting'; r.completedAt = null;
        const exact = rest.length >= 2 ? exactMatches(roomCounts(s, r.id)) : [];
        sys(s, r.id, '첫 만남 전에 구성원이 나가서 빈자리를 다시 모집해요.', now);
        if (exact.length) openProposalInternal(s, r.id, 'earlyComplete', 'departure', exact[0].id, null, now);
        for (const m of rest) if (hasConflict(s, m.userId))
          notify(s, m.userId, '다시 모집 중인 실험실과 다른 모집 중인 실험실에 함께 속해 있어요. 한 곳을 골라 주세요.', r.id, now);
      }
      break;
    }
    case 'startAutoMatch': {
      const u = lockedUser(s, cmd.actor); assertFree(s, u.id);
      const r = bestRoomFor(s, u.id);
      if (r) {
        addMember(s, r.id, u.id, 'auto', now);
        createdId = r.id; info = 'joined';
      } else {
        s.queue.push({ userId: u.id, enteredAt: now, status: 'waiting' });
        info = 'queued';
      }
      break;
    }
    case 'cancelAutoMatch': {
      const q = waitingEntry(s, cmd.actor) ?? fail('대기 중이 아니에요.');
      q.status = 'cancelled'; q.resolvedAt = now; break;
    }
    case 'sendMessage': {
      const body = cmd.body.trim();
      if (!body) fail('메시지를 입력해 주세요.');
      if (!canChat(s, cmd.roomId, cmd.actor)) fail('지금은 이 실험실에서 채팅할 수 없어요.');
      s.messages.push({ id: nid(s, 'm'), roomId: cmd.roomId, senderId: cmd.actor, body: body.slice(0, 500), createdAt: now }); break;
    }
    case 'propose': {
      const r = room(s, cmd.roomId);
      if (!isMember(s, r.id, cmd.actor)) fail('구성원만 제안할 수 있어요.');
      if (!isRecruitingOpen(r)) fail('모집 중인 실험실에서만 제안할 수 있어요.');
      if (openProposal(s, r.id)) fail('이미 진행 중인 투표가 있어요.');
      const counts = roomCounts(s, r.id);
      if (cmd.kind === 'earlyComplete') {
        if (activeMembers(s, r.id).length < 2) fail('두 명 이상 모여야 해요.');
        if (!exactMatches(counts).some((m) => m.id === cmd.moleculeId)) fail('지금 구성과 정확히 같은 분자만 조기 완성할 수 있어요.');
      } else {
        if (!supersetCandidates(counts, r.targetMoleculeId).some((m) => m.id === cmd.moleculeId)) fail('지금 구성원을 모두 수용하는 분자만 새 목표로 정할 수 있어요.');
      }
      createdId = openProposalInternal(s, r.id, cmd.kind, 'manual', cmd.moleculeId, cmd.actor, now).id; break;
    }
    case 'vote': {
      const p = s.proposals.find((x) => x.id === cmd.proposalId) ?? fail('제안을 찾을 수 없어요.');
      if (p.status !== 'open') fail('이미 끝난 투표예요.');
      if (!p.electorate.includes(cmd.actor)) fail('이 투표의 동의 대상이 아니에요.');
      if (p.votes[cmd.actor]) fail('이미 응답했어요.');
      p.votes[cmd.actor] = cmd.choice;
      if (cmd.choice === 'no') { rejectProposal(s, p, 'rejected', now); break; }
      if (p.electorate.every((id) => p.votes[id] === 'yes')) {
        const r = s.rooms[p.roomId], m = moleculeById(p.targetMoleculeId)!, counts = roomCounts(s, r.id);
        if (p.type === 'earlyComplete' ? !sameCounts(m.atomCounts, counts) : !contains(m.atomCounts, counts)) fail('구성이 바뀌어 적용할 수 없어요.');
        p.status = 'passed'; r.targetMoleculeId = m.id;
        if (p.type === 'earlyComplete') {
          sys(s, r.id, `전원 동의로 반응이 종결됐어요.`, now);
          checkComplete(s, r.id, now);
        } else {
          sys(s, r.id, `전원 동의로 목표가 ${j(molName(m.id), '으로/로')} 바뀌었어요. 남은 자리를 모집해요.`, now);
          checkComplete(s, r.id, now);
        }
      }
      break;
    }
    case 'expireRecruitment': {
      const r = room(s, cmd.roomId);
      if (!isRecruitingOpen(r)) fail('모집 중인 실험실이 아니에요.');
      const exact = activeMembers(s, r.id).length >= 2 ? exactMatches(roomCounts(s, r.id)) : [];
      if (exact.length) {
        sys(s, r.id, '모집 기한이 끝났어요. 지금 구성으로 만들 수 있는 분자가 있어요.', now);
        createdId = openProposalInternal(s, r.id, 'earlyComplete', 'deadline', exact[0].id, null, now).id;
      } else {
        r.recruitment = 'failed'; r.closedAt = now; r.closeReason = 'deadline';
        sys(s, r.id, '모집 기한이 끝났고 지금 구성으로 만들 수 있는 분자가 없어 실험실이 종료됐어요.', now);
        notifyRoom(s, r.id, `${molName(r.targetMoleculeId)} 실험실이 모집 마감으로 종료됐어요.`, now);
      }
      break;
    }
    case 'expireProposal': {
      const p = s.proposals.find((x) => x.id === cmd.proposalId) ?? fail('제안을 찾을 수 없어요.');
      if (p.status !== 'open') fail('이미 끝난 투표예요.');
      rejectProposal(s, p, 'expired', now); break; // 미응답 처리는 미정. 기본안: 동의 부족으로 본다.
    }
    case 'closeRoom': {
      const r = room(s, cmd.roomId);
      if (r.hostId !== cmd.actor) fail('방장만 실험실을 종료할 수 있어요.');
      if (r.closedAt) fail('이미 종료된 실험실이에요.');
      r.closedAt = now; r.closeReason = 'host';
      for (const p of s.proposals) if (p.roomId === r.id && p.status === 'open') p.status = 'void';
      const pm = pendingMeeting(s, r.id); if (pm) pm.status = 'superseded';
      sys(s, r.id, '방장이 실험실을 종료했어요. 이미 얻은 카드와 만남 기록은 그대로 남아요.', now);
      notifyRoom(s, r.id, `${molName(r.targetMoleculeId)} 실험실이 종료됐어요.`, now, cmd.actor);
      break;
    }
    case 'proposeMeeting': {
      const r = room(s, cmd.roomId);
      if (r.hostId !== cmd.actor) fail('방장만 참석자를 제안할 수 있어요.');
      if (r.closedAt) fail('종료된 실험실이에요.');
      if (r.firstMeetingConfirmedAt !== null) fail('첫 만남은 이미 기록됐어요.');
      if (r.recruitment !== 'complete') fail('분자가 완성된 뒤에 만남을 기록할 수 있어요.');
      const ids = [...new Set(cmd.attendeeIds)];
      const act = activeMembers(s, r.id);
      if (ids.length < 2) fail('참석자를 두 명 이상 골라 주세요.');
      if (!ids.every((id) => act.some((m) => m.userId === id))) fail('실험실 구성원만 참석자로 고를 수 있어요.');
      const prevM = pendingMeeting(s, r.id);
      if (prevM) prevM.status = 'superseded'; // 수정하면 기존 확인은 모두 무효
      const attendees = ids.map((id) => { const m = act.find((x) => x.userId === id)!; return { userId: id, element: m.elementSnapshot, intro: s.users[id].intro }; });
      const match = exactMatches(countsOf(attendees.map((a) => a.element)))[0] ?? null; // 같은 조성이 여럿이면 카탈로그 첫 항목 (미정 사항)
      const id = nid(s, 'mt');
      s.meetings.push({ id, roomId: r.id, proposedBy: cmd.actor, attendees, confirmations: {}, status: 'pending',
        matchedMoleculeId: match?.id ?? null, createdAt: now, confirmedAt: null });
      sys(s, r.id, prevM ? '방장이 참석자 목록을 수정했어요. 참석자 모두 다시 확인해 주세요.' : '방장이 첫 만남 참석자를 제안했어요. 참석한 분은 확인해 주세요.', now);
      for (const a of attendees) notify(s, a.userId, '첫 만남 참석 확인을 기다리고 있어요.', r.id, now);
      createdId = id; break;
    }
    case 'respondMeeting': {
      const mt = s.meetings.find((m) => m.id === cmd.meetingId) ?? fail('만남 제안을 찾을 수 없어요.');
      if (!mt.attendees.some((a) => a.userId === cmd.actor)) fail('참석자로 선택된 사람만 확인할 수 있어요.');
      if (mt.status === 'confirmed' && cmd.response === 'confirm') { info = 'noop'; break; } // 중복 클릭: 아무것도 늘지 않음
      if (mt.status !== 'pending') fail('이미 끝난 만남 확인이에요.');
      if (mt.confirmations[cmd.actor] === 'confirmed' && cmd.response === 'confirm') { info = 'noop'; break; }
      mt.confirmations[cmd.actor] = cmd.response === 'confirm' ? 'confirmed' : 'rejected';
      if (cmd.response === 'reject') {
        mt.status = 'rejected';
        sys(s, mt.roomId, '참석자 한 명이 참석 목록이 맞지 않다고 응답했어요. 방장이 목록을 수정해 다시 제안해 주세요.', now);
        notify(s, s.rooms[mt.roomId].hostId, '만남 참석 제안이 거절됐어요. 참석자를 수정해 주세요.', mt.roomId, now);
      } else finalizeMeetingIfReady(s, mt.id, now);
      break;
    }
    case 'setCardVisibility': {
      const c = s.cards.find((x) => x.userId === cmd.actor && x.moleculeId === cmd.moleculeId) ?? fail('내 카드가 아니에요.');
      c.visibility = cmd.visibility; break;
    }
    case 'setRecordVisibility': {
      const r = s.records.find((x) => x.id === cmd.recordId && x.userId === cmd.actor) ?? fail('내 기록이 아니에요.');
      r.visibility = cmd.visibility; break;
    }
    case 'resolveConflict': {
      const c = recruitingCommitments(s, cmd.actor);
      if (!c.rooms.includes(cmd.keepRoomId)) fail('고른 실험실이 모집 중인 내 실험실이 아니에요.');
      for (const rid of c.rooms) if (rid !== cmd.keepRoomId) return apply(s, { type: 'leaveRoom', actor: cmd.actor, roomId: rid }, now);
      const q = waitingEntry(s, cmd.actor); if (q) { q.status = 'cancelled'; q.resolvedAt = now; }
      break;
    }
    case 'readNotifications': {
      for (const n of s.notifications) if (n.userId === cmd.actor && !n.readAt) n.readAt = now;
      break;
    }
  }
  if (cmd.type !== 'readNotifications' && cmd.type !== 'createUser') drainQueue(s, now);
  if (cmd.type === 'startAutoMatch' && info === 'queued') {
    const q = s.queue.find((x) => x.userId === cmd.actor && x.enteredAt === now);
    if (q?.status === 'matched') {
      info = 'matched';
      createdId = activeMembers2(s, cmd.actor).at(-1);
    }
  }
  return { state: s, createdId, info };
}

function activeMembers2(s: State, uid: Id) {
  return s.members.filter((m) => m.userId === uid && m.leftAt === null).sort((a, b) => a.joinedAt - b.joinedAt).map((m) => m.roomId);
}
