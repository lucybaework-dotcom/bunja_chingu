// 약관 보기·동의, 탈퇴, 홈 화면에 추가, 알림 켜기, 약속 장소 지도
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PRIVACY, TERMS, type DocSection } from './terms';
import { DELETE_WORD, TERMS_VERSION, type Command } from './engine';
import { CAMPUS } from './campus';
import type { DispatchResult } from './backend';
import type { Room } from './types';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall, pushState, subscribePush, unsubscribePush, type PushState } from './pwa';

type Run = (c: Command, ok?: string) => Promise<DispatchResult>;

export function DocSheet({ which, onClose }: { which: 'terms' | 'privacy'; onClose: () => void }) {
  const doc: DocSection[] = which === 'terms' ? TERMS : PRIVACY;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet doc" role="dialog" aria-label={which === 'terms' ? '이용약관' : '개인정보 처리방침'} onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>{which === 'terms' ? '이용약관' : '개인정보 처리방침'}</h2><button className="btn sm" onClick={onClose}>닫기</button></div>
        <p className="small muted">시범 운영용 초안 · {TERMS_VERSION}</p>
        {doc.map((sec) => (
          <section key={sec.h} className="stack-s"><h3>{sec.h}</h3>{sec.p.map((t, i) => <p key={i} className="small doc-p">{t}</p>)}</section>
        ))}
      </div>
    </div>
  );
}

/** 필수 동의 세 개. 모두 체크해야 ok */
export function ConsentChecks({ onChange }: { onChange: (ok: boolean) => void }) {
  const [c, setC] = useState({ terms: false, privacy: false, age: false });
  const [open, setOpen] = useState<'terms' | 'privacy' | null>(null);
  useEffect(() => { onChange(c.terms && c.privacy && c.age); }, [c, onChange]);
  const all = c.terms && c.privacy && c.age;
  return (
    <div className="panel" style={{ gap: 8 }}>
      <label className="check" htmlFor="c-all"><input id="c-all" type="checkbox" checked={all} onChange={(e) => setC({ terms: e.target.checked, privacy: e.target.checked, age: e.target.checked })} /><strong className="small">모두 동의해요</strong></label>
      <hr className="rule" />
      <div className="row between"><label className="check" htmlFor="c-terms"><input id="c-terms" type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} /><span className="small">(필수) 이용약관 동의</span></label><button type="button" className="linkish small" onClick={() => setOpen('terms')}>보기</button></div>
      <div className="row between"><label className="check" htmlFor="c-privacy"><input id="c-privacy" type="checkbox" checked={c.privacy} onChange={(e) => setC({ ...c, privacy: e.target.checked })} /><span className="small">(필수) 개인정보 수집·이용 동의</span></label><button type="button" className="linkish small" onClick={() => setOpen('privacy')}>보기</button></div>
      <label className="check" htmlFor="c-age"><input id="c-age" type="checkbox" checked={c.age} onChange={(e) => setC({ ...c, age: e.target.checked })} /><span className="small">(필수) 만 14세 이상이에요</span></label>
      {open && <DocSheet which={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** 예전에 가입해서 지금 약관에 동의하지 않은 사람에게 */
export function TermsUpdateCard({ viewer, run }: { viewer: string; run: Run }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="panel warn">
      <h3>약관 동의가 필요해요</h3>
      <p className="small">이용약관과 개인정보 처리방침이 생겼어요. 동의하면 계속 이용할 수 있어요.</p>
      <ConsentChecks onChange={setOk} />
      <button className="btn primary" disabled={!ok} onClick={() => run({ type: 'acceptTerms', actor: viewer, version: TERMS_VERSION }, '동의했어요.')}>동의하고 계속하기</button>
    </div>
  );
}

export function DeleteAccount({ viewer, run, onDeleted }: { viewer: string; run: Run; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="btn ghost block danger-text" onClick={() => setOpen(true)}>회원 탈퇴</button>;
  return (
    <form className="panel warn" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const r = await run({ type: 'deleteAccount', actor: viewer, confirm: word });
      setBusy(false);
      if (r.ok) onDeleted();
    }}>
      <h3>정말 탈퇴할까요?</h3>
      <p className="small">탈퇴하면 열려 있는 실험실에서 모두 나가고(방장이면 다음 사람에게 넘어가요), 닉네임과 소개, 모은 분자 카드, 만남 기록, 반응도가 모두 지워져요. 되돌릴 수 없어요. 원소를 바꾸고 싶다면 탈퇴한 뒤 다시 가입하면 돼요.</p>
      <label className="stack-s" htmlFor="del-word"><span className="small">확인을 위해 <strong>{DELETE_WORD}</strong>라고 입력해 주세요.</span>
        <input id="del-word" className="input" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></label>
      <div className="row"><button type="button" className="btn ghost" onClick={() => { setOpen(false); setWord(''); }}>취소</button><button className="btn danger grow" disabled={word.trim() !== DELETE_WORD || busy}>{busy ? '탈퇴하는 중…' : '탈퇴하기'}</button></div>
    </form>
  );
}

export function InstallCard() {
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  if (isStandalone()) return null;
  if (canPromptInstall()) return (
    <div className="panel install"><div className="row between"><span className="stack-s grow" style={{ gap: 0 }}><strong>홈 화면에 앱으로 추가</strong><span className="small muted">주소창 없이 앱처럼 열리고 알림도 받을 수 있어요</span></span>
      <button className="btn primary sm" onClick={() => void promptInstall()}>추가하기</button></div></div>
  );
  if (isIOS()) return (
    <div className="panel install"><strong>홈 화면에 앱으로 추가</strong>
      <p className="small">Safari 아래쪽 <strong>공유 버튼(네모에 위쪽 화살표)</strong>을 누르고 <strong>홈 화면에 추가</strong>를 고르세요. 아이폰은 이렇게 추가해야 알림을 받을 수 있어요.</p></div>
  );
  return null;
}

export function PushToggle({ viewer, run, demo }: { viewer: string; run: Run; demo: boolean }) {
  const [st, setSt] = useState<PushState | 'loading'>('loading');
  const [err, setErr] = useState('');
  const refresh = () => { pushState().then(setSt).catch(() => setSt('unsupported')); };
  useEffect(() => { if (!demo) refresh(); }, [demo]);
  if (demo) return <div className="panel"><strong>알림</strong><p className="small muted">시연판에서는 폰 알림을 보낼 수 없어요. 실제 사이트에서 켤 수 있어요.</p></div>;
  const on = st === 'on';
  const msg: Record<string, string> = {
    unsupported: '이 브라우저는 알림을 지원하지 않아요.',
    'needs-install': '아이폰은 먼저 홈 화면에 앱으로 추가한 뒤, 추가한 앱에서 알림을 켤 수 있어요.',
    denied: '알림이 차단돼 있어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.',
  };
  return (
    <div className="panel" style={{ gap: 8 }}>
      <div className="row between">
        <span className="stack-s grow" style={{ gap: 0 }}><strong>폰 알림 받기</strong><span className="small muted">새 채팅, 합류, 만남 확인, 약속 장소 알림</span></span>
        <button role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} disabled={st === 'loading' || !!msg[st]} onClick={async () => {
          setErr('');
          if (on) { const ep = await unsubscribePush(); if (ep) await run({ type: 'removePush', actor: viewer, endpoint: ep }, '알림을 껐어요.'); }
          else { const r = await subscribePush(); if (!r.ok) setErr(r.error); else await run({ type: 'savePush', actor: viewer, sub: r.sub as never }, '이 기기에서 알림을 받아요.'); }
          refresh();
        }}><span /></button>
      </div>
      {msg[st as string] && <p className="small muted">{msg[st as string]}</p>}
      {err && <p className="small" style={{ color: 'var(--bad)' }}>{err}</p>}
    </div>
  );
}

// ───── 약속 장소 ─────
function pinIcon(label: string) {
  return L.divIcon({ className: 'pin-wrap', iconSize: [44, 52], iconAnchor: [22, 50],
    html: `<div class="pin place" style="--c:#0f6e78;--i:#fff"><span>★</span></div><div class="pin-label">${label.replace(/[<>&"]/g, '')}</div>` });
}

export function PlaceCard({ room, isHost, run, viewer }: { room: Room; isHost: boolean; run: Run; viewer: string }) {
  const [picking, setPicking] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const p = room.place;
  useEffect(() => {
    if (!p || !el.current) return;
    const map = L.map(el.current, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, attributionControl: true }).setView([p.lat, p.lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    L.marker([p.lat, p.lng], { icon: pinIcon(p.label) }).addTo(map);
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); };
  }, [p?.lat, p?.lng, p?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p && !isHost) return null;
  return (
    <div className="panel" style={{ gap: 8 }}>
      <div className="row between"><h3>약속 장소</h3>{isHost && !room.closedAt && <button className="btn sm" onClick={() => setPicking(true)}>{p ? '바꾸기' : '지도에서 정하기'}</button>}</div>
      {p ? (
        <>
          <strong>{p.label}</strong>
          <div className="mapbox small-map" ref={el} aria-label={`약속 장소 지도: ${p.label}`} />
          <div className="row">
            <a className="btn sm" href={`https://map.kakao.com/link/map/${encodeURIComponent(p.label)},${p.lat},${p.lng}`} target="_blank" rel="noreferrer">카카오맵에서 열기</a>
            <a className="btn sm ghost" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer">OpenStreetMap</a>
          </div>
        </>
      ) : <p className="small muted">방장이 지도에서 만날 곳을 찍으면 구성원 모두에게 알림이 가요.</p>}
      {picking && <PlacePicker room={room} onClose={() => setPicking(false)} onSave={async (place) => { const r = await run({ type: 'setPlace', actor: viewer, roomId: room.id, place }, '약속 장소를 정했어요.'); if (r.ok) setPicking(false); }}
        onClear={p ? async () => { const r = await run({ type: 'setPlace', actor: viewer, roomId: room.id, place: null }, '약속 장소를 지웠어요.'); if (r.ok) setPicking(false); } : undefined} />}
    </div>
  );
}

function PlacePicker({ room, onClose, onSave, onClear }: { room: Room; onClose: () => void; onSave: (p: { lat: number; lng: number; label: string }) => void; onClear?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(room.place ? { lat: room.place.lat, lng: room.place.lng } : null);
  const [label, setLabel] = useState(room.place?.label ?? '');
  const marker = useRef<L.Marker | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const start = room.place ?? CAMPUS.center;
    const map = L.map(el.current).setView([start.lat, start.lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    L.polygon(CAMPUS.polygon, { color: '#0f6e78', weight: 2, fillOpacity: 0.05, dashArray: '6 6' }).addTo(map);
    const place = (lat: number, lng: number) => {
      setPt({ lat, lng });
      if (marker.current) marker.current.setLatLng([lat, lng]); else marker.current = L.marker([lat, lng], { icon: pinIcon('여기') }).addTo(map);
    };
    if (room.place) place(room.place.lat, room.place.lng);
    map.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 80);
    return () => { map.remove(); marker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" role="dialog" aria-label="약속 장소 정하기" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (pt) onSave({ ...pt, label }); }}>
        <div className="row between"><h2>약속 장소 정하기</h2><button type="button" className="btn sm" onClick={onClose}>닫기</button></div>
        <p className="small muted">지도를 눌러 만날 곳을 찍어 주세요. 학교에서 5km 안이면 돼요.</p>
        <div className="mapbox" ref={el} />
        <label className="stack-s" htmlFor="place-label"><span className="small" style={{ fontWeight: 600 }}>장소 이름</span>
          <input id="place-label" className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 학생회관 1층 입구" /></label>
        <div className="row">
          {onClear && <button type="button" className="btn ghost" onClick={onClear}>장소 지우기</button>}
          <button className="btn primary grow" disabled={!pt || label.trim().length < 2}>{pt ? '이 장소로 정하기' : '지도에서 먼저 찍어 주세요'}</button>
        </div>
      </form>
    </div>
  );
}
