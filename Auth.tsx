// 실제 서비스 모드의 로그인. 학교 인증 정책은 미정이라 지금은 이메일+비밀번호만 쓴다.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RemoteBackend } from './backend';
import { supabase, supabaseTransport } from './supabase';
import App from './App';
import { lastKnown } from './geo';
import { Atom } from './bits';

const KO: [RegExp, string][] = [
  [/Invalid login credentials/i, '이메일이나 비밀번호가 맞지 않아요.'],
  [/already registered|already been registered/i, '이미 가입된 이메일이에요. 로그인해 주세요.'],
  [/Password should be at least/i, '비밀번호는 6자 이상이어야 해요.'],
  [/Email not confirmed/i, '메일함에서 인증 링크를 먼저 눌러 주세요.'],
  [/rate limit|too many/i, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'],
  [/valid email|invalid format/i, '이메일 주소 형식을 확인해 주세요.'],
];
const ko = (m: string) => KO.find(([r]) => r.test(m))?.[1] ?? m;

export default function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [backend, setBackend] = useState<RemoteBackend | null>(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { backend?.stop(); setBackend(null); return; }
    if (backend) return;
    const b = new RemoteBackend(supabaseTransport(), lastKnown);
    b.start().then(() => setBackend(b)).catch((e: Error) => setLoadErr(e.message));
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <Center>불러오는 중…</Center>;
  if (!session) return <Login />;
  if (loadErr) return <Center><p>{loadErr}</p><button className="btn" onClick={() => location.reload()}>다시 시도</button></Center>;
  if (!backend) return <Center>내 실험실을 불러오는 중…</Center>;
  return <App backend={backend} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="shell" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 80 }}><div className="stack" style={{ alignItems: 'center' }}>{children}</div></div>;
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const sb = supabase();
    const res = mode === 'in'
      ? await sb.auth.signInWithPassword({ email, password: pw })
      : await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    if (res.error) return setMsg({ t: ko(res.error.message), err: true });
    if (mode === 'up' && !res.data.session) setMsg({ t: '가입 메일을 보냈어요. 메일함에서 인증 링크를 누른 뒤 로그인해 주세요.' });
  };
  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-model" aria-hidden="true">
          <Atom el="H" size={40} /><span className="bond" style={{ width: 20, height: 4, background: 'var(--ink-2)' }} />
          <Atom el="O" size={56} /><span className="bond" style={{ width: 20, height: 4, background: 'var(--ink-2)' }} />
          <Atom el="H" size={40} />
        </div>
        <h1>분자친구</h1>
        <p className="muted">나를 닮은 원소로, 실제 분자만큼 모여 친구가 돼요.</p>
      </section>
      <form className="panel" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>로그인</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>처음이에요</button>
        </div>
        <label className="stack-s" htmlFor="email"><span className="small" style={{ fontWeight: 600 }}>이메일</span>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="stack-s" htmlFor="pw"><span className="small" style={{ fontWeight: 600 }}>비밀번호 (6자 이상)</span>
          <input id="pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <button className="btn primary block" disabled={busy}>{busy ? '잠시만요…' : mode === 'in' ? '로그인' : '가입하기'}</button>
        {msg && <p className="small" style={{ color: msg.err ? 'var(--bad)' : 'var(--ok)' }} role="status">{msg.t}</p>}
      </form>
      <p className="small muted">이메일은 로그인에만 쓰이고 다른 학생에게는 원소와 한 줄 소개만 보여요. <a href="#demo" onClick={() => setTimeout(() => location.reload(), 0)}>가상 사용자로 먼저 둘러보기</a></p>
    </div>
  );
}
