// 서버가 사용자 한 명에게 돌려주는 보기. 남의 채팅·알림·카드·리뷰·위치는 빼고, 볼 수 있는 프로필만 넣는다.
import { isOnCampus } from './campus';
import { buildProfile, canViewProfile, hostPins, type PublicProfile } from './engine';
import type { State } from './types';

export type View = State & { profiles: Record<string, PublicProfile>; isAdmin?: boolean };

export function viewFor(s: State, uid: string, here?: { lat: number; lng: number } | null, now = Date.now()): View {
  const admin = s.admins.includes(uid);
  const mine = new Set(s.members.filter((m) => m.userId === uid).map((m) => m.roomId));
  const visible = (id: string) => admin || canViewProfile(s, uid, id);
  const profiles: Record<string, PublicProfile> = {};
  for (const id of Object.keys(s.users)) if (visible(id)) profiles[id] = buildProfile(s, id);

  // 방장 위치: 내가 캠퍼스 안에 있을 때만 (A-2: 캠퍼스 안 모든 사용자에게 공개)
  const onCampus = !!here && isOnCampus(here.lat, here.lng);
  const pinIds = new Set(onCampus ? hostPins(s, now).map((p) => p.userId) : []);
  const locations = Object.fromEntries(Object.entries(s.locations).filter(([id]) => id === uid || pinIds.has(id)));

  return {
    ...s,
    meId: s.users[uid] ? uid : null,
    users: Object.fromEntries(Object.entries(s.users).map(([id, u]) => [id, {
      ...u, demoLabel: '',
      nickname: visible(id) || pinIds.has(id) ? u.nickname : undefined,
      tags: visible(id) ? u.tags : [],
      suspendedAt: id === uid || admin ? u.suspendedAt : null,
    }])),
    queue: s.queue.map((q) => (q.userId === uid ? q : { ...q, userId: 'hidden' })),
    messages: s.messages.filter((m) => mine.has(m.roomId)),
    proposals: s.proposals.filter((p) => mine.has(p.roomId)),
    meetings: s.meetings.filter((m) => mine.has(m.roomId)).map((m) => ({ ...m, confirmLoc: undefined })),
    notifications: s.notifications.filter((n) => n.userId === uid),
    cards: s.cards.filter((c) => c.userId === uid),
    records: s.records.filter((r) => r.userId === uid),
    quizAttempts: s.quizAttempts.filter((q) => q.userId === uid),
    reviews: s.reviews.filter((r) => r.from === uid), // 받은 리뷰는 익명 집계(profiles)로만
    reports: admin ? s.reports : s.reports.filter((r) => r.from === uid),
    blocks: s.blocks.filter((b) => b.from === uid),
    locations,
    admins: admin ? [uid] : [],
    pushSubs: s.pushSubs[uid] ? { [uid]: s.pushSubs[uid].map((x) => ({ ...x, keys: { p256dh: '', auth: '' } })) } : {},
    profiles,
    isAdmin: admin,
  };
}
