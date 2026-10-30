// 서버 연결 지점. 화면은 Backend 인터페이스만 사용한다.
// LocalBackend: 이 기기의 브라우저 저장소 + 가상 사용자로 흐름을 시연한다 (다중 사용자 서비스가 아님).
// RemoteBackend: 같은 Command를 Supabase Edge Function에 보내고, 서버가 같은 규칙(engine.apply)을
// 저장소 버전 확인과 함께 실행한다. 화면은 서버가 돌려준 "내 보기"만 그린다.
import { apply, normalize, remindMeetings, type Command } from './engine';
import { DomainError, type State } from './types';
import { seedState } from './seed';
import { demoAdvisor, type AiReply, type AiTurn } from './advisor';

export type AiResult = { ok: true; reply: AiReply } | { ok: false; error: string };

export interface DispatchResult { ok: boolean; error?: string; createdId?: string; info?: string }

export interface Backend {
  readonly mode: 'demo' | 'live';
  getState(): State;
  dispatch(cmd: Command): Promise<DispatchResult>;
  subscribe(fn: () => void): () => void;
  reset(): void;
  signOut?(): Promise<void>;
  /** AI 원소 상담 한 번 주고받기 */
  ai(history: AiTurn[], finish: boolean): Promise<AiResult>;
}

const KEY = 'bunja-chingu-demo-v1';

export class LocalBackend implements Backend {
  readonly mode = 'demo' as const;
  private state: State;
  private subs = new Set<() => void>();
  constructor(private clock: () => number = () => Date.now()) {
    this.state = this.load() ?? seedState(this.clock());
    this.freshenVirtual();
    // 시연판에는 서버가 없으니 이 기기에서 30초마다 '10분 전 알림'을 확인한다
    if (typeof window !== 'undefined') setInterval(() => this.tick(), 30_000);
  }
  private tick() {
    const r = remindMeetings(this.state, this.clock());
    if (r.changed) { this.state = r.state; this.save(); this.subs.forEach((f) => f()); }
  }
  /** 시연용 가상 방장은 움직이지 않으니 위치 시각만 지금으로 맞춰 지도에 계속 보이게 한다 */
  private freshenVirtual() {
    const now = this.clock();
    for (const [id, loc] of Object.entries(this.state.locations ?? {})) if (this.state.users[id]?.virtual) loc.at = now;
  }
  private load(): State | null {
    try { const raw = localStorage.getItem(KEY); if (!raw) return null; const s = JSON.parse(raw); return s?.version === 1 && Array.isArray(s.reviews) ? normalize(s) : null; } catch { return null; }
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 저장소를 못 써도 화면은 동작 */ } }
  getState() { return this.state; }
  async dispatch(cmd: Command): Promise<DispatchResult> {
    try {
      this.state = remindMeetings(this.state, this.clock()).state;
      const r = apply(this.state, cmd, this.clock());
      this.state = r.state; this.freshenVirtual(); this.save(); this.subs.forEach((f) => f());
      return { ok: true, createdId: r.createdId, info: r.info };
    } catch (e) {
      if (e instanceof DomainError) return { ok: false, error: e.message };
      throw e;
    }
  }
  /** 시연판: 서버와 AI 없이 정해진 질문으로 상담을 흉내 낸다 */
  async ai(history: AiTurn[], finish: boolean): Promise<AiResult> {
    await new Promise((r) => setTimeout(r, 500));
    const reply = demoAdvisor(history, finish);
    if (reply.done && this.state.meId) { const r = await this.dispatch({ type: 'recordAdvice', actor: this.state.meId, ranking: reply.ranking }); if (!r.ok) return { ok: false, error: r.error! }; }
    return { ok: true, reply };
  }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  reset() { this.state = seedState(this.clock()); this.freshenVirtual(); this.save(); this.subs.forEach((f) => f()); }
}

/** 서버와 통신하는 최소 기능. Supabase 클라이언트를 감싸서 테스트에서 바꿔 끼울 수 있게 한다. */
export interface RemoteTransport {
  call(body: unknown): Promise<{ status: number; json: Record<string, unknown> }>;
  onChange(fn: () => void): () => void;
  signOut(): Promise<void>;
}

export class RemoteBackend implements Backend {
  readonly mode = 'live' as const;
  private state: State | null = null;
  private subs = new Set<() => void>();
  private stopWatch: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private t: RemoteTransport, private here: () => { lat: number; lng: number } | null = () => null) {}

  /** 처음 한 번 서버에서 내 보기를 받아 오고, 바뀔 때마다 다시 받는다. */
  async start() {
    await this.refresh();
    this.stopWatch = this.t.onChange(() => { this.refresh().catch(() => undefined); });
    this.timer = setInterval(() => { this.refresh().catch(() => undefined); }, 20_000); // 실시간 연결이 끊겨도 따라잡도록
  }
  stop() { this.stopWatch(); clearInterval(this.timer); }
  async refresh() {
    const h = this.here();
    const r = await this.t.call({ action: 'view', ...(h ? { here: { lat: h.lat, lng: h.lng } } : {}) });
    if (r.status === 200 && r.json.view) this.set(r.json.view as State);
    else if (r.status >= 400) throw Object.assign(new Error(String(r.json.error ?? '서버에 연결하지 못했어요.')), { status: r.status });
  }
  private set(s: State) { this.state = s; this.subs.forEach((f) => f()); }
  getState(): State {
    if (!this.state) throw new Error('아직 불러오지 않았어요.');
    return this.state;
  }
  async dispatch(cmd: Command): Promise<DispatchResult> {
    try {
      const h = this.here();
      const r = await this.t.call({ action: 'dispatch', cmd, ...(h ? { here: { lat: h.lat, lng: h.lng } } : {}) });
      if (r.json.view) this.set(r.json.view as State);
      if (r.status !== 200) return { ok: false, error: String(r.json.error ?? '서버 오류가 났어요.') };
      return { ok: !!r.json.ok, error: r.json.error as string | undefined, createdId: r.json.createdId as string | undefined, info: r.json.info as string | undefined };
    } catch {
      return { ok: false, error: '인터넷 연결을 확인하고 다시 시도해 주세요.' };
    }
  }
  async ai(history: AiTurn[], finish: boolean): Promise<AiResult> {
    try {
      const r = await this.t.call({ action: 'ai', history, finish });
      if (r.json.view) this.set(r.json.view as State);
      if (r.status !== 200 || !r.json.ai) return { ok: false, error: String(r.json.error ?? 'AI가 답하지 못했어요.') };
      return { ok: true, reply: r.json.ai as AiReply };
    } catch { return { ok: false, error: '인터넷 연결을 확인하고 다시 시도해 주세요.' }; }
  }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  reset() {}
  async signOut() { this.stop(); await this.t.signOut(); }
}
