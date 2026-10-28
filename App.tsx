import { j, josaOf } from './josa';
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ELEMENTS, METAPHOR_NOTICE, pairContent } from './elements';
import { kindLabel, moleculeById, type ElementId } from './molecules';
import { CONTEXT_LABEL, QUESTIONS, scoreQuiz } from './quiz';
import type { Backend, DispatchResult } from './backend';
import { countsOf, exactMatches, moleculesWith, supersetCandidates, usableElements, vacancies } from './chemistry';
import {
  activeMembers, canChat, hasConflict, INTRO_MAX, isMember, isRecruitingOpen, joinableRoomsFor, openProposal, pendingMeeting,
  recruitingCommitments, roomCounts, waitingEntry, type Command,
} from './engine';
import type { Room, State } from './types';
import { PERIODIC, PT_GROUPS, PT_PERIODS } from './periodic';
import { elementColor } from './colors';
import Molecule3D from './Molecule3D';
import { Atom, fmtDate, fmtTime, Formula, Icon, MoleculeStrip, MolTitle } from './bits';

type View =
  | { k: 'home' } | { k: 'rooms' } | { k: 'create' } | { k: 'auto' } | { k: 'room'; id: string }
  | { k: 'collection' } | { k: 'card'; mol: string } | { k: 'public' } | { k: 'profile' } | { k: 'element'; el: ElementId } | { k: 'table'; el?: string };

interface Ctx { s: State; viewer: string; run: (c: Command, ok?: string) => Promise<DispatchResult>; go: (v: View) => void; view: View; backend: Backend }
const C = createContext<Ctx>(null as unknown as Ctx);
const useApp = () => useContext(C);

const molName = (id: string) => { const m = moleculeById(id)!; return `${m.name} ${m.formula}`; };

function roomStatus(r: Room): { label: string; cls: string } {
  if (r.closedAt) return { label: r.closeReason === 'deadline' ? '모집 마감 종료' : '종료', cls: 'bad' };
  if (r.firstMeetingConfirmedAt) return { label: '첫 만남 완료', cls: 'ok' };
  if (r.recruitment === 'complete') return { label: '분자 완성', cls: 'on' };
  return { label: '모집 중', cls: 'warn' };
}

export default function App({ backend }: { backend: Backend }) {
  const s = useSyncExternalStore((f) => backend.subscribe(f), () => backend.getState());
  const [viewer, setViewer] = useState<string | null>(s.meId);
  const [view, setView] = useState<View>({ k: 'home' });
  const [toast, setToast] = useState<{ t: string; err?: boolean } | null>(null);
  const [demo, setDemo] = useState(false);
  const tRef = useRef<number>();
  useEffect(() => { if (!viewer || !s.users[viewer]) setViewer(s.meId); }, [s.meId, viewer, s.users]);
  const show = (t: string, err?: boolean) => { setToast({ t, err }); window.clearTimeout(tRef.current); tRef.current = window.setTimeout(() => setToast(null), 2800); };
  // 요청은 한 번에 하나씩 순서대로 보낸다 (중복 클릭으로 같은 요청이 겹치지 않게)
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const run = (c: Command, ok?: string): Promise<DispatchResult> => {
    const p = chain.current.then(() => backend.dispatch(c)).then((r) => { if (!r.ok) show(r.error!, true); else if (ok) show(ok); return r; });
    chain.current = p.catch(() => undefined);
    return p;
  };
  const go = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

  const vid = viewer ?? s.meId;
  const me = vid ? s.users[vid] : null;
  let body: JSX.Element;
  if (!me) body = <Intro onStart={async () => { const r = await run({ type: 'createUser', intro: '', makeMe: true }); if (r.ok) setViewer(r.createdId!); }} />;
  else if (!me.elementLockedAt) body = <Onboarding />;
  else body = <Screen />;
  const onboarded = !!me?.elementLockedAt;

  return (
    <C.Provider value={{ s, viewer: vid ?? '', run, go, view, backend }}>
      <div className="shell">
        <header className="topbar">
          <button className="brand" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => go({ k: 'home' })}>
            <span className="brand-mark" aria-hidden="true"><Atom el="H" size={20} /><span className="bond" style={{ width: 8, height: 3, background: 'var(--ink-2)', display: 'inline-block' }} /><Atom el="O" size={24} /></span>
            분자친구
          </button>
          {onboarded && <NotifBell />}
        </header>
        {me && me.virtual && <div className="viewer-banner">시연 중: {me.demoLabel} 화면으로 보고 있어요. 시연 도구에서 내 화면으로 돌아갈 수 있어요.</div>}
        {body}
      </div>
      {onboarded && <TabBar />}
      {backend.mode === 'demo' && <button className="demo-fab" onClick={() => setDemo(true)}>시연 도구</button>}
      {demo && <DemoSheet onClose={() => setDemo(false)} setViewer={setViewer} reset={() => { backend.reset(); setViewer(null); go({ k: 'home' }); }} />}
      {toast && <div className={`toast${toast.err ? ' err' : ''}`} role="status">{toast.t}</div>}
    </C.Provider>
  );
}

function Screen() {
  const { view } = useApp();
  switch (view.k) {
    case 'home': return <Home />;
    case 'rooms': return <RoomsList />;
    case 'create': return <CreateRoom />;
    case 'auto': return <AutoMatch />;
    case 'room': return <RoomDetail id={view.id} />;
    case 'collection': return <Collection />;
    case 'card': return <CardDetail mol={view.mol} />;
    case 'public': return <PublicPreview />;
    case 'profile': return <Profile />;
    case 'element': return <ElementPage el={view.el} />;
    case 'table': return <PeriodicTable initial={view.el} />;
  }
}

function TabBar() {
  const { view, go } = useApp();
  const items: [View['k'][], string, 'home' | 'search' | 'table' | 'cards' | 'user', View][] = [
    [['home', 'auto'], '홈', 'home', { k: 'home' }], [['rooms', 'create', 'room'], '분자방', 'search', { k: 'rooms' }],
    [['table', 'element'], '주기율표', 'table', { k: 'table' }],
    [['collection', 'card', 'public'], '컬렉션', 'cards', { k: 'collection' }], [['profile'], '내 정보', 'user', { k: 'profile' }],
  ];
  return (
    <nav className="tabs" aria-label="주요 메뉴"><div className="tabs-inner">
      {items.map(([ks, label, ic, v]) => (
        <button key={label} className={`tab${ks.includes(view.k) ? ' on' : ''}`} onClick={() => go(v)} aria-current={ks.includes(view.k) ? 'page' : undefined}>
          <Icon name={ic} />{label}
        </button>
      ))}
    </div></nav>
  );
}

function NotifBell() {
  const { s, viewer, run, go } = useApp();
  const [open, setOpen] = useState(false);
  const mine = s.notifications.filter((n) => n.userId === viewer).slice().reverse();
  const unread = mine.filter((n) => !n.readAt).length;
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn sm ghost" onClick={() => { setOpen(!open); if (!open && unread) run({ type: 'readNotifications', actor: viewer }); }} aria-expanded={open}>
        알림 {unread > 0 && <span className="chip on">{unread}</span>}
      </button>
      {open && (
        <div className="panel" style={{ position: 'absolute', right: 0, top: 46, width: 'min(320px, calc(100vw - 32px))', zIndex: 12, maxHeight: 360, overflowY: 'auto', boxShadow: '0 10px 30px rgb(0 0 0 / .15)' }}>
          {mine.length === 0 && <p className="muted small">아직 알림이 없어요.</p>}
          {mine.slice(0, 20).map((n) => (
            <button key={n.id} className="notif" style={{ background: 'none', border: 'none', textAlign: 'left', cursor: n.roomId ? 'pointer' : 'default', padding: 0 }}
              onClick={() => { if (n.roomId) { go({ k: 'room', id: n.roomId }); setOpen(false); } }}>
              <span className={`dot${n.readAt ? ' read' : ''}`} aria-hidden="true" />
              <span className="grow"><span>{n.text}</span><br /><span className="muted small">{fmtTime(n.createdAt)}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── 1. 소개 ─────────
function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <div className="hero-model" aria-hidden="true">
          <Atom el="H" size={44} /><span className="bond" style={{ width: 22, height: 4, background: 'var(--ink-2)' }} />
          <Atom el="O" size={64} /><span className="bond" style={{ width: 22, height: 4, background: 'var(--ink-2)' }} />
          <Atom el="H" size={44} />
        </div>
        <h1>나를 닮은 원소로,<br />실제 분자만큼 모여 친구가 돼요</h1>
        <p className="muted">같은 학교 학생들이 원소 하나씩을 맡아 2~6명의 분자를 이뤄요. 서로 다른 성향이 만나 채워 주는 게 이 서비스의 재미예요.</p>
      </section>
      <div className="stack">
        {[
          ['1', '나의 원소 찾기', '테스트로 추천을 받고, 원소 설명을 비교해서 직접 골라요. 한 번 확정하면 바꿀 수 없어요.'],
          ['2', '분자방에 모이기', '물(H₂O)이라면 수소 두 명과 산소 한 명. 실제 분자의 자리에 맞춰 방을 찾거나 자동 매칭해요.'],
          ['3', '만나고 카드 모으기', '실제로 만난 사람들의 구성이 진짜 분자라면 그 분자 카드를 받아요.'],
        ].map(([n, t, d]) => (
          <div key={n} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
            <span className="mono muted" style={{ fontSize: 13, paddingTop: 2 }}>{n}</span>
            <div className="stack-s grow"><h3>{t}</h3><p className="muted small">{d}</p></div>
          </div>
        ))}
      </div>
      <p className="small muted">{METAPHOR_NOTICE}</p>
      <button className="btn primary block" onClick={onStart}>내 원소 찾기 시작</button>
    </div>
  );
}

// ───────── 2~3. 테스트 → 비교 → 확정 ─────────
function Onboarding() {
  const { s, viewer, run } = useApp();
  const attempts = s.quizAttempts.filter((a) => a.userId === viewer);
  const [phase, setPhase] = useState<'quiz' | 'choose'>(attempts.length ? 'choose' : 'quiz');
  if (phase === 'quiz') return <Quiz onDone={async (answers) => { const r = await run({ type: 'recordQuiz', actor: viewer, answers }); if (r.ok) setPhase('choose'); }} onSkip={attempts.length ? () => setPhase('choose') : undefined} />;
  return <Choose onRetake={() => setPhase('quiz')} />;
}

function Quiz({ onDone, onSkip }: { onDone: (a: Record<string, number>) => void; onSkip?: () => void }) {
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, number>>({});
  const q = QUESTIONS[i];
  const pick = (idx: number) => {
    const next = { ...ans, [q.id]: idx }; setAns(next);
    if (i < QUESTIONS.length - 1) setTimeout(() => setI(i + 1), 160); else onDone(next);
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack-s">
        <div className="row between"><span className="eyebrow">{CONTEXT_LABEL[q.context]}</span><span className="mono small muted">{i + 1} / {QUESTIONS.length}</span></div>
        <div className="progress" aria-hidden="true"><div style={{ width: `${((i + (ans[q.id] !== undefined ? 1 : 0)) / QUESTIONS.length) * 100}%` }} /></div>
      </div>
      <h2>{q.text}</h2>
      <div className="stack-s" role="radiogroup">
        {q.options.map((o, idx) => (
          <button key={idx} className={`option${ans[q.id] === idx ? ' sel' : ''}`} role="radio" aria-checked={ans[q.id] === idx} onClick={() => pick(idx)}>{o.text}</button>
        ))}
      </div>
      <div className="row between">
        <button className="btn ghost sm" disabled={i === 0} onClick={() => setI(i - 1)}>이전 문항</button>
        {onSkip && <button className="btn ghost sm" onClick={onSkip}>이전 결과로 돌아가기</button>}
      </div>
      <p className="small muted">친구들과 있을 때의 모습에 가장 큰 비중을 둬요. 결과는 추천일 뿐이고 원소는 직접 고르게 돼요.</p>
    </div>
  );
}

function ElementDetail({ el }: { el: ElementId }) {
  const e = ELEMENTS[el];
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        <Atom el={el} size={56} />
        <div className="stack-s grow"><h2>{e.name} <span className="mono muted" style={{ fontSize: 16 }}>{e.symbol}</span></h2><p className="small muted">{e.factual}</p></div>
      </div>
      <p>{e.personality}</p>
      <div className="stack-s"><h3>친구 사이에서</h3><ul className="plain">{e.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <div className="stack-s"><h3>어려울 수 있는 점</h3><ul className="plain">{e.difficulties.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <div className="stack-s">
        <h3>다른 원소와는</h3>
        {usableElements().flatMap((o) => pairContent(el, o).map((p, i) => (
          <div key={`${o}${i}`} className={`pair ${p.kind}`}>
            <div className="row"><Atom el={o} size={22} /><span className="chip">{p.kind === 'clash' ? '상극' : '보완'}</span><strong>{p.title}</strong></div>
            <p className="small" style={{ marginTop: 4 }}>{p.body}</p>
            <p className="small muted">{p.chemistryContext}</p>
          </div>
        )))}
        <p className="small muted">상극 설명은 재미를 위한 세계관이에요. 어떤 원소든 목표 분자에 자리가 있으면 함께할 수 있어요.</p>
      </div>
    </div>
  );
}

function Choose({ onRetake }: { onRetake: () => void }) {
  const { s, viewer, run, go } = useApp();
  const last = s.quizAttempts.filter((a) => a.userId === viewer).at(-1)!;
  const ranking = useMemo(() => scoreQuiz(last.answers, usableElements()).ranking, [last]);
  const [sel, setSel] = useState<ElementId>(last.recommended);
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [intro, setIntro] = useState(s.users[viewer].intro);
  const lock = async () => {
    const a = await run({ type: 'updateIntro', actor: viewer, intro });
    if (!a.ok) return;
    const r = await run({ type: 'lockElement', actor: viewer, elementId: sel, acknowledged: ack }, `${j(ELEMENTS[sel].name, '으로/로')} 확정했어요.`);
    if (r.ok) go({ k: 'home' });
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack-s">
        <span className="eyebrow">테스트 결과</span>
        <h1>추천 원소는 {j(ELEMENTS[last.recommended].name, '이에요/예요')}</h1>
        <p className="muted small">다른 원소 설명도 비교해 보고 직접 골라 주세요. 추천과 달라도 괜찮아요.</p>
      </div>
      <div className="el-tabs" role="tablist">
        {ranking.map((el) => (
          <button key={el} role="tab" aria-selected={sel === el} className={`el-tab${sel === el ? ' sel' : ''}`} onClick={() => { setSel(el); setConfirming(false); }}>
            <Atom el={el} size={34} /><span>{ELEMENTS[el].name}</span>{el === last.recommended && <span className="rec">추천</span>}
          </button>
        ))}
      </div>
      <div className="panel"><ElementDetail el={sel} /></div>
      {!confirming ? (
        <div className="stack-s">
          <button className="btn primary block" onClick={() => setConfirming(true)}>{j(ELEMENTS[sel].name, '으로/로')} 할게요</button>
          <button className="btn ghost block" onClick={onRetake}>테스트 다시 보기</button>
        </div>
      ) : (
        <div className="panel warn">
          <h2>{j(ELEMENTS[sel].name, '을/를')} 내 원소로 확정할까요?</h2>
          <p className="small">확정하면 계정을 유지하는 동안 원소를 바꿀 수 없어요. 바꾸려면 탈퇴 후 다시 가입해야 해요.</p>
          <label className="stack-s" htmlFor="intro-in">
            <span className="small" style={{ fontWeight: 600 }}>한 줄 소개 (방에서 원소와 함께 이것만 보여요)</span>
            <input id="intro-in" className="input" maxLength={INTRO_MAX} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="예: 조용한 카페에서 수다 떠는 거 좋아해요" />
            <span className="small muted mono">{intro.length}/{INTRO_MAX}</span>
          </label>
          <label className="check" htmlFor="ack-in"><input id="ack-in" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span className="small">원소를 다시 바꿀 수 없다는 걸 이해했어요.</span></label>
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirming(false)}>다시 고를래요</button>
            <button className="btn primary grow" disabled={!ack || !intro.trim()} onClick={lock}>확정하기</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── 4. 홈 ─────────
function Home() {
  const { s, viewer, run, go } = useApp();
  const me = s.users[viewer];
  const el = me.elementId!;
  const commit = recruitingCommitments(s, viewer);
  const conflict = hasConflict(s, viewer);
  const myRooms = Object.values(s.rooms).filter((r) => isMember(s, r.id, viewer)).sort((a, b) => b.createdAt - a.createdAt);
  const pastRooms = Object.values(s.rooms).filter((r) => !isMember(s, r.id, viewer) && s.members.some((m) => m.roomId === r.id && m.userId === viewer) && r.closedAt);
  const busy = commit.rooms.length > 0 || commit.queued;
  const auto = async () => {
    const r = await run({ type: 'startAutoMatch', actor: viewer });
    if (!r.ok) return;
    if (r.info === 'queued') go({ k: 'auto' }); else go({ k: 'room', id: r.createdId! });
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Atom el={el} size={60} />
        <div className="stack-s grow">
          <span className="eyebrow">나의 원소</span>
          <h2>{ELEMENTS[el].name} <span className="mono muted" style={{ fontSize: 15 }}>{el}</span></h2>
          <p className="small muted">“{me.intro}”</p>
        </div>
      </div>
      {conflict && (
        <div className="panel warn">
          <h3>모집방이 두 곳 겹쳐 있어요</h3>
          <p className="small">첫 만남 전에 다시 모집을 시작한 방이 있어요. 모집 중인 방은 한 곳만 남길 수 있어요. 남길 방을 골라 주세요. 고르지 않은 방에서는 나가게 돼요.</p>
          {commit.rooms.map((rid) => (
            <button key={rid} className="btn block" onClick={() => run({ type: 'resolveConflict', actor: viewer, keepRoomId: rid }, '한 곳만 남겼어요.')}>{molName(s.rooms[rid].targetMoleculeId)} 방에 남기</button>
          ))}
        </div>
      )}
      <div className="stack-s">
        <button className="btn primary block" disabled={busy} onClick={auto}>자동 매칭 시작</button>
        <button className="btn block" onClick={() => go({ k: 'rooms' })}>분자방 직접 찾기</button>
        {commit.queued && <button className="btn ghost block" onClick={() => go({ k: 'auto' })}>자동 매칭 대기 중 · 상태 보기</button>}
        {!commit.queued && commit.rooms.length > 0 && !conflict && <p className="small muted">모집 중인 방이 있어서 새 모집에 참여할 수 없어요. 모집방은 한 곳만 참여할 수 있어요.</p>}
      </div>
      <section className="stack">
        <div className="section-title"><h2>참여 중인 방</h2><span className="mono small muted">{myRooms.length}</span></div>
        {myRooms.length === 0 && <div className="panel flat"><p className="muted small">아직 들어간 방이 없어요. 자동 매칭을 시작하거나 방을 찾아보세요.</p></div>}
        {myRooms.map((r) => <RoomCard key={r.id} room={r} compact />)}
        {pastRooms.length > 0 && <p className="small muted">종료됐거나 나온 방 {pastRooms.length}곳은 내 정보에서 볼 수 있어요.</p>}
      </section>
      <button className="btn ghost block" onClick={() => go({ k: 'collection' })}>내 분자 컬렉션 · 카드 {s.cards.filter((c) => c.userId === viewer).length}장</button>
    </div>
  );
}

function RoomCard({ room, compact }: { room: Room; compact?: boolean }) {
  const { s, viewer, go } = useApp();
  const m = moleculeById(room.targetMoleculeId)!;
  const mems = activeMembers(s, room.id);
  const st = roomStatus(room);
  const me = s.users[viewer];
  const vac = vacancies(m.atomCounts, roomCounts(s, room.id));
  const canIn = isRecruitingOpen(room) && !isMember(s, room.id, viewer) && (vac[me.elementId!] ?? 0) > 0;
  return (
    <button className="panel roomcard" onClick={() => go({ k: 'room', id: room.id })}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <MolTitle id={room.targetMoleculeId} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {!compact && isRecruitingOpen(room) && <span className={`chip ${canIn ? 'on' : ''}`}>{canIn ? `${ELEMENTS[me.elementId!].name} 자리 있음` : '내 자리 없음'}</span>}
        </div>
      </div>
      <MoleculeStrip formula={m.formula} target={m.atomCounts} members={mems} meId={viewer} size={32} />
      <div className="row small muted">
        <span className="mono">{mems.length}/{m.totalAtoms}명</span><span>·</span>
        <span>{room.origin === 'automatic' ? '자동 매칭 방 · 바로 채팅' : room.chatPolicy === 'immediate' ? '입장하면 바로 채팅' : '완성되면 채팅'}</span>
        {room.originalMoleculeId !== room.targetMoleculeId && <><span>·</span><span>처음 목표 {moleculeById(room.originalMoleculeId)!.formula}</span></>}
      </div>
      {!compact && (
        <div className="stack-s">
          {mems.map((mm) => (
            <div key={mm.userId} className="row small" style={{ flexWrap: 'nowrap' }}><Atom el={mm.elementSnapshot} size={20} /><span className="grow" style={{ overflowWrap: 'anywhere' }}>{s.users[mm.userId].intro}</span></div>
          ))}
        </div>
      )}
    </button>
  );
}

// ───────── 5. 분자방 목록 ─────────
function RoomsList() {
  const { s, viewer, go } = useApp();
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const joinable = joinableRoomsFor(s, viewer);
  const all = Object.values(s.rooms).filter(isRecruitingOpen);
  const list = (tab === 'mine' ? joinable : all).sort((a, b) => b.createdAt - a.createdAt);
  const el = s.users[viewer].elementId!;
  return (
    <div className="stack">
      <div className="row between"><h1>분자방</h1><button className="btn primary sm" onClick={() => go({ k: 'create' })}>새 방 만들기</button></div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>{ELEMENTS[el].name} 자리 있는 방 {joinable.length}</button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>모집 중 전체 {all.length}</button>
      </div>
      {list.length === 0 && <div className="panel flat"><p className="small muted">지금은 {tab === 'mine' ? `${ELEMENTS[el].name} 자리가 남은 방이 없어요. 새 방을 만들거나 자동 매칭으로 기다려 보세요.` : '모집 중인 방이 없어요.'}</p></div>}
      {list.map((r) => <RoomCard key={r.id} room={r} />)}
    </div>
  );
}

// ───────── 6. 방 만들기 ─────────
function CreateRoom() {
  const { s, viewer, run, go } = useApp();
  const el = s.users[viewer].elementId!;
  const cands = moleculesWith(el).sort((a, b) => a.totalAtoms - b.totalAtoms);
  const [mol, setMol] = useState(cands[0]?.id ?? '');
  const [policy, setPolicy] = useState<'immediate' | 'afterComplete'>('immediate');
  const [days, setDays] = useState(s.config.defaultRecruitDays);
  const groups = [...new Set(cands.map((m) => m.totalAtoms))];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <button className="back" onClick={() => go({ k: 'rooms' })}>← 분자방</button>
      <h1>어떤 분자를 만들까요?</h1>
      <p className="small muted">이온 결정은 결정 속 화학식 단위의 원자 수만큼 모여요. 예를 들어 소금 NaCl은 2명이에요.</p>
      <p className="small muted">{j(ELEMENTS[el].name, '이/가')} 들어갈 수 있는 분자만 보여요. 나는 방장으로 원자 한 자리를 차지해요.</p>
      {groups.map((n) => (
        <section key={n} className="stack-s">
          <span className="eyebrow">{n}명</span>
          <div className="stack-s">
            {cands.filter((m) => m.totalAtoms === n).map((m) => (
              <Fragment key={m.id}>
              <button className={`option${mol === m.id ? ' sel' : ''}`} onClick={() => setMol(m.id)} aria-pressed={mol === m.id}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="row"><Formula f={m.formula} style={{ fontSize: 18, minWidth: 74 }} /><span>{m.name}</span>{m.kind === 'ionic' && <span className="chip">이온 결정</span>}</span>
                  <MoleculeStrip formula={m.formula} target={m.atomCounts} members={[]} size={18} labels={false} />
                </div>
              </button>
              {mol === m.id && <div className="panel" style={{ padding: 10 }}><Molecule3D id={m.id} height={150} label={m.name} /></div>}
              </Fragment>
            ))}
          </div>
        </section>
      ))}
      <section className="stack-s">
        <h3>채팅은 언제부터?</h3>
        <div className="seg">
          <button className={policy === 'immediate' ? 'on' : ''} onClick={() => setPolicy('immediate')} aria-pressed={policy === 'immediate'}>입장하면 바로</button>
          <button className={policy === 'afterComplete' ? 'on' : ''} onClick={() => setPolicy('afterComplete')} aria-pressed={policy === 'afterComplete'}>분자 완성 후</button>
        </div>
      </section>
      <section className="stack-s">
        <label htmlFor="days-in"><h3>모집 기한</h3></label>
        <select id="days-in" className="input" value={days} onChange={(e) => setDays(+e.target.value)}>
          {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d}일</option>)}
        </select>
      </section>
      <button className="btn primary block" disabled={!mol} onClick={async () => { const r = await run({ type: 'createRoom', actor: viewer, moleculeId: mol, chatPolicy: policy, recruitDays: days }, '방을 만들었어요.'); if (r.ok) go({ k: 'room', id: r.createdId! }); }}>
        {mol && moleculeById(mol)!.formula} 방 만들기
      </button>
    </div>
  );
}

// ───────── 7. 자동 매칭 대기 ─────────
function AutoMatch() {
  const { s, viewer, run, go, backend } = useApp();
  const q = waitingEntry(s, viewer);
  const last = s.queue.filter((x) => x.userId === viewer).at(-1);
  const el = s.users[viewer].elementId!;
  useEffect(() => {
    if (!q && last?.status === 'matched') {
      const rid = s.members.filter((m) => m.userId === viewer && m.leftAt === null).sort((a, b) => b.joinedAt - a.joinedAt)[0]?.roomId;
      if (rid) go({ k: 'room', id: rid });
    }
  }, [q, last?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q) return (
    <div className="stack"><h1>자동 매칭</h1><div className="panel flat"><p className="small muted">대기 중이 아니에요.</p></div><button className="btn" onClick={() => go({ k: 'home' })}>홈으로</button></div>
  );
  const waiting = s.queue.filter((x) => x.status === 'waiting').length;
  return (
    <div className="stack" style={{ gap: 20, alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
      <span className="pulse"><Atom el={el} size={88} /></span>
      <h1>결합할 원자를 찾는 중</h1>
      <p className="muted">{ELEMENTS[el].name} 자리가 있는 모집방이 아직 없어서 대기열에 들어갔어요. 함께 기다리는 사람들로 실제 분자가 만들어지면 바로 방이 열리고 알려 드려요.</p>
      <div className="row small muted" style={{ justifyContent: 'center' }}><span className="mono">대기 {waiting}명</span><span>·</span><span>{fmtTime(q.enteredAt)}부터</span></div>
      <button className="btn danger" onClick={async () => { const r = await run({ type: 'cancelAutoMatch', actor: viewer }, '매칭을 취소했어요.'); if (r.ok) go({ k: 'home' }); }}>매칭 취소</button>
      {backend.mode === 'demo' && <p className="small muted">시연 도구에서 가상 사용자를 대기열에 넣어 매칭을 확인할 수 있어요.</p>}
    </div>
  );
}

// ───────── 8~9. 방 상세 ─────────
function RoomDetail({ id }: { id: string }) {
  const { s, viewer, run, go } = useApp();
  const r = s.rooms[id];
  const [confirmLeave, setConfirmLeave] = useState<'' | 'leave' | 'close'>('');
  if (!r) return <p>방을 찾을 수 없어요.</p>;
  const m = moleculeById(r.targetMoleculeId)!;
  const mems = activeMembers(s, id);
  const member = isMember(s, id, viewer);
  const st = roomStatus(r);
  const me = s.users[viewer];
  const vac = vacancies(m.atomCounts, roomCounts(s, id));
  const myMem = mems.find((x) => x.userId === viewer);
  const blocked = recruitingCommitments(s, viewer);
  const join = () => run({ type: 'joinRoom', actor: viewer, roomId: id }, '방에 합류했어요.');
  return (
    <div className="stack" style={{ gap: 16 }}>
      <button className="back" onClick={() => go({ k: member ? 'home' : 'rooms' })}>← {member ? '홈' : '분자방'}</button>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <MolTitle id={r.targetMoleculeId} big />
        <div className="stack-s" style={{ alignItems: 'flex-end' }}>
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {r.origin === 'automatic' && <span className="chip">자동 매칭 방</span>}
        </div>
      </div>
      {r.originalMoleculeId !== r.targetMoleculeId && <p className="small muted">처음 목표는 {molName(r.originalMoleculeId)}였어요.</p>}
      {r.firstMeetingConfirmedAt && (
        <p className="small">첫 만남 결과: {r.firstMeetingMoleculeId ? <strong>{molName(r.firstMeetingMoleculeId)} 카드 획득</strong> : '유효한 분자가 아니어서 카드 없이 기록만 남았어요'}</p>
      )}
      <div className="panel">
        <Molecule3D id={m.id} height={170} label={m.name} />
        <MoleculeStrip formula={m.formula} target={m.atomCounts} members={mems} meId={viewer} size={44} />
        {isRecruitingOpen(r) && (
          <p className="small muted">남은 자리: {Object.entries(vac).map(([e, n]) => `${ELEMENTS[e as ElementId].name} ${n}`).join(', ') || '없음'} · 마감 {fmtTime(r.deadline)}</p>
        )}
        <div className="stack-s">
          {mems.map((mm) => (
            <div key={mm.userId} className="memberline">
              <Atom el={mm.elementSnapshot} size={30} me={mm.userId === viewer} />
              <div className="who grow stack-s" style={{ gap: 0 }}>
                <span className="row small" style={{ gap: 6 }}>
                  <strong>{ELEMENTS[mm.elementSnapshot].name}</strong>
                  {mm.userId === r.hostId && <span className="chip">방장</span>}
                  {mm.userId === viewer && <span className="chip on">나</span>}
                </span>
                <span className="small" style={{ overflowWrap: 'anywhere' }}>{s.users[mm.userId].intro}</span>
              </div>
            </div>
          ))}
        </div>
        {myMem?.reason && (
          <div className="pair complement"><p className="small"><strong>자동 매칭 추천 이유</strong></p><p className="small">{myMem.reason.mood}</p><p className="small muted">{myMem.reason.behavior}</p></div>
        )}
        {!member && isRecruitingOpen(r) && (
          (vac[me.elementId!] ?? 0) > 0
            ? <button className="btn primary block" disabled={blocked.rooms.length > 0 || blocked.queued} onClick={join}>{ELEMENTS[me.elementId!].name} 자리로 합류</button>
            : <p className="small muted">이 방에는 {ELEMENTS[me.elementId!].name} 자리가 없어요.</p>
        )}
        {!member && isRecruitingOpen(r) && (blocked.rooms.length > 0 || blocked.queued) && (vac[me.elementId!] ?? 0) > 0 && (
          <p className="small muted">{blocked.queued ? '자동 매칭 대기 중이라 직접 합류할 수 없어요.' : '이미 다른 모집방에 있어요. 모집방은 한 곳만 참여할 수 있어요.'}</p>
        )}
      </div>

      {member && <Proposals room={r} />}
      {member && <MeetingPanel key={`${viewer}:${mems.map((x) => x.userId).join(',')}`} room={r} />}
      {(member || r.closedAt) && <Chat room={r} />}

      {member && !r.closedAt && (
        <div className="stack-s">
          {confirmLeave === '' && (
            <div className="row">
              <button className="btn danger grow" onClick={() => setConfirmLeave('leave')}>방 나가기</button>
              {r.hostId === viewer && <button className="btn danger grow" onClick={() => setConfirmLeave('close')}>방 종료</button>}
            </div>
          )}
          {confirmLeave !== '' && (
            <div className="panel warn">
              <p className="small">{confirmLeave === 'leave'
                ? (r.firstMeetingConfirmedAt ? '나가도 남은 사람들의 방은 그대로 유지돼요.' : r.recruitment === 'complete' ? '첫 만남 전이라 내가 나가면 이 방은 빈자리를 다시 모집해요.' : '나가면 내 자리가 빈자리로 돌아가요.')
                : '방을 종료하면 채팅과 모집이 모두 끝나요. 이미 얻은 카드와 만남 기록은 그대로 남아요.'}</p>
              <div className="row">
                <button className="btn ghost" onClick={() => setConfirmLeave('')}>취소</button>
                <button className="btn danger grow" onClick={async () => {
                  const ok = await (confirmLeave === 'leave' ? run({ type: 'leaveRoom', actor: viewer, roomId: id }, '방에서 나왔어요.') : run({ type: 'closeRoom', actor: viewer, roomId: id }, '방을 종료했어요.'));
                  setConfirmLeave(''); if (ok.ok && confirmLeave === 'leave') go({ k: 'home' });
                }}>{confirmLeave === 'leave' ? '나가기' : '종료하기'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Proposals({ room }: { room: Room }) {
  const { s, viewer, run } = useApp();
  const p = openProposal(s, room.id);
  const [open, setOpen] = useState(false);
  const counts = roomCounts(s, room.id);
  const exact = activeMembers(s, room.id).length >= 2 ? exactMatches(counts) : [];
  const supers = supersetCandidates(counts, room.targetMoleculeId);
  if (!isRecruitingOpen(room) && !p) return null;
  return (
    <div className="panel">
      {p ? (
        <>
          <span className="eyebrow">{p.reason === 'deadline' ? '모집 마감' : p.reason === 'departure' ? '구성원 이탈' : '구성원 제안'}</span>
          <h2>{p.type === 'earlyComplete' ? '반응을 종결시키겠습니까?' : '목표 분자를 바꿀까요?'}</h2>
          <p className="small">{p.type === 'earlyComplete'
            ? `지금 모인 구성 그대로 ${j(molName(p.targetMoleculeId), '으로/로')} 확정해요.`
            : `목표를 ${j(molName(p.targetMoleculeId), '으로/로')} 바꾸고 남은 자리를 더 모집해요. 지금 있는 사람은 아무도 빠지지 않아요.`}
            {p.reason === 'deadline' && ' 한 명이라도 반대하면 방이 종료돼요.'}</p>
          <div className="stack-s">
            {p.electorate.map((uid) => {
              const mm = s.members.find((x) => x.roomId === room.id && x.userId === uid)!;
              const v = p.votes[uid];
              return <div key={uid} className="row small"><Atom el={mm.elementSnapshot} size={20} /><span className="grow">{uid === viewer ? '나' : s.users[uid].intro}</span><span className={`chip ${v === 'yes' ? 'ok' : v === 'no' ? 'bad' : ''}`}>{v === 'yes' ? '동의' : v === 'no' ? '반대' : '응답 대기'}</span></div>;
            })}
          </div>
          <p className="small muted mono">응답 기한 {fmtTime(p.expiresAt)}</p>
          {p.electorate.includes(viewer) && !p.votes[viewer] && (
            <div className="row">
              <button className="btn grow" onClick={() => run({ type: 'vote', actor: viewer, proposalId: p.id, choice: 'no' })}>반대</button>
              <button className="btn primary grow" onClick={() => run({ type: 'vote', actor: viewer, proposalId: p.id, choice: 'yes' }, '동의했어요.')}>동의</button>
            </div>
          )}
        </>
      ) : (
        <>
          <button className="row between" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }} onClick={() => setOpen(!open)} aria-expanded={open}>
            <h3>모집 바꾸기</h3><span className="muted small">{open ? '접기' : `조기 완성 ${exact.length} · 목표 변경 ${supers.length}`}</span>
          </button>
          {open && (
            <div className="stack">
              <div className="stack-s">
                <p className="small"><strong>조기 완성</strong> <span className="muted">지금 모인 원소 구성과 정확히 같은 분자</span></p>
                {exact.length === 0 && <p className="small muted">지금 구성과 정확히 같은 분자는 없어요.</p>}
                {exact.map((x) => <button key={x.id} className="btn block" onClick={() => run({ type: 'propose', actor: viewer, roomId: room.id, kind: 'earlyComplete', moleculeId: x.id }, '투표를 열었어요.')}>{x.formula} {j(x.name, '으로/로')} 반응 종결 제안</button>)}
              </div>
              <div className="stack-s">
                <p className="small"><strong>목표 변경</strong> <span className="muted">지금 구성원을 모두 담는 더 큰 분자</span></p>
                {supers.length === 0 && <p className="small muted">바꿀 수 있는 분자가 없어요.</p>}
                {supers.slice(0, 6).map((x) => <button key={x.id} className="btn block" onClick={() => run({ type: 'propose', actor: viewer, roomId: room.id, kind: 'retarget', moleculeId: x.id }, '투표를 열었어요.')}>{x.formula} {j(`${x.name} (${x.totalAtoms}명)`, '으로/로')} 바꾸기 제안</button>)}
              </div>
              <p className="small muted">현재 구성원 전원이 동의해야 바뀌어요.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeetingPanel({ room }: { room: Room }) {
  const { s, viewer, run } = useApp();
  const pm = pendingMeeting(s, room.id);
  const last = s.meetings.filter((m) => m.roomId === room.id).at(-1);
  const isHost = room.hostId === viewer;
  const mems = activeMembers(s, room.id);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>(mems.map((m) => m.userId));
  if (room.closedAt || room.firstMeetingConfirmedAt || room.recruitment !== 'complete') return null;
  const preview = exactMatches(countsOf(mems.filter((m) => sel.includes(m.userId)).map((m) => m.elementSnapshot)))[0];
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div className="panel">
      <span className="eyebrow">첫 만남 기록</span>
      {pm && !picking ? (
        <>
          <h3>실제 참석 확인</h3>
          <p className="small">{pm.matchedMoleculeId ? <>참석 구성이 <strong>{molName(pm.matchedMoleculeId)}</strong>{josaOf(molName(pm.matchedMoleculeId), '이에요/예요')}. 모두 확인하면 이 카드를 받아요.</> : '참석 구성이 유효한 분자가 아니에요. 모두 확인하면 카드 없이 만남 기록만 남아요.'}</p>
          <div className="stack-s">
            {pm.attendees.map((a) => {
              const c = pm.confirmations[a.userId];
              return <div key={a.userId} className="row small"><Atom el={a.element} size={20} /><span className="grow">{a.userId === viewer ? '나' : a.intro}</span><span className={`chip ${c === 'confirmed' ? 'ok' : ''}`}>{c === 'confirmed' ? '확인함' : '확인 대기'}</span></div>;
            })}
          </div>
          {mems.filter((m) => !pm.attendees.some((a) => a.userId === m.userId)).length > 0 && <p className="small muted">불참으로 표시된 분은 확인하지 않아도 되고 카드도 받지 않아요.</p>}
          {pm.attendees.some((a) => a.userId === viewer) && !pm.confirmations[viewer] && (
            <div className="row">
              <button className="btn grow" onClick={() => run({ type: 'respondMeeting', actor: viewer, meetingId: pm.id, response: 'reject' }, '방장에게 수정을 요청했어요.')}>목록이 달라요</button>
              <button className="btn primary grow" onClick={() => run({ type: 'respondMeeting', actor: viewer, meetingId: pm.id, response: 'confirm' }, '만남을 확인했어요.')}>실제로 만났어요</button>
            </div>
          )}
          {isHost && <button className="btn ghost sm" onClick={() => { setSel(pm.attendees.map((a) => a.userId)); setPicking(true); }}>참석자 수정 (기존 확인은 다시 받아요)</button>}
        </>
      ) : isHost && (!pm || picking) ? (
        <>
          {last?.status === 'rejected' && !picking && <p className="small" style={{ color: 'var(--warn)' }}>참석자 한 명이 목록이 다르다고 했어요. 실제 참석자를 다시 골라 주세요.</p>}
          <h3>만난 뒤, 실제로 온 사람을 골라 주세요</h3>
          <div className="stack-s">
            {mems.map((mm) => (
              <label key={mm.userId} className="check" htmlFor={`att-${mm.userId}`}>
                <input id={`att-${mm.userId}`} type="checkbox" checked={sel.includes(mm.userId)} onChange={() => toggle(mm.userId)} />
                <Atom el={mm.elementSnapshot} size={22} /><span className="small grow">{mm.userId === viewer ? '나' : s.users[mm.userId].intro}</span>
              </label>
            ))}
          </div>
          <p className="small">판정: {sel.length < 2 ? '두 명 이상 골라 주세요.' : preview ? <strong>{molName(preview.id)} · 카드 지급 대상</strong> : '유효한 분자가 아니에요 · 카드 없이 기록만'}</p>
          <div className="row">
            {picking && <button className="btn ghost" onClick={() => setPicking(false)}>취소</button>}
            <button className="btn primary grow" disabled={sel.length < 2} onClick={async () => { const r = await run({ type: 'proposeMeeting', actor: viewer, roomId: room.id, attendeeIds: sel }, '참석 확인을 요청했어요.'); if (r.ok) setPicking(false); }}>참석자에게 확인 요청</button>
          </div>
        </>
      ) : (
        <p className="small muted">{last?.status === 'rejected' ? '방장이 참석자 목록을 수정하는 중이에요.' : '만남 뒤 방장이 실제 참석자를 고르면 여기서 확인할 수 있어요. 날짜와 장소는 채팅에서 정해 주세요.'}</p>
      )}
    </div>
  );
}

function Chat({ room }: { room: Room }) {
  const { s, viewer, run } = useApp();
  const [txt, setTxt] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const msgs = s.messages.filter((m) => m.roomId === room.id);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [msgs.length]);
  const ok = canChat(s, room.id, viewer);
  const elOf = (uid: string) => s.members.find((m) => m.roomId === room.id && m.userId === uid)?.elementSnapshot ?? 'H';
  const reason = room.closedAt ? '종료된 방이에요.' : !isMember(s, room.id, viewer) ? '구성원만 채팅할 수 있어요.' : '분자가 완성되면 채팅이 열려요.';
  return (
    <div className="panel">
      <div className="section-title"><h3>방 채팅</h3><span className="small muted">개인 채팅·친구 추가는 없어요</span></div>
      <div className="chat" ref={ref}>
        {msgs.map((m) => m.senderId === null ? (
          <div key={m.id} className="msg sys"><div className="bubble">{m.body}</div></div>
        ) : (
          <div key={m.id} className={`msg${m.senderId === viewer ? ' mine' : ''}`}>
            {m.senderId !== viewer && <Atom el={elOf(m.senderId)} size={26} />}
            <div className="bubble"><span>{m.body}</span><br /><span className="small muted mono">{fmtTime(m.createdAt)}</span></div>
          </div>
        ))}
      </div>
      {ok ? (
        <form className="composer" onSubmit={async (e) => { e.preventDefault(); const r = await run({ type: 'sendMessage', actor: viewer, roomId: room.id, body: txt }); if (r.ok) setTxt(''); }}>
          <input id={`chat-${room.id}`} className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="메시지 보내기" aria-label="메시지" />
          <button className="btn primary" disabled={!txt.trim()}>보내기</button>
        </form>
      ) : <p className="small muted">{reason}</p>}
    </div>
  );
}

// ───────── 10~11. 컬렉션 ─────────
function Collection() {
  const { s, viewer, go } = useApp();
  const [tab, setTab] = useState<'cards' | 'nocard'>('cards');
  const cards = s.cards.filter((c) => c.userId === viewer).sort((a, b) => b.firstEarnedAt - a.firstEarnedAt);
  const nocard = s.records.filter((r) => r.userId === viewer && !r.moleculeId);
  return (
    <div className="stack">
      <div className="row between"><h1>컬렉션</h1><button className="btn sm" onClick={() => go({ k: 'public' })}>공개 화면 미리보기</button></div>
      <div className="seg">
        <button className={tab === 'cards' ? 'on' : ''} onClick={() => setTab('cards')}>분자 카드 {cards.length}</button>
        <button className={tab === 'nocard' ? 'on' : ''} onClick={() => setTab('nocard')}>카드 없는 만남 {nocard.length}</button>
      </div>
      {tab === 'cards' && (cards.length === 0
        ? <div className="panel flat"><p className="small muted">아직 카드가 없어요. 분자방에서 만나고 참석자 모두 확인하면 그 구성의 분자 카드를 받아요.</p></div>
        : <div className="cards">{cards.map((c) => {
            const m = moleculeById(c.moleculeId)!; const n = s.records.filter((r) => r.userId === viewer && r.moleculeId === c.moleculeId).length;
            return (
              <button key={c.moleculeId} className="panel mcard" onClick={() => go({ k: 'card', mol: c.moleculeId })}>
                <Formula f={m.formula} style={{ fontSize: 26 }} />
                <span className="small">{m.name}</span>
                <MoleculeStrip formula={m.formula} target={m.atomCounts} members={[]} size={14} labels={false} />
                <span className="row small muted"><span className="mono">만남 {n}회</span><span className={`chip ${c.visibility === 'public' ? 'on' : ''}`}>{c.visibility === 'public' ? '공개' : '비공개'}</span></span>
              </button>
            );
          })}</div>)}
      {tab === 'nocard' && (nocard.length === 0
        ? <div className="panel flat"><p className="small muted">참석 구성이 유효한 분자가 아니었던 만남이 여기 남아요.</p></div>
        : nocard.map((r) => <RecordRow key={r.id} recId={r.id} />))}
    </div>
  );
}

function RecordRow({ recId }: { recId: string }) {
  const { s, viewer, run } = useApp();
  const r = s.records.find((x) => x.id === recId)!;
  return (
    <div className="panel" style={{ gap: 8 }}>
      <div className="row between"><span className="small mono">{fmtDate(r.createdAt)}</span><span className="small muted">방 목표 {moleculeById(r.targetMoleculeId)!.formula}</span></div>
      <div className="stack-s">
        {r.companions.map((c, i) => <div key={i} className="row small" style={{ flexWrap: 'nowrap' }}><Atom el={c.element} size={20} /><span className="grow">{c.intro}</span></div>)}
      </div>
      <div className="row between">
        <span className="small muted">이 기록 공개</span>
        <div className="seg">
          <button className={r.visibility === 'private' ? 'on' : ''} onClick={() => run({ type: 'setRecordVisibility', actor: viewer, recordId: r.id, visibility: 'private' })}>비공개</button>
          <button className={r.visibility === 'public' ? 'on' : ''} onClick={() => run({ type: 'setRecordVisibility', actor: viewer, recordId: r.id, visibility: 'public' })}>공개</button>
        </div>
      </div>
    </div>
  );
}

function CardDetail({ mol }: { mol: string }) {
  const { s, viewer, run, go } = useApp();
  const c = s.cards.find((x) => x.userId === viewer && x.moleculeId === mol);
  const m = moleculeById(mol)!;
  if (!c) return <p>카드를 찾을 수 없어요.</p>;
  const recs = s.records.filter((r) => r.userId === viewer && r.moleculeId === mol).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ k: 'collection' })}>← 컬렉션</button>
      <div className="panel" style={{ alignItems: 'flex-start' }}>
        <Formula f={m.formula} className="formula xl" />
        <h2>{m.name}</h2>
        <span className="chip">{kindLabel(m)}</span>
        <div style={{ width: '100%' }}><Molecule3D id={m.id} height={240} label={m.name} /></div>
        <p className="small">{m.stabilityNote}</p>
        <p className="small muted mono">{m.sources.join(' · ')} · 처음 얻은 날 {fmtDate(c.firstEarnedAt)}</p>
        <div className="row between" style={{ width: '100%' }}>
          <span className="small">카드 공개</span>
          <div className="seg">
            <button className={c.visibility === 'private' ? 'on' : ''} onClick={() => run({ type: 'setCardVisibility', actor: viewer, moleculeId: mol, visibility: 'private' })}>비공개</button>
            <button className={c.visibility === 'public' ? 'on' : ''} onClick={() => run({ type: 'setCardVisibility', actor: viewer, moleculeId: mol, visibility: 'public' })}>공개</button>
          </div>
        </div>
      </div>
      <div className="section-title"><h2>함께한 만남</h2><span className="mono small muted">{recs.length}회</span></div>
      {recs.map((r) => <RecordRow key={r.id} recId={r.id} />)}
      <p className="small muted">기록에는 만난 시점의 원소와 한 줄 소개가 그대로 남아요.</p>
    </div>
  );
}

function PublicPreview() {
  const { s, viewer, go } = useApp();
  const me = s.users[viewer];
  const cards = s.cards.filter((c) => c.userId === viewer && c.visibility === 'public');
  const recs = s.records.filter((r) => r.userId === viewer && r.visibility === 'public');
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ k: 'collection' })}>← 컬렉션</button>
      <h1>다른 학생에게 보이는 화면</h1>
      <p className="small muted">공개로 설정한 카드와 기록만 보여요. 함께한 사람의 한 줄 소개는 그 사람의 동의 정책이 정해지기 전까지 보이지 않고, 원소만 보여요.</p>
      <div className="panel" style={{ flexDirection: 'row', alignItems: 'center' }}><Atom el={me.elementId!} size={44} /><div className="grow"><strong>{ELEMENTS[me.elementId!].name}</strong><p className="small">{me.intro}</p></div></div>
      {cards.length === 0 && recs.length === 0 && <div className="panel flat"><p className="small muted">공개한 카드나 기록이 없어요.</p></div>}
      {cards.length > 0 && <div className="cards">{cards.map((c) => { const m = moleculeById(c.moleculeId)!; return <div key={c.moleculeId} className="panel mcard"><Formula f={m.formula} style={{ fontSize: 24 }} /><span className="small">{m.name}</span></div>; })}</div>}
      {recs.map((r) => (
        <div key={r.id} className="panel" style={{ gap: 6 }}>
          <span className="small mono">{fmtDate(r.createdAt)} · {r.moleculeId ? moleculeById(r.moleculeId)!.formula : '카드 없는 만남'}</span>
          <div className="row">{r.companions.map((c, i) => <Atom key={i} el={c.element} size={24} />)}<span className="small muted">와 함께</span></div>
        </div>
      ))}
    </div>
  );
}

// ───────── 12. 내 정보 ─────────
function Profile() {
  const { s, viewer, run, go, backend } = useApp();
  const [out, setOut] = useState(false);
  const me = s.users[viewer];
  const [intro, setIntro] = useState(me.intro);
  const rooms = [...new Set(s.members.filter((m) => m.userId === viewer).map((m) => m.roomId))].map((id) => s.rooms[id]).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1>내 정보</h1>
      <div className="panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Atom el={me.elementId!} size={56} />
        <div className="stack-s grow">
          <h2>{ELEMENTS[me.elementId!].name}</h2>
          <p className="small muted">{fmtDate(me.elementLockedAt!)} 확정 · 원소는 바꿀 수 없어요. 바꾸려면 탈퇴 후 다시 가입해야 해요.</p>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go({ k: 'table', el: me.elementId! })}>주기율표에서 보기</button>
        </div>
      </div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run({ type: 'updateIntro', actor: viewer, intro }, '한 줄 소개를 바꿨어요.'); }}>
        <label htmlFor="intro-edit"><h3>한 줄 소개</h3></label>
        <input id="intro-edit" className="input" maxLength={INTRO_MAX} value={intro} onChange={(e) => setIntro(e.target.value)} />
        <div className="row between"><span className="small muted mono">{intro.length}/{INTRO_MAX}</span><button className="btn primary sm" disabled={intro.trim() === me.intro || !intro.trim()}>저장</button></div>
        <p className="small muted">이미 남은 만남 기록에는 그때의 소개가 유지돼요.</p>
      </form>
      <section className="stack-s">
        <h2>참여한 방</h2>
        {rooms.length === 0 && <p className="small muted">아직 없어요.</p>}
        {rooms.map((r) => {
          const st = roomStatus(r); const left = !isMember(s, r.id, viewer);
          return (
            <button key={r.id} className="panel roomcard" style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }} onClick={() => go({ k: 'room', id: r.id })}>
              <Formula f={moleculeById(r.targetMoleculeId)!.formula} className="formula grow" style={{ fontSize: 18 }} />
              {left && !r.closedAt && <span className="chip">나옴</span>}
              <span className={`chip ${st.cls}`}>{st.label}</span>
            </button>
          );
        })}
      </section>
      <p className="small muted">{METAPHOR_NOTICE}</p>
      {backend.signOut && <button className="btn block" disabled={out} onClick={async () => { setOut(true); await backend.signOut!(); location.reload(); }}>로그아웃</button>}
    </div>
  );
}

function ElementPage({ el }: { el: ElementId }) {
  const { go } = useApp();
  return <div className="stack"><button className="back" onClick={() => go({ k: 'profile' })}>← 내 정보</button><div className="panel"><ElementDetail el={el} /></div></div>;
}

// ───────── 시연 도구 ─────────
function DemoSheet({ onClose, setViewer, reset }: { onClose: () => void; setViewer: (id: string) => void; reset: () => void }) {
  const { s, viewer, run, view } = useApp();
  const [qEl, setQEl] = useState<ElementId>('H');
  const [confirmReset, setConfirmReset] = useState(false);
  const roomId = view.k === 'room' ? view.id : null;
  const r = roomId ? s.rooms[roomId] : null;
  const users = Object.values(s.users).filter((u) => u.elementLockedAt || !u.virtual);
  const newVirtual = async (el: ElementId) => (await run({ type: 'createUser', intro: `시연용 ${ELEMENTS[el].name} 친구`, elementId: el, virtual: true, demoLabel: `가상 ${Object.keys(s.users).length + 1} · ${el}` })).createdId!;
  const fillOne = async () => {
    if (!r) return;
    const vac = vacancies(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, r.id));
    const el = Object.keys(vac)[0] as ElementId | undefined;
    if (!el) return;
    const uid = await newVirtual(el);
    await run({ type: 'joinRoom', actor: uid, roomId: r.id }, `가상 ${j(ELEMENTS[el].name, '이/가')} 합류했어요.`);
  };
  const p = r ? openProposal(s, r.id) : undefined;
  const pm = r ? pendingMeeting(s, r.id) : undefined;
  const othersVote = async (choice: 'yes' | 'no') => {
    if (!p) return;
    const pending = p.electorate.filter((u) => u !== viewer && !p.votes[u]);
    if (choice === 'no') { if (pending[0]) run({ type: 'vote', actor: pending[0], proposalId: p.id, choice: 'no' }); return; }
    for (const u of pending) await run({ type: 'vote', actor: u, proposalId: p.id, choice: 'yes' });
  };
  const othersConfirm = async () => { if (pm) for (const a of pm.attendees) if (a.userId !== viewer && !pm.confirmations[a.userId]) await run({ type: 'respondMeeting', actor: a.userId, meetingId: pm.id, response: 'confirm' }); };
  const hostActs = () => r && r.hostId !== viewer && setViewer(r.hostId);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="시연 도구" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>시연 도구</h2><button className="btn sm" onClick={onClose}>닫기</button></div>
        <p className="small muted">서버 없이 이 기기에서만 동작하는 시연이에요. 다른 사람은 모두 가상 사용자이고, 아래 버튼은 각 가상 사용자 본인 자격으로 행동해요.</p>

        <div className="panel">
          <label htmlFor="viewer-sel"><h3>누구의 화면으로 볼까요</h3></label>
          <select id="viewer-sel" className="input" value={viewer} onChange={(e) => setViewer(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.virtual ? u.demoLabel : `나${u.elementId ? ` · ${u.elementId}` : ''}`} — {u.intro || '소개 없음'}</option>)}
          </select>
          {s.meId && viewer !== s.meId && <button className="btn sm" onClick={() => setViewer(s.meId!)}>내 화면으로 돌아가기</button>}
        </div>

        {r && (
          <div className="panel">
            <h3>지금 보는 방: {moleculeById(r.targetMoleculeId)!.formula}</h3>
            <div className="stack-s">
              <button className="btn block" disabled={!isRecruitingOpen(r)} onClick={fillOne}>빈자리 하나를 가상 사용자로 채우기</button>
              <button className="btn block" disabled={!isRecruitingOpen(r) || !!p} onClick={() => run({ type: 'expireRecruitment', roomId: r.id }, '모집 기한이 끝난 상황을 만들었어요.')}>모집 기한 끝내기</button>
              <button className="btn block" disabled={!p} onClick={() => othersVote('yes')}>투표: 다른 구성원 모두 동의</button>
              <button className="btn block" disabled={!p} onClick={() => othersVote('no')}>투표: 다른 구성원 한 명 반대</button>
              <button className="btn block" disabled={!p} onClick={() => p && run({ type: 'expireProposal', proposalId: p.id }, '응답 기한이 끝났어요.')}>투표 응답 기한 끝내기</button>
              <button className="btn block" disabled={!pm} onClick={othersConfirm}>만남: 다른 참석자 모두 확인</button>
              <button className="btn block" disabled={r.hostId === viewer} onClick={hostActs}>방장 화면으로 보기</button>
            </div>
          </div>
        )}

        <div className="panel">
          <h3>자동 매칭 대기열</h3>
          <p className="small muted">대기 중: {s.queue.filter((q) => q.status === 'waiting').map((q) => s.users[q.userId].elementId).join(', ') || '없음'}</p>
          <div className="row">
            <select id="queue-el" className="input grow" style={{ width: 'auto' }} value={qEl} onChange={(e) => setQEl(e.target.value as ElementId)} aria-label="원소">
              {usableElements().map((e) => <option key={e} value={e}>{ELEMENTS[e].name} {e}</option>)}
            </select>
            <button className="btn" onClick={async () => { const uid = await newVirtual(qEl); run({ type: 'startAutoMatch', actor: uid }, `가상 ${j(ELEMENTS[qEl].name, '이/가')} 자동 매칭을 시작했어요.`); }}>대기열에 넣기</button>
          </div>
        </div>

        <div className="panel">
          {!confirmReset ? <button className="btn danger block" onClick={() => setConfirmReset(true)}>시연 데이터 처음으로</button> : (
            <div className="stack-s"><p className="small">내 원소와 모든 방, 카드가 지워지고 처음 상태로 돌아가요.</p>
              <div className="row"><button className="btn ghost" onClick={() => setConfirmReset(false)}>취소</button><button className="btn danger grow" onClick={() => { reset(); onClose(); }}>초기화</button></div></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── 주기율표 ─────────
function PeriodicTable({ initial }: { initial?: string }) {
  const { s, viewer, go } = useApp();
  const mine = s.users[viewer].elementId!;
  const usable = usableElements() as string[];
  const [sel, setSel] = useState<string>(initial ?? mine);
  const cell = PERIODIC.find((c) => c.symbol === sel)!;
  const active = usable.includes(sel);
  const el = sel as ElementId;
  const mols = active ? moleculesWith(el).sort((a, b) => a.totalAtoms - b.totalAtoms) : [];
  const openRooms = active ? Object.values(s.rooms).filter((r) => isRecruitingOpen(r) && (vacancies(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, r.id))[el] ?? 0) > 0).length : 0;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack-s">
        <h1>주기율표</h1>
        <p className="small muted">원소를 눌러 성격 비유와 잘 맞는 원소를 볼 수 있어요. 색이 있는 칸이 지금 분자친구에서 고를 수 있는 원소예요.</p>
      </div>
      <div className="pt-wrap">
        <div className="pt" role="grid" aria-label="주기율표 1~4주기 (전형 원소)">
          {PT_GROUPS.map((g) => <span key={`g${g}`} className={`pt-group mono${g === 13 ? ' split' : ''}`} aria-hidden="true">{g}</span>)}
          {PT_PERIODS.flatMap((period) => PT_GROUPS.map((g) => {
            const c = PERIODIC.find((x) => x.period === period && x.group === g);
            if (!c) return <span key={`${period}-${g}`} className={`pt-empty${g === 13 ? ' split' : ''}`} aria-hidden="true" />;
            const on = usable.includes(c.symbol);
            return (
              <button key={c.symbol} role="gridcell" aria-selected={sel === c.symbol}
                className={`pt-cell${on ? ' on' : ''}${sel === c.symbol ? ' sel' : ''}`}
                style={{ ['--c' as string]: elementColor(c.symbol).bg, ['--i' as string]: elementColor(c.symbol).ink, ['--t' as string]: elementColor(c.symbol).tint, ['--d' as string]: `${(period - 1) * 40 + PT_GROUPS.indexOf(g) * 18}ms` }}
                onClick={() => setSel(c.symbol)} aria-label={`${c.name}${on ? '' : ', 아직 쓰지 않는 원소'}${c.symbol === mine ? ', 내 원소' : ''}`}>
                <span className="pt-z mono">{c.z}</span>
                <span className="pt-sym mono">{c.symbol}</span>
                <span className="pt-name">{c.name}</span>
                {c.symbol === mine && <span className="pt-me">나</span>}
              </button>
            );
          }))}
        </div>
      </div>
      <div className="stack-s small muted">
        <div className="row"><span className="pt-key on" aria-hidden="true" style={{ background: elementColor('O').bg }} /> 고를 수 있는 원소 <span className="pt-key" aria-hidden="true" style={{ marginLeft: 8, background: elementColor('O').tint }} /> 아직 쓰지 않는 원소</div>
        <div className="row"><span className="pt-ramp" aria-hidden="true">{['H', 'Na', 'K'].map((x) => <span key={x} style={{ background: elementColor(x).bg }} />)}</span> 같은 족은 같은 색, 아래 주기로 갈수록 진해져요</div>
      </div>

      {active ? (
        <div key={sel} className="stack pt-detail">
          <div className="panel">
            {el === mine && <span className="chip on" style={{ alignSelf: 'flex-start' }}>내 원소</span>}
            <ElementDetail el={el} />
          </div>
          <div className="panel">
            <div className="section-title"><h3>{j(ELEMENTS[el].name, '이/가')} 들어가는 분자·화합물</h3><span className="mono small muted">{mols.length}개</span></div>
            <div className="row">
              {mols.map((m) => <span key={m.id} className="chip" title={m.name}><Formula f={m.formula} className="mono" /> {m.name}</span>)}
            </div>
            <p className="small muted">지금 {ELEMENTS[el].name} 자리가 남은 모집방 {openRooms}곳</p>
            {el === mine && openRooms > 0 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go({ k: 'rooms' })}>내 자리 있는 방 보기</button>}
          </div>
        </div>
      ) : (
        <div key={sel} className="panel flat pt-detail">
          <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            <span className="pt-cell big" aria-hidden="true" style={{ ['--t' as string]: elementColor(cell.symbol).tint }}><span className="pt-z mono">{cell.z}</span><span className="pt-sym mono">{cell.symbol}</span></span>
            <div className="stack-s grow"><h2>{cell.name}</h2><p className="small">{cell.note}</p></div>
          </div>
          <p className="small muted">원소 목록은 실제 분자 카탈로그가 검토되면서 늘어날 수 있어요.</p>
        </div>
      )}
    </div>
  );
}
