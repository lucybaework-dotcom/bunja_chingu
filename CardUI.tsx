// 분자 카드: 실제 카드 모양(앞/뒤 뒤집기), 도감, 넘겨 보기, 카드 받기 연출
import { useEffect, useRef, useState } from 'react';
import { ELEMENTS } from './elements';
import { kindLabel, moleculeById, USABLE, type ElementId } from './molecules';
import type { MeetingRecord } from './types';
import { slotsOf } from './chemistry';
import { Atom, Formula, fmtDate } from './bits';
import { elementColor } from './colors';
import Molecule3D from './Molecule3D';

export const dexNo = (id: string) => USABLE().findIndex((m) => m.id === id) + 1;

function foil(id: string) {
  const m = moleculeById(id)!;
  // 원소 색 사이사이에 금색·청록 홀로그램 색을 섞어 흰색(H)만 있는 카드도 테두리가 보이게
  const cs = [...new Set(slotsOf(m.atomCounts, m.formula))].map((e) => elementColor(e).bg);
  const holo = ['#d9b45a', '#5fc4cc', '#c792ea'];
  const stops = cs.flatMap((c, i) => [c, holo[i % holo.length]]);
  return `conic-gradient(from 210deg, ${[...stops, ...stops, stops[0]].join(', ')})`;
}

/** 카드 한 장. records가 있으면 뒷면에 만남 기록을, 없으면 카드 뒷면 무늬를 보여 준다 */
export function MolCard({ id, flipped = false, onFlip, records, live3d = true, tilt = true }: {
  id: string; flipped?: boolean; onFlip?: () => void; records?: MeetingRecord[]; live3d?: boolean; tilt?: boolean;
}) {
  const m = moleculeById(id)!;
  const ref = useRef<HTMLDivElement>(null);
  const counts = Object.entries(m.atomCounts) as [ElementId, number][];
  const move = (e: React.PointerEvent) => {
    if (!tilt || !ref.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const b = ref.current.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    ref.current.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
    ref.current.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    ref.current.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
    ref.current.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
  };
  const leave = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); };
  return (
    <div className="tcard" ref={ref} onPointerMove={move} onPointerLeave={leave}>
      <button type="button" className={`tcard-inner${flipped ? ' flipped' : ''}`} onClick={onFlip} aria-label={`${m.name} 카드${flipped ? ' 뒷면' : ' 앞면'}. 눌러서 뒤집기`}>
        <div className="tcard-face tcard-front" style={{ ['--foil' as string]: foil(id) }}>
          <div className="tcard-body">
            <div className="row between tcard-top"><span className="mono">No.{String(dexNo(id)).padStart(2, '0')}</span><span>{kindLabel(m)}</span></div>
            <div className="tcard-title"><Formula f={m.formula} className="formula" /><span className="tcard-name">{m.name}</span></div>
            <div className="tcard-art">{live3d ? <Molecule3D id={id} height={150} label={m.name} bare /> : <MiniAtoms id={id} />}</div>
            <div className="tcard-atoms">{counts.map(([e, n]) => <span key={e} className="row" style={{ gap: 3 }}><Atom el={e} size={20} /><span className="mono small">×{n}</span></span>)}</div>
            <p className="tcard-note">{m.stabilityNote}</p>
          </div>
          <span className="tcard-shine" aria-hidden="true" />
        </div>
        <div className="tcard-face tcard-back" style={{ ['--foil' as string]: foil(id) }}>
          {records ? (
            <div className="tcard-body">
              <div className="row between tcard-top"><span className="mono">No.{String(dexNo(id)).padStart(2, '0')}</span><span>함께한 만남 {records.length}회</span></div>
              <div className="stack-s" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                {records.map((r) => (
                  <div key={r.id} className="tcard-rec">
                    <span className="small mono">{fmtDate(r.createdAt)}</span>
                    <span className="row" style={{ gap: 4 }}>{r.companions.map((c, i) => <Atom key={i} el={c.element} size={20} />)}<span className="small">와 함께</span></span>
                  </div>
                ))}
              </div>
              <p className="tcard-note">기록에는 만난 날의 원소와 한 줄 소개가 그대로 남아요.</p>
            </div>
          ) : <CardBackPattern />}
        </div>
      </button>
    </div>
  );
}

function MiniAtoms({ id }: { id: string }) {
  const m = moleculeById(id)!;
  return <div className="row" style={{ justifyContent: 'center', gap: 4, flexWrap: 'wrap', padding: 12 }}>{slotsOf(m.atomCounts, m.formula).map((e, i) => <Atom key={i} el={e} size={30} />)}</div>;
}

export function CardBackPattern() {
  return (
    <div className="tcard-backart" aria-hidden="true">
      <div className="hero-model" style={{ justifyContent: 'center' }}>
        <Atom el="H" size={30} /><span className="bond" style={{ width: 14, height: 4, background: 'currentColor' }} />
        <Atom el="O" size={44} /><span className="bond" style={{ width: 14, height: 4, background: 'currentColor' }} />
        <Atom el="H" size={30} />
      </div>
      <span className="tcard-brand">분자친구</span>
    </div>
  );
}

/** 도감 한 칸 */
export function DexTile({ id, owned, pending, mineFits, onOpen }: { id: string; owned: boolean; pending: boolean; mineFits: boolean; onOpen?: () => void }) {
  const m = moleculeById(id)!;
  return (
    <button type="button" className={`dex${owned ? ' owned' : ' locked'}`} style={owned ? { ['--foil' as string]: foil(id) } : undefined} onClick={onOpen} disabled={!owned && !pending}
      aria-label={`${m.name} ${owned ? '모음' : pending ? '받을 수 있음' : '아직 못 모음'}`}>
      <span className="dex-no mono">{String(dexNo(id)).padStart(2, '0')}</span>
      <Formula f={m.formula} className="formula dex-f" />
      <span className="dex-name">{m.name}</span>
      <span className="dex-meta">
        {owned ? <span className="chip on">모음</span> : pending ? <span className="chip warn">받기 대기</span> : <svg className="dex-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
        {!owned && mineFits && <span className="dex-fit">내 자리 있음</span>}
      </span>
    </button>
  );
}

/** 모은 카드를 옆으로 넘겨 보기. 누르면 뒤집힌다 */
export function CardCarousel({ ids, start, recordsOf, onIndex }: { ids: string[]; start: string; recordsOf: (id: string) => MeetingRecord[]; onIndex?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [cur, setCur] = useState(Math.max(0, ids.indexOf(start)));
  // 카드 i를 가운데에 두려면 얼마나 스크롤해야 하는지 (화면 좌표로 계산해서 레이아웃과 무관하게)
  const leftFor = (el: HTMLDivElement, i: number) => {
    const k = el.children[i] as HTMLElement | undefined; if (!k) return 0;
    const box = el.getBoundingClientRect(), kb = k.getBoundingClientRect();
    return el.scrollLeft + (kb.left - box.left) - (box.width - kb.width) / 2;
  };
  const target = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.scrollTo({ left: leftFor(el, Math.max(0, ids.indexOf(start))), behavior: 'auto' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const box = el.getBoundingClientRect(); const mid = box.left + box.width / 2;
    let best = 0, bd = Infinity;
    [...el.children].forEach((k, i) => { const r = k.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = i; } });
    // 버튼으로 넘기는 중에는 도착할 때까지 목표 카드를 유지한다
    if (target.current !== null) { if (best !== target.current) return; target.current = null; }
    if (best !== cur) { setCur(best); onIndex?.(ids[best]); }
  };
  const go = (d: number) => {
    const el = ref.current; if (!el) return;
    const i = Math.min(ids.length - 1, Math.max(0, (target.current ?? cur) + d));
    target.current = i; setCur(i); onIndex?.(ids[i]);
    el.scrollTo({ left: leftFor(el, i), behavior: 'smooth' });
    window.setTimeout(() => { if (target.current === i) target.current = null; }, 900);
  };
  return (
    <div className="stack-s">
      <div className="carousel" ref={ref} onScroll={onScroll}>
        {ids.map((id, i) => (
          <div key={id} className={`carousel-slot${i === cur ? ' cur' : ''}`}>
            <MolCard id={id} flipped={!!flip[id]} onFlip={() => setFlip({ ...flip, [id]: !flip[id] })} records={recordsOf(id)} live3d={Math.abs(i - cur) <= 1} />
          </div>
        ))}
      </div>
      <div className="row between">
        <button className="btn sm" onClick={() => go(-1)} disabled={cur === 0} aria-label="이전 카드">←</button>
        <span className="small muted mono">{cur + 1} / {ids.length} · 눌러서 뒤집기</span>
        <button className="btn sm" onClick={() => go(1)} disabled={cur === ids.length - 1} aria-label="다음 카드">→</button>
      </div>
    </div>
  );
}

/** 카드 받기 연출: 포장된 카드가 흔들리다 터지면서 앞면으로 뒤집힌다 */
export function CardReveal({ record, onClaim, onClose }: { record: MeetingRecord; onClaim: () => Promise<boolean>; onClose: () => void }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<'pack' | 'burst' | 'show'>(reduce ? 'show' : 'pack');
  const [busy, setBusy] = useState(false);
  const claimed = useRef(false);
  const id = record.moleculeId;
  const open = async () => {
    if (stage !== 'pack') return;
    setStage('burst');
    if (!claimed.current) { claimed.current = true; setBusy(true); const ok = await onClaim(); setBusy(false); if (!ok) { onClose(); return; } }
    setTimeout(() => setStage('show'), 650);
  };
  useEffect(() => { if (reduce && !claimed.current) { claimed.current = true; void onClaim(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  const m = moleculeById(id)!;
  const els = [...new Set(slotsOf(m.atomCounts, m.formula))];
  return (
    <div className="reveal-bg" role="dialog" aria-label="분자 카드 받기">
      <div className={`reveal stage-${stage}`}>
        {stage !== 'show' && <p className="reveal-hint">{stage === 'pack' ? '카드를 눌러서 열어 보세요' : busy ? '반응 중…' : '반응 중…'}</p>}
        <div className="reveal-card" onClick={open}>
          <MolCard id={id} flipped={stage !== 'show'} tilt={stage === 'show'} />
        </div>
        {stage !== 'pack' && !reduce && (
          <div className="sparks" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => {
              const e = els[i % els.length];
              return <span key={i} className="spark" style={{ ['--a' as string]: `${(i / 14) * 360}deg`, ['--d' as string]: `${90 + (i % 3) * 30}px`, background: elementColor(e).bg }} />;
            })}
          </div>
        )}
        {stage === 'show' && (
          <div className="stack-s reveal-text">
            <h2>{m.name} 카드를 얻었어요!</h2>
            <p className="small">{ELEMENTS[els[0]].name}{els.length > 1 ? ' 외 ' + (els.length - 1) + '종류의 원자' : ''}가 실제로 만나서 만든 분자예요.</p>
            <button className="btn primary block" onClick={onClose}>컬렉션에 넣기</button>
          </div>
        )}
      </div>
    </div>
  );
}
