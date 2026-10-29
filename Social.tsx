// 프로필 보기, 반응 남기기, 신고·차단, 관리자 화면
import { useState } from 'react';
import { ELEMENTS } from './elements';
import { moleculeById } from './molecules';
import { INTEREST_TAGS, PRAISE, PRAISE_MAX, REACTION, REPORT_REASONS, TAGS_MAX } from './socialData';
import { getProfile, NICK_MAX, roomTitle, type Command } from './engine';
import type { DispatchResult } from './backend';
import type { ReportReason, State } from './types';
import { Atom, Formula, fmtTime } from './bits';

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

/** 반응도 막대 */
export function ReactionMeter({ score, reviews }: { score: number | null; reviews: number }) {
  if (score === null) return <p className="small muted">반응도 측정 중 · 반응 {reviews}/{REACTION.minReviewsToShow}개 모이면 공개돼요</p>;
  const level = score >= 70 ? '아주 활발해요' : score >= 55 ? '활발해요' : score >= 45 ? '보통이에요' : '조심스러워요';
  return (
    <div className="stack-s" style={{ gap: 4 }}>
      <div className="row between"><span className="small"><strong>반응도 {score}</strong> · {level}</span><span className="small muted mono">반응 {reviews}개</span></div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="반응도"><div style={{ width: `${score}%` }} /></div>
    </div>
  );
}

export function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="stack-s">
      <span className="small muted">관심사 (최대 {TAGS_MAX}개, 선택)</span>
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
      <span className="small" style={{ fontWeight: 600 }}>닉네임 (2~{NICK_MAX}자, 같은 실험실 사람에게 보여요)</span>
      <input id={id} className="input" maxLength={NICK_MAX} value={value} onChange={(e) => onChange(e.target.value)} placeholder="예: 수소방울" autoComplete="nickname" />
    </label>
  );
}

export function ProfileSheet({ s, viewer, uid, run, onClose, roomId }: { s: State; viewer: string; uid: string; run: Run; onClose: () => void; roomId?: string }) {
  const p = getProfile(s, viewer, uid);
  const [mode, setMode] = useState<'view' | 'report' | 'block'>('view');
  const blocked = s.blocks.some((b) => b.from === viewer && b.to === uid);
  if (!p) return <Sheet title="프로필" onClose={onClose}><p className="small muted">같은 실험실이 열려 있는 동안에만 프로필을 볼 수 있어요.</p></Sheet>;
  const me = uid === viewer;
  return (
    <Sheet title={me ? '내 프로필' : `${p.nickname || '이름 없음'}님`} onClose={onClose}>
      {mode === 'view' && (
        <>
          <div className="panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {p.element && <Atom el={p.element} size={56} />}
            <div className="stack-s grow">
              <h2>{p.nickname || '닉네임 없음'}</h2>
              <span className="small muted">{p.element ? `${ELEMENTS[p.element].name} (${p.element})` : ''}</span>
              <p className="small">“{p.intro}”</p>
            </div>
          </div>
          <div className="panel">
            <ReactionMeter score={p.reaction.score} reviews={p.reaction.reviews} />
            {p.reaction.score !== null && (
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
          <p className="small">차단하면 {p.nickname}님과 같은 실험실에 들어갈 수 없고, 자동 매칭에서도 서로 묶이지 않아요. 차단 사실은 상대에게 알리지 않아요. 지금 함께 있는 실험실에서는 나가지 않아요.</p>
          <div className="row"><button className="btn ghost" onClick={() => setMode('view')}>취소</button>
            <button className="btn danger grow" onClick={async () => { const r = await run({ type: 'block', actor: viewer, target: uid }, '차단했어요.'); if (r.ok) setMode('view'); }}>차단하기</button></div>
        </div>
      )}
    </Sheet>
  );
}

function ReportForm({ run, viewer, target, roomId, name, onDone }: { run: Run; viewer: string; target: string; roomId?: string; name: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); if (!reason) return;
      const r = await run({ type: 'report', actor: viewer, target, roomId: roomId ?? null, reason, detail }, '신고를 접수했어요.');
      if (r.ok && alsoBlock) await run({ type: 'block', actor: viewer, target });
      if (r.ok) onDone();
    }}>
      <p className="small">{name}님을 신고하는 이유를 골라 주세요. 신고한 사실은 상대에게 알리지 않아요. 서로 다른 세 명에게 신고되면 관리자가 확인할 때까지 이용이 정지돼요.</p>
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

/** 만남이 확인된 뒤 함께한 사람에게 칭찬을 남긴다 (익명) */
export function ReviewSheet({ s, viewer, meetingId, run, onClose }: { s: State; viewer: string; meetingId: string; run: Run; onClose: () => void }) {
  const mt = s.meetings.find((m) => m.id === meetingId);
  const others = mt?.attendees.filter((a) => a.userId !== viewer) ?? [];
  const done = (to: string) => s.reviews.some((r) => r.meetingId === meetingId && r.from === viewer && r.to === to);
  const [cur, setCur] = useState<string | null>(others.find((o) => !done(o.userId))?.userId ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const name = (uid: string) => getProfile(s, viewer, uid)?.nickname || '함께한 친구';
  return (
    <Sheet title="반응 남기기" onClose={onClose}>
      <p className="small muted">누가 남겼는지는 알 수 없어요. 반응이 {REACTION.minReviewsToShow}개 이상 모여야 상대의 반응도가 공개돼요. 불편한 일이 있었다면 반응 대신 프로필에서 신고해 주세요.</p>
      <div className="stack-s">
        {others.map((o) => (
          <button key={o.userId} type="button" className={`option${cur === o.userId ? ' sel' : ''}`} disabled={done(o.userId)} onClick={() => { setCur(o.userId); setTags([]); }}>
            <span className="row"><Atom el={o.element} size={24} /><span className="grow">{name(o.userId)}</span>{done(o.userId) && <span className="chip ok">남김</span>}</span>
          </button>
        ))}
      </div>
      {cur && !done(cur) && (
        <div className="panel">
          <h3>{name(cur)}님은 어땠나요? <span className="small muted">(최대 {PRAISE_MAX}개)</span></h3>
          <div className="row" style={{ gap: 6 }}>
            {PRAISE.map((p) => { const on = tags.includes(p.id); return <button key={p.id} type="button" className={`chip pick${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && tags.length >= PRAISE_MAX} onClick={() => setTags(on ? tags.filter((x) => x !== p.id) : [...tags, p.id])}>{p.label}</button>; })}
          </div>
          <button className="btn primary block" disabled={!tags.length} onClick={async () => {
            const r = await run({ type: 'review', actor: viewer, meetingId, to: cur, tags }, '반응을 남겼어요.');
            if (r.ok) { setTags([]); setCur(others.find((o) => o.userId !== cur && !done(o.userId))?.userId ?? null); }
          }}>남기기</button>
        </div>
      )}
      {others.length > 0 && others.every((o) => done(o.userId)) && <p className="small">모두에게 반응을 남겼어요. 고마워요!</p>}
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
