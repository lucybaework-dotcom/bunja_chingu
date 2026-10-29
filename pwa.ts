// 홈 화면에 추가, 서비스 워커, 알림 구독
import { VAPID_PUBLIC_KEY } from './config';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const subs = new Set<() => void>();
export const onInstallChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

export const canPromptInstall = () => !!deferred;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null; subs.forEach((f) => f());
  return r.outcome === 'accepted';
}
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ───── 알림 ─────
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

function keyBytes(b64: string) {
  const p = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function subscribePush(): Promise<{ ok: true; sub: PushSubscriptionJSON } | { ok: false; error: string }> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: '알림 권한을 허용해야 받을 수 있어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.' };
  const reg = await navigator.serviceWorker.ready;
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    return { ok: true, sub: sub.toJSON() };
  } catch {
    return { ok: false, error: '알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.' };
  }
}

export async function unsubscribePush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const ep = sub.endpoint; await sub.unsubscribe().catch(() => undefined);
  return ep;
}
