import type { ElementId } from '../data/molecules';
import type { MatchReason } from './recommend';

export type Id = string;

export interface User {
  id: Id; universityId: string; elementId: ElementId | null; elementLockedAt: number | null;
  intro: string; createdAt: number; virtual: boolean; demoLabel: string;
}

export type ChatPolicy = 'immediate' | 'afterComplete';
export type Recruitment = 'recruiting' | 'complete' | 'failed';

export interface Room {
  id: Id; targetMoleculeId: string; originalMoleculeId: string; hostId: Id;
  origin: 'manual' | 'automatic'; chatPolicy: ChatPolicy; recruitment: Recruitment;
  createdAt: number; completedAt: number | null; deadline: number;
  firstMeetingConfirmedAt: number | null; firstMeetingMoleculeId: string | null;
  closedAt: number | null; closeReason: 'host' | 'deadline' | 'empty' | null;
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

export interface AttendeeSnap { userId: Id; element: ElementId; intro: string }

export interface Meeting {
  id: Id; roomId: Id; proposedBy: Id; attendees: AttendeeSnap[];
  confirmations: Record<Id, 'confirmed' | 'rejected'>;
  status: 'pending' | 'confirmed' | 'rejected' | 'superseded';
  matchedMoleculeId: string | null; createdAt: number; confirmedAt: number | null;
}

export type Visibility = 'private' | 'public';
export interface CollectionCard { userId: Id; moleculeId: string; visibility: Visibility; firstEarnedAt: number }
export interface MeetingRecord {
  id: Id; userId: Id; meetingId: Id; roomId: Id; moleculeId: string | null; targetMoleculeId: string;
  companions: { element: ElementId; intro: string }[]; visibility: Visibility; createdAt: number;
}

export interface Notification { id: Id; userId: Id; text: string; roomId?: Id; createdAt: number; readAt: number | null }

export interface QuizAttempt { id: Id; userId: Id; version: string; answers: Record<string, number>; recommended: ElementId; createdAt: number }

export interface Config {
  /** 모집 기한 (미정 사항 → 설정값) */
  defaultRecruitDays: number;
  /** 투표 응답 기한 (미정 사항 → 설정값) */
  proposalHours: number;
}

export interface State {
  version: 1; seq: number; meId: Id | null;
  users: Record<Id, User>; rooms: Record<Id, Room>; members: RoomMember[]; queue: QueueEntry[];
  proposals: Proposal[]; messages: Message[]; meetings: Meeting[];
  cards: CollectionCard[]; records: MeetingRecord[]; notifications: Notification[]; quizAttempts: QuizAttempt[];
  config: Config;
}

export class DomainError extends Error {}
