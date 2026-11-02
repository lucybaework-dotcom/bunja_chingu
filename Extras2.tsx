// 빈자리 알림, 업적·칭호, 학교 원소 분포, 첫 사용 안내
import { useState } from 'react';
import { ACHIEVEMENTS, achievementById } from './achievements';
import { ELEMENTS } from './elements';
import { usableElements } from './chemistry';
import { achCtx, earnedTitles, elementStats, type Command } from './engine';
import type { DispatchResult } from './backend';
import type { State } from './types';
import type { ElementId } from './molecules';
import { Atom } from './bits';
import { josaOf } from './josa';
import { elementColor } from './colors';

type Run = (c: Command, ok?: string) => Promise<DispatchResult>;

export function VacancyToggle({ s, viewer, run }: { s: State; viewer: string; run: Run }) {
  const me = s.users[viewer]; const on = !!me.vacancyAlert;
  return (
    <div className="panel">
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <span className="stack-s grow" style={{ gap: 0 }}><strong>내 원소 빈자리 알림</strong>
          <span className="small muted">{ELEMENTS[me.elementId!].name} 자리가 생기면 알려 줘요.</span></span>
        <button role="switch" aria-checked={on} aria-label="내 원소 빈자리 알림" className={`switch${on ? ' on' : ''}`}
          onClick={() => run({ type: 'setVacancyAlert', actor: viewer, on: !on }, on ? '빈자리 알림을 껐어요.' : '빈자리가 생기면 알려 드릴게요.')}><span /></button>
      </div>
    </div>
  );
}

export const TitleChip = ({ id }: { id?: string | null }) => { const a = id ? achievementById(id) : null; return a ? <span className="chip title-chip">{a.title}</span> : null; };

/** 업적 목록 (컬렉션 화면). 진행도와 함께 보여 준다 */
export function Achievements({ s, viewer }: { s: State; viewer: string }) {
  const c = achCtx(s, viewer);
  const [all, setAll] = useState(false);
  const rate = (a: (typeof ACHIEVEMENTS)[number]) => { const [n, g] = a.goal(c); return Math.min(1, n / g); };
  const sorted = [...ACHIEVEMENTS].sort((a, b) => rate(b) - rate(a));
  const done = ACHIEVEMENTS.filter((a) => rate(a) >= 1).length;
  const shown = all ? sorted : sorted.slice(0, Math.max(4, done + 2));
  return (
    <section className="stack-s">
      <div className="section-title"><h2>업적</h2><span className="mono small muted">{done}/{ACHIEVEMENTS.length}</span></div>
      <div className="ach-grid">
        {shown.map((a) => {
          const [n, g] = a.goal(c); const ok = n >= g;
          return (
            <div key={a.id} className={`ach${ok ? ' done' : ''}`}>
              <span className="ach-badge" aria-hidden="true">{ok ? '★' : '☆'}</span>
              <span className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
                <strong className="small">{a.title}</strong>
                <span className="small muted">{a.desc}</span>
                {!ok && <span className="ach-bar" aria-label={`${Math.min(n, g)}/${g}`}><span style={{ width: `${(Math.min(n, g) / g) * 100}%` }} /></span>}
              </span>
              <span className="mono small muted">{ok ? '달성' : `${Math.min(n, g)}/${g}`}</span>
            </div>
          );
        })}
      </div>
      {shown.length < sorted.length && <button className="btn ghost block" onClick={() => setAll(true)}>업적 {sorted.length - shown.length}개 더 보기</button>}
    </section>
  );
}

export function TitlePicker({ s, viewer, run }: { s: State; viewer: string; run: Run }) {
  const earned = earnedTitles(s, viewer); const cur = s.users[viewer].title ?? null;
  return (
    <div className="panel" style={{ gap: 8 }}>
      <h3>칭호</h3>
      {earned.length === 0 ? <p className="small muted">첫 카드를 받으면 생겨요.</p> : (
        <div className="row" style={{ gap: 6 }}>
          <button className={`chip pick${cur === null ? ' on' : ''}`} aria-pressed={cur === null} onClick={() => run({ type: 'setTitle', actor: viewer, title: null }, '칭호를 뗐어요.')}>달지 않기</button>
          {earned.map((id) => <button key={id} className={`chip pick${cur === id ? ' on' : ''}`} aria-pressed={cur === id} onClick={() => run({ type: 'setTitle', actor: viewer, title: id }, `‘${achievementById(id)!.title}’ 칭호를 달았어요.`)}>{achievementById(id)!.title}</button>)}
        </div>
      )}
    </div>
  );
}

/** 학교 원소 분포. 서버 보기에는 stats가 들어 있고, 시연판은 이 기기 상태로 계산한다 */
export function ElementStats({ s, viewer }: { s: State & { stats?: ReturnType<typeof elementStats> }; viewer: string }) {
  const st = s.stats ?? elementStats(s);
  const els = usableElements() as ElementId[];
  const max = Math.max(1, ...els.map((e) => st.counts[e] ?? 0));
  const mine = s.users[viewer]?.elementId;
  const sorted = [...els].sort((a, b) => (st.counts[b] ?? 0) - (st.counts[a] ?? 0));
  const rare = sorted.filter((e) => (st.counts[e] ?? 0) > 0).at(-1);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="stack-s"><h1>우리 학교 원소 분포</h1>
        <p className="small muted">{st.total}명 기준</p></div>
      <div className="panel stats" role="list">
        {sorted.map((e) => {
          const n = st.counts[e] ?? 0; const pct = st.total ? Math.round((n / st.total) * 100) : 0; const c = elementColor(e);
          return (
            <div key={e} className={`stat-row${e === mine ? ' me' : ''}`} role="listitem" aria-label={`${ELEMENTS[e].name} ${n}명`}>
              <Atom el={e} size={26} />
              <span className="stat-name small">{ELEMENTS[e].name}{e === mine && <span className="muted"> · 나</span>}</span>
              <span className="stat-bar"><span style={{ width: `${(n / max) * 100}%`, background: c.bg, borderColor: c.bg.toLowerCase() === '#ffffff' ? '#8a96a0' : c.bg }} /></span>
              <span className="mono small stat-n">{n}<span className="muted"> · {pct}%</span></span>
            </div>
          );
        })}
      </div>
      {rare && st.total >= 5 && <p className="small">지금 가장 귀한 원소는 <strong>{ELEMENTS[rare].name}</strong>{josaOf(ELEMENTS[rare].name, '이에요/예요')}.</p>}
    </div>
  );
}

const GUIDE = [
  { t: '나는 원소 하나', d: '고른 원소가 나예요. 정하면 못 바꿔요.', ic: ['H'] },
  { t: '실험실에 모여 분자 만들기', d: 'H₂O면 수소 둘, 산소 하나. 실험실을 찾거나 자동 매칭해요.', ic: ['H', 'O', 'H'] },
  { t: '채팅하고 약속 잡기', d: '약속은 채팅 위에 고정되고 10분 전에 알려 줘요.', ic: ['O'] },
  { t: '만나서 확인하고 카드 받기', d: '모두 100m 안에서 확인하면 카드를 받아요.', ic: ['N', 'H', 'H', 'H'] },
] as const;

export function GuideSheet({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const g = GUIDE[i]; const last = i === GUIDE.length - 1;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet guide" role="dialog" aria-label="몰링크 사용 안내" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><span className="mono small muted">{i + 1} / {GUIDE.length}</span><button className="btn sm ghost" onClick={onClose}>건너뛰기</button></div>
        <div className="guide-art" key={i} aria-hidden="true">{g.ic.map((e, k) => <Atom key={k} el={e as ElementId} size={k === 1 && g.ic.length === 3 ? 60 : 46} />)}</div>
        <h2>{g.t}</h2>
        <p>{g.d}</p>
        <div className="guide-dots" aria-hidden="true">{GUIDE.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row">
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>이전</button>}
          <button className="btn primary grow" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? '시작하기' : '다음'}</button>
        </div>
      </div>
    </div>
  );
}
const GUIDE_KEY = 'bunja-guide-seen-v1';
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 무시 */ } };
