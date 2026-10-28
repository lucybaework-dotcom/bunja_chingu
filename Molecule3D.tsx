// 가벼운 3D 볼-스틱 모형 (캔버스). 원자를 깊이 순서로 그리는 방식이라 외부 3D 라이브러리가 필요 없다.
import { useEffect, useRef } from 'react';
import { GEOMETRY } from './geometry';
import { elementColor } from './colors';

/** 표시용 반지름(Å). 공유 결합 반지름 / 이온 반지름을 줄여서 쓴다. */
const COV: Record<string, number> = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, K: 2.03 };
const ION: Record<string, number> = { Na: 1.02, K: 1.38, Mg: 0.72, Al: 0.54, Cl: 1.81, F: 1.33, O: 1.4, S: 1.84 };

export function hasModel(id: string) { return !!GEOMETRY[id]; }

export default function Molecule3D({ id, height = 200, label }: { id: string; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const g = GEOMETRY[id];
  const ionic = !!g?.note; // 이온 결정 모형에는 설명(note)이 붙어 있다

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !g) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let yaw = 0.6, pitch = -0.35, raf = 0, last = performance.now(), idleUntil = 0;
    let drag: { x: number; y: number } | null = null;
    const atoms = g.atoms.map(([el, x, y, z]) => ({ el, p: [x, y, z] as [number, number, number], r: 0.22 + 0.42 * (ionic && el !== 'H' && ION[el] ? ION[el] * 0.55 : (COV[el] ?? 0.8)) }));
    const R = Math.max(1.2, ...atoms.map((a) => Math.hypot(...a.p) + a.r));
    const colors = atoms.map((a) => elementColor(a.el));
    const line = getComputedStyle(cv).getPropertyValue('--ink-2').trim() || '#888';

    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const scale = (Math.min(w, h) / 2 - 10) / R, cam = R * 4;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const proj = atoms.map(({ p: [x, y, z] }) => {
        const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
        const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
        const k = cam / (cam - z2);
        return { x: w / 2 + x1 * scale * k, y: h / 2 - y2 * scale * k, z: z2, k };
      });
      type Item = { z: number; draw: () => void };
      const items: Item[] = [];
      for (const [a, b, order] of g.bonds) {
        const A = proj[a], B = proj[b];
        items.push({ z: (A.z + B.z) / 2 - 0.01, draw: () => {
          const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          // 결합선이 앞쪽 원자의 한가운데를 덮지 않도록 각 원자 표면에서 시작한다
          const ra = atoms[a].r * scale * A.k * 0.82, rb = atoms[b].r * scale * B.k * 0.82;
          if (order > 0 && ra + rb >= L) return;
          const ux = dx / L, uy = dy / L;
          const S = { x: A.x + ux * ra, y: A.y + uy * ra }, E = { x: B.x - ux * rb, y: B.y - uy * rb };
          if (order === 0) {
            ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = line; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore(); return;
          }
          const width = Math.max(2, 0.16 * scale * (A.k + B.k) / 2 / (order > 1 ? 1.6 : 1));
          const gap = width * 1.15;
          for (let i = 0; i < order; i++) {
            const off = (i - (order - 1) / 2) * gap;
            const ax = S.x + nx * off, ay = S.y + ny * off, bx = E.x + nx * off, by = E.y + ny * off;
            const t = ra / (ra + rb), mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
            ctx.lineCap = 'round'; ctx.lineWidth = width;
            ctx.strokeStyle = colors[a].bg; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.stroke();
            ctx.strokeStyle = colors[b].bg; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(bx, by); ctx.stroke();
          }
        } });
      }
      atoms.forEach((at, i) => {
        const P = proj[i];
        items.push({ z: P.z, draw: () => {
          const rad = at.r * scale * P.k;
          const grd = ctx.createRadialGradient(P.x - rad * 0.35, P.y - rad * 0.4, rad * 0.1, P.x, P.y, rad);
          grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.28, colors[i].bg); grd.addColorStop(1, colors[i].bg);
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(P.x, P.y, rad, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke();
          if (rad > 11) {
            ctx.fillStyle = colors[i].ink; ctx.font = `600 ${Math.min(16, rad * 0.75)}px "IBM Plex Mono", ui-monospace, monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(at.el, P.x, P.y + 1);
          }
        } });
      });
      items.sort((p, q) => p.z - q.z).forEach((it) => it.draw());
    };

    const tick = (t: number) => {
      const dt = Math.min(64, t - last); last = t;
      if (!drag && !reduce && t > idleUntil) yaw += dt * 0.0006;
      draw();
      raf = requestAnimationFrame(tick);
    };
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      yaw += (e.clientX - drag.x) * 0.012;
      if (e.pointerType === 'mouse') pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.012));
      drag = { x: e.clientX, y: e.clientY };
      if (reduce) draw();
    };
    const up = () => { drag = null; idleUntil = performance.now() + 2500; };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    if (reduce) { draw(); const ro = new ResizeObserver(draw); ro.observe(cv); return () => { ro.disconnect(); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); }; }
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return null;
  return (
    <figure className="mol3d">
      <canvas ref={ref} style={{ height }} role="img" aria-label={`${label} 3D 모형. 끌어서 돌려 볼 수 있어요.`} />
      <figcaption className="small muted">{g.note ?? '끌어서 돌려 보세요.'}{g.note ? ' 끌어서 돌려 보세요.' : ''}</figcaption>
    </figure>
  );
}
