import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FUNCTION_NAME, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { RemoteTransport } from './backend';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export function supabaseTransport(): RemoteTransport {
  const sb = supabase();
  return {
    async call(body) {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ error: `서버 응답을 읽지 못했어요 (${res.status}).` }));
      return { status: res.status, json };
    },
    onChange(fn) {
      const ch = sb.channel('app-version')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_version' }, () => fn())
        .subscribe();
      return () => { void sb.removeChannel(ch); };
    },
    async signOut() { await sb.auth.signOut(); },
  };
}
