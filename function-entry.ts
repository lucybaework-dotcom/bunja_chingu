// Supabase Edge Function 진입점 (Deno). 빌드하면 server-dist/bunja-function.js 한 파일이 된다.
import { handle, type Deps } from './handler';
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
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
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
};

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
    const r = await handle(token, body, deps);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
