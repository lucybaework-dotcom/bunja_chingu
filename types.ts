import type { ElementId } from './molecules';
import type { MatchReason } from './recommend';

export type Id = string;

export interface User {
  id: Id; universityId: string; elementId: ElementId | null; elementLockedAt: number | null;
  intro: string; createdAt: number; virtual: boolean; demoLabel: string;
  /** 닉네임 (2~10자, 중복 불가). 예전 계정은 비어 있을 수 있다 */
  nickname?: string;
  tags?: string[];
  /** 방장 위치 공유를 켰는지 */
  sharingLocation?: boolean;
  /** 신고 누적으로 일시 정지된 시각 */
  suspendedAt?: number | null;
  /** 동의한 약관 버전과 시각 */
  consentVersion?: string; consentAt?: number;
  /** 탈퇴한 시각. 탈퇴하면 개인 정보는 지우고 자리만 남긴다 */
  deletedAt?: number | null;
  /** 내 원소 빈자리 알림을 켰는지, 마지막으로 보낸 시각 (너무 자주 보내지 않게) */
  vacancyAlert?: boolean; lastVacancyAlertAt?: number;
  /** 고른 칭호 (업적 id) */
  title?: string | null;
}

export type ChatPolicy = 'immediate' | 'afterComplete';
export type Recruitment = 'recruiting' | 'complete' | 'failed';

export interface Room {
  id: Id; targetMoleculeId: string; originalMoleculeId: string; hostId: Id;
  origin: 'manual' | 'automatic'; chatPolicy: ChatPolicy; recruitment: Recruitment;
  createdAt: number; completedAt: number | null; deadline: number;
  firstMeetingConfirmedAt: number | null; firstMeetingMoleculeId: string | null;
  closedAt: number | null; closeReason: 'host' | 'deadline' | 'empty' | null;
  /** 실험실 이름 (직접 만든 실험실은 필수, 자동 매칭 실험실은 방장이 나중에 정함) */
  name?: string | null;
  /** 모이는 시각 (선택) */
  meetAt?: number | null;
  /** 약속 장소 (방장이 지도에서 찍음) */
  place?: { lat: number; lng: number; label: string } | null;
  /** 모이기 10분 전 알림을 보낸 시각 */
  remindedAt?: number | null;
}

export interface RoomMember {
  roomId: Id; userId: Id; elementSnapshot: ElementId; introSnapshot: string;
  joinedAt: number; leftAt: number | null; via: 'create' | 'join' | 'auto'; reason?: MatchReason;
}

export interface QueueEntry { userId: Id; enteredAt: number; status: 'waiting' | 'matched' | 'cancelled'; resolvedAt?: number }

export interface Proposal {
  id: Id; roomId: Id; type: 'earlyComplete' | 'retarget'; reason: 'manual' | 'deadline' | 'departure';
  targetMoleculeId: string; proposedBy: Id | null; electorate: Id[]; votes: Record<Id, 'yes' | 'no'>;
  status: 'open' | 'passed' | 'rejected' | 'void' | 'expired'; createdAt: number; expiresAt: number;
}

export interface Message { id: Id; roomId: Id; senderId: Id | null; body: string; createdAt: number }

export interface AttendeeSnap { userId: Id; element: ElementId; intro: string; nickname?: string }

export interface GeoPoint { lat: number; lng: number; acc: number }
export interface Meeting {
  id: Id; roomId: Id; proposedBy: Id; attendees: AttendeeSnap[];
  confirmations: Record<Id, 'confirmed' | 'rejected'>;
  /** 확인을 누른 시각·위치 (100m 규칙 판정용). 만남이 끝나면 위치는 지운다 */
  confirmAt?: Record<Id, number>;
  confirmLoc?: Record<Id, GeoPoint>;
  status: 'pending' | 'confirmed' | 'rejected' | 'superseded';
  matchedMoleculeId: string | null; createdAt: number; confirmedAt: number | null;
}

export type Visibility = 'private' | 'public';
export interface CollectionCard { userId: Id; moleculeId: string; visibility: Visibility; firstEarnedAt: number }
export interface MeetingRecord {
  id: Id; userId: Id; meetingId: Id; roomId: Id; moleculeId: string | null; targetMoleculeId: string;
  companions: { element: ElementId; intro: string; nickname?: string }[]; visibility: Visibility; createdAt: number;
  /** "분자 카드 받기"를 누른 시각. 누르기 전에는 카드가 포장된 채로 기다린다 */
  claimedAt?: number | null;
}

export interface Review { id: Id; meetingId: Id; from: Id; to: Id; tags: string[]; createdAt: number }
export type ReportReason = 'rude' | 'noshow' | 'spam' | 'inappropriate' | 'other';
export interface Report {
  id: Id; from: Id; target: Id; roomId: Id | null; reason: ReportReason; detail: string; createdAt: number;
  status: 'open' | 'upheld' | 'dismissed'; resolvedAt: number | null;
  /** 메시지 하나를 골라 신고했으면 그 메시지와 신고 당시 내용 */
  messageId?: Id | null; quote?: string;
}
export interface Block { from: Id; to: Id; createdAt: number }
export interface LastLocation { lat: number; lng: number; acc: number; at: number }
/** 웹 푸시 구독 (브라우저가 준 값 그대로) */
export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string }; at: number }

export interface Notification { id: Id; userId: Id; text: string; roomId?: Id; createdAt: number; readAt: number | null }

export interface QuizAttempt {
  id: Id; userId: Id; version: string; answers: Record<string, number>; recommended: ElementId; createdAt: number;
  /** AI 상담으로 받은 추천 (순서대로)과 이유 */
  aiRanking?: ElementId[]; aiReasons?: Partial<Record<ElementId, string>>;
}

export interface Config {
  /** 모집 기한 (미정 사항 → 설정값) */
  defaultRecruitDays: number;
  /** 투표 응답 기한 (미정 사항 → 설정값) */
  proposalHours: number;
  /** 만남 확인 위치 규칙 */
  meetingProximity: { required: boolean; radiusM: number; windowMs: number; maxAccuracyM: number };
  /** 이만큼 다른 사람에게 신고되면 자동 일시 정지 */
  suspendAfterReports: number;
}

export interface State {
  version: 1; seq: number; meId: Id | null;
  users: Record<Id, User>; rooms: Record<Id, Room>; members: RoomMember[]; queue: QueueEntry[];
  proposals: Proposal[]; messages: Message[]; meetings: Meeting[];
  cards: CollectionCard[]; records: MeetingRecord[]; notifications: Notification[]; quizAttempts: QuizAttempt[];
  reviews: Review[]; reports: Report[]; blocks: Block[];
  /** AI 상담 하루 사용 횟수 */
  aiUsage?: Record<Id, { day: string; n: number }>;
  /** 방장 위치: 사용자당 마지막 한 곳만 */
  locations: Record<Id, LastLocation>;
  /** 알림 구독: 사용자별 기기 목록 */
  pushSubs: Record<Id, PushSub[]>;
  admins: Id[];
  config: Config;
}

export class DomainError extends Error {}
