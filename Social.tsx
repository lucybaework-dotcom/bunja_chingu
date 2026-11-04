// 프로필 보기, 반응 남기기, 신고·차단, 관리자 화면
import { useState } from 'react';
import { ELEMENTS } from './elements';
import { moleculeById } from './molecules';
import { INTEREST_TAGS, PRAISE, PRAISE_MAX, REACTION, REPORT_REASONS, TAGS_MAX } from './socialData';
import { getProfile, NICK_MAX, roomTitle, type Command } from './engine';
import type { DispatchResult } from './backend';
import type { ReportReason, State } from './types';
import { Atom, Formula, fmtTime } from './bits';
import { TitleChip } from './Extras2';

type Run = (c: Command, ok?: string) => Promise<DispatchResult>;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>{title}</h2><button className="btn sm" onClick={onClose}>닫기</button></div>
        {children}
      </div>
    </div>
  );
}

/** 별 다섯 개 (소수점은 반만 채움) */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={value >= i - 0.25 ? 'on' : value >= i - 0.75 ? 'half' : ''}>★</span>)}
    </span>
  );
}

/** 반응도가 뭔지 알려 주는 작은 창 */
export function ReactionHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="반응도가 뭐예요?" onClose={onClose}>
      <div className="row" style={{ gap: 8 }}><Stars value={4.5} size={22} /><strong>4.5</strong><span className="small muted">함께 만난 사람들이 남긴 별점 평균</span></div>
      <ul className="plain stack-s small">
        <li><strong>실제로 만난 사람</strong>끼리만 별점을 남길 수 있어요. 만남 확인이 끝나야 열려요.</li>
        <li>누가 몇 점을 줬는지는 <strong>아무도 몰라요</strong>. 평균만 보여요.</li>
        <li>별점이 <strong>{REACTION.minReviewsToShow}개 이상</strong> 모여야 공개돼요. 그전엔 “새 친구”로 보여요.</li>
        <li>신고가 관리자에게 확인되면 별점이 내려가요.</li>
        <li>실험실에 들어가기 전에 이미 있는 사람들의 별점을 볼 수 있어요.</li>
      </ul>
      <p className="small muted">사람을 평가하는 점수가 아니라, 함께 만났을 때의 경험을 나누는 거예요.</p>
    </Sheet>
  );
}

/** 반응도 (별점 평균) */
export function ReactionMeter({ stars, reviews }: { stars: number | null; reviews: number }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="row between" style={{ flexWrap: 'nowrap' }}>
      {stars === null
        ? <span className="small muted">반응도 · 별점 모으는 중 ({reviews}/{REACTION.minReviewsToShow})</span>
        : <span className="row" style={{ gap: 8 }}><span className="small" style={{ fontWeight: 700 }}>반응도</span><Stars value={stars} size={18} /><strong>{stars.toFixed(1)}</strong><span className="small muted">({reviews})</span></span>}
      <button type="button" className="linkish small" onClick={() => setHelp(true)}>반응도란?</button>
      {help && <ReactionHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

/** 실험실 목록·상세에서 쓰는 짧은 별점 표시 */
export function RatingChip({ stars, reviews }: { stars: number | null; reviews: number }) {
  return stars === null
    ? <span className="rating-chip new" title={`별점 ${reviews}개`}>새 친구</span>
    : <span className="rating-chip" aria-label={`별점 ${stars.toFixed(1)}, ${reviews}개`}>★ {stars.toFixed(1)}</span>;
}

export function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="stack-s">
      <span className="small muted">관심사 (최대 {TAGS_MAX}개)</span>
      <div className="row" style={{ gap: 6 }}>
        {INTEREST_TAGS.map((t) => {
          const on = value.includes(t);
          return <button key={t} type="button" className={`chip pick${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && value.length >= TAGS_MAX}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}>{t}</button>;
        })}
      </div>
    </div>
  );
}

export function NicknameInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="stack-s" htmlFor={id}>
      <span className="small" style={{ fontWeight: 600 }}>닉네임 (2~{NICK_MAX}자)</span>
      <input id={id} className="input" maxLength={NICK_MAX} value={value} onChange={(e) => onChange(e.target.value)} placeholder="예: 수소방울" autoComplete="nickname" />
    </label>
  );
}

export function ProfileSheet({ s, viewer, uid, run, onClose, roomId }: { s: State; viewer: string; uid: string; run: Run; onClose: () => void; roomId?: string }) {
  const p = getProfile(s, viewer, uid);
  const [mode, setMode] = useState<'view' | 'report' | 'block'>('view');
  const blocked = s.blocks.some((b) => b.from === viewer && b.to === uid);
  if (!p) return <Sheet title="프로필" onClose={onClose}><p className="small muted">같은 실험실에 있을 때만 볼 수 있어요.</p></Sheet>;
  const me = uid === viewer;
  return (
    <Sheet title={me ? '내 프로필' : `${p.nickname || '이름 없음'}님`} onClose={onClose}>
      {mode === 'view' && (
        <>
          <div className="panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {p.element && <Atom el={p.element} size={56} />}
            <div className="stack-s grow">
              <h2>{p.nickname || '닉네임 없음'}</h2>
              {p.title && <TitleChip id={p.title} />}
              <span className="small muted">{p.element ? `${ELEMENTS[p.element].name} (${p.element})` : ''}</span>
              <p className="small">“{p.intro}”</p>
            </div>
          </div>
          <div className="panel">
            <ReactionMeter stars={p.reaction.stars} reviews={p.reaction.reviews} />
            {p.reaction.stars !== null && (
              <div className="row" style={{ gap: 6 }}>
                {PRAISE.filter((x) => p.reaction.praise[x.id]).map((x) => <span key={x.id} className="chip">{x.label} <span className="mono">{p.reaction.praise[x.id]}</span></span>)}
              </div>
            )}
          </div>
          {p.tags.length > 0 && <div className="row" style={{ gap: 6 }}>{p.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
          <div className="stack-s">
            <h3>모은 분자 <span className="mono muted small">{p.molecules.length}</span></h3>
            {p.molecules.length === 0 ? <p className="small muted">아직 모은 분자가 없어요.</p> : (
              <div className="row" style={{ gap: 6 }}>{p.molecules.map((id) => <span key={id} className="chip"><Formula f={moleculeById(id)!.formula} className="mono" /> {moleculeById(id)!.name}</span>)}</div>
            )}
          </div>
          {!me && (
            <div className="row">
              <button className="btn danger grow" onClick={() => setMode('report')}>신고하기</button>
              {blocked
                ? <button className="btn grow" onClick={() => run({ type: 'unblock', actor: viewer, target: uid }, '차단을 풀었어요.')}>차단 풀기</button>
                : <button className="btn grow" onClick={() => setMode('block')}>차단하기</button>}
            </div>
          )}
        </>
      )}
      {mode === 'report' && <ReportForm run={run} viewer={viewer} target={uid} roomId={roomId} name={p.nickname} onDone={() => setMode('view')} />}
      {mode === 'block' && (
        <div className="panel warn">
          <p className="small">차단하면 {p.nickname}님과 다시 묶이지 않아요. 상대는 몰라요.</p>
          <div className="row"><button className="btn ghost" onClick={() => setMode('view')}>취소</button>
            <button className="btn danger grow" onClick={async () => { const r = await run({ type: 'block', actor: viewer, target: uid }, '차단했어요.'); if (r.ok) setMode('view'); }}>차단하기</button></div>
        </div>
      )}
    </Sheet>
  );
}

export function ReportForm({ run, viewer, target, roomId, name, onDone, messageId, quote }: { run: Run; viewer: string; target: string; roomId?: string; name: string; onDone: () => void; messageId?: string; quote?: string }) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); if (!reason) return;
      const r = await run({ type: 'report', actor: viewer, target, roomId: roomId ?? null, reason, detail, ...(messageId ? { messageId } : {}) }, '신고를 접수했어요.');
      if (r.ok && alsoBlock) await run({ type: 'block', actor: viewer, target });
      if (r.ok) onDone();
    }}>
      {quote !== undefined && <blockquote className="quote small">“{quote}”</blockquote>}
      <p className="small">{quote !== undefined ? `${name}님의 이 메시지를` : `${name}님을`} 신고하는 이유를 골라 주세요. 상대는 몰라요.</p>
      <div className="stack-s" role="radiogroup">
        {REPORT_REASONS.map((r) => (
          <label key={r.id} className="check" htmlFor={`rr-${r.id}`}><input id={`rr-${r.id}`} type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} /><span>{r.label}</span></label>
        ))}
      </div>
      <label className="stack-s" htmlFor="rp-detail"><span className="small">자세한 내용 {reason === 'other' ? '(필수)' : '(선택)'}</span>
        <textarea id="rp-detail" className="input" rows={3} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
      <label className="check" htmlFor="rp-block"><input id="rp-block" type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /><span className="small">이 사람을 차단도 할게요</span></label>
      <div className="row"><button type="button" className="btn ghost" onClick={onDone}>취소</button><button className="btn danger grow" disabled={!reason || (reason === 'other' && !detail.trim())}>신고하기</button></div>
    </form>
  );
}

/** 만남이 확인된 뒤 함께한 사람에게 별점(필수)과 칭찬(선택)을 남긴다 (익명) */
export function ReviewSheet({ s, viewer, meetingId, run, onClose }: { s: State; viewer: string; meetingId: string; run: Run; onClose: () => void }) {
  const mt = s.meetings.find((m) => m.id === meetingId);
  const others = mt?.attendees.filter((a) => a.userId !== viewer) ?? [];
  const done = (to: string) => s.reviews.some((r) => r.meetingId === meetingId && r.from === viewer && r.to === to);
  const [cur, setCur] = useState<string | null>(others.find((o) => !done(o.userId))?.userId ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const [stars, setStars] = useState(0);
  const [help, setHelp] = useState(false);
  const name = (uid: string) => getProfile(s, viewer, uid)?.nickname || '함께한 친구';
  const LABEL = ['', '아쉬웠어요', '그저 그랬어요', '괜찮았어요', '좋았어요', '최고였어요'];
  return (
    <Sheet title="별점 남기기" onClose={onClose}>
      <div className="row between"><p className="small muted">익명이에요. 평균만 보여요.</p><button type="button" className="linkish small" onClick={() => setHelp(true)}>반응도란?</button></div>
      <div className="stack-s">
        {others.map((o) => (
          <button key={o.userId} type="button" className={`option${cur === o.userId ? ' sel' : ''}`} disabled={done(o.userId)} onClick={() => { setCur(o.userId); setTags([]); setStars(0); }}>
            <span className="row"><Atom el={o.element} size={24} /><span className="grow">{name(o.userId)}</span>{done(o.userId) && <span className="chip ok">남김</span>}</span>
          </button>
        ))}
      </div>
      {cur && !done(cur) && (
        <div className="panel" style={{ gap: 10 }}>
          <h3>{name(cur)}님과의 만남은 어땠나요?</h3>
          <div className="star-pick" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}점`} className={stars >= n ? 'on' : ''} onClick={() => setStars(n)}>★</button>
            ))}
            <span className="small muted">{LABEL[stars]}</span>
          </div>
          <span className="small muted">좋았던 점 (선택, 최대 {PRAISE_MAX}개)</span>
          <div className="row" style={{ gap: 6 }}>
            {PRAISE.map((p) => { const on = tags.includes(p.id); return <button key={p.id} type="button" className={`chip pick${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && tags.length >= PRAISE_MAX} onClick={() => setTags(on ? tags.filter((x) => x !== p.id) : [...tags, p.id])}>{p.label}</button>; })}
          </div>
          <button className="btn primary block" disabled={!stars} onClick={async () => {
            const r = await run({ type: 'review', actor: viewer, meetingId, to: cur, stars, tags }, '별점을 남겼어요.');
            if (r.ok) { setTags([]); setStars(0); setCur(others.find((o) => o.userId !== cur && !done(o.userId))?.userId ?? null); }
          }}>{stars ? `별 ${stars}개 남기기` : '별을 눌러 주세요'}</button>
        </div>
      )}
      {others.length > 0 && others.every((o) => done(o.userId)) && <p className="small">모두에게 별점을 남겼어요. 고마워요!</p>}
      {help && <ReactionHelp onClose={() => setHelp(false)} />}
    </Sheet>
  );
}

export function AdminView({ s, viewer, run }: { s: State; viewer: string; run: Run }) {
  const [tab, setTab] = useState<'open' | 'done' | 'suspended'>('open');
  const nick = (uid: string) => s.users[uid]?.nickname || uid.slice(0, 6);
  const reason = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  const list = s.reports.filter((r) => (tab === 'open' ? r.status === 'open' : r.status !== 'open')).sort((a, b) => b.createdAt - a.createdAt);
  const suspended = Object.values(s.users).filter((u) => u.suspendedAt);
  return (
    <div className="stack">
      <h1>관리자</h1>
      <div className="seg">
        <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>처리 전 {s.reports.filter((r) => r.status === 'open').length}</button>
        <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>처리함</button>
        <button className={tab === 'suspended' ? 'on' : ''} onClick={() => setTab('suspended')}>정지 {suspended.length}</button>
      </div>
      {tab !== 'suspended' && list.length === 0 && <div className="panel flat"><p className="small muted">{tab === 'open' ? '처리할 신고가 없어요.' : '처리한 신고가 없어요.'}</p></div>}
      {tab !== 'suspended' && list.map((r) => (
        <div key={r.id} className="panel" style={{ gap: 8 }}>
          <div className="row between"><strong>{nick(r.target)}</strong><span className="small muted mono">{fmtTime(r.createdAt)}</span></div>
          <span className="chip warn" style={{ alignSelf: 'flex-start' }}>{reason(r.reason)}</span>
          {r.quote !== undefined && <blockquote className="quote small">신고된 메시지: “{r.quote}”</blockquote>}
          {r.detail && <p className="small">{r.detail}</p>}
          <span className="small muted">신고한 사람: {nick(r.from)}{r.roomId && s.rooms[r.roomId] ? ` · ${roomTitle(s.rooms[r.roomId])}` : ''}</span>
          {r.status === 'open' ? (
            <div className="row">
              <button className="btn grow" onClick={() => run({ type: 'adminResolveReport', actor: viewer, reportId: r.id, decision: 'dismissed' }, '기각했어요.')}>기각</button>
              <button className="btn danger grow" onClick={() => run({ type: 'adminResolveReport', actor: viewer, reportId: r.id, decision: 'upheld' }, '확정했어요. 반응도가 내려가요.')}>확정 (반응도 -5)</button>
            </div>
          ) : <span className={`chip ${r.status === 'upheld' ? 'bad' : ''}`} style={{ alignSelf: 'flex-start' }}>{r.status === 'upheld' ? '확정함' : '기각함'}</span>}
          {s.users[r.target] && (s.users[r.target].suspendedAt
            ? <button className="btn sm" onClick={() => run({ type: 'adminSetSuspended', actor: viewer, target: r.target, suspended: false }, '정지를 풀었어요.')}>{nick(r.target)}님 정지 풀기</button>
            : <button className="btn sm danger" onClick={() => run({ type: 'adminSetSuspended', actor: viewer, target: r.target, suspended: true }, '정지했어요.')}>이용 정지</button>)}
        </div>
      ))}
      {tab === 'suspended' && (suspended.length === 0 ? <div className="panel flat"><p className="small muted">정지된 사용자가 없어요.</p></div> : suspended.map((u) => (
        <div key={u.id} className="panel" style={{ flexDirection: 'row', alignItems: 'center' }}>
          {u.elementId && <Atom el={u.elementId} size={30} />}
          <div className="grow"><strong>{u.nickname || u.id.slice(0, 6)}</strong><br /><span className="small muted">{fmtTime(u.suspendedAt!)} 정지</span></div>
          <button className="btn sm" onClick={() => run({ type: 'adminSetSuspended', actor: viewer, target: u.id, suspended: false }, '정지를 풀었어요.')}>풀기</button>
        </div>
      )))}
    </div>
  );
}
