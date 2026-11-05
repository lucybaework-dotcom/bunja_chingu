// 분자 카드: 실제 카드 모양(앞/뒤 뒤집기), 도감, 넘겨 보기, 카드 받기 연출
import { useEffect, useRef, useState } from 'react';
import { ELEMENTS } from './elements';
import { josaOf } from './josa';
import { kindLabel, moleculeById, USABLE, type ElementId } from './molecules';
import type { MeetingRecord } from './types';
import { slotsOf } from './chemistry';
import { Atom, Formula, fmtDate } from './bits';
import { elementColor } from './colors';
import Molecule3D from './Molecule3D';

export const dexNo = (id: string) => USABLE().findIndex((m) => m.id === id) + 1;

/** 원자 수가 많을수록 레어한 테두리: 2 브론즈 · 3 실버 · 4 골드 · 5 다이아 · 6 무지개 */
export const RARITY = [
  { min: 0, id: 'bronze', label: '브론즈', foil: 'linear-gradient(135deg, #7a4a24 0%, #c98a52 22%, #f0c08e 38%, #a8662f 55%, #e2a873 75%, #6e3f1c 100%)' },
  { min: 3, id: 'silver', label: '실버', foil: 'linear-gradient(135deg, #8d969e 0%, #e9eef2 20%, #b4bcc3 40%, #ffffff 52%, #9ea7af 70%, #dfe5ea 85%, #7d868e 100%)' },
  { min: 4, id: 'gold', label: '골드', foil: 'linear-gradient(135deg, #9a6b12 0%, #f6d36b 20%, #fff2b8 34%, #d9a62b 50%, #ffe28a 68%, #b07d18 84%, #f3c94f 100%)' },
  { min: 5, id: 'diamond', label: '다이아', foil: 'conic-gradient(from 200deg, #6fd3ff, #ffffff, #3aa8e0, #d9f6ff, #9b8cff, #ffffff, #5cc8f2, #c9f1ff, #6fd3ff)' },
  { min: 6, id: 'rainbow', label: '무지개', foil: 'conic-gradient(from 210deg, #ff5f6d, #ffb347, #ffe66d, #7bed9f, #4facfe, #a77bff, #ff6ec7, #ff5f6d)' },
] as const;
export const rarityOf = (id: string) => { const n = moleculeById(id)!.totalAtoms; return [...RARITY].reverse().find((r) => n >= r.min)!; };
const foil = (id: string) => rarityOf(id).foil;

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
        <div className={`tcard-face tcard-front r-${rarityOf(id).id}`} style={{ ['--foil' as string]: foil(id) }}>
          <div className="tcard-body">
            <div className="row between tcard-top"><span className="mono">No.{String(dexNo(id)).padStart(2, '0')}</span><span className="row" style={{ gap: 6 }}><span>{kindLabel(m)}</span><span className={`rarity r-${rarityOf(id).id}`}>{rarityOf(id).label}</span></span></div>
            <div className="tcard-title"><Formula f={m.formula} className="formula" /><span className="tcard-name">{m.name}</span></div>
            <div className="tcard-art">{live3d ? <Molecule3D id={id} height={150} label={m.name} bare /> : <MiniAtoms id={id} />}</div>
            <div className="tcard-atoms">{counts.map(([e, n]) => <span key={e} className="row" style={{ gap: 3 }}><Atom el={e} size={20} /><span className="mono small">×{n}</span></span>)}</div>
            <p className="tcard-note">{m.stabilityNote}</p>
          </div>
          <span className="tcard-shine" aria-hidden="true" />
        </div>
        <div className={`tcard-face tcard-back r-${rarityOf(id).id}`} style={{ ['--foil' as string]: foil(id) }}>
          {records ? (
            <div className="tcard-body">
              <div className="row between tcard-top"><span className="mono">No.{String(dexNo(id)).padStart(2, '0')}</span><span>함께한 만남 {records.length}회</span></div>
              <div className="stack-s" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                {records.map((r) => (
                  <div key={r.id} className="tcard-rec">
                    <span className="small mono">{fmtDate(r.createdAt)}</span>
                    <span className="row tcard-with">{r.companions.map((c, i) => { const n = c.nickname || ELEMENTS[c.element].name; const last = i === r.companions.length - 1; return <span key={i} className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><Atom el={c.element} size={20} /><span className="small">{n}{last ? josaOf(n, '과/와') + ' 함께' : ','}</span></span>; })}</span>
                  </div>
                ))}
              </div>
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
    <button type="button" className={`dex${owned ? ` owned r-${rarityOf(id).id}` : ' locked'}`} style={owned ? { ['--foil' as string]: foil(id) } : undefined} onClick={onOpen} disabled={!owned && !pending}
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

/* ───── 카드 받기: 카드 봉지를 옆으로 밀어 뜯으면 카드가 슉 올라오고, 뒤집히며 앞면이 나온다 ───── */
type Stage = 'pack' | 'tear' | 'out' | 'flip' | 'show';
// 뜯는 선의 들쭉날쭉한 모양 (px). 위 조각과 아래 봉지가 똑같은 선을 나눠 가진다
const JAG = [3, 7, 2, 8, 4, 9, 3, 6, 1, 7, 5, 9, 2, 6, 3, 8, 4, 7, 2, 5, 3];
const TEAR_Y = 13; // 봉지 위에서 몇 % 지점을 뜯나
const tearLine = JAG.map((d, i) => `${(i / (JAG.length - 1)) * 100}% calc(${TEAR_Y}% + ${d}px)`);
const crimp = (y0: string, y1: string, n = 24) => Array.from({ length: n + 1 }, (_, i) => `${(i / n) * 100}% ${i % 2 ? y1 : y0}`);
const TOP_CLIP = `polygon(${[...crimp('0px', '6px'), ...[...tearLine].reverse()].join(',')})`;
const BODY_CLIP = `polygon(${[...tearLine, ...[...crimp('100%', 'calc(100% - 6px)')].reverse()].join(',')})`;

/** 등급별 연출 세기: 레어할수록 빛·불꽃·꽃가루·흔들림이 많아진다 */
const TIER = {
  bronze: { n: 0, sparks: 8, confetti: 0, twinkles: 0, rings: 0, wait: 0, vib: [20] as number[], colors: ['#c98a52', '#f0c08e'] },
  silver: { n: 1, sparks: 12, confetti: 0, twinkles: 0, rings: 0, wait: 0, vib: [25], colors: ['#dfe5ea', '#ffffff'] },
  gold: { n: 2, sparks: 18, confetti: 26, twinkles: 0, rings: 1, wait: 250, vib: [30, 40, 40], colors: ['#f6d36b', '#fff2b8', '#d9a62b'] },
  diamond: { n: 3, sparks: 24, confetti: 38, twinkles: 10, rings: 2, wait: 500, vib: [30, 40, 60, 40, 60], colors: ['#6fd3ff', '#ffffff', '#9b8cff', '#c9f1ff'] },
  rainbow: { n: 4, sparks: 32, confetti: 64, twinkles: 16, rings: 3, wait: 800, vib: [40, 40, 60, 40, 80, 40, 160], colors: ['#ff5f6d', '#ffb347', '#ffe66d', '#7bed9f', '#4facfe', '#a77bff', '#ff6ec7'] },
} as const;

export function CardReveal({ record, onClaim, onClose }: { record: MeetingRecord; onClaim: () => Promise<boolean>; onClose: () => void }) {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<Stage>(reduce ? 'show' : 'pack');
  const [pull, setPull] = useState(0); // 0~1 얼마나 뜯었나
  const claim = useRef<Promise<boolean> | null>(null);
  const drag = useRef<{ x: number; w: number; moved: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const id = record.moleculeId;
  const tier = TIER[id ? rarityOf(id).id : 'bronze'];
  useEffect(() => { if (reduce && !claim.current) claim.current = onClaim(); return () => timers.current.forEach(clearTimeout); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const tear = () => {
    if (stage !== 'pack') return;
    claim.current ??= onClaim();
    try { navigator.vibrate?.(tier.vib); } catch { /* 무시 */ }
    setPull(1); setStage('tear');
    later(380, () => setStage('out'));
    later(380 + 560 + tier.wait, async () => {
      if (!(await claim.current)) { onClose(); return; }
      setStage('flip');
      later(800, () => setStage('show'));
    });
  };
  const down = (e: React.PointerEvent) => {
    if (stage !== 'pack') return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, w: (e.currentTarget as HTMLElement).clientWidth, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || stage !== 'pack') return;
    const p = Math.min(1, Math.abs(e.clientX - d.x) / (d.w * 0.6));
    if (p > 0.04) d.moved = true;
    setPull(p);
    if (p >= 1) { drag.current = null; tear(); }
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d || stage !== 'pack') return;
    if (!d.moved || pull > 0.45) tear(); else setPull(0); // 톡 누르거나 절반 넘게 밀면 뜯긴다
  };

  if (!id) return null;
  const m = moleculeById(id)!;
  const r = rarityOf(id);
  const els = [...new Set(slotsOf(m.atomCounts, m.formula))];
  const opened = stage === 'flip' || stage === 'show';
  const fx = !reduce && opened;
  const col = (i: number) => tier.colors[i % tier.colors.length];
  return (
    <div className={`reveal-bg tier-${r.id}${fx ? ' fx-on' : ''}`} role="dialog" aria-label="분자 카드 받기" style={{ ['--t1' as string]: tier.colors[0], ['--t2' as string]: tier.colors[1] }}>
      {fx && tier.n >= 2 && <div className="fx-flash" aria-hidden="true" />}
      {fx && tier.confetti > 0 && (
        <div className="fx-confetti" aria-hidden="true">
          {Array.from({ length: tier.confetti }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, background: col(i), ['--d' as string]: `${(i % 7) * 0.09}s`, ['--x' as string]: `${((i * 53) % 120) - 60}px`, ['--r' as string]: `${(i * 97) % 720}deg`, ['--s' as string]: `${1.6 + (i % 5) * 0.25}s`, width: i % 3 ? 7 : 10, height: i % 3 ? 12 : 6 }} />
          ))}
        </div>
      )}
      <div className={`reveal st-${stage}`}>
        <p className="reveal-hint" aria-live="polite">{stage === 'pack' ? '봉지 윗부분을 옆으로 쭉 밀어 뜯어 보세요' : ''}</p>
        <div className="pk-stage" role="button" tabIndex={0} aria-label="카드 봉지 뜯기"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setPull(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tear(); } }}
          style={{ ['--pull' as string]: pull, ['--foil' as string]: r.foil }}>
          {fx && tier.n >= 1 && <div className={`pk-rays r-${r.id}`} aria-hidden="true" />}
          {fx && Array.from({ length: tier.rings }, (_, i) => <div key={i} className="pk-ring" style={{ animationDelay: `${i * 0.18}s` }} aria-hidden="true" />)}
          {!opened && tier.n >= 2 && (stage === 'tear' || stage === 'out') && <div className="pk-leak" style={{ top: `${TEAR_Y}%` }} aria-hidden="true" />}
          <div className="pk-card"><MolCard id={id} flipped={!opened} tilt={stage === 'show'} live3d={opened} /></div>
          {!opened && (
            <div className="pk-pouch" aria-hidden="true">
              <div className="pk-part pk-body" style={{ clipPath: BODY_CLIP }}>
                <div className="pk-logo">
                  <span className="pk-atoms"><i className="h">H</i><b /><i className="o">O</i></span>
                  <strong>분자친구</strong>
                  <span className="pk-sub">MOLECULE CARD PACK</span>
                  <span className="pk-count">분자 카드 1장</span>
                </div>
              </div>
              <div className="pk-part pk-top" style={{ clipPath: TOP_CLIP }} />
              {stage === 'pack' && <div className="pk-cut" style={{ top: `${TEAR_Y}%` }}><span>✂</span></div>}
            </div>
          )}
          {fx && (
            <div className="sparks" aria-hidden="true">
              {Array.from({ length: tier.sparks }, (_, i) => {
                const e = els[i % els.length];
                return <span key={i} className="spark" style={{ ['--a' as string]: `${(i / tier.sparks) * 360}deg`, ['--d' as string]: `${100 + tier.n * 22 + (i % 3) * 35}px`, background: i % 2 && tier.n >= 2 ? col(i) : elementColor(e).bg }} />;
              })}
            </div>
          )}
          {fx && tier.twinkles > 0 && (
            <div className="twinkles" aria-hidden="true">
              {Array.from({ length: tier.twinkles }, (_, i) => (
                <span key={i} style={{ left: `${(i * 41 + 7) % 100}%`, top: `${(i * 67 + 11) % 100}%`, color: col(i), animationDelay: `${(i % 6) * 0.22}s`, fontSize: 12 + (i % 3) * 7 }}>✦</span>
              ))}
            </div>
          )}
        </div>
        {stage === 'show' && (
          <div className="stack-s reveal-text">
            <h2><span className={`rarity r-${r.id}`} style={{ fontSize: 13, verticalAlign: 3 }}>{r.label}</span> {m.name} 카드를 얻었어요!</h2>
            <p className="small">{ELEMENTS[els[0]].name}{els.length > 1 ? ' 외 ' + (els.length - 1) + '종류의 원자' : ''}가 실제로 만나서 만든 분자예요.</p>
            <button className="btn primary block" onClick={onClose}>컬렉션에 넣기</button>
          </div>
        )}
      </div>
    </div>
  );
}
