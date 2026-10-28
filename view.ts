// 서버가 사용자 한 명에게 돌려주는 보기. 남의 채팅·알림·카드·대기열 정보는 빼고 보낸다.
import type { State } from './types';

export function viewFor(s: State, uid: string): State {
  const mine = new Set(s.members.filter((m) => m.userId === uid).map((m) => m.roomId));
  return {
    ...s,
    meId: s.users[uid] ? uid : null,
    users: Object.fromEntries(Object.entries(s.users).map(([id, u]) => [id, { ...u, demoLabel: '' }])),
    queue: s.queue.map((q) => (q.userId === uid ? q : { ...q, userId: 'hidden' })),
    messages: s.messages.filter((m) => mine.has(m.roomId)),
    proposals: s.proposals.filter((p) => mine.has(p.roomId)),
    meetings: s.meetings.filter((m) => mine.has(m.roomId)),
    notifications: s.notifications.filter((n) => n.userId === uid),
    cards: s.cards.filter((c) => c.userId === uid),
    records: s.records.filter((r) => r.userId === uid),
    quizAttempts: s.quizAttempts.filter((q) => q.userId === uid),
  };
}
