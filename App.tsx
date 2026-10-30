import { Achievements, ElementStats, guideSeen, GuideSheet, markGuideSeen, TitlePicker, VacancyToggle } from './Extras2';
import { ConsentChecks, DeleteAccount, DocSheet, InstallCard, PlaceCard, PushToggle, TermsUpdateCard } from './Extras';
import { j, josaOf } from './josa';
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ELEMENTS, METAPHOR_NOTICE, pairContent } from './elements';
import { Professor, PROF } from './Professor';
import { AI_LIMITS, type AiReply, type AiTurn } from './advisor';
import { kindLabel, moleculeById, type ElementId } from './molecules';
import { CONTEXT_LABEL, QUESTIONS, scoreQuiz } from './quiz';
import type { Backend, DispatchResult } from './backend';
import { countsOf, exactMatches, moleculesWith, supersetCandidates, usableElements, vacancies } from './chemistry';
import {
  activeMembers, canChat, getProfile, hasConflict, INTRO_MAX, isMember, isRecruitingOpen, joinableRoomsFor, openProposal, pendingMeeting,
  recruitingCommitments, roomCounts, roomTitle, ROOM_NAME_MAX, TERMS_VERSION, waitingEntry, type Command,
} from './engine';
import type { MeetingRecord, Room, State } from './types';
import { USABLE } from './molecules';
import { CardCarousel, CardReveal, DexTile } from './CardUI';
import { AdminView, NicknameInput, ProfileSheet, ReactionMeter, ReportForm, ReviewSheet, TagPicker } from './Social';
import Nearby from './Nearby';
import { getLocation, getSimulated, isDemoGeo, setDemoGeo, setSimulated, watchLocation } from './geo';
import { CAMPUS } from './campus';
import { PERIODIC, PT_GROUPS, PT_PERIODS } from './periodic';
import { elementColor } from './colors';
import Molecule3D from './Molecule3D';
import { Atom, fmtDate, fmtTime, Formula, Icon, MoleculeStrip } from './bits';

type View =
  | { k: 'home' } | { k: 'rooms' } | { k: 'create' } | { k: 'auto' } | { k: 'room'; id: string }
  | { k: 'collection' } | { k: 'card'; mol: string } | { k: 'public' } | { k: 'profile' } | { k: 'element'; el: ElementId } | { k: 'table'; el?: string }
  | { k: 'nearby' } | { k: 'admin' } | { k: 'stats' };

interface Ctx {
  s: State; viewer: string; run: (c: Command, ok?: string) => Promise<DispatchResult>; go: (v: View) => void; view: View; backend: Backend;
  openProfile: (uid: string, roomId?: string) => void; openReveal: (recordId: string) => void; openReview: (meetingId: string) => void; now: number;
  openGuide: () => void;
}

/** 내 카드 상태: 받은 카드(받기를 누름)와 받기 대기 중인 기록 */
export function myCards(s: State, uid: string) {
  const recs = s.records.filter((r) => r.userId === uid && r.moleculeId);
  const owned = new Set(recs.filter((r) => r.claimedAt).map((r) => r.moleculeId!));
  const pending = recs.filter((r) => !r.claimedAt);
  return { owned, pending, recordsOf: (id: string) => recs.filter((r) => r.moleculeId === id && r.claimedAt).sort((a, b) => b.createdAt - a.createdAt) };
}
const isAdminView = (s: State, uid: string) => s.admins.includes(uid) || !!(s as State & { isAdmin?: boolean }).isAdmin;
const nickOf = (s: State, viewer: string, uid: string) => getProfile(s, viewer, uid)?.nickname || s.users[uid]?.nickname || '';
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
  useMemo(() => setDemoGeo(backend.mode === 'demo'), [backend.mode]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const [profileOf, setProfileOf] = useState<{ uid: string; roomId?: string } | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [reviewOf, setReviewOf] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  // 버튼을 누르면 튕기는 효과 (동작 줄이기 설정이면 끔)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const down = (e: PointerEvent) => {
      const b = (e.target as HTMLElement)?.closest?.('button, .chip.pick, .option, .tab') as HTMLElement | null;
      if (!b || (b as HTMLButtonElement).disabled || b.closest('.tcard, .pt-cell, .mapbox')) return;
      b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing');
    };
    const end = (e: AnimationEvent) => { if (e.animationName === 'boing') (e.target as HTMLElement).classList.remove('boing'); };
    document.addEventListener('pointerdown', down); document.addEventListener('animationend', end);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('animationend', end); };
  }, []);

  const vid = viewer ?? s.meId;
  const me = vid ? s.users[vid] : null;

  // 방장 위치 공유: 켜져 있는 동안 위치가 바뀌면 서버에 마지막 위치만 보낸다
  const sharing = !!me?.sharingLocation;
  useEffect(() => {
    if (!sharing || !vid) return;
    let lastSent = 0; let lastLoc: { lat: number; lng: number } | null = null;
    return watchLocation((r) => {
      if (!r.ok) { show(r.error, true); return; }
      const moved = !lastLoc || Math.hypot((r.loc.lat - lastLoc.lat) * 111_000, (r.loc.lng - lastLoc.lng) * 88_000) > 20;
      if (!moved && Date.now() - lastSent < 60_000) return;
      lastSent = Date.now(); lastLoc = r.loc;
      void backend.dispatch({ type: 'setLocation', actor: vid, loc: r.loc }).then((x) => { if (x.info === 'offCampus') show('캠퍼스를 벗어나서 위치 공유를 껐어요.'); });
    });
  }, [sharing, vid]); // eslint-disable-line react-hooks/exhaustive-deps
  let body: JSX.Element;
  // 알림을 눌러 #room-<id>로 열리면 그 실험실로 간다
  useEffect(() => {
    const open = () => { const m = /^#room-(.+)$/.exec(location.hash); if (m && s.rooms[m[1]]) { go({ k: 'room', id: m[1] }); history.replaceState(null, '', location.pathname + location.search); } };
    open(); window.addEventListener('hashchange', open); return () => window.removeEventListener('hashchange', open);
  }, [!!s.rooms]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me || me.deletedAt) body = <Intro onStart={async () => { const r = await run({ type: 'createUser', intro: '', makeMe: true, consentVersion: TERMS_VERSION }); if (r.ok) setViewer(r.createdId!); }} />;
  else if (!me.elementLockedAt) body = <Onboarding />;
  else body = <Screen />;
  const onboarded = !!me?.elementLockedAt;
  // 처음 원소를 정한 뒤 한 번 사용 안내를 보여 준다
  useEffect(() => { if (onboarded && !me?.virtual && !guideSeen()) { markGuideSeen(); setGuide(true); } }, [onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <C.Provider value={{ s, viewer: vid ?? '', run, go, view, backend, now,
      openProfile: (uid, roomId) => setProfileOf({ uid, roomId }), openReveal: setReveal, openReview: setReviewOf, openGuide: () => setGuide(true) }}>
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
      {profileOf && vid && <ProfileSheet s={s} viewer={vid} uid={profileOf.uid} roomId={profileOf.roomId} run={run} onClose={() => setProfileOf(null)} />}
      {reviewOf && vid && <ReviewSheet s={s} viewer={vid} meetingId={reviewOf} run={run} onClose={() => setReviewOf(null)} />}
      {reveal && vid && (() => {
        const rec = s.records.find((r) => r.id === reveal);
        if (!rec) return null;
        return <CardReveal record={rec} onClaim={async () => (await run({ type: 'claimCard', actor: vid, recordId: rec.id })).ok}
          onClose={() => { setReveal(null); const mt = s.meetings.find((m) => m.id === rec.meetingId); if (mt && mt.attendees.some((a) => a.userId !== vid && !s.reviews.some((x) => x.meetingId === mt.id && x.from === vid && x.to === a.userId))) setReviewOf(mt.id); }} />;
      })()}
      {guide && <GuideSheet onClose={() => setGuide(false)} />}
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
    case 'nearby': return <NearbyScreen />;
    case 'admin': return <AdminScreen />;
    case 'stats': return <StatsScreen />;
  }
}

function TabBar() {
  const { view, go } = useApp();
  const items: [View['k'][], string, 'home' | 'search' | 'table' | 'cards' | 'user', View][] = [
    [['home', 'auto'], '홈', 'home', { k: 'home' }], [['rooms', 'create', 'room'], '실험실', 'search', { k: 'rooms' }],
    [['table', 'element', 'stats'], '주기율표', 'table', { k: 'table' }],
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
  const [ok, setOk] = useState(false);
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
          ['2', '실험실에 모이기', '물(H₂O)이라면 수소 두 명과 산소 한 명. 실제 분자의 자리에 맞춰 실험실을 찾거나 자동 매칭해요.'],
          ['3', '만나고 카드 모으기', '실제로 만난 사람들의 구성이 진짜 분자라면 그 분자 카드를 받아요.'],
        ].map(([n, t, d]) => (
          <div key={n} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
            <span className="mono muted" style={{ fontSize: 13, paddingTop: 2 }}>{n}</span>
            <div className="stack-s grow"><h3>{t}</h3><p className="muted small">{d}</p></div>
          </div>
        ))}
      </div>
      <p className="small muted">{METAPHOR_NOTICE}</p>
      <ConsentChecks onChange={setOk} />
      <button className="btn primary block" disabled={!ok} onClick={onStart}>{ok ? '동의하고 내 원소 찾기 시작' : '필수 항목에 동의해 주세요'}</button>
    </div>
  );
}

// ───────── 2~3. 테스트 → 비교 → 확정 ─────────
function Onboarding() {
  const { s, viewer, run } = useApp();
  const attempts = s.quizAttempts.filter((a) => a.userId === viewer);
  const [phase, setPhase] = useState<'pick' | 'quiz' | 'ai' | 'choose'>(attempts.length ? 'choose' : 'pick');
  if (phase === 'pick') return <FindWay onAi={() => setPhase('ai')} onQuiz={() => setPhase('quiz')} onBack={attempts.length ? () => setPhase('choose') : undefined} />;
  if (phase === 'ai') return <AiAdvisor onDone={() => setPhase('choose')} onQuiz={() => setPhase('quiz')} />;
  if (phase === 'quiz') return <Quiz onDone={async (answers) => { const r = await run({ type: 'recordQuiz', actor: viewer, answers }); if (r.ok) setPhase('choose'); }} onSkip={attempts.length ? () => setPhase('choose') : undefined} />;
  return <Choose onRetake={() => setPhase('pick')} />;
}

function FindWay({ onAi, onQuiz, onBack }: { onAi: () => void; onQuiz: () => void; onBack?: () => void }) {
  const { backend } = useApp();
  return (
    <div className="stack" style={{ gap: 16 }}>
      {onBack && <button className="back" onClick={onBack}>← 결과로 돌아가기</button>}
      <div className="stack-s"><span className="eyebrow">나의 원소 찾기</span><h1>어떻게 찾아볼까요?</h1>
        <p className="small muted">어느 쪽이든 추천은 참고일 뿐이고, 마지막엔 원소 설명을 비교해서 직접 골라요.</p></div>
      <button className="option way" onClick={onAi}>
        <span className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="way-ic" aria-hidden="true"><Professor size={52} mood="happy" /></span>
          <span className="stack-s grow" style={{ gap: 2 }}><strong>벤 교수님과 상담하기 <span className="chip on">추천</span></strong>
            <span className="small muted">유기화학 연구실의 벤 교수님(AI)이 4~5개를 물어보고, 내 답을 근거로 어울리는 원소 3개를 골라 줘요. 3분쯤 걸려요.</span></span></span>
      </button>
      <button className="option way" onClick={onQuiz}>
        <span className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="way-ic" aria-hidden="true">📝</span>
          <span className="stack-s grow" style={{ gap: 2 }}><strong>질문 {QUESTIONS.length}개 고르기</strong>
            <span className="small muted">보기 중에 고르기만 하면 돼요. 1분이면 끝나요.</span></span></span>
      </button>
      <p className="small muted">{backend.mode === 'demo' ? '시연판의 벤 교수님은 실제 AI 대신 정해진 질문과 규칙으로 흉내만 내요.' : '벤 교수님은 AI 캐릭터예요. 상담 대화는 추천을 만들기 위해 Google Gemini로 보내지고, 분자친구 서버에는 저장하지 않아요. 이름·연락처 같은 개인 정보는 적지 마세요.'}</p>
    </div>
  );
}

function AiAdvisor({ onDone, onQuiz }: { onDone: () => void; onQuiz: () => void }) {
  const { backend } = useApp();
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<AiReply | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const answers = turns.filter((t) => t.role === 'user').length;
  const ask = async (hist: AiTurn[], finish = false) => {
    setBusy(true); setErr('');
    const r = await backend.ai(hist, finish);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return false; }
    setTurns([...hist, { role: 'ai', text: r.reply.reply }]);
    if (r.reply.done) setResult(r.reply);
    return true;
  };
  useEffect(() => { void ask([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [turns.length, busy, result]);
  const send = async () => {
    const t = txt.trim(); if (!t || busy) return;
    const hist = [...turns, { role: 'user' as const, text: t }];
    setTurns(hist); setTxt('');
    if (!(await ask(hist))) { setTurns(turns); setTxt(t); }
  };
  return (
    <div className="stack ai-page" style={{ gap: 12 }}>
      <div className="prof-head">
        <Professor size={64} mood={result ? 'happy' : busy ? 'think' : 'idle'} />
        <div className="stack-s grow" style={{ gap: 0 }}><span className="eyebrow">원소 상담 · AI 캐릭터</span><h2>{PROF.name}</h2><span className="small muted">{PROF.title}</span></div>
        <button className="btn sm ghost" onClick={onQuiz}>질문으로 할래요</button>
      </div>
      <div className="chat ai-chat" ref={ref} aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`msg${t.role === 'user' ? ' mine' : ''}`}>
            {t.role === 'ai' && <span className="ai-av" aria-hidden="true"><Professor size={30} /></span>}
            <div className="bubble">{t.role === 'ai' && <><span className="small" style={{ fontWeight: 700 }}>{PROF.name}</span><br /></>}{t.text}</div>
          </div>
        ))}
        {busy && <div className="msg"><span className="ai-av" aria-hidden="true"><Professor size={30} mood="think" /></span><div className="bubble typing" aria-label="교수님이 생각하는 중"><span /><span /><span /></div></div>}
        {result && (
          <div className="panel ai-result">
            <div className="row" style={{ gap: 8 }}><Professor size={34} mood="happy" /><span className="eyebrow">{PROF.name}의 추천 원소</span></div>
            {result.ranking.map((p, i) => (
              <div key={p.element} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
                <Atom el={p.element} size={i === 0 ? 40 : 32} />
                <span className="stack-s grow" style={{ gap: 2 }}><strong>{i + 1}. {ELEMENTS[p.element].name}</strong><span className="small">{p.reason}</span></span>
              </div>
            ))}
            <button className="btn primary block" onClick={onDone}>원소 비교하고 고르기</button>
          </div>
        )}
      </div>
      {err && <div className="panel warn"><p className="small">{err}</p><div className="row"><button className="btn sm" onClick={() => void (turns.length ? send() : ask([]))}>다시 시도</button><button className="btn sm ghost" onClick={onQuiz}>질문으로 찾기</button></div></div>}
      {!result && (
        <>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={AI_LIMITS.maxChars} placeholder={busy ? '교수님이 생각하는 중…' : '교수님께 자유롭게 답해 주세요'} aria-label="교수님께 답하기" disabled={busy || !turns.length} />
            <button className="btn primary" disabled={busy || !txt.trim()}>보내기</button>
          </form>
          {answers >= AI_LIMITS.minAnswersToFinish && <button className="btn ghost block" disabled={busy} onClick={() => void ask(turns, true)}>이 정도면 됐어요, 결과 볼래요</button>}
        </>
      )}
    </div>
  );
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
  const isAi = !!last.aiRanking?.length;
  const ranking = useMemo(() => isAi ? [...last.aiRanking!, ...usableElements().filter((e) => !last.aiRanking!.includes(e))] : scoreQuiz(last.answers, usableElements()).ranking, [last, isAi]);
  const [sel, setSel] = useState<ElementId>(last.recommended);
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [intro, setIntro] = useState(s.users[viewer].intro);
  const [nick, setNick] = useState(s.users[viewer].nickname ?? '');
  const [tags, setTags] = useState<string[]>(s.users[viewer].tags ?? []);
  const lock = async () => {
    const n = await run({ type: 'updateProfile', actor: viewer, nickname: nick, tags });
    if (!n.ok) return;
    const a = await run({ type: 'updateIntro', actor: viewer, intro });
    if (!a.ok) return;
    const r = await run({ type: 'lockElement', actor: viewer, elementId: sel, acknowledged: ack }, `${j(ELEMENTS[sel].name, '으로/로')} 확정했어요.`);
    if (r.ok) go({ k: 'home' });
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack-s">
        <span className="eyebrow">{isAi ? `${PROF.name} 상담 결과` : '테스트 결과'}</span>
        <h1>추천 원소는 {j(ELEMENTS[last.recommended].name, '이에요/예요')}</h1>
        <p className="muted small">다른 원소 설명도 비교해 보고 직접 골라 주세요. 추천과 달라도 괜찮아요.</p>
      </div>
      <div className="el-tabs" role="tablist">
        {ranking.map((el) => (
          <button key={el} role="tab" aria-selected={sel === el} className={`el-tab${sel === el ? ' sel' : ''}`} onClick={() => { setSel(el); setConfirming(false); }}>
            <Atom el={el} size={34} /><span>{ELEMENTS[el].name}</span>{el === last.recommended ? <span className="rec">추천</span> : isAi && last.aiRanking!.includes(el) ? <span className="rec alt">{last.aiRanking!.indexOf(el) + 1}위</span> : null}
          </button>
        ))}
      </div>
      {isAi && last.aiReasons?.[sel] && <div className="panel ai-reason"><span className="row" style={{ gap: 6 }}><Professor size={26} mood="happy" /><span className="eyebrow">{PROF.name}의 한마디</span></span><p className="small">{last.aiReasons[sel]}</p></div>}
      <div className="panel"><ElementDetail el={sel} /></div>
      {!confirming ? (
        <div className="stack-s">
          <button className="btn primary block" onClick={() => setConfirming(true)}>{j(ELEMENTS[sel].name, '으로/로')} 할게요</button>
          <button className="btn ghost block" onClick={onRetake}>다른 방법으로 다시 찾기</button>
        </div>
      ) : (
        <div className="panel warn">
          <h2>{j(ELEMENTS[sel].name, '을/를')} 내 원소로 확정할까요?</h2>
          <p className="small">확정하면 계정을 유지하는 동안 원소를 바꿀 수 없어요. 바꾸려면 탈퇴 후 다시 가입해야 해요.</p>
          <NicknameInput id="nick-in" value={nick} onChange={setNick} />
          <label className="stack-s" htmlFor="intro-in">
            <span className="small" style={{ fontWeight: 600 }}>한 줄 소개 (실험실 목록에서 원소와 함께 보여요)</span>
            <input id="intro-in" className="input" maxLength={INTRO_MAX} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="예: 조용한 카페에서 수다 떠는 거 좋아해요" />
            <span className="small muted mono">{intro.length}/{INTRO_MAX}</span>
          </label>
          <TagPicker value={tags} onChange={setTags} />
          <label className="check" htmlFor="ack-in"><input id="ack-in" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span className="small">원소를 다시 바꿀 수 없다는 걸 이해했어요.</span></label>
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirming(false)}>다시 고를래요</button>
            <button className="btn primary grow" disabled={!ack || !intro.trim() || nick.trim().length < 2} onClick={lock}>확정하기</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── 4. 홈 ─────────
function Home() {
  const { s, viewer, run, go, openReveal } = useApp();
  const me = s.users[viewer];
  const el = me.elementId!;
  const commit = recruitingCommitments(s, viewer);
  const conflict = hasConflict(s, viewer);
  const myRooms = Object.values(s.rooms).filter((r) => isMember(s, r.id, viewer)).sort((a, b) => b.createdAt - a.createdAt);
  const pastRooms = Object.values(s.rooms).filter((r) => !isMember(s, r.id, viewer) && s.members.some((m) => m.roomId === r.id && m.userId === viewer) && r.closedAt);
  const busy = commit.rooms.length > 0 || commit.queued || !!me.suspendedAt || !me.nickname;
  const { pending } = myCards(s, viewer);
  const [nick, setNick] = useState('');
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
          <h2>{me.nickname || ELEMENTS[el].name} <span className="mono muted" style={{ fontSize: 15 }}>{ELEMENTS[el].name} {el}</span></h2>
          <p className="small muted">“{me.intro}”</p>
        </div>
      </div>
      {!me.virtual && me.consentVersion !== TERMS_VERSION && <TermsUpdateCard viewer={viewer} run={run} />}
      {!me.nickname && (
        <form className="panel warn" onSubmit={async (e) => { e.preventDefault(); await run({ type: 'updateProfile', actor: viewer, nickname: nick }, '닉네임을 정했어요.'); }}>
          <h3>닉네임을 정해 주세요</h3>
          <p className="small">같은 실험실 사람들에게 보이는 이름이에요. 정해야 실험실에 들어갈 수 있어요.</p>
          <NicknameInput id="home-nick" value={nick} onChange={setNick} />
          <button className="btn primary" disabled={nick.trim().length < 2}>정하기</button>
        </form>
      )}
      {me.suspendedAt && <div className="panel warn"><h3>이용이 잠시 정지됐어요</h3><p className="small">신고가 쌓여 관리자가 확인하는 중이에요. 확인이 끝나면 알림으로 알려 드려요.</p></div>}
      {pending.length > 0 && (
        <button className="panel claim-banner" onClick={() => openReveal(pending[0].id)}>
          <span className="claim-pack" aria-hidden="true" />
          <span className="stack-s grow" style={{ gap: 2, textAlign: 'left' }}><strong>받을 분자 카드가 {pending.length}장 있어요</strong><span className="small muted">눌러서 카드를 열어 보세요</span></span>
        </button>
      )}
      {conflict && (
        <div className="panel warn">
          <h3>모집 중인 실험실이 두 곳 겹쳐 있어요</h3>
          <p className="small">첫 만남 전에 다시 모집을 시작한 실험실이 있어요. 모집 중인 실험실은 한 곳만 남길 수 있어요. 남길 실험실을 골라 주세요. 고르지 않은 실험실에서는 나가게 돼요.</p>
          {commit.rooms.map((rid) => (
            <button key={rid} className="btn block" onClick={() => run({ type: 'resolveConflict', actor: viewer, keepRoomId: rid }, '한 곳만 남겼어요.')}>‘{roomTitle(s.rooms[rid])}’에 남기</button>
          ))}
        </div>
      )}
      <div className="stack-s">
        <button className="btn primary block" disabled={busy} onClick={auto}>자동 매칭 시작</button>
        <div className="row">
          <button className="btn grow" onClick={() => go({ k: 'rooms' })}>실험실 직접 찾기</button>
          <button className="btn grow" onClick={() => go({ k: 'nearby' })}>내 주변 원자 찾기</button>
        </div>
        <button className="btn ghost block" onClick={() => go({ k: 'stats' })}>우리 학교 원소 분포 보기</button>
        {commit.queued && <button className="btn ghost block" onClick={() => go({ k: 'auto' })}>자동 매칭 대기 중 · 상태 보기</button>}
        {!commit.queued && commit.rooms.length > 0 && !conflict && <p className="small muted">모집 중인 실험실이 있어서 새 모집에 참여할 수 없어요. 모집 중인 실험실은 한 곳만 참여할 수 있어요.</p>}
      </div>
      <section className="stack">
        <div className="section-title"><h2>참여 중인 실험실</h2><span className="mono small muted">{myRooms.length}</span></div>
        {myRooms.length === 0 && <div className="panel flat"><p className="muted small">아직 들어간 실험실이 없어요. 자동 매칭을 시작하거나 실험실을 찾아보세요.</p></div>}
        {myRooms.map((r) => <RoomCard key={r.id} room={r} compact />)}
        {pastRooms.length > 0 && <p className="small muted">종료됐거나 나온 실험실 {pastRooms.length}곳은 내 정보에서 볼 수 있어요.</p>}
      </section>
      <button className="btn ghost block" onClick={() => go({ k: 'collection' })}>내 분자 도감 · {myCards(s, viewer).owned.size}/{USABLE().length}</button>
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
        <div className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
          <strong className="room-name">{room.name || <span className="muted">이름 없는 실험실</span>}</strong>
          <span className="small muted"><Formula f={m.formula} className="mono" /> {m.name} · {m.totalAtoms}명{m.kind === 'ionic' ? ' · 이온 결정' : ''}{room.meetAt ? ` · ${fmtTime(room.meetAt)}` : ''}{room.place ? ` · 📍${room.place.label}` : ''}</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {compact && isMember(s, room.id, viewer) && unreadCount(s, viewer, room.id) > 0 && <span className="chip on">새 메시지 {unreadCount(s, viewer, room.id)}</span>}
          {!compact && isRecruitingOpen(room) && <span className={`chip ${canIn ? 'on' : ''}`}>{canIn ? `${ELEMENTS[me.elementId!].name} 자리 있음` : '내 자리 없음'}</span>}
        </div>
      </div>
      <MoleculeStrip formula={m.formula} target={m.atomCounts} members={mems} meId={viewer} size={32} />
      <div className="row small muted">
        <span className="mono">{mems.length}/{m.totalAtoms}명</span><span>·</span>
        <span>{room.origin === 'automatic' ? '자동 매칭 실험실 · 바로 채팅' : room.chatPolicy === 'immediate' ? '입장하면 바로 채팅' : '완성되면 채팅'}</span>
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

// ───────── 5. 실험실 목록 ─────────
function RoomsList() {
  const { s, viewer, go, now } = useApp();
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [sort, setSort] = useState<'new' | 'soon' | 'full'>('new');
  const [today, setToday] = useState(false);
  const [size, setSize] = useState(0);
  const joinable = joinableRoomsFor(s, viewer);
  const all = Object.values(s.rooms).filter(isRecruitingOpen);
  const fill = (r: Room) => activeMembers(s, r.id).length / moleculeById(r.targetMoleculeId)!.totalAtoms;
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const d1 = d0.getTime() + 86_400_000;
  const list = (tab === 'mine' ? joinable : all)
    .filter((r) => !today || (r.meetAt != null && r.meetAt >= d0.getTime() && r.meetAt < d1))
    .filter((r) => !size || moleculeById(r.targetMoleculeId)!.totalAtoms === size)
    .sort((a, b) => sort === 'soon' ? (a.meetAt ?? Infinity) - (b.meetAt ?? Infinity) || b.createdAt - a.createdAt
      : sort === 'full' ? fill(b) - fill(a) || b.createdAt - a.createdAt : b.createdAt - a.createdAt);
  const filtered = today || size > 0;
  const el = s.users[viewer].elementId!;
  return (
    <div className="stack">
      <div className="row between"><h1>실험실</h1><button className="btn primary sm" onClick={() => go({ k: 'create' })}>새 실험실 열기</button></div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>{ELEMENTS[el].name} 자리 있는 실험실 {joinable.length}</button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>모집 중 전체 {all.length}</button>
      </div>
      <div className="filters">
        <label className="sr-only" htmlFor="room-sort">정렬</label>
        <select id="room-sort" className="input sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="new">최근에 열린 순</option><option value="soon">모이는 시각 빠른 순</option><option value="full">거의 다 찬 순</option>
        </select>
        <button className={`chip pick${today ? ' on' : ''}`} aria-pressed={today} onClick={() => setToday(!today)}>오늘 모임</button>
        {[2, 3, 4, 5, 6].map((n) => <button key={n} className={`chip pick${size === n ? ' on' : ''}`} aria-pressed={size === n} onClick={() => setSize(size === n ? 0 : n)}>{n}명</button>)}
      </div>
      {list.length === 0 && filtered && <div className="panel flat"><p className="small muted">조건에 맞는 실험실이 없어요.</p><button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setToday(false); setSize(0); }}>필터 지우기</button></div>}
      {list.length === 0 && !filtered && <div className="panel flat"><p className="small muted">지금은 {tab === 'mine' ? `${ELEMENTS[el].name} 자리가 남은 실험실이 없어요. 새 실험실을 만들거나 자동 매칭으로 기다려 보세요.` : '모집 중인 실험실이 없어요.'}</p></div>}
      {list.map((r) => <RoomCard key={r.id} room={r} />)}
    </div>
  );
}

// ───────── 6. 실험실 만들기 ─────────
function CreateRoom() {
  const { s, viewer, run, go } = useApp();
  const el = s.users[viewer].elementId!;
  const cands = moleculesWith(el).sort((a, b) => a.totalAtoms - b.totalAtoms);
  const [mol, setMol] = useState(cands[0]?.id ?? '');
  const [policy, setPolicy] = useState<'immediate' | 'afterComplete'>('immediate');
  const [days, setDays] = useState(s.config.defaultRecruitDays);
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  const groups = [...new Set(cands.map((m) => m.totalAtoms))];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <button className="back" onClick={() => go({ k: 'rooms' })}>← 실험실</button>
      <h1>새 실험실 열기</h1>
      <section className="stack-s">
        <label htmlFor="room-name"><h3>실험실 이름 (필수)</h3></label>
        <input id="room-name" className="input" maxLength={ROOM_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2시에 밥 먹을 사람" />
        <span className="small muted mono">{name.trim().length}/{ROOM_NAME_MAX}</span>
      </section>
      <section className="stack-s">
        <label htmlFor="room-when"><h3>모이는 시각 (선택)</h3></label>
        <input id="room-when" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </section>
      <h2>어떤 분자를 만들까요?</h2>
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
      <button className="btn primary block" disabled={!mol || name.trim().length < 2} onClick={async () => { const r = await run({ type: 'createRoom', actor: viewer, moleculeId: mol, chatPolicy: policy, recruitDays: days, name, meetAt: when ? new Date(when).getTime() : null }, '실험실을 만들었어요.'); if (r.ok) go({ k: 'room', id: r.createdId! }); }}>
        {name.trim().length < 2 ? '실험실 이름을 먼저 정해 주세요' : `${moleculeById(mol)?.formula ?? ''} 실험실 만들기`}
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
      <p className="muted">{ELEMENTS[el].name} 자리가 있는 모집 중인 실험실이 아직 없어서 대기열에 들어갔어요. 함께 기다리는 사람들로 실제 분자가 만들어지면 바로 실험실이 열리고 알려 드려요.</p>
      <div className="row small muted" style={{ justifyContent: 'center' }}><span className="mono">대기 {waiting}명</span><span>·</span><span>{fmtTime(q.enteredAt)}부터</span></div>
      <button className="btn danger" onClick={async () => { const r = await run({ type: 'cancelAutoMatch', actor: viewer }, '매칭을 취소했어요.'); if (r.ok) go({ k: 'home' }); }}>매칭 취소</button>
      {backend.mode === 'demo' && <p className="small muted">시연 도구에서 가상 사용자를 대기열에 넣어 매칭을 확인할 수 있어요.</p>}
    </div>
  );
}

// ───────── 8~9. 실험실 상세 ─────────
function RoomDetail({ id }: { id: string }) {
  const { s, viewer, run, go, openProfile } = useApp();
  const r = s.rooms[id];
  const [confirmLeave, setConfirmLeave] = useState<'' | 'leave' | 'close'>('');
  if (!r) return <p>실험실을 찾을 수 없어요.</p>;
  const m = moleculeById(r.targetMoleculeId)!;
  const mems = activeMembers(s, id);
  const member = isMember(s, id, viewer);
  const st = roomStatus(r);
  const me = s.users[viewer];
  const vac = vacancies(m.atomCounts, roomCounts(s, id));
  const myMem = mems.find((x) => x.userId === viewer);
  const blocked = recruitingCommitments(s, viewer);
  const join = () => run({ type: 'joinRoom', actor: viewer, roomId: id }, '실험실에 합류했어요.');
  return (
    <div className="stack" style={{ gap: 16 }}>
      <button className="back" onClick={() => go({ k: member ? 'home' : 'rooms' })}>← {member ? '홈' : '실험실'}</button>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-s grow" style={{ gap: 4, minWidth: 0 }}>
          <h1 className="room-title">{r.name || '이름 없는 실험실'}</h1>
          <span className="row small muted" style={{ gap: 6 }}><Formula f={m.formula} className="mono" /> {m.name} · {m.totalAtoms}명{m.kind === 'ionic' ? ' · 이온 결정' : ''}</span>
          {r.meetAt && <span className="chip on" style={{ alignSelf: 'flex-start' }}>모이는 시각 {fmtTime(r.meetAt)}</span>}
        </div>
        <div className="stack-s" style={{ alignItems: 'flex-end' }}>
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {r.origin === 'automatic' && <span className="chip">자동 매칭 실험실</span>}
        </div>
      </div>
      {member && r.hostId === viewer && !r.closedAt && <RoomInfoEditor room={r} />}
      {member && <ClaimPanel room={r} />}
      {member && <PlaceCard room={r} isHost={r.hostId === viewer} run={run} viewer={viewer} />}
      {member && r.hostId === viewer && !r.closedAt && r.firstMeetingConfirmedAt === null && <LocationShare />}
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
            <button key={mm.userId} type="button" className="memberline" disabled={!member} onClick={() => openProfile(mm.userId, id)} aria-label={member ? `${nickOf(s, viewer, mm.userId) || ELEMENTS[mm.elementSnapshot].name} 프로필 보기` : undefined}>
              <Atom el={mm.elementSnapshot} size={30} me={mm.userId === viewer} />
              <div className="who grow stack-s" style={{ gap: 0 }}>
                <span className="row small" style={{ gap: 6 }}>
                  <strong>{member && nickOf(s, viewer, mm.userId) ? nickOf(s, viewer, mm.userId) : ELEMENTS[mm.elementSnapshot].name}</strong>
                  {member && nickOf(s, viewer, mm.userId) && <span className="muted">{ELEMENTS[mm.elementSnapshot].name}</span>}
                  {mm.userId === r.hostId && <span className="chip">방장</span>}
                  {mm.userId === viewer && <span className="chip on">나</span>}
                </span>
                <span className="small" style={{ overflowWrap: 'anywhere' }}>{s.users[mm.userId].intro}</span>
              </div>
              {member && <span className="small muted" aria-hidden="true">프로필 ›</span>}
            </button>
          ))}
        </div>
        {member && (() => {
          const gone = [...new Set(s.members.filter((x) => x.roomId === id && x.leftAt !== null && !mems.some((y) => y.userId === x.userId)).map((x) => x.userId))];
          return gone.length > 0 && !r.closedAt ? (
            <details className="small"><summary className="muted">나간 사람 {gone.length}명</summary>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>{gone.map((uid) => <button key={uid} className="chip pick" onClick={() => openProfile(uid, id)}>{nickOf(s, viewer, uid) || '이름 없음'}</button>)}</div>
            </details>
          ) : null;
        })()}
        {myMem?.reason && (
          <div className="pair complement"><p className="small"><strong>자동 매칭 추천 이유</strong></p><p className="small">{myMem.reason.mood}</p><p className="small muted">{myMem.reason.behavior}</p></div>
        )}
        {!member && isRecruitingOpen(r) && (
          (vac[me.elementId!] ?? 0) > 0
            ? <button className="btn primary block" disabled={blocked.rooms.length > 0 || blocked.queued} onClick={join}>{ELEMENTS[me.elementId!].name} 자리로 합류</button>
            : <p className="small muted">이 실험실에는 {ELEMENTS[me.elementId!].name} 자리가 없어요.</p>
        )}
        {!member && isRecruitingOpen(r) && (blocked.rooms.length > 0 || blocked.queued) && (vac[me.elementId!] ?? 0) > 0 && (
          <p className="small muted">{blocked.queued ? '자동 매칭 대기 중이라 직접 합류할 수 없어요.' : '이미 다른 모집 중인 실험실에 있어요. 모집 중인 실험실은 한 곳만 참여할 수 있어요.'}</p>
        )}
      </div>

      {member && <Proposals room={r} />}
      {member && <MeetingPanel key={`${viewer}:${mems.map((x) => x.userId).join(',')}`} room={r} />}
      {member && <ChatButton room={r} />}

      {member && !r.closedAt && (
        <div className="stack-s">
          {confirmLeave === '' && (
            <div className="row">
              <button className="btn danger grow" onClick={() => setConfirmLeave('leave')}>실험실 나가기</button>
              {r.hostId === viewer && <button className="btn danger grow" onClick={() => setConfirmLeave('close')}>실험실 종료</button>}
            </div>
          )}
          {confirmLeave !== '' && (
            <div className="panel warn">
              <p className="small">{confirmLeave === 'leave'
                ? (r.firstMeetingConfirmedAt ? '나가도 남은 사람들의 실험실은 그대로 유지돼요.' : r.recruitment === 'complete' ? '첫 만남 전이라 내가 나가면 이 실험실은 빈자리를 다시 모집해요.' : '나가면 내 자리가 빈자리로 돌아가요.')
                : '실험실을 종료하면 채팅과 모집이 모두 끝나요. 이미 얻은 카드와 만남 기록은 그대로 남아요.'}</p>
              <div className="row">
                <button className="btn ghost" onClick={() => setConfirmLeave('')}>취소</button>
                <button className="btn danger grow" onClick={async () => {
                  const ok = await (confirmLeave === 'leave' ? run({ type: 'leaveRoom', actor: viewer, roomId: id }, '실험실에서 나왔어요.') : run({ type: 'closeRoom', actor: viewer, roomId: id }, '실험실을 종료했어요.'));
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
            {p.reason === 'deadline' && ' 한 명이라도 반대하면 실험실이 종료돼요.'}</p>
          <div className="stack-s">
            {p.electorate.map((uid) => {
              const mm = s.members.find((x) => x.roomId === room.id && x.userId === uid)!;
              const v = p.votes[uid];
              return <div key={uid} className="row small"><Atom el={mm.elementSnapshot} size={20} /><span className="grow">{uid === viewer ? '나' : nickOf(s, viewer, uid) || s.users[uid].intro}</span><span className={`chip ${v === 'yes' ? 'ok' : v === 'no' ? 'bad' : ''}`}>{v === 'yes' ? '동의' : v === 'no' ? '반대' : '응답 대기'}</span></div>;
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
  const [locating, setLocating] = useState(false);
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
              return <div key={a.userId} className="row small"><Atom el={a.element} size={20} /><span className="grow">{a.userId === viewer ? '나' : nickOf(s, viewer, a.userId) || a.intro}</span><span className={`chip ${c === 'confirmed' ? 'ok' : ''}`}>{c === 'confirmed' ? '확인함' : '확인 대기'}</span></div>;
            })}
          </div>
          {mems.filter((m) => !pm.attendees.some((a) => a.userId === m.userId)).length > 0 && <p className="small muted">불참으로 표시된 분은 확인하지 않아도 되고 카드도 받지 않아요.</p>}
          {s.config.meetingProximity.required && <p className="small muted">참석자 모두 {s.config.meetingProximity.radiusM}m 안에서, 첫 확인 후 2시간 안에 눌러야 해요. 누를 때 위치를 한 번 확인하고, 만남이 확정되면 위치는 지워요.</p>}
          {pm.attendees.some((a) => a.userId === viewer) && !pm.confirmations[viewer] && (
            <div className="row">
              <button className="btn grow" onClick={() => run({ type: 'respondMeeting', actor: viewer, meetingId: pm.id, response: 'reject' }, '방장에게 수정을 요청했어요.')}>목록이 달라요</button>
              <button className="btn primary grow" disabled={locating} onClick={async () => {
                setLocating(true);
                const g = await getLocation();
                setLocating(false);
                if (!g.ok) { await run({ type: 'respondMeeting', actor: viewer, meetingId: pm.id, response: 'confirm', loc: null }); return; }
                await run({ type: 'respondMeeting', actor: viewer, meetingId: pm.id, response: 'confirm', loc: g.loc }, '만남을 확인했어요.');
              }}>{locating ? '위치 확인 중…' : '실제로 만났어요'}</button>
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
                <Atom el={mm.elementSnapshot} size={22} /><span className="small grow">{mm.userId === viewer ? '나' : nickOf(s, viewer, mm.userId) || s.users[mm.userId].intro}</span>
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

const seenKey = (uid: string, roomId: string) => `bunja-seen-${uid}-${roomId}`;
function readSeen(uid: string, roomId: string): number { try { return Number(localStorage.getItem(seenKey(uid, roomId)) ?? 0); } catch { return 0; } }
function writeSeen(uid: string, roomId: string, t: number) { try { localStorage.setItem(seenKey(uid, roomId), String(t)); } catch { /* 저장 불가 시 무시 */ } }

/** 읽지 않은 다른 사람의 메시지 수 (이 기기 기준) */
export function unreadCount(s: State, uid: string, roomId: string): number {
  const seen = readSeen(uid, roomId);
  return s.messages.filter((m) => m.roomId === roomId && m.senderId && m.senderId !== uid && m.createdAt > seen).length;
}

function ChatButton({ room }: { room: Room }) {
  const { s, viewer } = useApp();
  const [open, setOpen] = useState(false);
  const unread = open ? 0 : unreadCount(s, viewer, room.id);
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label={`실험실 채팅 열기${unread ? `, 새 메시지 ${unread}개` : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
        <span>채팅</span>
        {unread > 0 && <span className="chat-badge mono">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <ChatSheet room={room} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatSheet({ room, onClose }: { room: Room; onClose: () => void }) {
  const { s, viewer, run } = useApp();
  const [txt, setTxt] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const repMsg = reporting ? s.messages.find((m) => m.id === reporting) : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const msgs = s.messages.filter((m) => m.roomId === room.id);
  const lastT = msgs.at(-1)?.createdAt ?? 0;
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); writeSeen(viewer, room.id, lastT); }, [msgs.length, lastT, viewer, room.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const ok = canChat(s, room.id, viewer);
  const elOf = (uid: string) => s.members.find((m) => m.roomId === room.id && m.userId === uid)?.elementSnapshot ?? 'H';
  const reason = room.closedAt ? '종료된 실험실이라 읽기만 할 수 있어요.' : '분자가 완성되면 채팅이 열려요.';
  const m = moleculeById(room.targetMoleculeId)!;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet chat-sheet" role="dialog" aria-label={`${m.name} 실험실 채팅`} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="stack-s" style={{ gap: 0 }}><h2>{roomTitle(room)}</h2><span className="small muted"><Formula f={m.formula} className="mono" /> 실험실 채팅</span><span className="small muted">개인 채팅·친구 추가는 없어요</span></div>
          <button className="btn sm" onClick={onClose}>닫기</button>
        </div>
        {(room.meetAt || room.place) && (
          <div className="chat-pin" role="note" aria-label="고정된 약속">
            <span className="small" aria-hidden="true">📌</span>
            {room.meetAt && <span className="small"><strong>{fmtTime(room.meetAt)}</strong></span>}
            {room.place && <a className="small" href={`https://map.kakao.com/link/map/${encodeURIComponent(room.place.label)},${room.place.lat},${room.place.lng}`} target="_blank" rel="noreferrer">{room.place.label}</a>}
          </div>
        )}
        <div className="chat grow" ref={ref}>
          {msgs.length === 0 && <p className="small muted" style={{ textAlign: 'center' }}>아직 메시지가 없어요.</p>}
          {msgs.map((x) => x.senderId === null ? (
            <div key={x.id} className="msg sys"><div className="bubble">{x.body}</div></div>
          ) : (
            <Fragment key={x.id}>
            <div className={`msg${x.senderId === viewer ? ' mine' : ''}`}>
              {x.senderId !== viewer && <Atom el={elOf(x.senderId)} size={26} />}
              <div className={`bubble${x.senderId !== viewer ? ' pickable' : ''}`} onClick={x.senderId !== viewer ? () => setPick(pick === x.id ? null : x.id) : undefined}
                role={x.senderId !== viewer ? 'button' : undefined} tabIndex={x.senderId !== viewer ? 0 : undefined} aria-expanded={x.senderId !== viewer ? pick === x.id : undefined}>{x.senderId !== viewer && <><span className="small" style={{ fontWeight: 700 }}>{nickOf(s, viewer, x.senderId) || ELEMENTS[elOf(x.senderId)].name}</span><br /></>}<span>{x.body}</span><br /><span className="small muted mono">{fmtTime(x.createdAt)}</span></div>
            </div>
            {pick === x.id && x.senderId && <button className="btn sm danger msg-report" onClick={() => setReporting(x.id)}>이 메시지 신고하기</button>}
            </Fragment>
          ))}
        </div>
        {ok ? (
          <form className="composer" onSubmit={async (e) => { e.preventDefault(); const r = await run({ type: 'sendMessage', actor: viewer, roomId: room.id, body: txt }); if (r.ok) setTxt(''); }}>
            <input id={`chat-${room.id}`} className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="메시지 보내기" aria-label="메시지" autoFocus />
            <button className="btn primary" disabled={!txt.trim()}>보내기</button>
          </form>
        ) : <p className="small muted">{reason}</p>}
        {repMsg && repMsg.senderId && (
          <div className="sheet-bg" onClick={() => setReporting(null)}>
            <div className="sheet" role="dialog" aria-label="메시지 신고" onClick={(e) => e.stopPropagation()}>
              <div className="row between"><h2>메시지 신고</h2><button className="btn sm" onClick={() => setReporting(null)}>닫기</button></div>
              <ReportForm run={run} viewer={viewer} target={repMsg.senderId} roomId={room.id} name={nickOf(s, viewer, repMsg.senderId) || '이 사람'}
                messageId={repMsg.id} quote={repMsg.body} onDone={() => { setReporting(null); setPick(null); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── 10~11. 컬렉션 (도감) ─────────
function Collection() {
  const { s, viewer, go, openReveal } = useApp();
  const [tab, setTab] = useState<'dex' | 'nocard'>('dex');
  const [filter, setFilter] = useState<'all' | 'owned' | 'locked' | 'mine'>('all');
  const { owned, pending } = myCards(s, viewer);
  const myEl = s.users[viewer].elementId!;
  const nocard = s.records.filter((r) => r.userId === viewer && !r.moleculeId);
  const all = USABLE();
  const pendingOf = (id: string) => pending.find((r) => r.moleculeId === id);
  const list = all.filter((m) => filter === 'all' || (filter === 'owned' ? owned.has(m.id) : filter === 'locked' ? !owned.has(m.id) : (m.atomCounts[myEl] ?? 0) > 0));
  const pct = Math.round((owned.size / all.length) * 100);
  return (
    <div className="stack">
      <div className="row between"><h1>분자 도감</h1><button className="btn sm" onClick={() => go({ k: 'public' })}>공개 화면 미리보기</button></div>
      <div className="panel" style={{ gap: 8 }}>
        <div className="row between"><strong>{owned.size} / {all.length}종 모음</strong><span className="mono small muted">{pct}%</span></div>
        <div className="meter"><div style={{ width: `${pct}%` }} /></div>
        <p className="small muted">실제로 만난 사람들의 원소 구성이 그 분자와 같으면 카드가 열려요. {ELEMENTS[myEl].name} 자리가 있는 분자는 “내 자리 있음”으로 표시돼요.</p>
      </div>
      {pending.length > 0 && (
        <button className="panel claim-banner" onClick={() => openReveal(pending[0].id)}>
          <span className="claim-pack" aria-hidden="true" />
          <span className="stack-s grow" style={{ gap: 2, textAlign: 'left' }}><strong>받을 카드 {pending.length}장</strong><span className="small muted">눌러서 열어 보세요</span></span>
        </button>
      )}
      <div className="seg">
        <button className={tab === 'dex' ? 'on' : ''} onClick={() => setTab('dex')}>도감</button>
        <button className={tab === 'nocard' ? 'on' : ''} onClick={() => setTab('nocard')}>카드 없는 만남 {nocard.length}</button>
      </div>
      {tab === 'dex' && (
        <>
          <div className="row" style={{ gap: 6 }}>
            {([['all', '전체'], ['owned', '모은 것'], ['locked', '아직'], ['mine', '내 자리 있음']] as const).map(([k, l]) => (
              <button key={k} className={`chip pick${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="dex-grid">
            {list.map((m) => (
              <DexTile key={m.id} id={m.id} owned={owned.has(m.id)} pending={!!pendingOf(m.id)} mineFits={(m.atomCounts[myEl] ?? 0) > 0}
                onOpen={() => owned.has(m.id) ? go({ k: 'card', mol: m.id }) : pendingOf(m.id) && openReveal(pendingOf(m.id)!.id)} />
            ))}
          </div>
        </>
      )}
      {tab === 'nocard' && (nocard.length === 0
        ? <div className="panel flat"><p className="small muted">참석 구성이 유효한 분자가 아니었던 만남이 여기 남아요.</p></div>
        : nocard.map((r) => <RecordRow key={r.id} recId={r.id} />))}
      <Achievements s={s} viewer={viewer} />
    </div>
  );
}

function StatsScreen() {
  const { s, viewer, go } = useApp();
  return <div className="stack"><button className="back" onClick={() => go({ k: 'table' })}>← 주기율표</button><ElementStats s={s} viewer={viewer} /></div>;
}

function RecordRow({ recId }: { recId: string }) {
  const { s, viewer, run } = useApp();
  const r = s.records.find((x) => x.id === recId)!;
  return (
    <div className="panel" style={{ gap: 8 }}>
      <div className="row between"><span className="small mono">{fmtDate(r.createdAt)}</span><span className="small muted">실험실 목표 {moleculeById(r.targetMoleculeId)!.formula}</span></div>
      <div className="stack-s">
        {r.companions.map((c, i) => <div key={i} className="row small" style={{ flexWrap: 'nowrap' }}><Atom el={c.element} size={20} />{c.nickname && <strong>{c.nickname}</strong>}<span className="grow muted">{c.intro}</span></div>)}
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
  const { owned, recordsOf } = myCards(s, viewer);
  const ids = USABLE().map((m) => m.id).filter((id) => owned.has(id));
  const [cur, setCur] = useState(mol);
  if (!ids.length || !owned.has(mol)) return <div className="stack"><button className="back" onClick={() => go({ k: 'collection' })}>← 도감</button><p>카드를 찾을 수 없어요.</p></div>;
  const c = s.cards.find((x) => x.userId === viewer && x.moleculeId === cur);
  const m = moleculeById(cur)!;
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ k: 'collection' })}>← 도감</button>
      <CardCarousel ids={ids} start={mol} recordsOf={recordsOf} onIndex={setCur} />
      <div className="panel" style={{ gap: 8 }}>
        <div className="row between"><strong>{m.name}</strong><span className="chip">{kindLabel(m)}</span></div>
        <p className="small muted mono">{m.sources.join(' · ')}{c ? ` · 처음 얻은 날 ${fmtDate(c.firstEarnedAt)}` : ''}</p>
        {c && (
          <div className="row between">
            <span className="small">이 카드 공개</span>
            <div className="seg">
              <button className={c.visibility === 'private' ? 'on' : ''} onClick={() => run({ type: 'setCardVisibility', actor: viewer, moleculeId: cur, visibility: 'private' })}>비공개</button>
              <button className={c.visibility === 'public' ? 'on' : ''} onClick={() => run({ type: 'setCardVisibility', actor: viewer, moleculeId: cur, visibility: 'public' })}>공개</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicPreview() {
  const { s, viewer, go } = useApp();
  const me = s.users[viewer];
  const { owned } = myCards(s, viewer);
  const cards = s.cards.filter((c) => c.userId === viewer && c.visibility === 'public' && owned.has(c.moleculeId));
  const recs = s.records.filter((r) => r.userId === viewer && r.visibility === 'public');
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ k: 'collection' })}>← 도감</button>
      <h1>다른 학생에게 보이는 화면</h1>
      <p className="small muted">공개로 설정한 카드와 기록만 보여요. 함께한 사람의 한 줄 소개는 그 사람의 동의 정책이 정해지기 전까지 보이지 않고, 원소만 보여요.</p>
      <div className="panel" style={{ flexDirection: 'row', alignItems: 'center' }}><Atom el={me.elementId!} size={44} /><div className="grow"><strong>{me.nickname || ELEMENTS[me.elementId!].name}</strong><p className="small">{me.intro}</p></div></div>
      {cards.length === 0 && recs.length === 0 && <div className="panel flat"><p className="small muted">공개한 카드나 기록이 없어요.</p></div>}
      {cards.length > 0 && <div className="dex-grid">{cards.map((c) => <DexTile key={c.moleculeId} id={c.moleculeId} owned pending={false} mineFits={false} />)}</div>}
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
  const { s, viewer, run, go, backend, openProfile, openGuide } = useApp();
  const [out, setOut] = useState(false);
  const [doc, setDoc] = useState<'terms' | 'privacy' | null>(null);
  const me = s.users[viewer];
  const [intro, setIntro] = useState(me.intro);
  const [nick, setNick] = useState(me.nickname ?? '');
  const [tags, setTags] = useState<string[]>(me.tags ?? []);
  const mine = getProfile(s, viewer, viewer);
  const blocked = s.blocks.filter((b) => b.from === viewer);
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
      <TitlePicker s={s} viewer={viewer} run={run} />
      {mine && <div className="panel"><ReactionMeter score={mine.reaction.score} reviews={mine.reaction.reviews} /><button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => openProfile(viewer)}>다른 사람에게 보이는 내 프로필</button></div>}
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run({ type: 'updateProfile', actor: viewer, nickname: nick, tags }, '프로필을 저장했어요.'); }}>
        <NicknameInput id="nick-edit" value={nick} onChange={setNick} />
        <TagPicker value={tags} onChange={setTags} />
        <button className="btn primary sm" style={{ alignSelf: 'flex-end' }} disabled={nick.trim().length < 2 || (nick.trim() === (me.nickname ?? '') && tags.join() === (me.tags ?? []).join())}>저장</button>
      </form>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run({ type: 'updateIntro', actor: viewer, intro }, '한 줄 소개를 바꿨어요.'); }}>
        <label htmlFor="intro-edit"><h3>한 줄 소개</h3></label>
        <input id="intro-edit" className="input" maxLength={INTRO_MAX} value={intro} onChange={(e) => setIntro(e.target.value)} />
        <div className="row between"><span className="small muted mono">{intro.length}/{INTRO_MAX}</span><button className="btn primary sm" disabled={intro.trim() === me.intro || !intro.trim()}>저장</button></div>
        <p className="small muted">이미 남은 만남 기록에는 그때의 소개가 유지돼요.</p>
      </form>
      <section className="stack-s">
        <h2>참여한 실험실</h2>
        {rooms.length === 0 && <p className="small muted">아직 없어요.</p>}
        {rooms.map((r) => {
          const st = roomStatus(r); const left = !isMember(s, r.id, viewer);
          return (
            <button key={r.id} className="panel roomcard" style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }} onClick={() => go({ k: 'room', id: r.id })}>
              <span className="stack-s grow" style={{ gap: 0, minWidth: 0, textAlign: 'left' }}><strong>{roomTitle(r)}</strong><Formula f={moleculeById(r.targetMoleculeId)!.formula} className="small mono muted" /></span>
              {left && !r.closedAt && <span className="chip">나옴</span>}
              <span className={`chip ${st.cls}`}>{st.label}</span>
            </button>
          );
        })}
      </section>
      {blocked.length > 0 && (
        <section className="stack-s">
          <h2>차단한 사람</h2>
          {blocked.map((b) => <div key={b.to} className="row between panel" style={{ padding: 12 }}><span>{s.users[b.to]?.nickname || '알 수 없음'}</span><button className="btn sm" onClick={() => run({ type: 'unblock', actor: viewer, target: b.to }, '차단을 풀었어요.')}>차단 풀기</button></div>)}
        </section>
      )}
      {isAdminView(s, viewer) && <button className="btn block" onClick={() => go({ k: 'admin' })}>관리자 화면 · 처리 전 신고 {s.reports.filter((r) => r.status === 'open').length}</button>}
      <p className="small muted">{METAPHOR_NOTICE}</p>
      <section className="stack-s">
        <h2>앱과 알림</h2>
        <VacancyToggle s={s} viewer={viewer} run={run} />
        <InstallCard />
        <PushToggle viewer={viewer} run={run} demo={backend.mode === 'demo'} />
      </section>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="linkish small" onClick={() => setDoc('terms')}>이용약관</button><span className="small muted">·</span>
        <button className="linkish small" onClick={() => setDoc('privacy')}>개인정보 처리방침</button><span className="small muted">·</span>
        <button className="linkish small" onClick={openGuide}>사용 안내</button>
      </div>
      {doc && <DocSheet which={doc} onClose={() => setDoc(null)} />}
      {backend.signOut && <button className="btn block" disabled={out} onClick={async () => { setOut(true); await backend.signOut!(); location.reload(); }}>로그아웃</button>}
      <DeleteAccount viewer={viewer} run={run} onDeleted={async () => {
        if (backend.signOut) { await backend.signOut().catch(() => undefined); location.reload(); }
        else go({ k: 'home' });
      }} />
    </div>
  );
}

/** 방장: 실험실 이름·모이는 시각 고치기. 이름 없는 자동 매칭 실험실이면 먼저 열어 둔다 */
function RoomInfoEditor({ room }: { room: Room }) {
  const { viewer, run } = useApp();
  const [open, setOpen] = useState(!room.name);
  const [name, setName] = useState(room.name ?? '');
  const toLocal = (t: number) => { const d = new Date(t - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
  const [when, setWhen] = useState(room.meetAt ? toLocal(room.meetAt) : '');
  if (!open) return <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>실험실 이름·시각 바꾸기</button>;
  return (
    <form className={`panel${room.name ? '' : ' warn'}`} onSubmit={async (e) => {
      e.preventDefault();
      const r = await run({ type: 'renameRoom', actor: viewer, roomId: room.id, name, meetAt: when ? new Date(when).getTime() : null }, '실험실 정보를 바꿨어요.');
      if (r.ok) setOpen(false);
    }}>
      {!room.name && <p className="small"><strong>실험실 이름을 정해 주세요.</strong> 자동 매칭으로 만들어진 실험실이라 아직 이름이 없어요. 방장이 정할 수 있어요.</p>}
      <label className="stack-s" htmlFor={`rn-${room.id}`}><span className="small" style={{ fontWeight: 600 }}>실험실 이름</span>
        <input id={`rn-${room.id}`} className="input" maxLength={ROOM_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2시에 밥 먹을 사람" /></label>
      <label className="stack-s" htmlFor={`rw-${room.id}`}><span className="small" style={{ fontWeight: 600 }}>모이는 시각 (선택)</span>
        <input id={`rw-${room.id}`} className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      <div className="row">{room.name && <button type="button" className="btn ghost" onClick={() => setOpen(false)}>취소</button>}<button className="btn primary grow" disabled={name.trim().length < 2}>저장</button></div>
    </form>
  );
}

/** 만남이 확인된 뒤: 분자 카드 받기 + 반응 남기기 */
function ClaimPanel({ room }: { room: Room }) {
  const { s, viewer, run, openReveal, openReview } = useApp();
  const recs = s.records.filter((r) => r.userId === viewer && r.roomId === room.id);
  if (!recs.length) return null;
  const rec = recs[recs.length - 1] as MeetingRecord;
  const mt = s.meetings.find((m) => m.id === rec.meetingId);
  const left = mt ? mt.attendees.filter((a) => a.userId !== viewer && !s.reviews.some((x) => x.meetingId === mt.id && x.from === viewer && x.to === a.userId)).length : 0;
  return (
    <div className="panel claim-panel">
      {!rec.claimedAt ? (rec.moleculeId ? (
        <>
          <h3>첫 만남이 확인됐어요!</h3>
          <p className="small">함께 만난 구성으로 {molName(rec.moleculeId)} 카드가 생겼어요.</p>
          <button className="btn primary block claim-btn" onClick={() => openReveal(rec.id)}>분자 카드 받기</button>
        </>
      ) : (
        <>
          <h3>첫 만남이 확인됐어요</h3>
          <p className="small">참석 구성이 유효한 분자가 아니어서 카드 대신 만남 기록이 남았어요.</p>
          <button className="btn block" onClick={() => run({ type: 'claimCard', actor: viewer, recordId: rec.id }, '만남 기록을 받았어요.')}>만남 기록 받기</button>
        </>
      )) : <p className="small">{rec.moleculeId ? `${molName(rec.moleculeId)} 카드를 받았어요.` : '만남 기록을 받았어요.'}</p>}
      {mt && left > 0 && <button className="btn block" onClick={() => openReview(mt.id)}>함께한 사람에게 반응 남기기 · {left}명 남음</button>}
    </div>
  );
}

/** 방장: 캠퍼스 지도에 내 위치 보여 주기 */
function LocationShare() {
  const { s, viewer, run } = useApp();
  const on = !!s.users[viewer].sharingLocation;
  const loc = s.locations[viewer];
  return (
    <div className="panel" style={{ gap: 8 }}>
      <div className="row between">
        <span className="stack-s grow" style={{ gap: 0 }}><strong>내 위치를 캠퍼스 지도에 보여 주기</strong><span className="small muted">캠퍼스 안에 있는 모든 사용자가 볼 수 있어요</span></span>
        <button role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} onClick={() => run({ type: 'setSharing', actor: viewer, on: !on }, on ? '위치 공유를 껐어요.' : '위치 공유를 켰어요.')}><span /></button>
      </div>
      {on && <p className="small muted">{loc ? `마지막 위치 ${fmtTime(loc.at)} · ` : '위치를 찾는 중 · '}캠퍼스를 벗어나거나 첫 만남이 확인되면 자동으로 꺼져요. 위치 기록은 남기지 않고 마지막 위치 하나만 보여요.</p>}
    </div>
  );
}

function NearbyScreen() {
  const { s, viewer, go, now, backend } = useApp();
  return <Nearby s={s} viewer={viewer} now={now} onOpenRoom={(id) => go({ k: 'room', id })} refresh={() => (backend as Backend & { refresh?: () => Promise<void> }).refresh?.().catch(() => undefined)} />;
}

function AdminScreen() {
  const { s, viewer, run, go } = useApp();
  if (!isAdminView(s, viewer)) return <p>관리자만 볼 수 있어요.</p>;
  return <div className="stack"><button className="back" onClick={() => go({ k: 'profile' })}>← 내 정보</button><AdminView s={s} viewer={viewer} run={run} /></div>;
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
  const near = () => ({ lat: CAMPUS.center.lat + (Math.random() - 0.5) * 0.0004, lng: CAMPUS.center.lng + (Math.random() - 0.5) * 0.0004, acc: 20 });
  const othersConfirm = async () => { if (pm) for (const a of pm.attendees) if (a.userId !== viewer && !pm.confirmations[a.userId]) await run({ type: 'respondMeeting', actor: a.userId, meetingId: pm.id, response: 'confirm', loc: near() }); };
  const doneMeeting = r ? s.meetings.filter((m) => m.roomId === r.id && m.status === 'confirmed').at(-1) : undefined;
  const othersReview = async () => {
    if (!doneMeeting) return;
    const pool = ['kind', 'fun', 'again', 'punctual', 'caring', 'reply'];
    for (const a of doneMeeting.attendees) if (a.userId !== viewer && !s.reviews.some((x) => x.meetingId === doneMeeting.id && x.from === a.userId && x.to === viewer))
      await run({ type: 'review', actor: a.userId, meetingId: doneMeeting.id, to: viewer, tags: [pool[Math.floor(Math.random() * pool.length)]] });
  };
  const [sim, setSim] = useState(getSimulated());
  const hostActs = () => r && r.hostId !== viewer && setViewer(r.hostId);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="시연 도구" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>시연 도구</h2><button className="btn sm" onClick={onClose}>닫기</button></div>
        <p className="small muted">서버 없이 이 기기에서만 동작하는 시연이에요. 다른 사람은 모두 가상 사용자이고, 아래 버튼은 각 가상 사용자 본인 자격으로 행동해요.</p>

        <div className="panel">
          <label htmlFor="viewer-sel"><h3>누구의 화면으로 볼까요</h3></label>
          <select id="viewer-sel" className="input" value={viewer} onChange={(e) => setViewer(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.virtual ? `${u.demoLabel} ${u.nickname ?? ''}` : `나${u.elementId ? ` · ${u.elementId}` : ''}`} — {u.intro || '소개 없음'}</option>)}
          </select>
          {s.meId && viewer !== s.meId && <button className="btn sm" onClick={() => setViewer(s.meId!)}>내 화면으로 돌아가기</button>}
        </div>

        {r && (
          <div className="panel">
            <h3>지금 보는 실험실: {moleculeById(r.targetMoleculeId)!.formula}</h3>
            <div className="stack-s">
              <button className="btn block" disabled={!isRecruitingOpen(r)} onClick={fillOne}>빈자리 하나를 가상 사용자로 채우기</button>
              <button className="btn block" disabled={!isRecruitingOpen(r) || !!p} onClick={() => run({ type: 'expireRecruitment', roomId: r.id }, '모집 기한이 끝난 상황을 만들었어요.')}>모집 기한 끝내기</button>
              <button className="btn block" disabled={!p} onClick={() => othersVote('yes')}>투표: 다른 구성원 모두 동의</button>
              <button className="btn block" disabled={!p} onClick={() => othersVote('no')}>투표: 다른 구성원 한 명 반대</button>
              <button className="btn block" disabled={!p} onClick={() => p && run({ type: 'expireProposal', proposalId: p.id }, '응답 기한이 끝났어요.')}>투표 응답 기한 끝내기</button>
              <button className="btn block" disabled={!pm} onClick={othersConfirm}>만남: 다른 참석자 모두 확인</button>
              <button className="btn block" disabled={!doneMeeting} onClick={othersReview}>만남 후: 다른 참석자들이 나에게 반응 남기기</button>
              <button className="btn block" disabled={r.hostId === viewer} onClick={hostActs}>방장 화면으로 보기</button>
            </div>
          </div>
        )}

        {isDemoGeo() && (
          <div className="panel">
            <h3>내 위치 흉내 내기</h3>
            <p className="small muted">시연판은 진짜 GPS 대신 이 위치를 써요. 만남 확인과 주변 원자 찾기에 쓰여요.</p>
            <div className="seg">
              <button className={sim === 'campus' ? 'on' : ''} onClick={() => { setSimulated('campus'); setSim('campus'); }}>캠퍼스 안</button>
              <button className={sim === 'away' ? 'on' : ''} onClick={() => { setSimulated('away'); setSim('away'); }}>캠퍼스 밖</button>
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
            <div className="stack-s"><p className="small">내 원소와 모든 실험실, 카드가 지워지고 처음 상태로 돌아가요.</p>
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
        <div className="row between"><h1>주기율표</h1><button className="btn sm" onClick={() => go({ k: 'stats' })}>학교 원소 분포</button></div>
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
        <div className="row"><span className="pt-key on" aria-hidden="true" style={{ background: elementColor('O').bg }} /> 고를 수 있는 원소 <span className="pt-key" aria-hidden="true" style={{ marginLeft: 8 }} /> 아직 쓰지 않는 원소</div>
        <div className="row"><span className="pt-ramp" aria-hidden="true">{['C', 'H', 'N', 'O'].map((x) => <span key={x} style={{ background: elementColor(x).bg }} />)}</span> 분자 모형에서 흔히 쓰는 CPK 색이에요</div>
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
            <p className="small muted">지금 {ELEMENTS[el].name} 자리가 남은 모집 중인 실험실 {openRooms}곳</p>
            {el === mine && openRooms > 0 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go({ k: 'rooms' })}>내 자리 있는 실험실 보기</button>}
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
