// Supabase Edge Function 진입점 (Deno). 빌드하면 server-dist/bunja-function.js 한 파일이 된다.
import { handle, handleCron, type Deps } from './handler';
import { b64u, sendWebPush, type VapidKeys } from './webpush';
import { askGemini, askGeminiRoom, DEFAULT_MODELS } from './gemini';
import type { State } from './types';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const rest = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

const deps: Deps = {
  async getUser(token) {
    // 로그인 토큰을 이 함수 안에서 바로 확인한다 (인증 서버를 한 번 더 거치지 않게). 안 되면 예전 방식으로
    const local = await verifyLocal(token).catch(() => null);
    if (local) return local;
    const key = Deno.env.get('SUPABASE_ANON_KEY') || SERVICE;
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) { console.error('auth/v1/user', r.status, await r.text().catch(() => '')); return null; }
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? '' } : null;
  },
  async load() {
    const r = await rest('app_state?id=eq.1&select=version,state');
    if (!r.ok) throw new Error(`load ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    return rows[0] ? { version: Number(rows[0].version), state: rows[0].state as State } : null;
  },
  async save(prev, next) {
    if (prev === null) {
      const r = await rest('app_state', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: 1, version: 1, state: next }) });
      return r.ok; // 이미 누가 만들었으면 409 → 다시 시도
    }
    const r = await rest(`app_state?id=eq.1&version=eq.${prev}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ version: prev + 1, state: next }),
    });
    if (!r.ok) throw new Error(`save ${r.status}: ${await r.text()}`);
    return (await r.json()).length === 1;
  },
  async bump() {
    await rest('app_version?id=eq.1', { method: 'PATCH', body: JSON.stringify({ version: Date.now(), updated_at: new Date().toISOString() }) });
  },
  now: () => Date.now(),
  async deleteAuthUser(uid) {
    const r = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    if (!r.ok) console.error('delete auth user', r.status, await r.text().catch(() => ''));
  },
  ...(Deno.env.get('GEMINI_API_KEY') ? { aiRoom: (el, req) => askGeminiRoom(Deno.env.get('GEMINI_API_KEY')!, el, req,
    Deno.env.get('GEMINI_MODEL') ? [Deno.env.get('GEMINI_MODEL')!, ...DEFAULT_MODELS] : DEFAULT_MODELS) } : {}),
  ...(Deno.env.get('GEMINI_API_KEY') ? { ai: (h, finish, onText) => askGemini(Deno.env.get('GEMINI_API_KEY')!, h, finish,
    Deno.env.get('GEMINI_MODEL') ? [Deno.env.get('GEMINI_MODEL')!, ...DEFAULT_MODELS] : DEFAULT_MODELS, fetch, onText) } : {}),
  background: (p) => { const er = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (er?.waitUntil) er.waitUntil(p); else void p; },
  ...(vapid() ? { sendPush: (sub, data) => sendWebPush(sub, data, vapid()!).catch((e) => { console.error('push', e); return 0; }) } : {}),
};

/** Supabase 비밀값 VAPID_PRIVATE_JWK가 있을 때만 알림을 보낸다 */
let vapidCache: VapidKeys | null | undefined;
function vapid(): VapidKeys | null {
  if (vapidCache !== undefined) return vapidCache;
  try {
    const raw = Deno.env.get('VAPID_PRIVATE_JWK');
    if (!raw) return (vapidCache = null);
    const jwk = JSON.parse(raw) as JsonWebKey & { x: string; y: string };
    const pub = new Uint8Array([4, ...b64u.dec(jwk.x), ...b64u.dec(jwk.y)]);
    vapidCache = { privateJwk: jwk, publicKey: b64u.enc(pub), subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:lucybae@kookmin.ac.kr' };
  } catch (e) { console.error('VAPID_PRIVATE_JWK 형식 오류', e); vapidCache = null; }
  return vapidCache;
}

// ───── 토큰 확인 (Supabase 비대칭 서명 키, 공개키는 한 시간 보관) ─────
type Jwk = JsonWebKey & { kid?: string; alg?: string };
let jwks: { at: number; keys: Jwk[] } | null = null;
const dec = (s: string) => new TextDecoder().decode(b64u.dec(s));
async function verifyLocal(token: string): Promise<{ id: string; email: string } | null> {
  const [h, p, sig] = token.split('.'); if (!h || !p || !sig) return null;
  const head = JSON.parse(dec(h)) as { alg?: string; kid?: string };
  if (head.alg !== 'ES256' && head.alg !== 'RS256') return null; // 예전 공유 비밀 방식(HS256)은 인증 서버에 묻는다
  if (!jwks || Date.now() - jwks.at > 3_600_000 || !jwks.keys.some((k) => k.kid === head.kid)) {
    const r = await fetch(`${URL_}/auth/v1/.well-known/jwks.json`); if (!r.ok) return null;
    jwks = { at: Date.now(), keys: ((await r.json()) as { keys: Jwk[] }).keys ?? [] };
  }
  const jwk = jwks.keys.find((k) => k.kid === head.kid); if (!jwk) return null;
  const algo = head.alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['verify'] }, algo, false, ['verify']);
  const ok = await crypto.subtle.verify(head.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : algo, key, b64u.dec(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const c = JSON.parse(dec(p)) as { sub?: string; email?: string; exp?: number; role?: string };
  if (!c.sub || !c.exp || c.exp * 1000 < Date.now() || c.role !== 'authenticated') return null;
  return { id: c.sub, email: c.email ?? '' };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
    const body = await req.json().catch(() => ({}));
    const t0 = Date.now();
    const r = body?.action === 'cron'
      ? await handleCron(body.secret, { ...deps, cronSecret: Deno.env.get('CRON_SECRET') })
      : await handle(token, body, deps);
    if (r.stream) return new Response(r.stream, { status: 200, headers: { ...CORS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } });
    if (body?.action !== 'cron') console.log(`${body?.action ?? '?'} ${r.status} ${Date.now() - t0}ms`);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
