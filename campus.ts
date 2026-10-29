// 국민대학교 북악캠퍼스 경계 (대략적인 사각형). 지도에서 확인 후 꼭짓점을 고치면 된다.
export const CAMPUS = {
  name: '국민대학교 북악캠퍼스',
  center: { lat: 37.6110, lng: 126.9968 },
  /** [위도, 경도] 꼭짓점, 시계 방향 */
  polygon: [
    [37.6146, 126.9928], [37.6146, 127.0004], [37.6083, 127.0006], [37.6083, 126.9932],
  ] as [number, number][],
};

/** 점이 다각형 안에 있는지 (ray casting) */
export function isOnCampus(lat: number, lng: number): boolean {
  const P = CAMPUS.polygon;
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [yi, xi] = P[i], [yj, xj] = P[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 두 지점 사이 거리 (m) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m: number) => (m < 1000 ? `약 ${Math.max(10, Math.round(m / 10) * 10)}m` : `약 ${(m / 1000).toFixed(1)}km`);
