import type React from 'react';
import { ELEMENTS } from './elements';
import { moleculeById, type AtomCounts, type ElementId } from './molecules';
import { slotsOf } from './chemistry';
import type { RoomMember } from './types';

export function Atom({ el, size = 40, empty, me, title }: { el: ElementId; size?: number; empty?: boolean; me?: boolean; title?: string }) {
  return (
    <span className={`atom el-${el}${empty ? ' empty' : ''}${me ? ' me' : ''}`} style={{ ['--s' as string]: `${size}px` }}
      title={title ?? `${ELEMENTS[el].name}${empty ? ' 빈자리' : ''}`} aria-label={`${ELEMENTS[el].name}${empty ? ' 빈자리' : ''}`}>
      {el}
    </span>
  );
}

/** 목표 분자의 자리들을 결합선으로 잇고, 채워진 자리와 빈자리를 텍스트로도 구분한다. */
export function MoleculeStrip({ target, members, meId, size = 38, labels = true, formula }: { target: AtomCounts; members: RoomMember[]; meId?: string | null; size?: number; labels?: boolean; formula?: string }) {
  const slots = slotsOf(target, formula);
  const pool = [...members];
  const filled = slots.map((el) => { const i = pool.findIndex((m) => m.elementSnapshot === el); return i >= 0 ? pool.splice(i, 1)[0] : null; });
  return (
    <div className="strip" role="list">
      {slots.map((el, i) => (
        <span key={i} className="row" style={{ gap: 0, flexWrap: 'nowrap' }} role="listitem">
          {i > 0 && <span className="bond" aria-hidden="true" />}
          <span className="slot">
            <Atom el={el} size={size} empty={!filled[i]} me={!!filled[i] && filled[i]!.userId === meId} />
            {labels && <span className="slot-label">{filled[i] ? (filled[i]!.userId === meId ? '나' : '참여') : '빈자리'}</span>}
          </span>
        </span>
      ))}
    </div>
  );
}

const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6' };
/** 아래첨자 글리프 대신 <sub>로 그려 글꼴 대체를 피한다. */
export function Formula({ f, className = 'formula', style }: { f: string; className?: string; style?: React.CSSProperties }) {
  const parts = f.split(/([₀-₆]+)/).filter(Boolean);
  return <span className={className} style={style} aria-label={f}>{parts.map((p, i) => /[₀-₆]/.test(p) ? <sub key={i}>{[...p].map((c) => SUB[c]).join('')}</sub> : <span key={i}>{p}</span>)}</span>;
}

export function MolTitle({ id, big }: { id: string; big?: boolean }) {
  const m = moleculeById(id)!;
  return (
    <div className="stack-s" style={{ gap: 2 }}>
      <Formula f={m.formula} className={`formula${big ? ' xl' : ''}`} />
      <span className="muted small">{m.name} · {m.totalAtoms}명{m.kind === 'ionic' ? ' · 이온 결정' : ''}</span>
    </div>
  );
}

export function Icon({ name }: { name: 'home' | 'search' | 'table' | 'cards' | 'user' }) {
  const p: Record<string, JSX.Element> = {
    home: <><circle cx="12" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M10.5 9.5 7.5 14.5M13.5 9.5l3 5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
    table: <><rect x="3" y="4" width="5" height="5" rx="1" /><rect x="16" y="4" width="5" height="5" rx="1" /><rect x="3" y="11" width="5" height="5" rx="1" /><rect x="10" y="11" width="5" height="5" rx="1" /><rect x="16" y="11" width="5" height="5" rx="1" /><rect x="3" y="18" width="18" height="2" rx="1" /></>,
    cards: <><rect x="4" y="5" width="12" height="15" rx="2" /><path d="M8 3h10a2 2 0 0 1 2 2v13" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">{p[name]}</svg>;
}

export const fmtTime = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (t: number) => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
