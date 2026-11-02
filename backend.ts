// 서버 연결 지점. 화면은 Backend 인터페이스만 사용한다.
// LocalBackend: 이 기기의 브라우저 저장소 + 가상 사용자로 흐름을 시연한다 (다중 사용자 서비스가 아님).
// RemoteBackend: 같은 Command를 Supabase Edge Function에 보내고, 서버가 같은 규칙(engine.apply)을
// 저장소 버전 확인과 함께 실행한다. 화면은 서버가 돌려준 "내 보기"만 그린다.
import { apply, normalize, remindMeetings, type Command } from './engine';
import { DomainError, type State } from './types';
import { seedState } from './seed';
import { demoAdvisor, type AiReply, type AiTurn } from './advisor';
import { demoRoomAdvice, type RoomAdvice } from './roomAdvisor';

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
  ai(history: AiTurn[], finish: boolean, onPartial?: (text: string) => void): Promise<AiResult>;
  /** 원하는 모임 → 분자 추천 */
  aiRoom(request: string): Promise<{ ok: true; room: RoomAdvice } | { ok: false; error: string }>;
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
  async aiRoom(request: string) {
    await new Promise((r) => setTimeout(r, 600));
    const el = this.state.meId ? this.state.users[this.state.meId]?.elementId : null;
    if (!el) return { ok: false as const, error: '먼저 원소를 정해 주세요.' };
    return { ok: true as const, room: demoRoomAdvice(el, request) };
  }
  /** 시연판: 서버와 AI 없이 정해진 질문으로 상담을 흉내 낸다 */
  async ai(history: AiTurn[], finish: boolean, onPartial?: (text: string) => void): Promise<AiResult> {
    await new Promise((r) => setTimeout(r, 350));
    const reply = demoAdvisor(history, finish);
    // 실제처럼 글자가 조금씩 나오게
    if (onPartial) for (let i = 4; i < reply.reply.length + 4; i += 4) { onPartial(reply.reply.slice(0, i)); await new Promise((r) => setTimeout(r, 25)); }
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
  /** 한 줄에 JSON 하나씩 오는 응답을 읽는다 (교수님 답 흘려받기) */
  stream?(body: unknown, onLine: (o: Record<string, unknown>) => void): Promise<{ status: number; json?: Record<string, unknown> }>;
}

export class RemoteBackend implements Backend {
  readonly mode = 'live' as const;
  private state: State | null = null;
  private subs = new Set<() => void>();
  private stopWatch: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private t: RemoteTransport, private here: () => { lat: number; lng: number } | null = () => null, private uid = '') {}

  private get cacheKey() { return `bunja-view-${this.uid}`; }
  /** 지난번에 받은 내 보기가 이 기기에 있으면 먼저 보여 준다 (서버 응답을 기다리지 않고 바로 열리게) */
  primeFromCache(): boolean {
    if (!this.uid) return false;
    try {
      const v = JSON.parse(localStorage.getItem(this.cacheKey) ?? 'null') as State | null;
      if (v && v.meId === this.uid && v.version === 1) { this.state = normalize(v); return true; }
    } catch { /* 없거나 깨졌으면 무시 */ }
    return false;
  }
  clearCache() { try { localStorage.removeItem(this.cacheKey); } catch { /* 무시 */ } }

  /** 서버에서 내 보기를 받아 오고, 바뀔 때마다 다시 받는다. */
  async start() {
    this.stopWatch = this.t.onChange(() => { this.refresh().catch(() => undefined); });
    this.timer = setInterval(() => { this.refresh().catch(() => undefined); }, 20_000); // 실시간 연결이 끊겨도 따라잡도록
    await this.refresh();
  }
  private inflight: Promise<void> | null = null;
  stop() { this.stopWatch(); clearInterval(this.timer); }
  /** 동시에 여러 번 불려도 서버에는 한 번만 묻는다 */
  refresh(): Promise<void> {
    if (!this.inflight) this.inflight = this.fetchView().finally(() => { this.inflight = null; });
    return this.inflight;
  }
  private async fetchView() {
    const h = this.here();
    const r = await this.t.call({ action: 'view', ...(h ? { here: { lat: h.lat, lng: h.lng } } : {}) });
    if (r.status === 200 && r.json.view) this.set(r.json.view as State);
    else if (r.status >= 400) throw Object.assign(new Error(String(r.json.error ?? '서버에 연결하지 못했어요.')), { status: r.status });
  }
  private set(s: State) {
    this.state = s; this.subs.forEach((f) => f());
    if (this.uid && s.meId === this.uid) { try { localStorage.setItem(this.cacheKey, JSON.stringify(s)); } catch { /* 저장 공간이 없으면 다음에 기다리면 됨 */ } }
  }
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
  async aiRoom(request: string) {
    try {
      const r = await this.t.call({ action: 'aiRoom', request });
      if (r.json.view) this.set(r.json.view as State);
      if (r.status !== 200 || !r.json.room) return { ok: false as const, error: String(r.json.error ?? '교수님이 답하지 못했어요.') };
      return { ok: true as const, room: r.json.room as RoomAdvice };
    } catch { return { ok: false as const, error: '인터넷 연결을 확인하고 다시 시도해 주세요.' }; }
  }
  async ai(history: AiTurn[], finish: boolean, onPartial?: (text: string) => void): Promise<AiResult> {
    if (this.t.stream) {
      try {
        let result: AiResult = { ok: false, error: '교수님 답이 끊겼어요. 다시 보내 주세요.' };
        const r = await this.t.stream({ action: 'ai', history, finish, stream: true }, (o) => {
          if (o.t === 'delta' && typeof o.text === 'string') onPartial?.(o.text);
          else if (o.t === 'done') { if (o.view) this.set(o.view as State); result = { ok: true, reply: o.ai as AiReply }; }
          else if (o.t === 'error') result = { ok: false, error: String(o.error) };
        });
        if (r.json) return { ok: false, error: String(r.json.error ?? '교수님이 답하지 못했어요.') };
        return result;
      } catch { return { ok: false, error: '인터넷 연결을 확인하고 다시 시도해 주세요.' }; }
    }
    try {
      const r = await this.t.call({ action: 'ai', history, finish });
      if (r.json.view) this.set(r.json.view as State);
      if (r.status !== 200 || !r.json.ai) return { ok: false, error: String(r.json.error ?? 'AI가 답하지 못했어요.') };
      return { ok: true, reply: r.json.ai as AiReply };
    } catch { return { ok: false, error: '인터넷 연결을 확인하고 다시 시도해 주세요.' }; }
  }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  reset() {}
  async signOut() { this.stop(); this.clearCache(); await this.t.signOut(); }
}
