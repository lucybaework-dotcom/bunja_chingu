// 내 주변 원자 찾기: 캠퍼스 지도(OpenStreetMap)에 위치를 공유 중인 방장을 보여 준다.
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ELEMENTS } from './elements';
import { moleculeById } from './molecules';
import { CAMPUS, distanceM, fmtDistance, isOnCampus } from './campus';
import { hasVacancy } from './chemistry';
import { hostPins, isMember, isRecruitingOpen, roomCounts, roomTitle } from './engine';
import type { GeoPoint, Room, State } from './types';
import { Formula, fmtTime } from './bits';
import { elementColor } from './colors';
import { getLocation, lastKnown, onGeoChange } from './geo';

export default function Nearby({ s, viewer, now, onOpenRoom, refresh }: { s: State; viewer: string; now: number; onOpenRoom: (id: string) => void; refresh?: () => void }) {
  const [here, setHere] = useState<GeoPoint | null>(lastKnown());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const myEl = s.users[viewer]?.elementId;

  const locate = async () => {
    setBusy(true); setErr('');
    const r = await getLocation();
    setBusy(false);
    if (r.ok) { setHere(r.loc); refresh?.(); } else setErr(r.error);
  };
  useEffect(() => { void locate(); return onGeoChange(() => setHere(lastKnown())); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onCampus = !!here && isOnCampus(here.lat, here.lng);
  const pins = useMemo(() => (onCampus ? hostPins(s, now) : []), [s, now, onCampus]);
  const rows = pins.flatMap((p) => p.rooms.map((r) => ({ room: r, host: p.userId, lat: p.lat, lng: p.lng, d: here ? distanceM(here, p) : 0 })))
    .sort((a, b) => a.d - b.d);

  // 지도 만들기 (한 번)
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([CAMPUS.center.lat, CAMPUS.center.lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const poly = L.polygon(CAMPUS.polygon, { color: '#0f6e78', weight: 2, fillOpacity: 0.06, dashArray: '6 6' }).addTo(map).bindTooltip(CAMPUS.name);
    map.fitBounds(poly.getBounds(), { padding: [12, 12] });
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // 표시 갱신
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    for (const p of pins) {
      const u = s.users[p.userId]; const el = u?.elementId ?? 'H'; const c = elementColor(el);
      const first = p.rooms[0]; const m = moleculeById(first.targetMoleculeId)!;
      const icon = L.divIcon({ className: 'pin-wrap', iconSize: [44, 52], iconAnchor: [22, 50],
        html: `<div class="pin" style="--c:${c.bg};--i:${c.ink}"><span>${el}</span></div><div class="pin-label">${m.formula.replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)))}</div>` });
      L.marker([p.lat, p.lng], { icon, title: roomTitle(first) }).addTo(g).on('click', () => onOpenRoom(first.id));
    }
    if (here) {
      L.circle([here.lat, here.lng], { radius: Math.min(here.acc, 150), color: '#2f55e8', weight: 1, fillOpacity: 0.1 }).addTo(g);
      L.circleMarker([here.lat, here.lng], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#2f55e8', fillOpacity: 1 }).addTo(g).bindTooltip('나');
    }
  }, [pins, here, s.users, onOpenRoom]);

  const canJoin = (r: Room) => !!myEl && isRecruitingOpen(r) && !isMember(s, r.id, viewer) && hasVacancy(moleculeById(r.targetMoleculeId)!.atomCounts, roomCounts(s, r.id), myEl);

  return (
    <div className="stack">
      <div className="stack-s">
        <h1>내 주변 원자 찾기</h1>
        <p className="small muted">{CAMPUS.name} 안에서 위치를 공유 중인 방장이 지도에 보여요. 내 위치는 저장하지 않고 지금 화면에만 써요.</p>
      </div>
      <div className="mapbox" ref={mapEl} aria-label="캠퍼스 지도" />
      <div className="row between">
        <span className="small muted">{here ? (onCampus ? `캠퍼스 안 · 오차 약 ${Math.round(here.acc)}m` : '지금은 캠퍼스 밖이에요') : busy ? '위치 찾는 중…' : '위치를 아직 몰라요'}</span>
        <button className="btn sm" onClick={locate} disabled={busy}>{busy ? '찾는 중…' : '내 위치 다시 찾기'}</button>
      </div>
      {err && <div className="panel warn"><p className="small">{err}</p></div>}
      {here && !onCampus && <div className="panel flat"><p className="small">이 기능은 캠퍼스 안에서만 쓸 수 있어요. 캠퍼스에 들어오면 주변 실험실이 보여요.</p></div>}
      {onCampus && rows.length === 0 && <div className="panel flat"><p className="small muted">지금 캠퍼스에서 위치를 공유 중인 방장이 없어요. 내가 방장이라면 실험실 화면에서 위치 공유를 켤 수 있어요.</p></div>}
      {rows.map(({ room, host, d }) => {
        const m = moleculeById(room.targetMoleculeId)!; const he = s.users[host]?.elementId;
        return (
          <button key={room.id} className="panel roomcard" onClick={() => onOpenRoom(room.id)}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack-s grow" style={{ gap: 2 }}>
                <strong>{roomTitle(room)}</strong>
                <span className="small muted"><Formula f={m.formula} className="mono" /> {m.name}{room.meetAt ? ` · ${fmtTime(room.meetAt)}` : ''}</span>
              </div>
              <span className="chip on mono">{fmtDistance(d)}</span>
            </div>
            <span className="small muted">방장 {s.users[host]?.nickname ?? ''}{he ? ` (${ELEMENTS[he].name})` : ''} · {isRecruitingOpen(room) ? (canJoin(room) ? '내 자리 있음' : '모집 중') : '분자 완성 · 첫 만남 전'}</span>
          </button>
        );
      })}
    </div>
  );
}
