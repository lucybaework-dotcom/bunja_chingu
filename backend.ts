// 서버 연결 지점. 화면은 Backend 인터페이스만 사용한다.
// LocalBackend: 이 기기의 브라우저 저장소 + 가상 사용자로 흐름을 시연한다 (다중 사용자 서비스가 아님).
// 실제 서비스에서는 RemoteBackend가 같은 Command를 서버에 보내고, 서버가 engine.apply와 같은 규칙을
// 트랜잭션 안에서 원자적으로 실행해야 한다 (입장·매칭·확정·카드 지급).
import { apply, type Command } from '../domain/engine';
import { DomainError, type State } from '../domain/types';
import { seedState } from './seed';

export interface DispatchResult { ok: boolean; error?: string; createdId?: string; info?: string }

export interface Backend {
  getState(): State;
  dispatch(cmd: Command): DispatchResult;
  subscribe(fn: () => void): () => void;
  reset(): void;
}

const KEY = 'bunja-chingu-demo-v1';

export class LocalBackend implements Backend {
  private state: State;
  private subs = new Set<() => void>();
  constructor(private clock: () => number = () => Date.now()) {
    this.state = this.load() ?? seedState(this.clock());
  }
  private load(): State | null {
    try { const raw = localStorage.getItem(KEY); if (!raw) return null; const s = JSON.parse(raw); return s?.version === 1 ? s : null; } catch { return null; }
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 저장소를 못 써도 화면은 동작 */ } }
  getState() { return this.state; }
  dispatch(cmd: Command): DispatchResult {
    try {
      const r = apply(this.state, cmd, this.clock());
      this.state = r.state; this.save(); this.subs.forEach((f) => f());
      return { ok: true, createdId: r.createdId, info: r.info };
    } catch (e) {
      if (e instanceof DomainError) return { ok: false, error: e.message };
      throw e;
    }
  }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  reset() { this.state = seedState(this.clock()); this.save(); this.subs.forEach((f) => f()); }
}

export class RemoteBackend implements Backend {
  getState(): State { throw new Error('서버 미연결'); }
  dispatch(): DispatchResult { return { ok: false, error: '서버가 아직 연결되지 않았어요.' }; }
  subscribe() { return () => {}; }
  reset() {}
}
