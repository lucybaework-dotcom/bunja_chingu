import { j } from './josa';
// 상태 전이 규칙 (순수 함수). 실제 서비스에서는 같은 규칙을 서버에서 원자적으로 실행해야 한다.
import { ELEMENTS } from './elements';
import { moleculeById, USABLE, type ElementId } from './molecules';
import { QUESTIONS, QUIZ_VERSION, scoreQuiz } from './quiz';
import { contains, countsOf, exactMatches, hasVacancy, sameCounts, supersetCandidates, usableElements } from './chemistry';
import { complementScore, matchReason, RECOMMEND_CONFIG } from './recommend';
import { DomainError, type ChatPolicy, type GeoPoint, type Id, type Proposal, type ReportReason, type Room, type State, type Visibility } from './types';
import { distanceM, isOnCampus } from './campus';
import { INTEREST_TAGS, PRAISE, PRAISE_MAX, REACTION, REPORT_REASONS, TAGS_MAX } from './social';

export type Command =
  | { type: 'createUser'; id?: Id; intro: string; virtual?: boolean; demoLabel?: string; elementId?: ElementId; makeMe?: boolean; nickname?: string }
  | { type: 'recordQuiz'; actor: Id; answers: Record<string, number> }
  | { type: 'lockElement'; actor: Id; elementId: ElementId; acknowledged: boolean }
  | { type: 'updateIntro'; actor: Id; intro: string }
  | { type: 'createRoom'; actor: Id; moleculeId: string; chatPolicy: ChatPolicy; recruitDays?: number; name?: string; meetAt?: number | null }
  | { type: 'renameRoom'; actor: Id; roomId: Id; name: string; meetAt: number | null }
  | { type: 'claimCard'; actor: Id; recordId: Id }
  | { type: 'updateProfile'; actor: Id; nickname?: string; tags?: string[] }
  | { type: 'review'; actor: Id; meetingId: Id; to: Id; tags: string[] }
  | { type: 'report'; actor: Id; target: Id; roomId?: Id | null; reason: ReportReason; detail: string }
  | { type: 'block'; actor: Id; target: Id }
  | { type: 'unblock'; actor: Id; target: Id }
  | { type: 'setSharing'; actor: Id; on: boolean }
  | { type: 'setLocation'; actor: Id; loc: GeoPoint | null }
  | { type: 'adminResolveReport'; actor: Id; reportId: Id; decision: 'upheld' | 'dismissed' }
  | { type: 'adminSetSuspended'; actor: Id; target: Id; suspended: boolean }
  | { type: 'makeAdmin'; userId: Id }
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
  | { type: 'respondMeeting'; actor: Id; meetingId: Id; response: 'confirm' | 'reject'; loc?: GeoPoint | null }
  | { type: 'setCardVisibility'; actor: Id; moleculeId: string; visibility: Visibility }
  | { type: 'setRecordVisibility'; actor: Id; recordId: Id; visibility: Visibility }
  | { type: 'resolveConflict'; actor: Id; keepRoomId: Id }
  | { type: 'readNotifications'; actor: Id };

export const INTRO_MAX = 40;
export const NICK_MIN = 2, NICK_MAX = 10, ROOM_NAME_MIN = 2, ROOM_NAME_MAX = 30;
/** 방장 위치가 이보다 오래되면 지도에서 숨긴다 */
export const LOCATION_FRESH_MS = 15 * 60_000;
const DAY = 86_400_000, HOUR = 3_600_000;

export const DEFAULT_CONFIG: State['config'] = {
  defaultRecruitDays: 3, proposalHours: 24,
  meetingProximity: { required: true, radiusM: 100, windowMs: 2 * HOUR, maxAccuracyM: 150 },
  suspendAfterReports: 3,
};

export function emptyState(): State {
  return {
    version: 1, seq: 1, meId: null, users: {}, rooms: {}, members: [], queue: [], proposals: [], messages: [],
    meetings: [], cards: [], records: [], notifications: [], quizAttempts: [],
    reviews: [], reports: [], blocks: [], locations: {}, admins: [],
    config: structuredClone(DEFAULT_CONFIG),
  };
}

/** 예전 버전으로 저장된 상태에 새 항목을 채운다 */
export function normalize(s: State): State {
  const d = emptyState();
  const out = { ...d, ...s, config: { ...d.config, ...(s.config ?? {}) } } as State;
  for (const k of ['reviews', 'reports', 'blocks', 'admins'] as const) if (!Array.isArray(out[k])) (out as any)[k] = [];
  if (!out.locations) out.locations = {};
  return out;
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

export const isBlockedPair = (s: State, a: Id, b: Id) => s.blocks.some((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
export const blockedWithRoom = (s: State, uid: Id, roomId: Id) => activeMembers(s, roomId).some((m) => isBlockedPair(s, uid, m.userId));

export function joinableRoomsFor(s: State, uid: Id): Room[] {
  const u = s.users[uid];
  if (!u?.elementId) return [];
  return Object.values(s.rooms).filter((r) => isRecruitingOpen(r) && !isMember(s, r.id, uid) && !blockedWithRoom(s, uid, r.id)
    && hasVacancy(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, r.id), u.elementId!));
}

export const roomTitle = (r: Room) => r.name || `${moleculeById(r.targetMoleculeId)!.name} 실험실`;

/** 같은 실험실(종료 전)에 viewer가 지금 있고 target이 한 번이라도 있었으면 프로필을 볼 수 있다 */
export function canViewProfile(s: State, viewer: Id, target: Id): boolean {
  if (viewer === target) return true;
  return s.members.some((m) => m.userId === viewer && m.leftAt === null && s.rooms[m.roomId]?.closedAt === null
    && s.members.some((o) => o.roomId === m.roomId && o.userId === target));
}

export interface Reaction { score: number | null; reviews: number; praise: Record<string, number> }
export function reactionOf(s: State, uid: Id): Reaction {
  const got = s.reviews.filter((r) => r.to === uid);
  const praise: Record<string, number> = {};
  for (const r of got) for (const t of r.tags) praise[t] = (praise[t] ?? 0) + 1;
  const total = Object.values(praise).reduce((a, b) => a + b, 0);
  const upheld = s.reports.filter((r) => r.target === uid && r.status === 'upheld').length;
  const raw = REACTION.base + total * REACTION.perPraise + upheld * REACTION.perUpheldReport;
  return { score: got.length >= REACTION.minReviewsToShow ? Math.max(0, Math.min(100, raw)) : null, reviews: got.length, praise };
}

export interface PublicProfile {
  id: Id; nickname: string; element: ElementId | null; intro: string; tags: string[];
  reaction: Reaction; molecules: string[];
}
export function buildProfile(s: State, uid: Id): PublicProfile {
  const u = s.users[uid];
  const claimed = new Set(s.records.filter((r) => r.userId === uid && r.moleculeId && r.claimedAt).map((r) => r.moleculeId!));
  return { id: uid, nickname: u?.nickname ?? '', element: u?.elementId ?? null, intro: u?.intro ?? '', tags: u?.tags ?? [],
    reaction: reactionOf(s, uid), molecules: [...claimed] };
}
/** 화면에서 쓰는 프로필 조회. 서버가 보낸 보기에는 볼 수 있는 프로필만 profiles에 들어 있다 */
export function getProfile(s: State & { profiles?: Record<Id, PublicProfile> }, viewer: Id, uid: Id): PublicProfile | null {
  if (s.profiles) return s.profiles[uid] ?? null;
  return canViewProfile(s, viewer, uid) ? buildProfile(s, uid) : null;
}

/** 위치를 지도에 보여 줄 방장: 공유 중, 15분 안에 갱신, 캠퍼스 안, 첫 만남 전 열린 실험실의 방장 */
export function hostPins(s: State, now: number): { userId: Id; lat: number; lng: number; rooms: Room[] }[] {
  const out: { userId: Id; lat: number; lng: number; rooms: Room[] }[] = [];
  for (const [uid, loc] of Object.entries(s.locations)) {
    if (!s.users[uid]?.sharingLocation || now - loc.at > LOCATION_FRESH_MS || !isOnCampus(loc.lat, loc.lng)) continue;
    const rooms = Object.values(s.rooms).filter((r) => r.hostId === uid && r.closedAt === null && r.firstMeetingConfirmedAt === null);
    if (rooms.length) out.push({ userId: uid, lat: loc.lat, lng: loc.lng, rooms });
  }
  return out;
}
const hostsOpenRoom = (s: State, uid: Id) => Object.values(s.rooms).some((r) => r.hostId === uid && r.closedAt === null && r.firstMeetingConfirmedAt === null);
function stopSharing(s: State, uid: Id) {
  if (s.users[uid]) s.users[uid].sharingLocation = false;
  delete s.locations[uid];
}

// ───────── 내부 변경 헬퍼 (draft를 직접 수정) ─────────
function nid(s: State, p: string) { return `${p}${s.seq++}`; }
function fail(msg: string): never { throw new DomainError(msg); }
function lockedUser(s: State, uid: Id) {
  const u = s.users[uid] ?? fail('사용자를 찾을 수 없어요.');
  if (!u.elementId || !u.elementLockedAt) fail('원소를 먼저 확정해 주세요.');
  if (!u.nickname) fail('닉네임을 먼저 정해 주세요.');
  if (u.suspendedAt) fail('신고가 쌓여 이용이 잠시 정지됐어요. 관리자 확인을 기다려 주세요.');
  return u as typeof u & { elementId: ElementId };
}
function cleanNickname(s: State, uid: Id, raw: string): string {
  const n = raw.trim().replace(/\s+/g, ' ');
  if (n.length < NICK_MIN || n.length > NICK_MAX) fail(`닉네임은 ${NICK_MIN}~${NICK_MAX}자로 정해 주세요.`);
  if (!/^[가-힣a-zA-Z0-9_ .]+$/.test(n)) fail('닉네임에는 한글, 영문, 숫자, _ 만 쓸 수 있어요.');
  if (Object.values(s.users).some((u) => u.id !== uid && (u.nickname ?? '').toLowerCase() === n.toLowerCase())) fail('이미 쓰고 있는 닉네임이에요.');
  return n;
}
function cleanRoomName(raw: string): string {
  const n = raw.trim().replace(/\s+/g, ' ');
  if (n.length < ROOM_NAME_MIN || n.length > ROOM_NAME_MAX) fail(`실험실 이름은 ${ROOM_NAME_MIN}~${ROOM_NAME_MAX}자로 정해 주세요.`);
  return n;
}
function cleanMeetAt(v: number | null | undefined, now: number): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) fail('모이는 시각을 다시 골라 주세요.');
  if (v < now - HOUR) fail('이미 지난 시각이에요.');
  if (v > now + 60 * DAY) fail('모이는 시각은 두 달 안으로 정해 주세요.');
  return v;
}
function isAdmin(s: State, uid: Id) { return s.admins.includes(uid); }
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
  if (blockedWithRoom(s, uid, roomId)) fail('함께할 수 없는 사람이 있는 실험실이에요.');
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
  delete mt.confirmLoc; // 만남이 확인되면 확인 위치는 지운다
  if (s.users[r.hostId]?.sharingLocation && !hostsOpenRoom(s, r.hostId)) {
    stopSharing(s, r.hostId);
    notify(s, r.hostId, '첫 만남이 확인돼서 위치 공유를 껐어요.', r.id, now);
  }
  const text = mt.matchedMoleculeId ? `첫 만남이 확인됐어요. 참석자 모두 ${molName(mt.matchedMoleculeId)} 카드를 받을 수 있어요.`
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
    if (picked.some((a, i) => picked.slice(i + 1).some((b) => isBlockedPair(s, a, b)))) continue;
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
  const s: State = normalize(structuredClone(prev));
  let createdId: Id | undefined; let info: string | undefined;

  switch (cmd.type) {
    case 'createUser': {
      if (cmd.id && s.users[cmd.id]) fail('이미 가입된 계정이에요.');
      const id = cmd.id ?? nid(s, 'u');
      const intro = cmd.intro.trim().slice(0, INTRO_MAX);
      s.users[id] = { id, universityId: 'demo-univ', elementId: null, elementLockedAt: null, intro, createdAt: now,
        virtual: !!cmd.virtual, demoLabel: cmd.demoLabel ?? '나', tags: [], sharingLocation: false, suspendedAt: null };
      if (cmd.elementId) { s.users[id].elementId = cmd.elementId; s.users[id].elementLockedAt = now; }
      if (cmd.nickname) s.users[id].nickname = cleanNickname(s, id, cmd.nickname);
      else if (cmd.virtual) s.users[id].nickname = `${cmd.elementId ?? '원자'}${s.seq}`;
      if (cmd.makeMe) { s.meId = id; if (!s.admins.includes(id)) s.admins.push(id); } // 시연에서는 나를 관리자로
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
      const name = cleanRoomName(cmd.name ?? '');
      const meetAt = cleanMeetAt(cmd.meetAt, now);
      const id = createRoomInternal(s, u.id, m.id, cmd.chatPolicy, 'manual', now, days);
      s.rooms[id].name = name; s.rooms[id].meetAt = meetAt;
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
      if (s.users[cmd.actor]?.suspendedAt) fail('신고가 쌓여 이용이 잠시 정지됐어요. 관리자 확인을 기다려 주세요.');
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
      if (cmd.response === 'confirm' && s.config.meetingProximity.required) {
        const P = s.config.meetingProximity, loc = cmd.loc;
        if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) fail('위치를 켜야 만남을 확인할 수 있어요. 위치를 켜야 카드를 받을 수 있어요.');
        if (!(loc.acc <= P.maxAccuracyM)) fail(`위치가 정확하지 않아요 (오차 약 ${Math.round(loc.acc)}m). 건물 밖으로 나와서 다시 눌러 주세요.`);
        mt.confirmAt ??= {}; mt.confirmLoc ??= {};
        // 2시간이 지난 확인은 다시 받는다
        for (const [uid, at] of Object.entries(mt.confirmAt)) {
          if (mt.confirmations[uid] === 'confirmed' && now - at > P.windowMs) {
            delete mt.confirmations[uid]; delete mt.confirmAt[uid]; delete mt.confirmLoc[uid];
            notify(s, uid, '만남 확인이 2시간 안에 모두 모이지 않아 다시 확인해야 해요.', mt.roomId, now);
          }
        }
        for (const [uid, other] of Object.entries(mt.confirmLoc)) {
          if (uid !== cmd.actor && mt.confirmations[uid] === 'confirmed' && distanceM(loc, other) > P.radiusM)
            fail(`먼저 확인한 참석자와 ${P.radiusM}m 넘게 떨어져 있어요. 함께 있을 때 눌러 주세요.`);
        }
        mt.confirmAt[cmd.actor] = now;
        mt.confirmLoc[cmd.actor] = { lat: loc.lat, lng: loc.lng, acc: loc.acc };
      }
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
    case 'renameRoom': {
      const r = room(s, cmd.roomId);
      if (r.hostId !== cmd.actor) fail('방장만 실험실 이름을 바꿀 수 있어요.');
      if (r.closedAt) fail('종료된 실험실이에요.');
      r.name = cleanRoomName(cmd.name); r.meetAt = cleanMeetAt(cmd.meetAt, now);
      sys(s, r.id, `방장이 실험실 이름을 '${r.name}'${r.meetAt ? '(으)로 정하고 모이는 시각을 적었어요.' : '(으)로 정했어요.'}`, now);
      break;
    }
    case 'claimCard': {
      const rec = s.records.find((x) => x.id === cmd.recordId && x.userId === cmd.actor) ?? fail('내 만남 기록이 아니에요.');
      if (rec.claimedAt) { info = 'noop'; createdId = rec.moleculeId ?? undefined; break; }
      rec.claimedAt = now; createdId = rec.moleculeId ?? undefined; break;
    }
    case 'updateProfile': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      if (cmd.nickname !== undefined) u.nickname = cleanNickname(s, u.id, cmd.nickname);
      if (cmd.tags !== undefined) {
        const tags = [...new Set(cmd.tags)];
        if (tags.length > TAGS_MAX) fail(`관심사는 ${TAGS_MAX}개까지 고를 수 있어요.`);
        if (!tags.every((t) => INTEREST_TAGS.includes(t))) fail('목록에 있는 관심사만 고를 수 있어요.');
        u.tags = tags;
      }
      break;
    }
    case 'review': {
      const mt = s.meetings.find((m) => m.id === cmd.meetingId) ?? fail('만남을 찾을 수 없어요.');
      if (mt.status !== 'confirmed') fail('실제 만남이 확인된 뒤에 반응을 남길 수 있어요.');
      if (!mt.attendees.some((a) => a.userId === cmd.actor) || !mt.attendees.some((a) => a.userId === cmd.to)) fail('함께 만난 사람에게만 반응을 남길 수 있어요.');
      if (cmd.to === cmd.actor) fail('나에게는 반응을 남길 수 없어요.');
      if (s.reviews.some((r) => r.meetingId === mt.id && r.from === cmd.actor && r.to === cmd.to)) fail('이미 반응을 남겼어요.');
      const tags = [...new Set(cmd.tags)];
      if (!tags.length || tags.length > PRAISE_MAX) fail(`칭찬은 1~${PRAISE_MAX}개 골라 주세요.`);
      if (!tags.every((t) => PRAISE.some((p) => p.id === t))) fail('목록에 있는 칭찬만 고를 수 있어요.');
      s.reviews.push({ id: nid(s, 'rv'), meetingId: mt.id, from: cmd.actor, to: cmd.to, tags, createdAt: now });
      break;
    }
    case 'report': {
      if (!s.users[cmd.target]) fail('사용자를 찾을 수 없어요.');
      if (cmd.target === cmd.actor) fail('나를 신고할 수는 없어요.');
      if (!REPORT_REASONS.some((r) => r.id === cmd.reason)) fail('신고 사유를 골라 주세요.');
      const detail = (cmd.detail ?? '').trim().slice(0, 300);
      if (cmd.reason === 'other' && !detail) fail('기타 사유는 내용을 적어 주세요.');
      if (s.reports.some((r) => r.from === cmd.actor && r.target === cmd.target && r.status === 'open')) fail('이미 신고했어요. 관리자가 확인하고 있어요.');
      s.reports.push({ id: nid(s, 'rp'), from: cmd.actor, target: cmd.target, roomId: cmd.roomId ?? null, reason: cmd.reason, detail, createdAt: now, status: 'open', resolvedAt: null });
      notify(s, cmd.actor, '신고가 접수됐어요. 관리자가 확인할게요. 신고한 사실은 상대에게 알리지 않아요.', undefined, now);
      const reporters = new Set(s.reports.filter((r) => r.target === cmd.target && r.status !== 'dismissed').map((r) => r.from));
      const t = s.users[cmd.target];
      if (reporters.size >= s.config.suspendAfterReports && !t.suspendedAt) {
        t.suspendedAt = now; stopSharing(s, t.id);
        const q = waitingEntry(s, t.id); if (q) { q.status = 'cancelled'; q.resolvedAt = now; }
        for (const a of s.admins) notify(s, a, `신고가 ${reporters.size}건 쌓여 ${t.nickname || '사용자'}님을 일시 정지했어요. 확인해 주세요.`, undefined, now);
      }
      for (const a of s.admins) if (a !== cmd.actor) notify(s, a, '새 신고가 들어왔어요.', undefined, now);
      break;
    }
    case 'block': {
      if (cmd.target === cmd.actor || !s.users[cmd.target]) fail('차단할 수 없는 사용자예요.');
      if (!s.blocks.some((b) => b.from === cmd.actor && b.to === cmd.target)) s.blocks.push({ from: cmd.actor, to: cmd.target, createdAt: now });
      break;
    }
    case 'unblock': {
      s.blocks = s.blocks.filter((b) => !(b.from === cmd.actor && b.to === cmd.target)); break;
    }
    case 'setSharing': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      if (cmd.on) {
        if (!hostsOpenRoom(s, u.id)) fail('첫 만남 전인 실험실의 방장만 위치를 공유할 수 있어요.');
        if (u.suspendedAt) fail('이용이 정지된 동안에는 위치를 공유할 수 없어요.');
        u.sharingLocation = true;
      } else stopSharing(s, u.id);
      break;
    }
    case 'setLocation': {
      const u = s.users[cmd.actor] ?? fail('사용자를 찾을 수 없어요.');
      if (!u.sharingLocation) { info = 'noop'; break; }
      if (!cmd.loc) { delete s.locations[u.id]; break; }
      if (!isOnCampus(cmd.loc.lat, cmd.loc.lng)) {
        stopSharing(s, u.id); info = 'offCampus';
        notify(s, u.id, '캠퍼스를 벗어나서 위치 공유를 껐어요.', undefined, now);
        break;
      }
      s.locations[u.id] = { lat: cmd.loc.lat, lng: cmd.loc.lng, acc: cmd.loc.acc, at: now }; // 마지막 위치 하나만
      break;
    }
    case 'adminResolveReport': {
      if (!isAdmin(s, cmd.actor)) fail('관리자만 할 수 있어요.');
      const r = s.reports.find((x) => x.id === cmd.reportId) ?? fail('신고를 찾을 수 없어요.');
      if (r.status !== 'open') fail('이미 처리한 신고예요.');
      r.status = cmd.decision; r.resolvedAt = now;
      notify(s, r.from, cmd.decision === 'upheld' ? '신고하신 내용이 확인되어 조치했어요.' : '신고하신 내용을 확인했지만 조치할 사항이 없었어요.', undefined, now);
      break;
    }
    case 'adminSetSuspended': {
      if (!isAdmin(s, cmd.actor)) fail('관리자만 할 수 있어요.');
      const t = s.users[cmd.target] ?? fail('사용자를 찾을 수 없어요.');
      if (cmd.suspended) {
        t.suspendedAt = now; stopSharing(s, t.id);
        const q = waitingEntry(s, t.id); if (q) { q.status = 'cancelled'; q.resolvedAt = now; }
      } else { t.suspendedAt = null; notify(s, t.id, '이용 정지가 풀렸어요.', undefined, now); }
      break;
    }
    case 'makeAdmin': {
      if (!s.users[cmd.userId]) fail('사용자를 찾을 수 없어요.');
      if (!s.admins.includes(cmd.userId)) s.admins.push(cmd.userId);
      break;
    }
    case 'readNotifications': {
      for (const n of s.notifications) if (n.userId === cmd.actor && !n.readAt) n.readAt = now;
      break;
    }
  }
  if (!['readNotifications', 'createUser', 'setLocation', 'updateProfile', 'claimCard', 'review'].includes(cmd.type)) drainQueue(s, now);
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
