// 위치 가져오기. 실제 서비스는 기기 GPS, 시연판은 흉내 낸 위치(캠퍼스 안/밖)를 쓴다.
import { CAMPUS } from './campus';
import type { GeoPoint } from './types';

export type GeoResult = { ok: true; loc: GeoPoint } | { ok: false; error: string };

let demo = false;
let simulated: 'campus' | 'away' = 'campus';
let last: GeoPoint | null = null;
const subs = new Set<() => void>();

export function setDemoGeo(on: boolean) { demo = on; }
export function isDemoGeo() { return demo; }
export function getSimulated() { return simulated; }
export function setSimulated(m: 'campus' | 'away') { simulated = m; last = null; subs.forEach((f) => f()); }
export function lastKnown(): GeoPoint | null { return last; }
export function onGeoChange(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

function fake(): GeoPoint {
  if (simulated === 'away') return { lat: 37.5665, lng: 126.978, acc: 25 }; // 서울시청 근처
  const j = () => (Math.random() - 0.5) * 0.0003;
  return { lat: CAMPUS.center.lat + j(), lng: CAMPUS.center.lng + j(), acc: 18 };
}

const MSG: Record<number, string> = {
  1: '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.',
  2: '위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.',
  3: '위치를 찾는 데 시간이 너무 걸렸어요. 다시 시도해 주세요.',
};

export function getLocation(): Promise<GeoResult> {
  if (demo) { last = fake(); subs.forEach((f) => f()); return Promise.resolve({ ok: true, loc: last }); }
  if (!('geolocation' in navigator)) return Promise.resolve({ ok: false, error: '이 기기에서는 위치를 쓸 수 없어요.' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; subs.forEach((f) => f()); resolve({ ok: true, loc: last }); },
      (e) => resolve({ ok: false, error: MSG[e.code] ?? '위치를 가져오지 못했어요.' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 },
    );
  });
}

/** 위치가 바뀔 때마다 알려 준다 (방장 위치 공유용) */
export function watchLocation(cb: (r: GeoResult) => void): () => void {
  if (demo) {
    const tick = () => { last = fake(); subs.forEach((f) => f()); cb({ ok: true, loc: last }); };
    tick();
    const t = setInterval(tick, 30_000);
    const off = onGeoChange(() => { if (!last) tick(); });
    return () => { clearInterval(t); off(); };
  }
  if (!('geolocation' in navigator)) { cb({ ok: false, error: '이 기기에서는 위치를 쓸 수 없어요.' }); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => { last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; subs.forEach((f) => f()); cb({ ok: true, loc: last }); },
    (e) => cb({ ok: false, error: MSG[e.code] ?? '위치를 가져오지 못했어요.' }),
    { enableHighAccuracy: true, maximumAge: 15_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
